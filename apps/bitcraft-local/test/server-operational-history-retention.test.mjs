import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync, constants as sqliteConstants } from "node:sqlite";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { applySchemaBootstrap } from "../src/server/schemaBootstrap.mjs";
import { applyAdditiveColumnMigrations } from "../src/server/schemaMigrations.mjs";
import { createOperationalHistoryRetentionDryRunJob } from "../src/server/scheduledJobs.mjs";
import {
  OPERATIONAL_HISTORY_RETENTION_DEFAULTS,
  applyOperationalHistoryRetentionSchema,
  buildOperationalHistoryRollups,
  normalizeOperationalHistoryRetentionSettings,
  operationalHistoryRetentionPreview,
  readOperationalMarketTradeDaily,
  readOperationalMarketTradeDailyReport,
  recordOperationalHistoryBackupVerification,
  runOperationalHistoryRetention,
  validateOperationalHistoryRetentionEnableGate,
} from "../src/server/operationalHistoryRetention.mjs";

const NOW = new Date("2026-08-22T12:00:00.000Z");
const CUTOFF = "2025-08-22T12:00:00.000Z";
const BACKUP_FIXTURE_ROOT = mkdtempSync(path.join(tmpdir(), "operational-retention-backup-"));
const BACKUP_FIXTURE_PATH = path.join(BACKUP_FIXTURE_ROOT, "fixture.sqlite");
const BACKUP_MANIFEST_PATH = `${BACKUP_FIXTURE_PATH}.manifest.json`;
{
  const backupDb = new DatabaseSync(BACKUP_FIXTURE_PATH);
  backupDb.exec("CREATE TABLE verified_fixture (id INTEGER PRIMARY KEY)");
  backupDb.close();
}
const BACKUP_BYTES = readFileSync(BACKUP_FIXTURE_PATH);
const BACKUP_DATABASE_SHA256 = createHash("sha256").update(BACKUP_BYTES).digest("hex");
const BACKUP_MANIFEST = JSON.stringify({
  name: "fixture.sqlite",
  size: BACKUP_BYTES.length,
  createdAt: "2026-08-22T08:00:00.000Z",
  databaseSha256: BACKUP_DATABASE_SHA256,
});
writeFileSync(BACKUP_MANIFEST_PATH, BACKUP_MANIFEST);
const BACKUP_MANIFEST_SHA256 = createHash("sha256").update(BACKUP_MANIFEST).digest("hex");
test.after(() => rmSync(BACKUP_FIXTURE_ROOT, { recursive: true, force: true }));

function fixture() {
  const db = new DatabaseSync(":memory:");
  applySchemaBootstrap(db);
  applyAdditiveColumnMigrations(db);
  applyOperationalHistoryRetentionSchema(db);
  return db;
}

function insertActivity(db, { claimId = "claim-a", sourceKey, occurredAt, eventType = "market_sale" }) {
  db.prepare(`
    INSERT INTO activity_events (claim_id, event_type, summary, occurred_at, metadata_json, source_key)
    VALUES (?, ?, ?, ?, '{}', ?)
  `).run(claimId, eventType, sourceKey, occurredAt, sourceKey);
}

function insertTrade(db, {
  tradeId,
  occurredAt,
  claimId = "claim-a",
  quantity = "1",
  totalPrice = "2",
}) {
  db.prepare(`
    INSERT INTO market_trades (
      trade_id, claim_id, region_id, item_id, item_type, item_name,
      quantity, unit_price, total_price, occurred_at, imported_at, raw_json
    ) VALUES (?, ?, '19', '42', '0', 'Timber', ?, '2', ?, ?, ?, '{}')
  `).run(tradeId, claimId, quantity, totalPrice, occurredAt, occurredAt);
}

function verifiedBackup() {
  return {
    backupName: "fixture.sqlite",
    backupCreatedAt: "2026-08-22T08:00:00.000Z",
    verifiedAt: "2026-08-22T08:05:00.000Z",
    backupPath: BACKUP_FIXTURE_PATH,
    manifestPath: BACKUP_MANIFEST_PATH,
    manifestSha256: BACKUP_MANIFEST_SHA256,
    databaseSha256: BACKUP_DATABASE_SHA256,
    restoredDatabaseSha256: BACKUP_DATABASE_SHA256,
    restoredManifestSha256: BACKUP_MANIFEST_SHA256,
    restoredTemporaryDatabase: true,
    integrityCheck: "ok",
    backupBytes: BACKUP_BYTES.length,
  };
}

test("operational retention defaults are disabled with an empty production allowlist", () => {
  assert.deepEqual(OPERATIONAL_HISTORY_RETENTION_DEFAULTS, {
    enabled: false,
    days: 365,
    tables: [],
  });
  assert.deepEqual(normalizeOperationalHistoryRetentionSettings({}), OPERATIONAL_HISTORY_RETENTION_DEFAULTS);
  assert.throws(
    () => normalizeOperationalHistoryRetentionSettings({ days: 89 }),
    /between 90 and 3650/,
  );
  assert.throws(
    () => normalizeOperationalHistoryRetentionSettings({ enabled: true, tables: [] }),
    /approved table allowlist is empty/i,
  );
});

