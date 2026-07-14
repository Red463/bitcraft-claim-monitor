import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { applySettlementStateMigration } from "../src/server/schemaMigrations.mjs";

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
    { claim_id: "a", captured_at: "2026-07-14T11:00:00.000Z", supplies: 11, treasury: 21, members_count: 4, buildings_count: 5, market_count: 6, updated_at: "2026-07-14T11:00:00.000Z" },
    { claim_id: "b", captured_at: "2026-07-14T09:00:00.000Z", supplies: 30, treasury: 40, members_count: 7, buildings_count: 8, market_count: 9, updated_at: "2026-07-14T09:00:00.000Z" },
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
    supplies: 99,
    treasury: 29,
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
      return { get: () => undefined };
    },
  };

  applySettlementStateMigration(db);

  assert.equal(calls[1][1], "BEGIN IMMEDIATE");
  assert.match(calls[2][1], /sqlite_schema/);
  assert.equal(calls[3][1], "COMMIT");
});

test("settlementStateSummary derives current settlement row fields", async () => {
  const { settlementStateSummary } = await import("../src/server/settlementState.mjs");
  const payload = {
    claimId: "12345678",
    claim: { supplies: "125.5", treasury: "450" },
    membersCount: "7",
    buildingsCount: "4",
    market: { listings: [{ id: 1 }, { id: 2 }] },
  };

  assert.deepEqual(settlementStateSummary(payload), {
    claimId: "12345678",
    supplies: 125.5,
    treasury: 450,
    membersCount: 7,
    buildingsCount: 4,
    marketCount: 2,
  });
});

test("settlementStateActivityChanges emits only changed scalar settlement fields", async () => {
  const { settlementStateActivityChanges } = await import("../src/server/settlementState.mjs");
  const previous = { supplies: 100, treasury: 20, members_count: 3, buildings_count: 2, market_count: 5 };
  const next = { supplies: 90, treasury: 35, membersCount: 3, buildingsCount: 4, marketCount: 5 };

  assert.deepEqual(settlementStateActivityChanges(previous, next), [
    { type: "supplies", summary: "-10 supplies", metadata: { before: 100, after: 90 } },
    { type: "treasury", summary: "+15g to treasury", metadata: { before: 20, after: 35 } },
    { type: "buildings", summary: "+2 buildings", metadata: { before: 2, after: 4 } },
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

test("server records settlement activity before upserting current state without snapshot inserts", () => {
  const source = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  const start = source.indexOf("function recordSettlementState");
  const end = source.indexOf("async function syncMarketListingsForSnapshot", start);
  const implementation = source.slice(start, end);

  assert.ok(start > -1);
  assert.ok(end > start);
  assert.ok(implementation.indexOf("statements.getSettlementState.get") < implementation.indexOf("settlementStateActivityChanges"));
  assert.ok(implementation.indexOf("settlementStateActivityChanges") < implementation.indexOf("statements.upsertSettlementState.run"));
  assert.match(implementation, /if \(previous\)/);
  assert.doesNotMatch(implementation, /insertSnapshot|INSERT INTO snapshots/);
});

test("legacy snapshot routes remain safe while backed by current settlement state", () => {
  const source = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  const routeStart = source.indexOf('if (req.method === "POST" && url.pathname === "/api/local/admin/maintenance/prune")');
  const routeEnd = source.indexOf('if (url.pathname === "/api/local/market/deal-watches")', routeStart);
  const routes = source.slice(routeStart, routeEnd);
  const historyStart = source.indexOf("function snapshotHistory");
  const historyEnd = source.indexOf("function activityHistory", historyStart);
  const history = source.slice(historyStart, historyEnd);

  assert.ok(routeStart > -1);
  assert.ok(routeEnd > routeStart);
  assert.match(routes, /recordSettlementState\(await readJson/);
  assert.doesNotMatch(routes, /enqueueSnapshot|DELETE FROM snapshots/);
  assert.match(history, /FROM settlement_state_current/);
  assert.doesNotMatch(history, /FROM snapshots/);
});
