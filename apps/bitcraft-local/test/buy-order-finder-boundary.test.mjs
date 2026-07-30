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

test("regional Buy Order Finder describes committed Relay data as live rather than cached", () => {
  const buyOrderFinder = readFileSync(new URL("../src/pages/market/BuyOrderFinder.tsx", import.meta.url), "utf8");

  assert.match(buyOrderFinder, /Updating live orders/);
  assert.match(buyOrderFinder, /live orders/);
  assert.match(buyOrderFinder, /Relay may still be loading/);
  assert.match(buyOrderFinder, /setState\(\(current\) => \(\{ \.\.\.current, error: "Relay regional market unavailable", loading: false \}\)\)/);
  assert.doesNotMatch(buyOrderFinder, /cached buy orders|cached orders/i);
});