test("disabled and dry-run retention report cutoff boundaries and delete no rows", () => {
  const db = fixture();
  insertActivity(db, { sourceKey: "cutoff-minus", occurredAt: "2025-08-22T11:59:59.000Z" });
  insertActivity(db, { sourceKey: "cutoff-exact", occurredAt: CUTOFF });
  insertActivity(db, { sourceKey: "cutoff-plus", occurredAt: "2025-08-22T12:00:01.000Z" });
  insertActivity(db, { claimId: "claim-b", sourceKey: "other-claim", occurredAt: "2025-08-22T11:59:59.000Z" });

  const preview = operationalHistoryRetentionPreview(db, { now: NOW, days: 365 });
  const activity = preview.tables.find((row) => row.table === "activity_events");
  assert.equal(preview.cutoff, CUTOFF);
  assert.equal(activity.rowCount, 4);
  assert.equal(activity.eligibleRows, 2);
  assert.equal(activity.oldestOccurredAt, "2025-08-22T11:59:59.000Z");

  const disabled = runOperationalHistoryRetention(db, { now: NOW, enabled: false, dryRun: false, days: 365 });
  assert.equal(disabled.mode, "disabled");
  assert.equal(disabled.deletedRows, 0);
  const dryRun = runOperationalHistoryRetention(db, { now: NOW, enabled: false, dryRun: true, days: 365 });
  assert.equal(dryRun.mode, "dry-run");
  assert.equal(dryRun.deletedRows, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM activity_events").get().count, 4);
});

test("daily rollups preserve claims, typed item identity, source counts and idempotent watermarks", () => {
  const db = fixture();
  const insertTrade = db.prepare(`
    INSERT INTO market_trades (
      trade_id, claim_id, region_id, item_id, item_type, item_name,
      quantity, unit_price, total_price, occurred_at, imported_at, raw_json
    ) VALUES (?, ?, ?, ?, ?, 'Timber', ?, ?, ?, ?, ?, '{}')
  `);
  insertTrade.run("trade-1", "claim-a", "19", "42", "0", "2", "3", "6", "2025-08-21T01:00:00.000Z", "2025-08-21T01:00:01.000Z");
  insertTrade.run("trade-2", "claim-a", "19", "42", "1", "4", "5", "20", "2025-08-21T02:00:00.000Z", "2025-08-21T02:00:01.000Z");
  insertTrade.run("trade-3", "claim-b", "19", "42", "0", "1", "7", "7", "2025-08-21T03:00:00.000Z", "2025-08-21T03:00:01.000Z");
  insertActivity(db, { sourceKey: "duplicate-source", occurredAt: "2025-08-21T01:00:00.000Z", eventType: "market_sale" });
  insertActivity(db, { sourceKey: "duplicate-source", occurredAt: "2025-08-21T02:00:00.000Z", eventType: "production_started" });

  const first = buildOperationalHistoryRollups(db, { beforeDay: "2025-08-22" });
  const second = buildOperationalHistoryRollups(db, { beforeDay: "2025-08-22" });
  assert.equal(first.failedDays.length, 0);
  assert.equal(second.failedDays.length, 0);
  assert.deepEqual(
    db.prepare(`
      SELECT claim_id, item_id, item_type, sales_count, quantity, total_value
      FROM operational_history_market_trade_daily
      ORDER BY claim_id, item_type
    `).all().map((row) => ({ ...row })),
    [
      { claim_id: "claim-a", item_id: "42", item_type: "0", sales_count: 1, quantity: "2", total_value: "6" },
      { claim_id: "claim-a", item_id: "42", item_type: "1", sales_count: 1, quantity: "4", total_value: "20" },
      { claim_id: "claim-b", item_id: "42", item_type: "0", sales_count: 1, quantity: "1", total_value: "7" },
    ],
  );
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM operational_history_activity_daily").get().count, 2);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM operational_history_rollup_watermarks WHERE completion_state = 'complete'").get().count, 3);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM operational_history_market_trade_daily").get().count, 3);
});

test("market trade ingestion identities are append-only across raw-row deletion", () => {
  const db = fixture();
  insertTrade(db, { tradeId: "first", occurredAt: "2025-08-21T12:00:00.000Z" });
  const firstId = db.prepare(`
    SELECT ingestion_id FROM operational_history_source_ingestion_ids
    WHERE source_table = 'market_trades' AND source_key = 'first'
  `).get().ingestion_id;
  db.prepare("DELETE FROM market_trades WHERE trade_id = 'first'").run();
  insertTrade(db, { tradeId: "second", occurredAt: "2025-08-21T01:00:00.000Z" });
  const identities = db.prepare(`
    SELECT source_key, ingestion_id FROM operational_history_source_ingestion_ids
    WHERE source_table = 'market_trades' ORDER BY ingestion_id
  `).all().map((row) => ({ ...row }));
  assert.deepEqual(identities, [
    { source_key: "first", ingestion_id: firstId },
    { source_key: "second", ingestion_id: firstId + 1 },
  ]);
  db.close();
});

test("rollup-backed market history includes late rows before and after partial prune without double counting", () => {
  const beforePrune = fixture();
  insertTrade(beforePrune, { tradeId: "trade-a", occurredAt: "2025-08-21T01:00:00.000Z" });
  buildOperationalHistoryRollups(beforePrune, { beforeDay: "2025-08-22", sourceTables: ["market_trades"] });
  insertTrade(beforePrune, { tradeId: "trade-b", occurredAt: "2025-08-21T02:00:00.000Z", quantity: "3", totalPrice: "6" });
  assert.deepEqual(
    readOperationalMarketTradeDaily(beforePrune, { claimId: "claim-a", startDay: "2025-08-21", endDay: "2025-08-21" }),
    { daily: [{ day: "2025-08-21", salesCount: 2, unitsSold: "4", totalValue: "8" }], observedSince: "2025-08-21T01:00:00.000Z" },
  );
  beforePrune.close();

  const afterPrune = fixture();
  insertTrade(afterPrune, { tradeId: "trade-a", occurredAt: "2025-08-21T01:00:00.000Z" });
  insertTrade(afterPrune, { tradeId: "trade-b", occurredAt: "2025-08-21T02:00:00.000Z", quantity: "3", totalPrice: "6" });
  buildOperationalHistoryRollups(afterPrune, { beforeDay: "2025-08-22", sourceTables: ["market_trades"] });
  const pruned = runOperationalHistoryRetention(afterPrune, {
    now: NOW,
    enabled: true,
    dryRun: false,
    days: 365,
    tables: ["market_trades"],
    approvedTables: new Set(["market_trades"]),
    explicitConfirmation: "ENABLE OPERATIONAL HISTORY RETENTION",
    backupVerification: verifiedBackup(),
    approvedBackupRoot: BACKUP_FIXTURE_ROOT,
    batchSize: 1,
  });
  assert.equal(pruned.deletedRows, 1);
  insertTrade(afterPrune, { tradeId: "trade-c", occurredAt: "2025-08-21T03:00:00.000Z", quantity: "5", totalPrice: "10" });
  assert.deepEqual(
    readOperationalMarketTradeDaily(afterPrune, { claimId: "claim-a", startDay: "2025-08-21", endDay: "2025-08-21" }),
    { daily: [{ day: "2025-08-21", salesCount: 3, unitsSold: "9", totalValue: "18" }], observedSince: "2025-08-21T01:00:00.000Z" },
  );
  afterPrune.close();
});

