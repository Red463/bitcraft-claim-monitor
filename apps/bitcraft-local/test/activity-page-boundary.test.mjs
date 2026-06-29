import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("Activity page lives outside the legacy MainPages bundle", () => {
  const mainPages = readFileSync(new URL("../src/pages/MainPages.tsx", import.meta.url), "utf8");
  const appShell = readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8");
  const activityPageUrl = new URL("../src/pages/ActivityPage.tsx", import.meta.url);

  assert.equal(existsSync(activityPageUrl), true);
  assert.doesNotMatch(mainPages, new RegExp("export function ActivityPanel\\b"));
  assert.equal(appShell.includes('import { ActivityPanel } from "./pages/ActivityPage";'), true);
});
