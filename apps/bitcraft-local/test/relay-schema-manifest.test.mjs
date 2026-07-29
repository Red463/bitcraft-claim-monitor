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
    assertSchemaFingerprint(manifest, "global", "cebd889939799c6317f12d86799a4ac38dde43dad265ff92ab7e03f6c8cb4f49"),
    "cebd889939799c6317f12d86799a4ac38dde43dad265ff92ab7e03f6c8cb4f49",
  );
  assert.equal(
    assertSchemaFingerprint(manifest, "regional", "762aeaa1449c53d5f400d72bb82f71a049997d34e28c6844ce8f3899d1cb6312"),
    "762aeaa1449c53d5f400d72bb82f71a049997d34e28c6844ce8f3899d1cb6312",
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
