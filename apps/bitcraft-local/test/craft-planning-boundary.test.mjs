import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Craft Planning page is registered in navigation, access control, and AppShell", () => {
  const appType = readFileSync(new URL("../src/types/app.ts", import.meta.url), "utf8");
  const navigation = readFileSync(new URL("../src/navigation.ts", import.meta.url), "utf8");
  const access = readFileSync(new URL("../src/access/accessControl.mjs", import.meta.url), "utf8");
  const appShell = readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8");

  assert.match(appType, /\| "planning"/);
  assert.match(navigation, /\["planning", "Craft Planning"/);
  assert.match(access, /\["planning", "Craft Planning"\]/);
  assert.match(appShell, /from "\.\/pages\/CraftPlanningPage"/);
  assert.match(appShell, /planning: <CraftPlanningPage/);
});

test("Craft Planning page renders read-only plan sections with an admin-only manager entry", () => {
  const page = readFileSync(new URL("../src/pages/CraftPlanningPage.tsx", import.meta.url), "utf8");

  assert.match(page, /\/craft-plan\?claimId=/);
  assert.match(page, /\/admin\/me/);
  assert.match(page, /Manage Plan/);
  assert.match(page, /<h3><Target size=\{17\} \/> Targets<\/h3>/);
  assert.match(page, /Needs Board/);
  assert.match(page, /craft-plan-needs-board/);
  assert.match(page, /<h3><Package size=\{17\} \/> Materials<\/h3>/);
  assert.ok(page.indexOf("Targets") < page.indexOf("Needs Board"), "targets should render before the public needs board");
  assert.doesNotMatch(page, /<h3><Route size=\{17\} \/> Recipe Routes<\/h3>/);
  assert.match(page, /Unavailable sources/);
  assert.match(page, /CraftPlanManagerDialog/);
});

test("Craft Planning manager owns full admin editing controls", () => {
  const manager = readFileSync(new URL("../src/pages/CraftPlanManagerDialog.tsx", import.meta.url), "utf8");
  const admin = readFileSync(new URL("../src/components/admin/AdminCraftPlanSection.tsx", import.meta.url), "utf8");
  const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

  assert.match(admin, /Open Manager/);
  assert.match(admin, /page=planning/);
  assert.match(manager, /\/admin\/craft-plan/);
  assert.match(manager, /Tier upgrade presets/);
  assert.match(manager, /Loaded from BitJita claim research/);
  assert.match(manager, /tierPresets/);
  assert.match(server, /nestedKeys = \["input", "inputs"/);
  assert.match(server, /techType === "settlement"/);
  assert.match(manager, /Target items/);
  assert.match(manager, /Settlement storage/);
  assert.match(manager, /Players & deployables/);
  assert.match(manager, /Chance and drop multipliers/);
  assert.match(manager, /mergeTargets/);
});

test("Dashboard shows Gather Next instead of Recent Activity", () => {
  const dashboard = readFileSync(new URL("../src/pages/DashboardPage.tsx", import.meta.url), "utf8");

  assert.match(dashboard, /\/api\/local\/craft-plan|LOCAL_API\}\/craft-plan/);
  assert.match(dashboard, /Gather Next/);
  assert.match(dashboard, /onNavigate\("planning"\)/);
  assert.doesNotMatch(dashboard, /DashboardCardHeader title="Recent Activity"/);
});
