import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("Leaderboard page lives outside the legacy MainPages bundle", () => {
  const mainPagesUrl = new URL("../src/pages/MainPages.tsx", import.meta.url);
  const mainPages = existsSync(mainPagesUrl) ? readFileSync(mainPagesUrl, "utf8") : "";
  const appShell = readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8");
  const leaderboardPageUrl = new URL("../src/pages/LeaderboardPage.tsx", import.meta.url);

  assert.equal(existsSync(leaderboardPageUrl), true);
  assert.doesNotMatch(mainPages, new RegExp("export function Leaderboard\\b"));
  assert.equal(appShell.includes('import { Leaderboard } from "./pages/LeaderboardPage";'), true);
});

test("Leaderboard time columns provide raw values for sorting", () => {
  const leaderboard = readFileSync(new URL("../src/pages/LeaderboardPage.tsx", import.meta.url), "utf8");

  for (const field of ["lastContributedAt", "lastActivityAt", "lastSaleAt", "lastLoginTimestamp"]) {
    assert.match(leaderboard, new RegExp(`timestampMs\\(entry\\.${field}\\)`), `${field} should sort by its timestamp`);
  }
  for (const field of ["sessionSeconds", "timePlayedSeconds", "timeSignedInSeconds"]) {
    assert.match(leaderboard, new RegExp(`toNumber\\(entry\\.${field}\\)`), `${field} should sort by raw seconds`);
  }
});
