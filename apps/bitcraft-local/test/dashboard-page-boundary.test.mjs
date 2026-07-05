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

test("Dashboard recent activity previews the activity page feed", () => {
  const dashboard = readFileSync(new URL("../src/pages/DashboardPage.tsx", import.meta.url), "utf8");

  assert.match(dashboard, /dashboardRecentActivityItems\(activity,\s*5\)/);
  assert.doesNotMatch(dashboard, /dashboardSummary\?\.recentActivity/);
});

test("Dashboard online members do not fall back to the settlement region as player location", () => {
  const dashboard = readFileSync(new URL("../src/pages/DashboardPage.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(dashboard, /regionName:\s*player\.regionName\s*\?\?\s*claim\.regionName/);
  assert.match(dashboard, /player\.regionName\s*\?\?\s*"Location unknown"/);
});
