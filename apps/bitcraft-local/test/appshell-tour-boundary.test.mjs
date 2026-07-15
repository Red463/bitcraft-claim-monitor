import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("AppShell wires first-run tour manager and suppresses app popups while tour is active", () => {
  const appShell = readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8");

  assert.match(appShell, /import \{ FirstRunTourManager \} from "\.\/components\/main\/FirstRunTourManager";/);
  assert.match(appShell, /const \[tourVisible, setTourVisible\] = React\.useState\(false\);/);
  assert.match(appShell, /<FirstRunTourManager/);
  assert.match(appShell, /onNavigate=\{\(panel\) => navigate\(panel\)\}/);
  assert.match(appShell, /onVisibilityChange=\{setTourVisible\}/);
  assert.match(appShell, /onOpenUserSettings=\{\(\) => setUserSettingsOpen\(true\)\}/);
  assert.match(appShell, /onCloseUserSettings=\{\(\) => setUserSettingsOpen\(false\)\}/);
  assert.match(appShell, /<FirstRunTourManager[\s\S]*enabled=\{[\s\S]*consent != null[\s\S]*replayToken=/);
  assert.match(appShell, /\{!tourVisible \? <ToastStack/);
  assert.match(appShell, /<AppPopupManager[\s\S]*!tourVisible/);
});

test("HelpCenter exposes a manual app tour replay action", () => {
  const legalDialogs = readFileSync(new URL("../src/components/main/LegalDialogs.tsx", import.meta.url), "utf8");

  assert.match(legalDialogs, /onStartTour/);
  assert.match(legalDialogs, /Start app tour/);
});


test("first-run tour prompt introduces Claim Monitor before offering the tour", () => {
  const manager = readFileSync(new URL("../src/components/main/FirstRunTourManager.tsx", import.meta.url), "utf8");

  assert.match(manager, /Welcome to Claim Monitor/);
  assert.match(manager, /Claim Monitor helps your settlement keep track of production, members, markets, inventory, construction, research, empire activity, and map information in one place\./);
  assert.match(manager, /Take a short tour to see where the main tools are and how to adjust notifications and browser settings\./);
});

test("tour card stacks above the spotlight dim layer", () => {
  const css = readFileSync(new URL("../src/styles/first-run-tour.css", import.meta.url), "utf8");
  const rootCss = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(css, /\.first-run-tour-overlay \{[^}]*z-index: calc\(var\(--z-overlay\) \+ 12\)/);
  assert.match(css, /\.first-run-tour-spotlight \{[^}]*z-index: 1/);
  assert.match(css, /\.first-run-tour-card \{[^}]*z-index: 2/);
  assert.match(rootCss, /--z-cookie: 60;/);
});

test("settings tour step reopens settings if the dialog is closed mid-step", () => {
  const manager = readFileSync(new URL("../src/components/main/FirstRunTourManager.tsx", import.meta.url), "utf8");

  assert.match(manager, /if \(!nextRect && step\.action === "settings"\)/);
  assert.match(manager, /onOpenUserSettings\?\.\(\);/);
});
test("tour anchors are stable data attributes rather than CSS selectors", () => {
  const appShell = readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8");
  const dashboard = readFileSync(new URL("../src/pages/DashboardPage.tsx", import.meta.url), "utf8");
  const leaderboard = readFileSync(new URL("../src/pages/LeaderboardPage.tsx", import.meta.url), "utf8");
  const members = readFileSync(new URL("../src/pages/MembersPage.tsx", import.meta.url), "utf8");
  const skills = readFileSync(new URL("../src/pages/SkillsPage.tsx", import.meta.url), "utf8");
  const production = readFileSync(new URL("../src/pages/ProductionPage.tsx", import.meta.url), "utf8");
  const inventory = readFileSync(new URL("../src/pages/InventoryPage.tsx", import.meta.url), "utf8");
  const construction = readFileSync(new URL("../src/pages/ConstructionPage.tsx", import.meta.url), "utf8");
  const research = readFileSync(new URL("../src/pages/ResearchPage.tsx", import.meta.url), "utf8");
  const market = readFileSync(new URL("../src/pages/MarketPage.tsx", import.meta.url), "utf8");
  const region = readFileSync(new URL("../src/pages/RegionPage.tsx", import.meta.url), "utf8");
  const empires = readFileSync(new URL("../src/pages/EmpiresPage.tsx", import.meta.url), "utf8");
  const map = readFileSync(new URL("../src/pages/MapPage.tsx", import.meta.url), "utf8");
  const activity = readFileSync(new URL("../src/pages/ActivityPage.tsx", import.meta.url), "utf8");
  const publicCrafts = readFileSync(new URL("../src/pages/PublicCraftFinderPage.tsx", import.meta.url), "utf8");
  const craftCalculator = readFileSync(new URL("../src/pages/CraftCalculatorPage.tsx", import.meta.url), "utf8");
  const sync = readFileSync(new URL("../src/pages/SyncPage.tsx", import.meta.url), "utf8");
  const userSettingsDialog = readFileSync(new URL("../src/components/main/UserSettingsDialog.tsx", import.meta.url), "utf8");

  assert.match(appShell, /data-tour="sidebar-navigation"/);
  assert.match(appShell, /data-tour="floating-actions"/);
  assert.match(dashboard, /data-tour="dashboard-summary"/);
  assert.match(leaderboard, /data-tour="leaderboard-page"/);
  assert.match(members, /data-tour="members-page"/);
  assert.match(skills, /data-tour="skills-page"/);
  assert.match(production, /data-tour="production-controls"/);
  assert.match(inventory, /data-tour="inventory-page"/);
  assert.match(construction, /data-tour="construction-page"/);
  assert.match(research, /data-tour="research-page"/);
  assert.match(market, /data-tour="market-tools"/);
  assert.match(region, /data-tour="region-page"/);
  assert.match(empires, /data-tour="empires-page"/);
  assert.match(map, /data-tour="map-player-tracking"/);
  assert.match(activity, /data-tour="activity-controls"/);
  assert.match(publicCrafts, /data-tour="publiccrafts-page"/);
  assert.match(craftCalculator, /data-tour="craftcalc-page"/);
  assert.match(sync, /data-tour="sync-page"/);
  assert.match(userSettingsDialog, /dataTour="user-settings"/);
});

