import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const { usesProviderNeutralGameData } = await import(
  new URL("../src/api/pageDomains.ts", import.meta.url).href,
);

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("main BitJita loader bypasses the browser cache and tracks forced page loads", () => {
  const bitjita = source("../src/api/bitjita.ts");

  assert.match(bitjita, /manualRefreshApplies/);
  assert.match(bitjita, /manualRefreshHeaders/);
  assert.match(bitjita, /const forced = manualRefreshApplies\(manualRefreshRequest, activePanel\)/);
  assert.match(bitjita, /if \(!forced && cached && cachedAgeMs < PAGE_NAVIGATION_CACHE_TTL_MS\)/);
  assert.match(bitjita, /headers:\s*\{[^}]*\.\.\.manualHeaders/s);
  assert.match(bitjita, /trackManualRefreshPromise\("main-data", load\(\)\)/);
});

test("local page history joins the same active refresh request", () => {
  const history = source("../src/api/localHistory.ts");

  assert.match(history, /manualRefreshHeaders\(manualRefreshRequest, activePanel\)/);
  assert.match(history, /trackManualRefreshPromise\("local-history", load\(\)\)/);
  assert.match(history, /manualRefreshRequest\?\.sequence/);
});

for (const [label, path] of [
  ["dashboard", "../src/pages/DashboardPage.tsx"],
  ["craft planning", "../src/pages/CraftPlanningPage.tsx"],
  ["leaderboard", "../src/pages/LeaderboardPage.tsx"],
  ["public craft finder", "../src/pages/PublicCraftFinderPage.tsx"],
  ["empires", "../src/pages/EmpiresPage.tsx"],
  ["market", "../src/pages/MarketPage.tsx"],
  ["members", "../src/pages/MembersPage.tsx"],
  ["inventory", "../src/pages/InventoryPage.tsx"],
  ["empire details", "../src/pages/empires/EmpireDetailsDialog.tsx"],
]) {
  test(`${label} live requests join the active manual refresh`, () => {
    const page = source(path);

    assert.match(page, /useManualRefresh/);
    assert.match(page, /manualRefreshHeaders/);
    assert.match(page, /trackPromise/);
    assert.match(page, /request\?\.sequence/);
  });
}

test("provider-neutral Production joins selected-member Toolbelt to the active refresh", () => {
  const page = source("../src/pages/ProductionPage.tsx");
  const loader = source("../src/api/bitjita.ts");

  assert.match(page, /useManualRefresh|manualRefreshHeaders|trackPromise/);
  assert.match(page, /request\?\.sequence/);
  assert.match(page, /\/api\/local\/player-data/);
  assert.equal(usesProviderNeutralGameData("craft-monitor"), true);
  assert.match(loader, /loadGameData\([\s\S]*headers:\s*\{\s*\.\.\.manualHeaders\s*\}/);
});
