import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("Dashboard page lives outside the legacy MainPages bundle", () => {
  const mainPagesUrl = new URL("../src/pages/MainPages.tsx", import.meta.url);
  const mainPages = existsSync(mainPagesUrl) ? readFileSync(mainPagesUrl, "utf8") : "";
  const appShell = readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8");
  const dashboardPageUrl = new URL("../src/pages/DashboardPage.tsx", import.meta.url);

  assert.equal(existsSync(dashboardPageUrl), true);
  assert.doesNotMatch(mainPages, /export function Dashboard\b/);
  assert.match(appShell, /import \{ Dashboard \} from "\.\/pages\/DashboardPage";/);
});

test("Dashboard shows the craft planning Gather Next overview", () => {
  const dashboard = readFileSync(new URL("../src/pages/DashboardPage.tsx", import.meta.url), "utf8");

  assert.match(dashboard, /\/api\/local\/craft-plan/);
  assert.match(dashboard, /Gather Next/);
  assert.match(dashboard, /onNavigate\("planning"\)/);
  assert.doesNotMatch(dashboard, /DashboardCardHeader title="Recent Activity"/);
});

test("Dashboard Gather Next shows known item tiers", () => {
  const dashboard = readFileSync(new URL("../src/pages/DashboardPage.tsx", import.meta.url), "utf8");

  assert.match(dashboard, /item\.tier\s*\?\?\s*item\.itemTier\s*\?\?\s*item\.tierLevel/);
  assert.match(dashboard, /dashboard-feed-item/);
  assert.match(dashboard, /<TierBadge tier=\{itemTier\}/);
});

test("Dashboard market trend exposes nearest-point pointer and keyboard readouts", () => {
  const widgets = readFileSync(new URL("../src/components/main/DashboardWidgets.tsx", import.meta.url), "utf8");

  assert.match(widgets, /activePointIndex/);
  assert.match(widgets, /onPointerMove/);
  assert.match(widgets, /getBoundingClientRect/);
  assert.match(widgets, /dashboard-chart-guide/);
  assert.match(widgets, /dashboard-chart-tooltip/);
  assert.match(widgets, /tabIndex=\{0\}/);
  assert.match(widgets, /onFocus=\{\(\) => setActivePointIndex\(index\)\}/);
  assert.match(widgets, /shortDateLabel\(activePoint\.at\)/);
  assert.match(widgets, /formatNumber\(activePoint\.value\)/);
});

test("Dashboard online members do not fall back to the settlement region as player location", () => {
  const dashboard = readFileSync(new URL("../src/pages/DashboardPage.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(dashboard, /regionName:\s*player\.regionName\s*\?\?\s*claim\.regionName/);
  assert.match(dashboard, /regionNameById/);
  assert.match(dashboard, /regionNameById\.get\(regionId\)\s*\?\?\s*`R\$\{regionId\}`/);
  assert.match(dashboard, /player\.regionName\s*\?\?\s*"Location unknown"/);
});
