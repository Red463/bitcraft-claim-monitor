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

test("automatic release reload shows one short-lived changelog confirmation", () => {
  const appShell = readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/styles/app-chrome.css", import.meta.url), "utf8");

  assert.match(appShell, /consumeAutomaticReleaseUpdate\(window\.sessionStorage\)/);
  assert.match(appShell, /markAutomaticReleaseUpdate\(window\.sessionStorage\)[\s\S]*window\.location\.reload\(\)/);
  assert.match(appShell, /const RELEASE_UPDATED_NOTICE_MS = 8_000/);
  assert.match(appShell, /window\.setTimeout\(\(\) => setReleaseUpdatedNotice\(false\), RELEASE_UPDATED_NOTICE_MS\)/);
  assert.match(appShell, /App updated/);
  assert.match(appShell, /You're now using the latest version\./);
  assert.match(appShell, /CHANGELOG_URL/);
  assert.match(appShell, /View changelog/);
  assert.match(appShell, /release-update-banner is-updated/);
  assert.match(css, /\.release-update-banner\.is-updated/);
  assert.match(css, /\.release-update-banner\.is-updated a/);
});