test("hybrid membership uses ingestion order for an earlier backfill and a same-time lower source key", () => {
  const db = fixture();
  insertTrade(db, { tradeId: "trade-z", occurredAt: "2025-08-21T12:00:00.000Z" });
  buildOperationalHistoryRollups(db, { beforeDay: "2025-08-22", sourceTables: ["market_trades"] });
  insertTrade(db, { tradeId: "trade-a", occurredAt: "2025-08-21T01:00:00.000Z", quantity: "3", totalPrice: "6" });
  insertTrade(db, { tradeId: "trade-0", occurredAt: "2025-08-21T12:00:00.000Z", quantity: "5", totalPrice: "10" });

  assert.deepEqual(
    readOperationalMarketTradeDaily(db, { claimId: "claim-a", startDay: "2025-08-21", endDay: "2025-08-21" }),
    { daily: [{ day: "2025-08-21", salesCount: 3, unitsSold: "9", totalValue: "18" }], observedSince: "2025-08-21T01:00:00.000Z" },
  );
  db.close();
});

test("late trades with missing or invalid ingestion identities remain visible and emit a diagnostic", () => {
  const db = fixture();
  insertTrade(db, { tradeId: "covered", occurredAt: "2025-08-21T12:00:00.000Z" });
  buildOperationalHistoryRollups(db, { beforeDay: "2025-08-22", sourceTables: ["market_trades"] });
  db.exec("DROP TRIGGER operational_history_market_trade_ingestion_id");
  insertTrade(db, { tradeId: "missing-ledger", occurredAt: "2025-08-21T01:00:00.000Z", quantity: "3", totalPrice: "6" });
  insertTrade(db, { tradeId: "invalid-ledger", occurredAt: "2025-08-21T00:30:00.000Z", quantity: "2", totalPrice: "4" });
  db.prepare(`
    INSERT INTO operational_history_source_ingestion_ids (ingestion_id, source_table, source_key)
    VALUES (0, 'market_trades', 'invalid-ledger')
  `).run();
  const diagnostics = [];

  assert.deepEqual(
    readOperationalMarketTradeDaily(db, {
      claimId: "claim-a",
      startDay: "2025-08-21",
      endDay: "2025-08-21",
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    }),
    { daily: [{ day: "2025-08-21", salesCount: 3, unitsSold: "6", totalValue: "12" }], observedSince: "2025-08-21T00:30:00.000Z" },
  );
  assert.deepEqual(diagnostics, [{
    code: "operational_history_missing_ingestion_identity",
    claimId: "claim-a",
    rowCount: 2,
  }]);
  db.close();
});

