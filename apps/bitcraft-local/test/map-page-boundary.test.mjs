import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("Map page lives outside the legacy MainPages bundle", () => {
  const mainPagesUrl = new URL("../src/pages/MainPages.tsx", import.meta.url);
  const mainPages = existsSync(mainPagesUrl) ? readFileSync(mainPagesUrl, "utf8") : "";
  const appShell = readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8");
  const mapPageUrl = new URL("../src/pages/MapPage.tsx", import.meta.url);

  assert.equal(existsSync(mapPageUrl), true);
  assert.doesNotMatch(mainPages, new RegExp("export function MapPanel\\b"));
  assert.equal(appShell.includes('import { MapPanel } from "./pages/MapPage";'), true);
});
