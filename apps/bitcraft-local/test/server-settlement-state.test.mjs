import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createPreparedStatements } from "../src/server/preparedStatements.mjs";
import { applySchemaBootstrap } from "../src/server/schemaBootstrap.mjs";
import {
  applyAdditiveColumnMigrations,
  applySettlementStateMigration,
} from "../src/server/schemaMigrations.mjs";

test("settlement state migration keeps the newest legacy snapshot per claim and removes history", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      claim_id TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      supplies REAL,
      treasury REAL,
      members_count INTEGER,
      buildings_count INTEGER,
      market_count INTEGER,
      raw_json TEXT NOT NULL
    );
    INSERT INTO snapshots (claim_id,captured_at,supplies,treasury,members_count,buildings_count,market_count,raw_json)
    VALUES
      ('a','2026-07-14T10:00:00.000Z',10,20,3,4,5,'{}'),
      ('a','2026-07-14T11:00:00.000Z',11,21,4,5,6,'{}'),
      ('b','2026-07-14T09:00:00.000Z',30,40,7,8,9,'{}');
  `);

  applySettlementStateMigration(db);

  assert.deepEqual(db.prepare("SELECT * FROM settlement_state_current ORDER BY claim_id").all().map((row) => ({ ...row })), [
    { claim_id: "a", captured_at: "2026-07-14T11:00:00.000Z", supplies: "11", treasury: "21", members_count: 4, buildings_count: 5, market_count: 6, updated_at: "2026-07-14T11:00:00.000Z" },
    { claim_id: "b", captured_at: "2026-07-14T09:00:00.000Z", supplies: "30", treasury: "40", members_count: 7, buildings_count: 8, market_count: 9, updated_at: "2026-07-14T09:00:00.000Z" },
  ]);
  assert.equal(db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='snapshots'").get(), undefined);
  db.close();
});

test("settlement state migration uses the highest id when legacy capture times match", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      claim_id TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      supplies REAL,
      treasury REAL,
      members_count INTEGER,
      buildings_count INTEGER,
      market_count INTEGER,
      raw_json TEXT NOT NULL
    );
    INSERT INTO snapshots (claim_id,captured_at,supplies,treasury,members_count,buildings_count,market_count,raw_json)
    VALUES
      ('a','2026-07-14T11:00:00.000Z',10,20,3,4,5,'{}'),
      ('a','2026-07-14T11:00:00.000Z',99,29,8,9,10,'{}');
  `);

  applySettlementStateMigration(db);

  assert.deepEqual({ ...db.prepare("SELECT * FROM settlement_state_current WHERE claim_id = 'a'").get() }, {
    claim_id: "a",
    captured_at: "2026-07-14T11:00:00.000Z",
    supplies: "99",
    treasury: "29",
    members_count: 8,
    buildings_count: 9,
    market_count: 10,
    updated_at: "2026-07-14T11:00:00.000Z",
  });
  db.close();
});

test("settlement state migration is idempotent after legacy history is removed", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      claim_id TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      supplies REAL,
      treasury REAL,
      members_count INTEGER,
      buildings_count INTEGER,
      market_count INTEGER,
      raw_json TEXT NOT NULL
    );
    INSERT INTO snapshots (claim_id,captured_at,supplies,treasury,members_count,buildings_count,market_count,raw_json)
    VALUES ('a','2026-07-14T11:00:00.000Z',11,21,4,5,6,'{}');
  `);

  applySettlementStateMigration(db);
  applySettlementStateMigration(db);

  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM settlement_state_current").get().count, 1);
  assert.equal(db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='snapshots'").get(), undefined);
  db.close();
});

test("settlement state migration rolls back a forced commit failure", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      claim_id TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      supplies REAL,
      treasury REAL,
      members_count INTEGER,
      buildings_count INTEGER,
      market_count INTEGER,
      raw_json TEXT NOT NULL
    );
    INSERT INTO snapshots (claim_id,captured_at,supplies,treasury,members_count,buildings_count,market_count,raw_json)
    VALUES ('a','2026-07-14T11:00:00.000Z',11,21,4,5,6,'{}');
  `);
  const failingDb = {
    exec(sql) {
      if (sql === "COMMIT") throw new Error("forced commit failure");
      return db.exec(sql);
    },
    prepare(sql) {
      return db.prepare(sql);
    },
  };

  assert.throws(() => applySettlementStateMigration(failingDb), /forced commit failure/);

  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM snapshots").get().count, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM settlement_state_current").get().count, 0);
  db.close();
});

