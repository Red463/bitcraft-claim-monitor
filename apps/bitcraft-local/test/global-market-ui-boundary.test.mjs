import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("global market map handoffs write the canonical region and coordinate parameters", () => {
  const appShell = source("../src/AppShell.tsx");
  assert.match(appShell, /label: activeMapFocus\?\.name/);
  assert.match(appShell, /x: activeMapFocus \? String\(activeMapFocus\.locationX\)/);
  assert.match(appShell, /z: activeMapFocus \? String\(activeMapFocus\.locationZ\)/);
  assert.match(appShell, /regionId: panel === "map" \? activeMapFocus\?\.regionId/);
});

test("Deals shows available, wanted, and maximum tradable quantities", () => {
  const deals = source("../src/pages/market/MarketDeals.tsx");
  assert.match(deals, /<th>Available<\/th><th>Wanted<\/th><th>Max trade<\/th>/);
  assert.match(deals, /formatNumber\(deal\.buyQuantity\)/);
  assert.match(deals, /formatNumber\(deal\.sellQuantity\)/);
});

test("stall cards show coordinates and item detail shows metadata plus order counts", () => {
  const stalls = source("../src/pages/market/MarketStalls.tsx");
  const browse = source("../src/pages/market/MarketBrowse.tsx");
  assert.match(stalls, /X \$\{formatNumber\(stall\.locationX\)\}, Z \$\{formatNumber\(stall\.locationZ\)\}/);
  assert.match(browse, /itemMetadata\.category \?\? itemMetadata\.tag/);
  assert.match(browse, /label="Sell Orders" value=\{formatNumber\(sells\.length\)\}/);
  assert.match(browse, /label="Buy Orders" value=\{formatNumber\(buys\.length\)\}/);
});

test("global market money and locations use the shared legible presentation", () => {
  const overview = source("../src/pages/market/MarketOverview.tsx");
  const deals = source("../src/pages/market/MarketDeals.tsx");
  const browse = source("../src/pages/market/MarketBrowse.tsx");

  assert.match(overview, /formatGoldAmount\(deal\.buyPrice\)/);
  assert.match(overview, /className="market-price-location"/);
  assert.match(deals, /formatGoldAmount\(totalPotential\)/);
  assert.match(deals, /className="market-price-location"/);
  assert.match(browse, /formatGoldAmount\(order\.unitPrice \* order\.quantity\)/);
  assert.doesNotMatch(overview, /formatCompactNumber\(row\.totalValue\)\}g/);
  assert.doesNotMatch(deals, /formatCompactNumber\(totalPotential\)\}g/);
});

test("Overview top deals uses explicit sortable values and a static Map column", () => {
  const overview = source("../src/pages/market/MarketOverview.tsx");

  assert.match(overview, /<DataTable[\s\S]*scrollLabel="Top global market deals"/);
  assert.match(overview, /\["Item",[\s\S]*deal\.itemName/);
  assert.match(overview, /\["Buy at",[\s\S]*toNumber\(deal\.buyPrice\)/);
  assert.match(overview, /\["Profit",[\s\S]*toNumber\(deal\.profit \?\? deal\.profitPerUnit\)/);
  assert.match(overview, /\["Map",[\s\S]*undefined,\s*false\]/);
});

test("Browse groups availability controls and separates item identity metadata", () => {
  const browse = source("../src/pages/market/MarketBrowse.tsx");

  assert.match(browse, /className="market-toggle-group"/);
  assert.match(browse, /className="market-item-identity"/);
  assert.match(browse, /className="market-item-meta"/);
});

test("Deal Watch renders operational facts as labelled units", () => {
  const watch = source("../src/pages/market/DealWatchlist.tsx");

  assert.match(watch, /className="deal-watch-fact"/);
  assert.match(watch, />Region<\/span><strong>R\{watch\.regionId\}<\/strong>/);
  assert.match(watch, />Last checked<\/span><strong>/);
  assert.match(watch, />Last alert<\/span><strong>/);
});
