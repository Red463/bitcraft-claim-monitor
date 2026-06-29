import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

test("Market page replaces the legacy MainPages bundle", () => {
  const mainPagesUrl = new URL("../src/pages/MainPages.tsx", import.meta.url);
  const marketPage = readFileSync(new URL("../src/pages/MarketPage.tsx", import.meta.url), "utf8");
  const appShell = readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8");

  assert.equal(existsSync(mainPagesUrl), false);
  assert.match(marketPage, /export function Market\b/);
  assert.match(marketPage, /from "\.\/market\/PriceFinder"/);
  assert.match(marketPage, /from "\.\/market\/BuyOrderFinder"/);
  assert.match(appShell, /from "\.\/pages\/MarketPage"/);
  assert.doesNotMatch(appShell, /from "\.\/pages\/MainPages"/);
});
