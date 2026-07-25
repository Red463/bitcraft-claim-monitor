import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const dashboardPage = fs.readFileSync(new URL("../src/pages/DashboardPage.tsx", import.meta.url), "utf8");
const widgets = fs.readFileSync(new URL("../src/components/main/DashboardWidgets.tsx", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../src/styles/dashboard.css", import.meta.url), "utf8");

test("dashboard market income exposes three accessible ranges", () => {
  assert.match(dashboardPage, /MARKET_INCOME_RANGES/);
  assert.match(dashboardPage, /useState<MarketIncomeRangeDays>\(7\)/);
  assert.match(dashboardPage, /<Segmented/);
  assert.match(dashboardPage, /label="Market income range"/);
  assert.match(dashboardPage, /marketTotals\.trackedValue/);
});

test("dashboard market income labels partial coverage and the Y axis", () => {
  assert.match(dashboardPage, /Stored sales begin/);
  assert.match(dashboardPage, /yAxisLabel="Cumulative gold"/);
  assert.match(widgets, /dashboard-chart-y-axis/);
  assert.match(widgets, /aria-label=\{yAxisLabel\}/);
  assert.match(styles, /\.dashboard-chart-controls/);
  assert.match(styles, /\.dashboard-chart-y-axis/);
  assert.match(styles, /\.dashboard-chart-coverage/);
});
