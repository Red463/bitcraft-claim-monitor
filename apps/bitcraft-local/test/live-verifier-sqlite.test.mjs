import assert from "node:assert/strict";
import test from "node:test";

let module = null;
try {
  module = await import("../src/server/liveVerifierSqlite.mjs");
} catch {
  // The first TDD run proves the verifier readiness helper is absent.
}

test("live verifier treats a database created before schema bootstrap as not ready", () => {
  assert.ok(module, "live verifier readiness helper must exist");
  let closed = false;
  const rows = module.queryRowsWhenReady({
    databaseExists: () => true,
    openDatabase: () => ({
      prepare: () => {
        const error = new Error("no such table: domain_payload_current");
        error.code = "ERR_SQLITE_ERROR";
        throw error;
      },
      close: () => { closed = true; },
    }),
    sql: "SELECT * FROM domain_payload_current",
  });

  assert.deepEqual(rows, []);
  assert.equal(closed, true);
});

test("live verifier does not hide real SQLite query failures", () => {
  assert.ok(module, "live verifier readiness helper must exist");
  assert.throws(() => module.queryRowsWhenReady({
    databaseExists: () => true,
    openDatabase: () => ({
      prepare: () => {
        const error = new Error("database disk image is malformed");
        error.code = "ERR_SQLITE_CORRUPT";
        throw error;
      },
      close: () => {},
    }),
    sql: "SELECT 1",
  }), /malformed/);
});
