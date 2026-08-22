import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  assertSchemaFingerprint,
  schemaBindingsReady,
} from "../src/server/game-data/schemaManifest.ts";

const manifest = JSON.parse(readFileSync(
  new URL("../src/server/game-data/bindings/schema-manifest.json", import.meta.url),
  "utf8",
));

test("Relay schema manifest records independent global and regional fingerprints", () => {
  assert.equal(
    assertSchemaFingerprint(manifest, "global", "17e7e2ddc0ad3416bac036d5463655fb8d2a9f2bc21b79f2e9f076b9c1a25232"),
    "17e7e2ddc0ad3416bac036d5463655fb8d2a9f2bc21b79f2e9f076b9c1a25232",
  );
  assert.equal(
    assertSchemaFingerprint(manifest, "regional", "3d0b4c9bba59f7b1daad5122369599ea557e333124c4f778079a45af1683f65b"),
    "3d0b4c9bba59f7b1daad5122369599ea557e333124c4f778079a45af1683f65b",
  );
  assert.equal(schemaBindingsReady(manifest, "global"), true);
  assert.equal(schemaBindingsReady(manifest, "regional"), true);
  assert.equal(manifest.codegen.mode, "pinned-cli-module-def-v9");
  assert.equal(
    existsSync(new URL("../src/server/game-data/bindings/global/index.ts", import.meta.url)),
    true,
  );
  assert.equal(
    existsSync(new URL("../src/server/game-data/bindings/regional/index.ts", import.meta.url)),
    true,
  );
});

test("schema drift stops ingestion before a mixed generation can apply", () => {
  assert.throws(
    () => assertSchemaFingerprint(manifest, "regional", "different"),
    /schema fingerprint mismatch/,
  );
});
