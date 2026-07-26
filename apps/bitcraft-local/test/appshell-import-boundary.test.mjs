import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("AppShell imports only top-level shell dependencies after admin/settings extraction", () => {
  const appShell = readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8");

  assert.equal(appShell.includes("./components/bot/"), false);
  assert.doesNotMatch(appShell, /DashboardWidgets|DataTable|ItemDisplay|SearchBox|Segmented|Stats/);
  assert.doesNotMatch(appShell, /buildConstructionProjects|constructionNeededMaterials|mapWithBrowserConcurrency|discordColorToHex|NOTIFICATION_SOUND_OPTIONS|THEME_FIELD_GROUPS/);
  assert.match(appShell, /React\.lazy\(\(\) => import\("\.\/components\/admin\/AdminPanel"\)/);
  assert.equal(appShell.includes('import { UserSettingsDialog } from "./components/main/UserSettingsDialog";'), true);
});

test("AppShell wires public access-control decisions into navigation and blocked states", () => {
  const appShell = readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8");

  assert.match(appShell, /\/access-control\/effective/);
  assert.match(appShell, /effectiveTargetAllowed/);
  assert.match(appShell, /targetIdForPage/);
  assert.match(appShell, /RestrictedAccessState/);
  assert.doesNotMatch(appShell, /visibleItems = group\.items\.filter/);
  assert.match(appShell, /const restricted = !isPageAllowed\(id\)/);
});
