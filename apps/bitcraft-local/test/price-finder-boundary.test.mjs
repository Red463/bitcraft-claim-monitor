import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("global Browse replaces the settlement-scoped Price Finder", () => {
  const marketPage = readFileSync(new URL("../src/pages/MarketPage.tsx", import.meta.url), "utf8");
  const settlementMarket = readFileSync(new URL("../src/pages/SettlementMarketPage.tsx", import.meta.url), "utf8");
  const marketBrowse = readFileSync(new URL("../src/pages/market/MarketBrowse.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(marketPage, /from "\.\/market\/PriceFinder"/);
  assert.doesNotMatch(settlementMarket, /from "\.\/market\/PriceFinder"/);
  assert.match(marketPage, /<MarketBrowse[^>]*mode="browse"/);
  assert.match(marketBrowse, /Search global catalog/);
});
test("Deal Watch remains separate from Favorites and Browse", () => {
  const marketPage = readFileSync(new URL("../src/pages/MarketPage.tsx", import.meta.url), "utf8");
  const marketBrowse = readFileSync(new URL("../src/pages/market/MarketBrowse.tsx", import.meta.url), "utf8");

  assert.match(marketPage, /const FAVORITES_KEY = "bitcraft\.market\.favorites\.v1"/);
  assert.match(marketPage, /<DealWatchlist/);
  assert.match(marketBrowse, /onToggleFavorite/);
  assert.doesNotMatch(marketBrowse, /<DealWatchlist/);
});
