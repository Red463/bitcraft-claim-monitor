import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const bootstrap = readFileSync(
  new URL("../src/server/schemaBootstrap.mjs", import.meta.url),
  "utf8",
);
const migrations = readFileSync(
  new URL("../src/server/schemaMigrations.mjs", import.meta.url),
  "utf8",
);
const inventory = readFileSync(
  new URL("../../../docs/relay-migration/table-inventory.md", import.meta.url),
  "utf8",
);

function names(source, pattern) {
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

test("every fresh SQL table has an explicit live-first ownership decision", () => {
  const freshTables = names(
    bootstrap,
    /CREATE TABLE IF NOT EXISTS\s+([A-Za-z0-9_]+)/g,
  );
  assert.ok(freshTables.length > 0);
  for (const table of freshTables) {
    assert.match(
      inventory,
      new RegExp(`\\\`${table}\\\``),
      `${table} must be recorded in the Relay SQL table inventory`,
    );
  }
});

test("every explicitly retired legacy table is absent from bootstrap and documented", () => {
  const retiredTables = names(
    migrations,
    /DROP TABLE IF EXISTS\s+([A-Za-z0-9_]+)/g,
  );
  assert.ok(retiredTables.length > 0);
  for (const table of retiredTables) {
    assert.doesNotMatch(
      bootstrap,
      new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${table}\\b`),
      `${table} must not return to the fresh schema`,
    );
    assert.match(
      inventory,
      new RegExp(`\\\`${table}\\\``),
      `${table} retirement must be recorded in the Relay SQL table inventory`,
    );
  }
});
