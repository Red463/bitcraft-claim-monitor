import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("global Buy Orders renders the dedicated live Relay finder", () => {
  const marketPage = readFileSync(new URL("../src/pages/MarketPage.tsx", import.meta.url), "utf8");
  const finder = readFileSync(new URL("../src/pages/market/BuyOrderFinder.tsx", import.meta.url), "utf8");

  assert.match(marketPage, /from "\.\/market\/BuyOrderFinder"/);
  assert.match(marketPage, /currentView === "buy-orders"[\s\S]*<BuyOrderFinder/);
  assert.doesNotMatch(marketPage, /currentView === "buy-orders"[\s\S]{0,300}<MarketBrowse/);
  assert.match(finder, /\/api\/local\/market\/buy-orders/);
  assert.match(finder, /useGameDataGeneration\(\s*claimId,\s*\["catalogs",\s*"regional-market"\]\s*,?\s*\)/);
  assert.match(finder, /Best Opportunities/);
  assert.match(finder, /locally observed confirmed sales/i);
  assert.match(finder, /React\.useEffect\(\(\) => \{[\s\S]*?buyOrderSearchTransition\(appliedLocationQuery\.current,\s*locationSearch\)[\s\S]*?setSearch\(transition\.search\)[\s\S]*?setPage\(1\)[\s\S]*?\}, \[locationSearch\]\)/);
  assert.match(finder, /\.catch\(\(error\) => \{[\s\S]*?setState\(\(current\) => \(\{\s*\.\.\.current,[\s\S]*?error:/);
  assert.doesNotMatch(finder, /\.catch\(\(error\) => \{[\s\S]{0,500}?data:\s*null/);
  assert.match(finder, /formatExactDecimalInteger/);
  assert.match(finder, /sumExactDecimalIntegers/);
  assert.doesNotMatch(finder, /formatCompactNumber|toNumber\(order\.(?:quantity|totalValue)\)|formatNumber\(order\.(?:quantity|unitPrice|totalValue|averageUnitPrice)\)/);
  assert.match(finder, /refreshSequence/);
  assert.match(finder, /refreshHeaders/);
  assert.match(finder, /trackRefresh/);
  assert.doesNotMatch(finder, /cached orders|collector may not have populated|BitJita/i);
});
