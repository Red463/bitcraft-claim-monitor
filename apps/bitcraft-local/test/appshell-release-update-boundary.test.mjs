import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("AppShell polls health for release updates and reloads hidden tabs", () => {
  const appShell = readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8");

  assert.match(appShell, /releaseUpdateDecision/);
  assert.match(appShell, /normalizeReleaseBuildId/);
  assert.match(appShell, /window\.setInterval\(checkReleaseBuild, 60_000\)/);
  assert.match(appShell, /document\.addEventListener\("visibilitychange", handleReleaseVisibility\)/);
  assert.match(appShell, /window\.location\.reload\(\)/);
  assert.match(appShell, /Update available/);
});