import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("PriceFinder lives in a market-owned component module", () => {
  const marketPage = readFileSync(new URL("../src/pages/MarketPage.tsx", import.meta.url), "utf8");
  const priceFinder = readFileSync(new URL("../src/pages/market/PriceFinder.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(marketPage, /export function PriceFinder\b/);
  assert.match(marketPage, /from "\.\/market\/PriceFinder"/);
  assert.match(priceFinder, /export function PriceFinder\b/);
  assert.match(priceFinder, /from "\.\.\/\.\.\/hooks\/useActiveRegions"/);
  assert.match(priceFinder, /from "\.\.\/\.\.\/navigation"/);
  assert.match(priceFinder, /from "\.\.\/\.\.\/utils\/analytics"/);
});
test("PriceFinder keeps item-specific watch action but not the full watchlist manager", () => {
  const priceFinder = readFileSync(new URL("../src/pages/market/PriceFinder.tsx", import.meta.url), "utf8");

  assert.match(priceFinder, /Watch for deals/);
  assert.doesNotMatch(priceFinder, /<section className="deal-watchlist-section">/);
  assert.doesNotMatch(priceFinder, /No watched items yet\. Search an item/);
});
