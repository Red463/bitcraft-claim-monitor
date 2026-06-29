import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("Public Craft Finder page lives outside the legacy MainPages bundle", () => {
  const mainPages = readFileSync(new URL("../src/pages/MainPages.tsx", import.meta.url), "utf8");
  const appShell = readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8");
  const publicCraftFinderPageUrl = new URL("../src/pages/PublicCraftFinderPage.tsx", import.meta.url);

  assert.equal(existsSync(publicCraftFinderPageUrl), true);
  assert.doesNotMatch(mainPages, new RegExp("export function PublicCraftFinder\\b"));
  assert.equal(appShell.includes('import { PublicCraftFinder } from "./pages/PublicCraftFinderPage";'), true);
});
