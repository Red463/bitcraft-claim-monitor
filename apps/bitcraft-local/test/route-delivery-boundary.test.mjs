import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), "utf8");

const routeStyles = new Map([
  ["DashboardPage.tsx", "dashboard.css"],
  ["LeaderboardPage.tsx", "leaderboard.css"],
  ["MembersPage.tsx", "members.css"],
  ["SkillsPage.tsx", "skills.css"],
  ["ProductionPage.tsx", "production.css"],
  ["CraftPlanningPage.tsx", "craft-planning.css"],
  ["InventoryPage.tsx", "inventory.css"],
  ["ConstructionPage.tsx", "construction.css"],
  ["ResearchPage.tsx", "research.css"],
  ["MarketPage.tsx", "market.css"],
  ["RegionPage.tsx", "region.css"],
  ["EmpiresPage.tsx", "empires.css"],
  ["ActivityPage.tsx", "activity.css"],
  ["PublicCraftFinderPage.tsx", "public-craft.css"],
  ["CraftCalculatorPage.tsx", "craftcalc.css"],
  ["MapPage.tsx", "map.css"],
  ["SyncPage.tsx", "sync.css"],
]);

test("main keeps feature styles out of the eager entry graph", () => {
  const main = source("../src/main.tsx");

  for (const stylesheet of routeStyles.values()) {
    assert.doesNotMatch(main, new RegExp(`styles/${stylesheet.replace(".", "\\.")}`));
  }
  assert.match(main, /import "\.\/styles\.css";/);
  assert.match(main, /React\.lazy/);
  assert.match(main, /Suspense/);
  assert.match(main, /RouteErrorBoundary/);
});

test("public and admin pages are delivered through lazy route boundaries", () => {
  const appShell = source("../src/AppShell.tsx");
  const routes = [
    "DashboardPage", "LeaderboardPage", "MembersPage", "SkillsPage", "ProductionPage",
    "CraftPlanningPage", "InventoryPage", "ConstructionPage", "ResearchPage", "MarketPage",
    "RegionPage", "EmpiresPage", "ActivityPage", "PublicCraftFinderPage", "CraftCalculatorPage",
    "MapPage", "SyncPage",
  ];

  for (const route of routes) {
    assert.match(appShell, new RegExp(`React\\.lazy\\(\\(\\) => import\\(\"\\./pages/${route}`), route);
  }
  assert.match(appShell, /React\.lazy\(\(\) => import\("\.\/components\/admin\/AdminPanel"\)/);
  assert.match(appShell, /<React\.Suspense\s+fallback=\{<RouteLoadingState/);
  assert.match(appShell, /<RouteErrorBoundary/);
  assert.match(appShell, /Try again/);
  assert.doesNotMatch(appShell, /^import \{[^\n]+\} from "\.\/pages\//m);
  assert.doesNotMatch(appShell, /^import \{ AdminPanel \}/m);
});

test("each feature route owns its stylesheet", () => {
  const main = source("../src/main.tsx");
  for (const [page, stylesheet] of routeStyles) {
    const pageSource = source(`../src/pages/${page}`);
    const ownedImport = new RegExp(`import \"\\.\\.\\/styles\\/${stylesheet.replace(".", "\\.")}\";`, "g");
    assert.equal(pageSource.match(ownedImport)?.length ?? 0, 1, `${page} should import ${stylesheet} exactly once`);
    assert.doesNotMatch(main, new RegExp(stylesheet.replace(".", "\\.")), stylesheet);
  }
});

test("map and sync own recoverable iframe host state", () => {
  for (const page of ["MapPage.tsx", "SyncPage.tsx"]) {
    const pageSource = source(`../src/pages/${page}`);
    assert.match(pageSource, /type FrameState = "loading" \| "ready" \| "timed-out" \| "failed"/);
    assert.match(pageSource, /setTimeout/);
    assert.match(pageSource, /onLoad=/);
    assert.match(pageSource, /onError=/);
    assert.match(pageSource, /Loading embedded/);
    assert.match(pageSource, /taking longer than expected/);
    assert.match(pageSource, /Retry/);
    assert.match(pageSource, /Open full page/);
  }
});
