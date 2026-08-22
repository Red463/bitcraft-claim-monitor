import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { applySchemaBootstrap } from "../src/server/schemaBootstrap.mjs";
import { applyAdditiveColumnMigrations } from "../src/server/schemaMigrations.mjs";
import { createOperationalHistoryRetentionDryRunJob } from "../src/server/scheduledJobs.mjs";
import {
  OPERATIONAL_HISTORY_RETENTION_DEFAULTS,
  applyOperationalHistoryRetentionSchema,
  buildOperationalHistoryRollups,
  normalizeOperationalHistoryRetentionSettings,
  operationalHistoryRetentionPreview,
  recordOperationalHistoryBackupVerification,
  runOperationalHistoryRetention,
} from "../src/server/operationalHistoryRetention.mjs";

const NOW = new Date("2026-08-22T12:00:00.000Z");
const CUTOFF = "2025-08-22T12:00:00.000Z";

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

function verifiedBackup() {
  return {
    backupCreatedAt: "2026-08-22T08:00:00.000Z",
    verifiedAt: "2026-08-22T08:05:00.000Z",
    manifestSha256: "a".repeat(64),
    restoredTemporaryDatabase: true,
    integrityCheck: "ok",
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

test("a source day that changes after rollup completion fails closed before pruning", () => {
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
  });
  assert.equal(result.deletedRows, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM activity_events").get().count, 2);
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

test("the scheduled retention job always runs rollups followed by a deletion-disabled dry run", () => {
  const calls = [];
  const run = createOperationalHistoryRetentionDryRunJob({
    buildRollups: (_db, options) => { calls.push(["rollups", options]); return { completedDays: [{ utcDay: "2025-08-21" }], failedDays: [] }; },
    runRetention: (_db, options) => { calls.push(["retention", options]); return { mode: "dry-run", deletedRows: 0 }; },
    db: {},
    readSettings: () => ({ days: 365, tables: [], enabled: false }),
    now: () => NOW,
  });

  assert.deepEqual(run(), {
    mode: "dry-run",
    deletedRows: 0,
    rollups: { completedDays: 1, failedDays: 0 },
  });
  assert.equal(calls[0][0], "rollups");
  assert.deepEqual(calls[1], ["retention", {
    now: NOW,
    days: 365,
    tables: [],
    enabled: false,
    dryRun: true,
  }]);
});

test("backup readiness is accepted only as a machine record with manifest, restored temp DB, and integrity evidence", () => {
  const db = fixture();
  const evidence = {
    ...verifiedBackup(),
    backupName: "fixture.sqlite",
    databaseSha256: "b".repeat(64),
    backupBytes: 4096,
  };
  const stored = recordOperationalHistoryBackupVerification(db, evidence);
  assert.deepEqual(stored, {
    backupName: "fixture.sqlite",
    backupCreatedAt: evidence.backupCreatedAt,
    verifiedAt: evidence.verifiedAt,
    manifestSha256: evidence.manifestSha256,
    databaseSha256: evidence.databaseSha256,
    restoredTemporaryDatabase: true,
    integrityCheck: "ok",
    backupBytes: 4096,
  });
  assert.throws(() => recordOperationalHistoryBackupVerification(db, { ...evidence, restoredTemporaryDatabase: false }), /temporary restore/);
});
