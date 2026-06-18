import test from "node:test";
import assert from "node:assert/strict";

import {
  buildOneOffQueryMessage,
  decodeOneOffRows,
  normalizeHost,
  pickTables,
  redactToken,
  safeSqlIdentifier,
} from "../bitcraft-live-db-tools.mjs";

test("normalizeHost converts websocket URLs to HTTPS origins", () => {
  assert.equal(normalizeHost("wss://bitcraft-early-access.spacetimedb.com/"), "https://bitcraft-early-access.spacetimedb.com");
  assert.equal(normalizeHost("https://bitcraft-early-access.spacetimedb.com///"), "https://bitcraft-early-access.spacetimedb.com");
});

test("redactToken keeps diagnostics useful without exposing secrets", () => {
  assert.equal(redactToken(""), "");
  assert.equal(redactToken("abc"), "***");
  assert.equal(redactToken("abcdefghijklmnopqrstuvwxyz"), "abcdef...uvwxyz");
});

test("safeSqlIdentifier only accepts plain table identifiers", () => {
  assert.equal(safeSqlIdentifier("claim_state"), '"claim_state"');
  assert.throws(() => safeSqlIdentifier("claim_state; DROP TABLE claim_state"), /Unsafe table name/);
});

test("buildOneOffQueryMessage uses SpacetimeDB JSON enum shape", () => {
  const message = buildOneOffQueryMessage("SELECT * FROM claim_state", [1, 2, 3]);
  assert.deepEqual(message, {
    OneOffQuery: {
      message_id: [1, 2, 3],
      query_string: "SELECT * FROM claim_state",
    },
  });
});

test("decodeOneOffRows parses nested row JSON strings", () => {
  const rows = decodeOneOffRows({
    OneOffQueryResponse: {
      error: { none: [] },
      tables: [
        {
          table_name: "claim_state",
          rows: ['{"entity_id":"1","name":"Timbersteel"}', '{"entity_id":"2","name":"Other"}'],
        },
      ],
    },
  });
  assert.deepEqual(rows, {
    claim_state: [
      { entity_id: "1", name: "Timbersteel" },
      { entity_id: "2", name: "Other" },
    ],
  });
});

test("decodeOneOffRows surfaces SpacetimeDB option errors", () => {
  assert.throws(
    () => decodeOneOffRows({ OneOffQueryResponse: { error: { some: "bad query" }, tables: [] } }),
    /bad query/,
  );
});

test("pickTables filters internal tables and applies include patterns", () => {
  const tables = pickTables(
    ["claim_state", "claim_member_state", "spacetime_internal", "inventory_state"],
    { include: ["claim"], exclude: [] },
  );
  assert.deepEqual(tables, ["claim_member_state", "claim_state"]);
});
