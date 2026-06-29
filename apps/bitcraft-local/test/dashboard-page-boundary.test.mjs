import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("Dashboard page lives outside the legacy MainPages bundle", () => {
  const mainPages = readFileSync(new URL("../src/pages/MainPages.tsx", import.meta.url), "utf8");
  const appShell = readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8");
  const dashboardPageUrl = new URL("../src/pages/DashboardPage.tsx", import.meta.url);

  assert.equal(existsSync(dashboardPageUrl), true);
  assert.doesNotMatch(mainPages, /export function Dashboard\b/);
  assert.match(appShell, /import \{ Dashboard \} from "\.\/pages\/DashboardPage";/);
});
