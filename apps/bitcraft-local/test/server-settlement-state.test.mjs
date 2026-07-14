import assert from "node:assert/strict";
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
