import assert from "node:assert/strict";
import test from "node:test";

import { applyDatabaseConnectionPragmas, databaseConnectionPragmaStatements } from "../src/server/databasePragmas.mjs";

test("databaseConnectionPragmaStatements enables WAL and a bounded busy timeout", () => {
  assert.deepEqual(databaseConnectionPragmaStatements({ busyTimeoutMs: 7000 }), [
    "PRAGMA journal_mode = WAL;",
    "PRAGMA busy_timeout = 7000;",
  ]);
});

test("databaseConnectionPragmaStatements clamps invalid busy timeout values", () => {
  assert.deepEqual(databaseConnectionPragmaStatements({ busyTimeoutMs: -1 }), [
    "PRAGMA journal_mode = WAL;",
    "PRAGMA busy_timeout = 5000;",
  ]);
});

test("applyDatabaseConnectionPragmas executes each connection pragma", () => {
  const executed = [];
  const db = { exec: (sql) => executed.push(sql) };

  applyDatabaseConnectionPragmas(db, { busyTimeoutMs: 2500 });

  assert.deepEqual(executed, ["PRAGMA journal_mode = WAL;", "PRAGMA busy_timeout = 2500;"]);
});