test("settlement state migration locks before checking for legacy history", () => {
  const calls = [];
  const db = {
    exec(sql) {
      calls.push(["exec", sql.trim()]);
    },
    prepare(sql) {
      calls.push(["prepare", sql]);
      return {
        all: () => [
          { name: "supplies", type: "TEXT" },
          { name: "treasury", type: "TEXT" },
        ],
        get: () => undefined,
      };
    },
  };

  applySettlementStateMigration(db);

  assert.equal(calls[1][1], "BEGIN IMMEDIATE");
  assert.match(calls[2][1], /PRAGMA table_info/);
  assert.match(calls[3][1], /sqlite_schema/);
  assert.equal(calls[4][1], "COMMIT");
});

test("settlementStateSummary derives current settlement row fields", async () => {
  const { settlementStateSummary } = await import("../src/server/settlementState.mjs");
  const payload = {
    claimId: "12345678",
    claim: { supplies: "9007199254740993125", treasury: "450" },
    membersCount: "7",
    market: { listings: [{ id: 1 }, { id: 2 }] },
  };

  assert.deepEqual(settlementStateSummary(payload), {
    claimId: "12345678",
    supplies: "9007199254740993125",
    treasury: "450",
    membersCount: 7,
    buildingsCount: null,
    marketCount: 2,
  });
});

test("settlementStateActivityChanges preserves exact decimal strings and emits exact signed deltas", async () => {
  const { settlementStateActivityChanges } = await import("../src/server/settlementState.mjs");
  const previous = {
    supplies: "9007199254740993125",
    treasury: "9007199254740993000",
    members_count: 3,
    buildings_count: 2,
    market_count: 5,
  };
  const next = {
    supplies: "9007199254740993000",
    treasury: "9007199254740993125",
    membersCount: 3,
    buildingsCount: null,
    marketCount: 5,
  };

  assert.deepEqual(settlementStateActivityChanges(previous, next), [
    {
      type: "supplies",
      summary: "-125 supplies",
      metadata: { before: "9007199254740993125", after: "9007199254740993000" },
    },
    {
      type: "treasury",
      summary: "+125g to treasury",
      metadata: { before: "9007199254740993000", after: "9007199254740993125" },
    },
  ]);
});

test("settlementStateActivityChanges does not emit an activity event without a previous baseline", async () => {
  const { settlementStateActivityChanges } = await import("../src/server/settlementState.mjs");

  assert.deepEqual(settlementStateActivityChanges(null, {
    supplies: 10,
    treasury: 20,
    membersCount: 3,
    buildingsCount: 2,
    marketCount: 1,
  }), []);
});

test("settlementStateActivityChanges treats an unavailable previous exact metric as missing rather than zero", async () => {
  const { settlementStateActivityChanges } = await import("../src/server/settlementState.mjs");

  assert.deepEqual(settlementStateActivityChanges({
    supplies: null,
    treasury: null,
    members_count: 3,
    buildings_count: null,
    market_count: 1,
  }, {
    supplies: "9007199254740993125",
    treasury: "9007199254740993000",
    membersCount: 3,
    buildingsCount: null,
    marketCount: 1,
  }), []);
});

test("server records settlement activity before upserting current state without snapshot inserts", () => {
  const source = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  const start = source.indexOf("function recordSettlementState");
  const end = source.indexOf("async function syncProductionJobActivityForSnapshot", start);
  const implementation = source.slice(start, end);

  assert.ok(start > -1);
  assert.ok(end > start);
  assert.ok(implementation.indexOf("statements.getSettlementState.get") < implementation.indexOf("settlementStateActivityChanges"));
  assert.ok(implementation.indexOf("settlementStateActivityChanges") < implementation.indexOf("statements.upsertSettlementState.run"));
  assert.match(implementation, /runSettlementStateTransaction/);
  assert.match(implementation, /processDiscordImmediately: false/);
  assert.match(implementation, /processOutbox: kickDiscordNotificationOutbox/);
  assert.doesNotMatch(implementation, /insertSnapshot|INSERT INTO snapshots/);
});

