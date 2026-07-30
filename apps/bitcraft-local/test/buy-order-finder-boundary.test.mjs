import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("global Buy Orders uses the item-first live market browser", () => {
  const marketPage = readFileSync(new URL("../src/pages/MarketPage.tsx", import.meta.url), "utf8");
  const marketBrowse = readFileSync(new URL("../src/pages/market/MarketBrowse.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(marketPage, /from "\.\/market\/BuyOrderFinder"/);
  assert.match(marketPage, /<MarketBrowse[^>]*mode="buy"/);
  assert.match(marketBrowse, /Find an item with buy orders/);
  assert.match(marketBrowse, /no monitored-settlement cache is used/);
  assert.doesNotMatch(marketBrowse, /\/api\/local\/market\/buy-orders/);
});
