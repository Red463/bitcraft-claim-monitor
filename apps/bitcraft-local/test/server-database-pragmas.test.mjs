import assert from "node:assert/strict";
import test from "node:test";

import { applyDatabaseConnectionPragmas, databaseConnectionPragmaStatements } from "../src/server/databasePragmas.mjs";

test("databaseConnectionPragmaStatements enables a bounded busy timeout before WAL", () => {
  assert.deepEqual(databaseConnectionPragmaStatements({ busyTimeoutMs: 7000 }), [
    "PRAGMA busy_timeout = 7000;",
    "PRAGMA journal_mode = WAL;",
  ]);
});

test("databaseConnectionPragmaStatements clamps invalid busy timeout values", () => {
  assert.deepEqual(databaseConnectionPragmaStatements({ busyTimeoutMs: -1 }), [
    "PRAGMA busy_timeout = 5000;",
    "PRAGMA journal_mode = WAL;",
  ]);
});

test("applyDatabaseConnectionPragmas executes each connection pragma", () => {
  const executed = [];
  const db = { exec: (sql) => executed.push(sql) };

  applyDatabaseConnectionPragmas(db, { busyTimeoutMs: 2500 });

  assert.deepEqual(executed, ["PRAGMA busy_timeout = 2500;", "PRAGMA journal_mode = WAL;"]);
});

test("applyDatabaseConnectionPragmas retries transient locked database errors", () => {
  const executed = [];
  let walAttempts = 0;
  const db = {
    exec: (sql) => {
      executed.push(sql);
      if (sql.includes("journal_mode") && walAttempts++ === 0) throw new Error("database is locked");
    },
  };

  applyDatabaseConnectionPragmas(db, { busyTimeoutMs: 2500, retryCount: 1, retryDelayMs: 1 });

  assert.deepEqual(executed, [
    "PRAGMA busy_timeout = 2500;",
    "PRAGMA journal_mode = WAL;",
    "PRAGMA journal_mode = WAL;",
  ]);
});