test("legacy browser settlement checkpoint writes are retired with snapshot history routes", () => {
  const source = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /url\.pathname === "\/api\/local\/snapshot"[\s\S]*recordSettlementState\(await readJson/);
  assert.doesNotMatch(source, /\/api\/local\/snapshots|maintenance\/prune|function snapshotHistory/);
});

test("settlement checkpoint migration converts legacy REAL amounts to TEXT without deleting activity history", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE settlement_state_current (
      claim_id TEXT PRIMARY KEY,
      captured_at TEXT NOT NULL,
      supplies REAL,
      treasury REAL,
      members_count INTEGER,
      buildings_count INTEGER,
      market_count INTEGER,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE activity_events (
      id INTEGER PRIMARY KEY,
      claim_id TEXT NOT NULL,
      summary TEXT NOT NULL
    );
    INSERT INTO settlement_state_current VALUES (
      'a', '2026-07-30T10:00:00.000Z', 125, 450, 3, 2, 5,
      '2026-07-30T10:00:00.000Z'
    );
    INSERT INTO activity_events VALUES (1, 'a', 'preserve me');
  `);

  applySettlementStateMigration(db);

  const columns = new Map(
    db.prepare("PRAGMA table_info(settlement_state_current)").all()
      .map((column) => [column.name, column.type]),
  );
  assert.equal(columns.get("supplies"), "TEXT");
  assert.equal(columns.get("treasury"), "TEXT");
  assert.deepEqual(
    { ...db.prepare("SELECT supplies, treasury FROM settlement_state_current WHERE claim_id = 'a'").get() },
    { supplies: "125", treasury: "450" },
  );
  assert.equal(db.prepare("SELECT summary FROM activity_events WHERE id = 1").get().summary, "preserve me");
  db.close();
});

test("exact settlement amounts and delta metadata survive a SQLite restart", async () => {
  const {
    runSettlementStateTransaction,
    settlementStateActivityChanges,
    settlementStateSummary,
  } = await import("../src/server/settlementState.mjs");
  const directory = mkdtempSync(path.join(tmpdir(), "relay-settlement-checkpoint-"));
  const databasePath = path.join(directory, "checkpoint.sqlite");
  const claimId = "1369094286777412590";

  function record(db, summary, occurredAt) {
    const statements = createPreparedStatements(db);
    runSettlementStateTransaction({
      db,
      readPrevious: () => statements.getSettlementState.get(claimId),
      activityChanges: (previous) => settlementStateActivityChanges(previous, summary),
      insertActivity: (change) => {
        statements.insertActivity.run(
          claimId,
          change.type,
          change.summary,
          occurredAt,
          JSON.stringify(change.metadata),
        );
        return true;
      },
      upsertState: () => statements.upsertSettlementState.run(
        claimId,
        occurredAt,
        summary.supplies,
        summary.treasury,
        summary.membersCount,
        summary.buildingsCount,
        summary.marketCount,
        occurredAt,
      ),
      processOutbox: () => {},
    });
  }

  let db = new DatabaseSync(databasePath);
  applySchemaBootstrap(db);
  applySettlementStateMigration(db);
  applyAdditiveColumnMigrations(db);
  record(db, settlementStateSummary({
    claimId,
    claim: {
      entityId: claimId,
      supplies: "9007199254740993125",
      treasury: "9007199254740993000",
    },
    membersCount: 3,
    market: { listings: [] },
  }), "2026-07-30T10:00:00.000Z");
  db.close();

  db = new DatabaseSync(databasePath);
  applySchemaBootstrap(db);
  applySettlementStateMigration(db);
  applyAdditiveColumnMigrations(db);
  record(db, settlementStateSummary({
    claimId,
    claim: {
      entityId: claimId,
      supplies: "9007199254740993250",
      treasury: "9007199254740992875",
    },
    membersCount: 3,
    market: { listings: [] },
  }), "2026-07-30T10:01:00.000Z");

  assert.deepEqual(
    { ...db.prepare(`
      SELECT supplies, treasury, buildings_count
      FROM settlement_state_current WHERE claim_id = ?
    `).get(claimId) },
    {
      supplies: "9007199254740993250",
      treasury: "9007199254740992875",
      buildings_count: null,
    },
  );
  assert.deepEqual(
    db.prepare("SELECT event_type, summary, metadata_json FROM activity_events ORDER BY id").all()
      .map((row) => ({ ...row, metadata: JSON.parse(row.metadata_json) })),
    [
      {
        event_type: "supplies",
        summary: "+125 supplies",
        metadata_json: '{"before":"9007199254740993125","after":"9007199254740993250"}',
        metadata: {
          before: "9007199254740993125",
          after: "9007199254740993250",
        },
      },
      {
        event_type: "treasury",
        summary: "-125g to treasury",
        metadata_json: '{"before":"9007199254740993000","after":"9007199254740992875"}',
        metadata: {
          before: "9007199254740993000",
          after: "9007199254740992875",
        },
      },
    ],
  );
  db.close();
  rmSync(directory, { recursive: true, force: true });
});

function settlementTransactionFixture({ failAfterStateWrite = false } = {}) {
  const rawDb = new DatabaseSync(":memory:");
  rawDb.exec(`
    CREATE TABLE settlement_state_current (claim_id TEXT PRIMARY KEY, supplies REAL);
    CREATE TABLE activity_events (id INTEGER PRIMARY KEY, event_type TEXT NOT NULL);
    CREATE TABLE discord_notification_outbox (id INTEGER PRIMARY KEY, event_type TEXT NOT NULL);
    INSERT INTO settlement_state_current (claim_id, supplies) VALUES ('a', 10);
  `);
  let transactionOpen = false;
  let processingKicks = 0;
  let processingStartedInsideTransaction = false;
  return {
    db: {
      exec(sql) {
        const command = sql.trim().toUpperCase();
        const result = rawDb.exec(sql);
        if (command === "BEGIN") transactionOpen = true;
        if (command === "COMMIT" || command === "ROLLBACK") transactionOpen = false;
        return result;
      },
    },
    rawDb,
    readPrevious: () => rawDb.prepare("SELECT * FROM settlement_state_current WHERE claim_id = 'a'").get(),
    activityChanges: () => [{ type: "supplies" }],
    insertActivity(change) {
      rawDb.prepare("INSERT INTO activity_events (event_type) VALUES (?)").run(change.type);
      rawDb.prepare("INSERT INTO discord_notification_outbox (event_type) VALUES (?)").run(change.type);
      return true;
    },
    upsertState() {
      rawDb.prepare("UPDATE settlement_state_current SET supplies = 20 WHERE claim_id = 'a'").run();
      if (failAfterStateWrite) throw new Error("forced settlement state failure");
    },
    processOutbox() {
      processingKicks += 1;
      processingStartedInsideTransaction ||= transactionOpen;
    },
    processing: () => ({ processingKicks, processingStartedInsideTransaction }),
  };
}

test("settlement state rollback persists no activity, outbox, or changed state and never starts Discord processing", async () => {
  const { runSettlementStateTransaction } = await import("../src/server/settlementState.mjs");
  const fixture = settlementTransactionFixture({ failAfterStateWrite: true });

  assert.throws(() => runSettlementStateTransaction(fixture), /forced settlement state failure/);

  assert.equal(fixture.rawDb.prepare("SELECT supplies FROM settlement_state_current WHERE claim_id = 'a'").get().supplies, 10);
  assert.equal(fixture.rawDb.prepare("SELECT COUNT(*) AS count FROM activity_events").get().count, 0);
  assert.equal(fixture.rawDb.prepare("SELECT COUNT(*) AS count FROM discord_notification_outbox").get().count, 0);
  assert.deepEqual(fixture.processing(), { processingKicks: 0, processingStartedInsideTransaction: false });
  fixture.rawDb.close();
});

test("settlement state success commits activity and outbox before starting Discord processing once", async () => {
  const { runSettlementStateTransaction } = await import("../src/server/settlementState.mjs");
  const fixture = settlementTransactionFixture();

  runSettlementStateTransaction(fixture);

  assert.equal(fixture.rawDb.prepare("SELECT supplies FROM settlement_state_current WHERE claim_id = 'a'").get().supplies, 20);
  assert.equal(fixture.rawDb.prepare("SELECT COUNT(*) AS count FROM activity_events").get().count, 1);
  assert.equal(fixture.rawDb.prepare("SELECT COUNT(*) AS count FROM discord_notification_outbox").get().count, 1);
  assert.deepEqual(fixture.processing(), { processingKicks: 1, processingStartedInsideTransaction: false });
  fixture.rawDb.close();
});
