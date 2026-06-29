import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("Inventory page lives outside the legacy MainPages bundle", () => {
  const mainPagesUrl = new URL("../src/pages/MainPages.tsx", import.meta.url);
  const mainPages = existsSync(mainPagesUrl) ? readFileSync(mainPagesUrl, "utf8") : "";
  const appShell = readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8");
  const inventoryPageUrl = new URL("../src/pages/InventoryPage.tsx", import.meta.url);

  assert.equal(existsSync(inventoryPageUrl), true);
  assert.doesNotMatch(mainPages, new RegExp("export function Inventory\\b"));
  assert.equal(appShell.includes('import { Inventory } from "./pages/InventoryPage";'), true);
});
