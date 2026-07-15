import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const leaderboardPage = readFileSync(new URL("../src/pages/LeaderboardPage.tsx", import.meta.url), "utf8");

test("Leaderboard renders a restricted state when every category is denied", () => {
  assert.match(leaderboardPage, /resolveAllowedView\(activeTab, visibleTabs\.map\(\(tab\) => tab\.id\)\)/);
  assert.match(leaderboardPage, /No leaderboard categories are available for your account\./);
});

test("Leaderboard page lives outside the legacy MainPages bundle", () => {
  const mainPagesUrl = new URL("../src/pages/MainPages.tsx", import.meta.url);
  const mainPages = existsSync(mainPagesUrl) ? readFileSync(mainPagesUrl, "utf8") : "";
  const appShell = readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8");
  const leaderboardPageUrl = new URL("../src/pages/LeaderboardPage.tsx", import.meta.url);

  assert.equal(existsSync(leaderboardPageUrl), true);
  assert.doesNotMatch(mainPages, new RegExp("export function Leaderboard\\b"));
  assert.match(appShell, /React\.lazy\(\(\) => import\("\.\/pages\/LeaderboardPage"\)/);
});

test("Leaderboard summary steps down to two columns and then one", () => {
  const css = readFileSync(new URL("../src/styles/leaderboard.css", import.meta.url), "utf8");

  assert.match(css, /\.leaderboard-page\s*\{[^}]*align-content:\s*start;/s);
  assert.match(css, /@media \(max-width:\s*1250px\)[\s\S]*\.leaderboard-summary\s*\{[^}]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /@media \(max-width:\s*560px\)[\s\S]*\.leaderboard-summary\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(css, /@media \(max-width:\s*560px\)[\s\S]*\.leaderboard-filter\s*\{[^}]*width:\s*100%[^}]*min-width:\s*0/s);
});
