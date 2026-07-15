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

test("Leaderboard summary steps down to two columns and then one", () => {
  const css = readFileSync(new URL("../src/styles/leaderboard.css", import.meta.url), "utf8");

  assert.match(css, /@media \(max-width:\s*1250px\)[\s\S]*\.leaderboard-summary\s*\{[^}]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /@media \(max-width:\s*560px\)[\s\S]*\.leaderboard-summary\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(css, /@media \(max-width:\s*560px\)[\s\S]*\.leaderboard-filter\s*\{[^}]*width:\s*100%[^}]*min-width:\s*0/s);
});