test("unsafe pre-build market identities prevent rollup coverage and are never prune candidates", () => {
  const db = fixture();
  insertTrade(db, { tradeId: "valid", occurredAt: "2025-08-21T12:00:00.000Z" });
  db.exec("DROP TRIGGER operational_history_market_trade_ingestion_id");
  insertTrade(db, { tradeId: "missing", occurredAt: "2025-08-21T00:45:00.000Z", quantity: "2", totalPrice: "4" });
  insertTrade(db, { tradeId: "zero", occurredAt: "2025-08-21T00:30:00.000Z", quantity: "3", totalPrice: "6" });
  insertTrade(db, { tradeId: "negative", occurredAt: "2025-08-21T00:15:00.000Z", quantity: "4", totalPrice: "8" });
  insertTrade(db, { tradeId: "too-large", occurredAt: "2025-08-21T00:05:00.000Z", quantity: "5", totalPrice: "10" });
  db.prepare(`
    INSERT INTO operational_history_source_ingestion_ids (ingestion_id, source_table, source_key)
    VALUES
      (0, 'market_trades', 'zero'),
      (-1, 'market_trades', 'negative'),
      (9007199254740992, 'market_trades', 'too-large')
  `).run();

  const build = buildOperationalHistoryRollups(db, { beforeDay: "2025-08-22", sourceTables: ["market_trades"] });
  assert.equal(build.completedDays.length, 0);
  assert.equal(build.failedDays.length, 1);
  assert.match(build.failedDays[0].error, /safe positive ingestion identity/i);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM operational_history_market_trade_daily").get().count, 0);
  assert.equal(db.prepare(`
    SELECT COUNT(*) AS count FROM operational_history_rollup_watermarks
    WHERE source_table = 'market_trades' AND completion_state = 'complete'
  `).get().count, 0);

  const diagnostics = [];
  assert.deepEqual(
    readOperationalMarketTradeDaily(db, {
      claimId: "claim-a",
      startDay: "2025-08-21",
      endDay: "2025-08-21",
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    }),
    { daily: [{ day: "2025-08-21", salesCount: 5, unitsSold: "15", totalValue: "30" }], observedSince: "2025-08-21T00:05:00.000Z" },
  );
  assert.deepEqual(diagnostics, [{
    code: "operational_history_missing_ingestion_identity",
    claimId: "claim-a",
    rowCount: 4,
  }]);

  const prune = runOperationalHistoryRetention(db, {
    now: NOW,
    enabled: true,
    dryRun: false,
    days: 365,
    tables: ["market_trades"],
    approvedTables: new Set(["market_trades"]),
    explicitConfirmation: "ENABLE OPERATIONAL HISTORY RETENTION",
    backupVerification: verifiedBackup(),
    approvedBackupRoot: BACKUP_FIXTURE_ROOT,
  });
  assert.equal(prune.deletedRows, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM market_trades").get().count, 5);
  db.close();
});

test("earlier and same-time lower-key late trades remain visible after a partial prune", () => {
  const db = fixture();
  insertTrade(db, { tradeId: "trade-z", occurredAt: "2025-08-21T12:00:00.000Z" });
  insertTrade(db, { tradeId: "trade-y", occurredAt: "2025-08-21T13:00:00.000Z", quantity: "2", totalPrice: "4" });
  buildOperationalHistoryRollups(db, { beforeDay: "2025-08-22", sourceTables: ["market_trades"] });
  const pruned = runOperationalHistoryRetention(db, {
    now: NOW,
    enabled: true,
    dryRun: false,
    days: 365,
    tables: ["market_trades"],
    approvedTables: new Set(["market_trades"]),
    explicitConfirmation: "ENABLE OPERATIONAL HISTORY RETENTION",
    backupVerification: verifiedBackup(),
    approvedBackupRoot: BACKUP_FIXTURE_ROOT,
    batchSize: 1,
  });
  assert.equal(pruned.deletedRows, 1);
  insertTrade(db, { tradeId: "trade-a", occurredAt: "2025-08-21T01:00:00.000Z", quantity: "3", totalPrice: "6" });
  insertTrade(db, { tradeId: "trade-0", occurredAt: "2025-08-21T13:00:00.000Z", quantity: "4", totalPrice: "8" });

  assert.deepEqual(
    readOperationalMarketTradeDaily(db, { claimId: "claim-a", startDay: "2025-08-21", endDay: "2025-08-21" }),
    { daily: [{ day: "2025-08-21", salesCount: 4, unitsSold: "10", totalValue: "20" }], observedSince: "2025-08-21T01:00:00.000Z" },
  );
  db.close();
});

test("covered-row mutation invalidates rollup parity and falls back to retained raw detail", () => {
  const db = fixture();
  insertTrade(db, { tradeId: "covered", occurredAt: "2025-08-21T12:00:00.000Z" });
  buildOperationalHistoryRollups(db, { beforeDay: "2025-08-22", sourceTables: ["market_trades"] });
  db.prepare("UPDATE market_trades SET quantity = '9', total_price = '18' WHERE trade_id = 'covered'").run();
  assert.deepEqual(
    readOperationalMarketTradeDaily(db, { claimId: "claim-a", startDay: "2025-08-21", endDay: "2025-08-21" }),
    { daily: [{ day: "2025-08-21", salesCount: 1, unitsSold: "9", totalValue: "18" }], observedSince: "2025-08-21T12:00:00.000Z" },
  );
  db.close();
});

test("normal rollup-backed market reads do not rescan covered source fields for fingerprints", () => {
  const db = fixture();
  insertTrade(db, { tradeId: "covered", occurredAt: "2025-08-21T12:00:00.000Z" });
  buildOperationalHistoryRollups(db, { beforeDay: "2025-08-22", sourceTables: ["market_trades"] });
  insertTrade(db, { tradeId: "late", occurredAt: "2025-08-21T13:00:00.000Z", quantity: "3", totalPrice: "6" });
  db.setAuthorizer((action, table, column) => {
    if (action === sqliteConstants.SQLITE_READ && table === "market_trades" && column === "imported_at") {
      return sqliteConstants.SQLITE_DENY;
    }
    return sqliteConstants.SQLITE_OK;
  });
  let rawRowsReturned = null;
  const instrumentedDb = {
    prepare(sql) {
      const statement = db.prepare(sql);
      return {
        all(...parameters) {
          const rows = statement.all(...parameters);
          if (/WITH coverage AS/.test(sql)) rawRowsReturned = rows.length;
          return rows;
        },
      };
    },
  };

  assert.deepEqual(
    readOperationalMarketTradeDaily(instrumentedDb, { claimId: "claim-a", startDay: "2025-08-21", endDay: "2025-08-21" }),
    { daily: [{ day: "2025-08-21", salesCount: 2, unitsSold: "4", totalValue: "8" }], observedSince: "2025-08-21T12:00:00.000Z" },
  );
  assert.equal(rawRowsReturned, 1);
  db.setAuthorizer(null);
  db.close();
});

test("a covered mutation after partial prune fails closed instead of serving a stale rollup", () => {
  const db = fixture();
  insertTrade(db, { tradeId: "pruned", occurredAt: "2025-08-21T01:00:00.000Z" });
  insertTrade(db, { tradeId: "retained", occurredAt: "2025-08-21T02:00:00.000Z", quantity: "2", totalPrice: "4" });
  buildOperationalHistoryRollups(db, { beforeDay: "2025-08-22", sourceTables: ["market_trades"] });
  const result = runOperationalHistoryRetention(db, {
    now: NOW,
    enabled: true,
    dryRun: false,
    days: 365,
    tables: ["market_trades"],
    approvedTables: new Set(["market_trades"]),
    explicitConfirmation: "ENABLE OPERATIONAL HISTORY RETENTION",
    backupVerification: verifiedBackup(),
    approvedBackupRoot: BACKUP_FIXTURE_ROOT,
    batchSize: 1,
  });
  assert.equal(result.deletedRows, 1);
  db.prepare("UPDATE market_trades SET quantity = '9', total_price = '18' WHERE trade_id = 'retained'").run();
  assert.throws(
    () => readOperationalMarketTradeDaily(db, { claimId: "claim-a", startDay: "2025-08-21", endDay: "2025-08-21" }),
    /parity is invalid/i,
  );
  db.close();
});

test("a migration-invalidated watermark after partial prune makes retained history explicitly unavailable", () => {
  const db = fixture();
  insertTrade(db, { tradeId: "pruned", occurredAt: "2025-08-21T01:00:00.000Z" });
  insertTrade(db, { tradeId: "retained", occurredAt: "2025-08-21T02:00:00.000Z", quantity: "2", totalPrice: "4" });
  buildOperationalHistoryRollups(db, { beforeDay: "2025-08-22", sourceTables: ["market_trades"] });
  const result = runOperationalHistoryRetention(db, {
    now: NOW,
    enabled: true,
    dryRun: false,
    days: 365,
    tables: ["market_trades"],
    approvedTables: new Set(["market_trades"]),
    explicitConfirmation: "ENABLE OPERATIONAL HISTORY RETENTION",
    backupVerification: verifiedBackup(),
    approvedBackupRoot: BACKUP_FIXTURE_ROOT,
    batchSize: 1,
  });
  assert.equal(result.deletedRows, 1);

  db.exec("DROP TRIGGER operational_history_market_trade_ingestion_id");
  insertTrade(db, { tradeId: "trigger-gap", occurredAt: "2025-08-21T00:30:00.000Z", quantity: "3", totalPrice: "6" });
  applyOperationalHistoryRetentionSchema(db);
  assert.deepEqual(
    { ...db.prepare(`
      SELECT completion_state, pruned_row_count
      FROM operational_history_rollup_watermarks
      WHERE source_table = 'market_trades' AND claim_id = 'claim-a' AND utc_day = '2025-08-21'
    `).get() },
    { completion_state: "failed", pruned_row_count: 1 },
  );

  const diagnostics = [];
  assert.throws(
    () => readOperationalMarketTradeDaily(db, {
      claimId: "claim-a",
      startDay: "2025-08-21",
      endDay: "2025-08-21",
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    }),
    (error) => error?.code === "operational_history_unavailable"
      && error?.reason === "watermark_not_complete"
      && error?.utcDay === "2025-08-21",
  );
  assert.deepEqual(diagnostics, [{
    code: "operational_history_unavailable",
    claimId: "claim-a",
    utcDay: "2025-08-21",
    reason: "watermark_not_complete",
    prunedRowCount: 1,
  }]);
  db.close();
});

test("an incomplete coverage record after partial prune makes retained history explicitly unavailable", () => {
  const db = fixture();
  insertTrade(db, { tradeId: "pruned", occurredAt: "2025-08-21T01:00:00.000Z" });
  insertTrade(db, { tradeId: "retained", occurredAt: "2025-08-21T02:00:00.000Z" });
  buildOperationalHistoryRollups(db, { beforeDay: "2025-08-22", sourceTables: ["market_trades"] });
  runOperationalHistoryRetention(db, {
    now: NOW,
    enabled: true,
    dryRun: false,
    days: 365,
    tables: ["market_trades"],
    approvedTables: new Set(["market_trades"]),
    explicitConfirmation: "ENABLE OPERATIONAL HISTORY RETENTION",
    backupVerification: verifiedBackup(),
    approvedBackupRoot: BACKUP_FIXTURE_ROOT,
    batchSize: 1,
  });
  db.prepare(`
    UPDATE operational_history_rollup_watermarks
    SET remaining_source_fingerprint = ''
    WHERE source_table = 'market_trades'
  `).run();
  const diagnostics = [];
  assert.throws(
    () => readOperationalMarketTradeDaily(db, {
      claimId: "claim-a",
      startDay: "2025-08-21",
      endDay: "2025-08-21",
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    }),
    (error) => error?.code === "operational_history_unavailable"
      && error?.reason === "watermark_coverage_incomplete",
  );
  assert.equal(diagnostics[0]?.reason, "watermark_coverage_incomplete");
  db.close();
});

test("a legacy watermark without ingestion boundaries after partial prune fails closed", () => {
  const db = fixture();
  insertTrade(db, { tradeId: "pruned", occurredAt: "2025-08-21T01:00:00.000Z" });
  insertTrade(db, { tradeId: "retained", occurredAt: "2025-08-21T02:00:00.000Z" });
  buildOperationalHistoryRollups(db, { beforeDay: "2025-08-22", sourceTables: ["market_trades"] });
  runOperationalHistoryRetention(db, {
    now: NOW,
    enabled: true,
    dryRun: false,
    days: 365,
    tables: ["market_trades"],
    approvedTables: new Set(["market_trades"]),
    explicitConfirmation: "ENABLE OPERATIONAL HISTORY RETENTION",
    backupVerification: verifiedBackup(),
    approvedBackupRoot: BACKUP_FIXTURE_ROOT,
    batchSize: 1,
  });
  db.prepare(`
    UPDATE operational_history_rollup_watermarks
    SET source_max_ingestion_id = NULL, source_max_mutation_id = NULL
    WHERE source_table = 'market_trades'
  `).run();
  const diagnostics = [];
  assert.throws(
    () => readOperationalMarketTradeDaily(db, {
      claimId: "claim-a",
      startDay: "2025-08-21",
      endDay: "2025-08-21",
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    }),
    (error) => error?.code === "operational_history_unavailable"
      && error?.reason === "watermark_coverage_incomplete",
  );
  assert.equal(diagnostics[0]?.prunedRowCount, 1);
  db.close();
});

test("a failed but unpruned watermark safely falls back to complete raw history", () => {
  const db = fixture();
  insertTrade(db, { tradeId: "raw-a", occurredAt: "2025-08-21T01:00:00.000Z" });
  insertTrade(db, { tradeId: "raw-b", occurredAt: "2025-08-21T02:00:00.000Z", quantity: "2", totalPrice: "4" });
  buildOperationalHistoryRollups(db, { beforeDay: "2025-08-22", sourceTables: ["market_trades"] });
  db.prepare(`
    UPDATE operational_history_rollup_watermarks
    SET completion_state = 'failed', last_error = 'fixture invalidation'
    WHERE source_table = 'market_trades'
  `).run();
  assert.deepEqual(
    readOperationalMarketTradeDaily(db, { claimId: "claim-a", startDay: "2025-08-21", endDay: "2025-08-21" }),
    { daily: [{ day: "2025-08-21", salesCount: 2, unitsSold: "3", totalValue: "6" }], observedSince: "2025-08-21T01:00:00.000Z" },
  );
  db.close();
});

test("the market report boundary contains an unavailable retained-history error", () => {
  const db = fixture();
  insertTrade(db, { tradeId: "raw-a", occurredAt: "2025-08-21T01:00:00.000Z" });
  buildOperationalHistoryRollups(db, { beforeDay: "2025-08-22", sourceTables: ["market_trades"] });
  db.prepare(`
    UPDATE operational_history_rollup_watermarks
    SET completion_state = 'failed', pruned_row_count = 1
    WHERE source_table = 'market_trades'
  `).run();

  assert.deepEqual(
    readOperationalMarketTradeDailyReport(db, { claimId: "claim-a", startDay: "2025-08-21", endDay: "2025-08-21" }),
    {
      daily: [],
      observedSince: null,
      historyWarning: {
        code: "operational_history_unavailable",
        message: "Retained market history is temporarily unavailable.",
        utcDay: "2025-08-21",
      },
    },
  );
  db.close();
});

test("market history includes a raw trade at the final millisecond of the requested UTC day", () => {
  const db = fixture();
  insertTrade(db, { tradeId: "final-ms", occurredAt: "2025-08-21T23:59:59.999Z" });
  assert.deepEqual(
    readOperationalMarketTradeDaily(db, { claimId: "claim-a", startDay: "2025-08-21", endDay: "2025-08-21" }).daily,
    [{ day: "2025-08-21", salesCount: 1, unitsSold: "1", totalValue: "2" }],
  );
  db.close();
});

test("a migrated complete watermark without an exact coverage boundary is ignored instead of double counted", () => {
  const db = fixture();
  insertTrade(db, { tradeId: "legacy-covered", occurredAt: "2025-08-21T01:00:00.000Z" });
  buildOperationalHistoryRollups(db, { beforeDay: "2025-08-22", sourceTables: ["market_trades"] });
  db.prepare(`
    UPDATE operational_history_rollup_watermarks
    SET source_max_occurred_at = NULL, source_fingerprint = '', remaining_source_fingerprint = ''
    WHERE source_table = 'market_trades'
  `).run();
  assert.deepEqual(
    readOperationalMarketTradeDaily(db, { claimId: "claim-a", startDay: "2025-08-21", endDay: "2025-08-21" }).daily,
    [{ day: "2025-08-21", salesCount: 1, unitsSold: "1", totalValue: "2" }],
  );
  db.close();
});

test("pruning requires complete watermarks and deletes at most 5000 rows below cutoff", () => {
  const db = fixture();
  const insert = db.prepare(`
    INSERT INTO activity_events (claim_id, event_type, summary, occurred_at, metadata_json, source_key)
    VALUES ('claim-a', 'event', ?, ?, '{}', ?)
  `);
  db.exec("BEGIN");
  for (let index = 0; index < 5002; index += 1) {
    const source = `old-${index}`;
    insert.run(source, "2025-08-21T01:00:00.000Z", source);
  }
  insert.run("exact", CUTOFF, "exact");
  insert.run("plus", "2025-08-22T12:00:01.000Z", "plus");
  insert.run("incomplete-day", "2025-08-20T01:00:00.000Z", "incomplete-day");
  db.exec("COMMIT");
  buildOperationalHistoryRollups(db, { beforeDay: "2025-08-22", sourceTables: ["activity_events"] });
  db.prepare(`
    UPDATE operational_history_rollup_watermarks
    SET completion_state = 'failed'
    WHERE source_table = 'activity_events' AND utc_day = '2025-08-20'
  `).run();

  const result = runOperationalHistoryRetention(db, {
    now: NOW,
    enabled: true,
    dryRun: false,
    days: 365,
    tables: ["activity_events"],
    approvedTables: new Set(["activity_events"]),
    explicitConfirmation: "ENABLE OPERATIONAL HISTORY RETENTION",
    backupVerification: verifiedBackup(),
    approvedBackupRoot: BACKUP_FIXTURE_ROOT,
    batchSize: 9000,
  });
  assert.equal(result.deletedRows, 5000);
  assert.equal(result.batchSize, 5000);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM activity_events WHERE source_key LIKE 'old-%'").get().count, 2);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM activity_events WHERE source_key IN ('exact', 'plus', 'incomplete-day')").get().count, 3);
  buildOperationalHistoryRollups(db, { beforeDay: "2025-08-22", sourceTables: ["activity_events"] });
  assert.deepEqual({ ...db.prepare(`
    SELECT source_row_count, pruned_row_count
    FROM operational_history_rollup_watermarks
    WHERE source_table = 'activity_events' AND claim_id = 'claim-a' AND utc_day = '2025-08-21'
  `).get() }, { source_row_count: 5002, pruned_row_count: 5000 });
  assert.equal(db.prepare(`
    SELECT event_count FROM operational_history_activity_daily
    WHERE claim_id = 'claim-a' AND utc_day = '2025-08-21' AND event_type = 'event'
  `).get().event_count, 5002);
});

