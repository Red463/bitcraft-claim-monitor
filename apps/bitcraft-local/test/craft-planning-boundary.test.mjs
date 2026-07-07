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

test("Craft Planning page renders read-only plan sections", () => {
  const page = readFileSync(new URL("../src/pages/CraftPlanningPage.tsx", import.meta.url), "utf8");

  assert.match(page, /\/api\/local\/craft-plan|LOCAL_API\}\/craft-plan/);
  assert.match(page, /Gather Next/);
  assert.match(page, /Targets/);
  assert.match(page, /Materials/);
  assert.match(page, /Recipe Routes/);
  assert.match(page, /Unavailable sources/);
  assert.doesNotMatch(page, /\/api\/local\/admin\/craft-plan/);
});

test("Admin panel exposes Craft Planning configuration controls", () => {
  const adminPanel = readFileSync(new URL("../src/components/admin/AdminPanel.tsx", import.meta.url), "utf8");
  const admin = `${adminPanel}\n${readFileSync(new URL("../src/components/admin/AdminCraftPlanSection.tsx", import.meta.url), "utf8")}`;

  assert.match(admin, /\/admin\/craft-plan/);
  assert.match(admin, /Craft Planning/);
  assert.match(admin, /Target items/);
  assert.match(admin, /Storage sources/);
  assert.match(admin, /Player inventories/);
  assert.match(admin, /Player deployables/);
  assert.match(admin, /Chance and drop multipliers/);
});

test("Dashboard shows Gather Next instead of Recent Activity", () => {
  const dashboard = readFileSync(new URL("../src/pages/DashboardPage.tsx", import.meta.url), "utf8");

  assert.match(dashboard, /\/api\/local\/craft-plan|LOCAL_API\}\/craft-plan/);
  assert.match(dashboard, /Gather Next/);
  assert.match(dashboard, /onNavigate\("planning"\)/);
  assert.doesNotMatch(dashboard, /DashboardCardHeader title="Recent Activity"/);
});
