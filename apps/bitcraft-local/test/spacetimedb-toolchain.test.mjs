import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateToolchainManifest } from "../src/server/game-data/toolchainManifest.ts";

const manifestUrl = new URL("../spacetimedb-toolchain.json", import.meta.url);

test("SpacetimeDB CLI and SDK are pinned to the matching release", () => {
  const manifest = JSON.parse(readFileSync(manifestUrl, "utf8"));
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

  assert.deepEqual(validateToolchainManifest(manifest, packageJson), {
    cliVersion: "2.7.0",
    sdkVersion: "2.7.0",
  });
  assert.match(manifest.cli.releaseTag, /^v2\.7\.0/);
  assert.match(manifest.cli.artifacts.windowsX86_64.sha256, /^[a-f0-9]{64}$/);
  assert.match(manifest.cli.artifacts.linuxX86_64.sha256, /^[a-f0-9]{64}$/);
});

test("toolchain validation rejects CLI/SDK drift", () => {
  assert.throws(
    () => validateToolchainManifest({
      cli: { version: "2.8.0", releaseTag: "v2.8.0", artifacts: {} },
      sdk: { package: "spacetimedb", version: "2.7.0" },
    }, { dependencies: { spacetimedb: "2.7.0" } }),
    /must match/,
  );
});