test("a late source row outside the captured boundary remains raw and is never pruned as covered", () => {
  const db = fixture();
  insertActivity(db, { sourceKey: "rolled", occurredAt: "2025-08-21T01:00:00.000Z" });
  buildOperationalHistoryRollups(db, { beforeDay: "2025-08-22", sourceTables: ["activity_events"] });
  insertActivity(db, { sourceKey: "late", occurredAt: "2025-08-21T02:00:00.000Z" });

  const result = runOperationalHistoryRetention(db, {
    now: NOW,
    enabled: true,
    dryRun: false,
    days: 365,
    tables: ["activity_events"],
    approvedTables: new Set(["activity_events"]),
    explicitConfirmation: "ENABLE OPERATIONAL HISTORY RETENTION",
    backupVerification: verifiedBackup(),
    approvedBackupRoot: BACKUP_FIXTURE_ROOT,
  });
  assert.equal(result.deletedRows, 1);
  assert.deepEqual(
    db.prepare("SELECT source_key, occurred_at FROM activity_events").all().map((row) => ({ ...row })),
    [{ source_key: "late", occurred_at: "2025-08-21T02:00:00.000Z" }],
  );
});

test("same-count same-boundary source mutation fails fingerprint validation before pruning", () => {
  const db = fixture();
  insertActivity(db, { sourceKey: "first", occurredAt: "2025-08-21T01:00:00.000Z", eventType: "market_sale" });
  insertActivity(db, { sourceKey: "boundary", occurredAt: "2025-08-21T02:00:00.000Z", eventType: "market_sale" });
  buildOperationalHistoryRollups(db, { beforeDay: "2025-08-22", sourceTables: ["activity_events"] });
  db.prepare("UPDATE activity_events SET event_type = 'production_started' WHERE source_key = 'first'").run();

  const result = runOperationalHistoryRetention(db, {
    now: NOW,
    enabled: true,
    dryRun: false,
    days: 365,
    tables: ["activity_events"],
    approvedTables: new Set(["activity_events"]),
    explicitConfirmation: "ENABLE OPERATIONAL HISTORY RETENTION",
    backupVerification: verifiedBackup(),
    approvedBackupRoot: BACKUP_FIXTURE_ROOT,
  });
  assert.equal(result.deletedRows, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM activity_events").get().count, 2);
});

test("a concurrent writer transaction on a second connection blocks prune before validation or deletion", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "operational-retention-race-"));
  const databasePath = path.join(directory, "fixture.sqlite");
  const pruneConnection = new DatabaseSync(databasePath);
  const writerConnection = new DatabaseSync(databasePath);
  try {
    applySchemaBootstrap(pruneConnection);
    applyAdditiveColumnMigrations(pruneConnection);
    applyOperationalHistoryRetentionSchema(pruneConnection);
    insertActivity(pruneConnection, { sourceKey: "covered", occurredAt: "2025-08-21T01:00:00.000Z" });
    buildOperationalHistoryRollups(pruneConnection, { beforeDay: "2025-08-22", sourceTables: ["activity_events"] });

    writerConnection.exec("PRAGMA busy_timeout = 0; BEGIN IMMEDIATE");
    insertActivity(writerConnection, { sourceKey: "racing", occurredAt: "2025-08-21T02:00:00.000Z" });
    assert.throws(() => runOperationalHistoryRetention(pruneConnection, {
      now: NOW,
      enabled: true,
      dryRun: false,
      days: 365,
      tables: ["activity_events"],
      approvedTables: new Set(["activity_events"]),
      explicitConfirmation: "ENABLE OPERATIONAL HISTORY RETENTION",
      backupVerification: verifiedBackup(),
      approvedBackupRoot: BACKUP_FIXTURE_ROOT,
    }), /busy|locked/i);
    assert.equal(pruneConnection.prepare("SELECT COUNT(*) AS count FROM activity_events").get().count, 1);
    writerConnection.exec("ROLLBACK");
    assert.equal(pruneConnection.prepare("SELECT COUNT(*) AS count FROM activity_events").get().count, 1);
  } finally {
    try { writerConnection.exec("ROLLBACK"); } catch {}
    writerConnection.close();
    pruneConnection.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("enabling fails closed without allowlist approval, confirmation, current verified backup, or complete watermark", () => {
  const db = fixture();
  const base = { now: NOW, enabled: true, dryRun: false, days: 365, tables: ["activity_events"] };
  assert.throws(() => runOperationalHistoryRetention(db, base), /not approved/i);
  assert.throws(() => runOperationalHistoryRetention(db, { ...base, approvedTables: new Set(["activity_events"]) }), /explicit confirmation/i);
  assert.throws(() => runOperationalHistoryRetention(db, {
    ...base,
    approvedTables: new Set(["activity_events"]),
    explicitConfirmation: "ENABLE OPERATIONAL HISTORY RETENTION",
  }), /verified backup/i);
  assert.throws(() => runOperationalHistoryRetention(db, {
    ...base,
    approvedTables: new Set(["activity_events"]),
    explicitConfirmation: "ENABLE OPERATIONAL HISTORY RETENTION",
    backupVerification: { ...verifiedBackup(), verifiedAt: "2026-08-20T08:05:00.000Z" },
  }), /within 24 hours/i);
});

test("the scheduled retention job never builds rollups and runs only a deletion-disabled aggregate preview", () => {
  const calls = [];
  const run = createOperationalHistoryRetentionDryRunJob({
    buildRollups: () => { throw new Error("scheduled publication path must not build rollups"); },
    runRetention: (_db, options) => { calls.push(["retention", options]); return { mode: "dry-run", deletedRows: 0 }; },
    db: {},
    readSettings: () => ({ days: 365, tables: [], enabled: false }),
    now: () => NOW,
  });

  assert.deepEqual(run(), {
    mode: "dry-run",
    deletedRows: 0,
  });
  assert.deepEqual(calls[0], ["retention", {
    now: NOW,
    days: 365,
    tables: [],
    enabled: false,
    dryRun: true,
  }]);
});

test("backup readiness is accepted only as a machine record with manifest, restored temp DB, and integrity evidence", () => {
  const db = fixture();
  const evidence = verifiedBackup();
  const stored = recordOperationalHistoryBackupVerification(db, evidence);
  assert.deepEqual(stored, {
    backupName: "fixture.sqlite",
    backupCreatedAt: evidence.backupCreatedAt,
    verifiedAt: evidence.verifiedAt,
    manifestSha256: evidence.manifestSha256,
    databaseSha256: evidence.databaseSha256,
    backupPath: evidence.backupPath,
    manifestPath: evidence.manifestPath,
    restoredDatabaseSha256: evidence.restoredDatabaseSha256,
    restoredManifestSha256: evidence.restoredManifestSha256,
    restoredTemporaryDatabase: true,
    integrityCheck: "ok",
    backupBytes: evidence.backupBytes,
  });
  assert.throws(() => recordOperationalHistoryBackupVerification(db, { ...evidence, restoredTemporaryDatabase: false }), /temporary restore/);
});

test("enable gate reopens an artifact under the approved root and rejects missing, tampered, or outside-root evidence", () => {
  const base = {
    now: NOW,
    approvedTables: new Set(["activity_events"]),
    tables: ["activity_events"],
    explicitConfirmation: "ENABLE OPERATIONAL HISTORY RETENTION",
    backupVerification: verifiedBackup(),
    approvedBackupRoot: BACKUP_FIXTURE_ROOT,
  };
  assert.doesNotThrow(() => validateOperationalHistoryRetentionEnableGate(base));
  assert.throws(() => validateOperationalHistoryRetentionEnableGate({
    ...base,
    backupVerification: { ...verifiedBackup(), backupPath: path.join(BACKUP_FIXTURE_ROOT, "missing.sqlite") },
  }), /artifact.*exist|missing/i);
  assert.throws(() => validateOperationalHistoryRetentionEnableGate({
    ...base,
    backupVerification: { ...verifiedBackup(), manifestPath: path.join(BACKUP_FIXTURE_ROOT, "missing.manifest.json") },
  }), /manifest.*exist|missing/i);

  const tamperedPath = path.join(BACKUP_FIXTURE_ROOT, "tampered.sqlite");
  writeFileSync(tamperedPath, Buffer.concat([BACKUP_BYTES, Buffer.from("tampered")]));
  assert.throws(() => validateOperationalHistoryRetentionEnableGate({
    ...base,
    backupVerification: { ...verifiedBackup(), backupPath: tamperedPath },
  }), /hash|size|integrity/i);

  const approvedSubdirectory = path.join(BACKUP_FIXTURE_ROOT, "approved-production-root");
  mkdirSync(approvedSubdirectory);
  assert.throws(() => validateOperationalHistoryRetentionEnableGate({ ...base, approvedBackupRoot: approvedSubdirectory }), /outside.*root/i);
});

test("enable gate rejects a configured production root that canonically aliases the local download root", () => {
  const localDownloadRoot = path.join(BACKUP_FIXTURE_ROOT, "local-download-root");
  const configuredAlias = path.join(BACKUP_FIXTURE_ROOT, "configured-alias");
  mkdirSync(localDownloadRoot);
  mkdirSync(configuredAlias);
  assert.throws(() => validateOperationalHistoryRetentionEnableGate({
    now: NOW,
    approvedTables: new Set(["activity_events"]),
    tables: ["activity_events"],
    explicitConfirmation: "ENABLE OPERATIONAL HISTORY RETENTION",
    backupVerification: verifiedBackup(),
    approvedBackupRoot: configuredAlias,
    disallowedBackupRoots: [localDownloadRoot],
    canonicalizePath: (value) => value === configuredAlias ? localDownloadRoot : value,
  }), /local downloadable backup root/i);
});

test("enable gate rejects a real filesystem alias to the local download root when supported", (context) => {
  const aliasParent = mkdtempSync(path.join(tmpdir(), "operational-retention-alias-"));
  const aliasPath = path.join(aliasParent, "backup-alias");
  try {
    try {
      symlinkSync(BACKUP_FIXTURE_ROOT, aliasPath, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      context.skip(`Filesystem alias creation unavailable: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    assert.throws(() => validateOperationalHistoryRetentionEnableGate({
      now: NOW,
      approvedTables: new Set(["activity_events"]),
      tables: ["activity_events"],
      explicitConfirmation: "ENABLE OPERATIONAL HISTORY RETENTION",
      backupVerification: verifiedBackup(),
      approvedBackupRoot: aliasPath,
      disallowedBackupRoots: [BACKUP_FIXTURE_ROOT],
    }), /local downloadable backup root/i);
  } finally {
    rmSync(aliasParent, { recursive: true, force: true });
  }
});
