import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { verifyRelayRuntimeBoundaries } from "../scripts/verify-relay-runtime-boundaries.mjs";

const source = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), "utf8");
const repository = "https://github.com/Red463/bitcraft-claim-monitor-relay";

test("active browser and Discord links target the standalone Relay repository", () => {
  const activeRuntime = [
    source("../src/AppShell.tsx"),
    source("../src/components/main/LegalDialogs.tsx"),
    source("../server.mjs"),
  ].join("\n");

  assert.match(activeRuntime, new RegExp(repository.replaceAll("/", "\\/")));
  assert.match(activeRuntime, /bitcraft-claim-monitor-relay\/blob\/main\/CHANGELOG\.md/);
  assert.match(activeRuntime, /bitcraft-claim-monitor-relay\/issues/);
  assert.doesNotMatch(activeRuntime, /Red463\/bitcraft-claim-monitor(?!-relay)/);
});

test("repository contact links target the standalone Relay repository", () => {
  const contacts = source("../../../.github/ISSUE_TEMPLATE/config.yml");

  assert.match(contacts, /bitcraft-claim-monitor-relay\/discussions/);
  assert.match(contacts, /bitcraft-claim-monitor-relay\/blob\/main\/README\.md/);
  assert.doesNotMatch(contacts, /Red463\/bitcraft-claim-monitor(?!-relay)/);
});

test("refresh chrome describes immediate generations and the fallback interval", () => {
  const chrome = source("../src/components/main/AppChrome.tsx");

  assert.match(chrome, /Live updates apply immediately; local fallback refreshes every/);
  assert.doesNotMatch(chrome, /Display refreshes every/);
});

test("production build verifies standalone links and immediate refresh copy in emitted assets", () => {
  const packageJson = JSON.parse(source("../package.json"));
  assert.match(packageJson.scripts.build, /verify-relay-runtime-boundaries\.mjs/);

  const fixture = path.join(
    tmpdir(),
    `relay-runtime-boundary-${process.pid}-${Date.now()}`,
  );
  mkdirSync(fixture, { recursive: true });
  try {
    const asset = path.join(fixture, "app.js");
    writeFileSync(
      asset,
      `${repository} Live updates apply immediately; local fallback refreshes every 30 seconds`,
    );
    assert.deepEqual(verifyRelayRuntimeBoundaries(fixture), { ok: true });

    writeFileSync(asset, "https://github.com/Red463/bitcraft-claim-monitor Display refreshes every 30 seconds");
    assert.throws(() => verifyRelayRuntimeBoundaries(fixture), /standalone Relay repository|maintained repository|refresh copy/i);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
