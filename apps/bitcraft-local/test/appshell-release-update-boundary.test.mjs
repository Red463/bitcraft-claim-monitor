import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("AppShell checks releases on startup, intervals, and every visibility change", () => {
  const appShell = readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8");

  assert.match(appShell, /observeReleaseBuild\(\{[\s\S]*currentBuildId: appBuildIdRef\.current,[\s\S]*documentHidden: document\.hidden,[\s\S]*storage: window\.localStorage[\s\S]*\}\)/);
  assert.match(appShell, /useState\(""\)[\s\S]*useRef\(""\)/);
  assert.match(appShell, /window\.setInterval\(checkReleaseBuild, 60_000\)/);
  assert.match(appShell, /function handleReleaseVisibility\(\) \{[\s\S]*void checkReleaseBuild\(\);[\s\S]*\}/);
  assert.match(appShell, /document\.addEventListener\("visibilitychange", handleReleaseVisibility\)/);
});

test("AppShell records loaded builds and confirms every completed update", () => {
  const appShell = readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/styles/app-chrome.css", import.meta.url), "utf8");

  assert.doesNotMatch(appShell, /markAutomaticReleaseUpdate/);
  assert.doesNotMatch(appShell, /consumeAutomaticReleaseUpdate/);
  assert.match(appShell, /if \(decision === "remember"\)[\s\S]*rememberBuildId\(nextBuildId\)/);
  assert.match(appShell, /if \(decision === "updated"\)[\s\S]*observation\.showUpdatedNotice[\s\S]*setReleaseUpdatedNotice\(true\)/);
  assert.match(appShell, /const RELEASE_UPDATED_NOTICE_MS = 8_000/);
  assert.match(appShell, /window\.setTimeout\(\(\) => setReleaseUpdatedNotice\(false\), RELEASE_UPDATED_NOTICE_MS\)/);
  assert.match(appShell, /Update available/);
  assert.match(appShell, /App updated/);
  assert.match(appShell, /You're now using the latest version\./);
  assert.match(appShell, /CHANGELOG_URL/);
  assert.match(appShell, /View changelog/);
  assert.match(css, /\.release-update-banner\.is-updated/);
});
