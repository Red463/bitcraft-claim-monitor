import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const { usesProviderNeutralGameData } = await import(
  new URL("../src/api/pageDomains.ts", import.meta.url).href,
);

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("main game-data loader keeps Relay pages live while legacy pages retain navigation throttling", () => {
  const loader = source("../src/api/gameDataLoader.ts");

  assert.match(loader, /manualRefreshApplies/);
  assert.match(loader, /manualRefreshHeaders/);
  assert.match(loader, /const providerNeutral = usesProviderNeutralGameData\(activePanel\)/);
  assert.match(loader, /const forced = manualRefreshApplies\(manualRefreshRequest, activePanel\)/);
  assert.match(loader, /if \(!providerNeutral && !forced && cached && cachedAgeMs < PAGE_NAVIGATION_CACHE_TTL_MS\)/);
  assert.match(loader, /headers:\s*\{[^}]*\.\.\.manualHeaders/s);
  assert.match(loader, /trackManualRefreshPromise\("main-data", load\(\)\)/);
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

test("provider-neutral Public Craft Finder uses the central live manual refresh", () => {
  const page = source("../src/pages/PublicCraftFinderPage.tsx");
  const loader = source("../src/api/gameDataLoader.ts");

  assert.equal(usesProviderNeutralGameData("publiccrafts"), true);
  assert.doesNotMatch(page, /useManualRefresh|manualRefreshHeaders|trackPromise|fetch\(/);
  assert.match(loader, /loadGameData\([\s\S]*headers:\s*\{\s*\.\.\.manualHeaders\s*\}/);
});

test("provider-neutral Production joins selected-member Toolbelt to the active refresh", () => {
  const page = source("../src/pages/ProductionPage.tsx");
  const loader = source("../src/api/gameDataLoader.ts");

  assert.match(page, /useManualRefresh|manualRefreshHeaders|trackPromise/);
  assert.match(page, /request\?\.sequence/);
  assert.match(page, /\/api\/local\/player-data/);
  assert.equal(usesProviderNeutralGameData("craft-monitor"), true);
  assert.match(loader, /loadGameData\([\s\S]*headers:\s*\{\s*\.\.\.manualHeaders\s*\}/);
});
