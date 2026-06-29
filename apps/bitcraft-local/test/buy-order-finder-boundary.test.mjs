import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("BuyOrderFinder lives in a market-owned component module", () => {
  const marketPage = readFileSync(new URL("../src/pages/MarketPage.tsx", import.meta.url), "utf8");
  const buyOrderFinder = readFileSync(new URL("../src/pages/market/BuyOrderFinder.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(marketPage, /export function BuyOrderFinder\b/);
  assert.match(marketPage, /from "\.\/market\/BuyOrderFinder"/);
  assert.match(buyOrderFinder, /export function BuyOrderFinder\b/);
  assert.match(buyOrderFinder, /from "\.\.\/\.\.\/hooks\/useActiveRegions"/);
  assert.match(buyOrderFinder, /from "\.\.\/\.\.\/navigation"/);
  assert.match(buyOrderFinder, /from "\.\.\/\.\.\/utils\/analytics"/);
});
