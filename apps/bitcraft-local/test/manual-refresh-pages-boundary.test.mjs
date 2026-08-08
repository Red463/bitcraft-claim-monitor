import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const { usesProviderNeutralGameData } = await import(
  new URL("../src/api/pageDomains.ts", import.meta.url).href,
);

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("main game-data loader follows the central page cycle", () => {
  const loader = source("../src/api/gameDataLoader.ts");

  assert.match(loader, /pageRefreshHeaders/);
  assert.match(loader, /const domains = pageDomains\(activePanel\)/);
  assert.match(loader, /if \(domains\.length === 0\)/);
  assert.doesNotMatch(loader, /PAGE_NAVIGATION_CACHE_TTL_MS|legacyPageEndpointMap/);
  assert.match(loader, /headers:\s*\{[^}]*\.\.\.refreshHeaders/s);
  assert.match(loader, /trackPageRefreshPromise\("main-data", load\(\)\)/);
  assert.doesNotMatch(loader, /useGameDataGeneration|refreshToken/);
});

test("local page history joins the same active page cycle", () => {
  const history = source("../src/api/localHistory.ts");

  assert.match(history, /pageRefreshHeaders\(pageRefreshCycle, activePanel\)/);
  assert.match(history, /trackPageRefreshPromise\("local-history", load\(\)\)/);
  assert.match(history, /pageRefreshCycle\?\.sequence/);
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
  assert.match(loader, /loadGameData\([\s\S]*headers:\s*\{\s*\.\.\.refreshHeaders\s*\}/);
});

test("provider-neutral Production joins selected-member Toolbelt to the active refresh", () => {
  const page = source("../src/pages/ProductionPage.tsx");
  const loader = source("../src/api/gameDataLoader.ts");

  assert.match(page, /useManualRefresh|manualRefreshHeaders|trackPromise/);
  assert.match(page, /request\?\.sequence/);
  assert.match(page, /\/api\/local\/player-data/);
  assert.equal(usesProviderNeutralGameData("craft-monitor"), true);
  assert.match(loader, /loadGameData\([\s\S]*headers:\s*\{\s*\.\.\.refreshHeaders\s*\}/);
});

for (const [label, path, task] of [
  ["activity search", "../src/pages/ActivityPage.tsx", "activity-search"],
  ["map catalog", "../src/pages/MapPage.tsx", "map-catalog"],
  ["craft calculator", "../src/pages/CraftCalculatorPage.tsx", "craft-calculator-plan"],
  ["sync embed", "../src/pages/SyncPage.tsx", "sync-embed"],
  ["active regions", "../src/hooks/useActiveRegions.ts", "active-regions"],
]) {
  test(`${label} participates in the active page cycle`, () => {
    const page = source(path);
    assert.match(page, /usePageRefresh/);
    assert.match(page, new RegExp(`trackPromise\\(\"${task}\"`));
  });
}

test("legacy generation consumers read the page cycle instead of opening watchers", () => {
  const hook = source("../src/hooks/useGameDataGeneration.ts");
  assert.match(hook, /usePageRefresh\(\)\.cycle\?\.sequence/);
  assert.doesNotMatch(hook, /EventSource|setInterval|fetch\(/);
});

test("automatic auxiliary refreshes retain data and propagate visible detail failures", () => {
  const activity = source("../src/pages/ActivityPage.tsx");
  const planning = source("../src/pages/CraftPlanningPage.tsx");

  assert.doesNotMatch(activity, /events:\s*\[\],\s*total:\s*0,\s*query:\s*trimmedSearch/);
  assert.match(planning, /openNeedDetail\(selectedNeedRef\.current,\s*true\)/);
  assert.match(planning, /if \(propagateError\) throw detailFetchError/);
});
