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

  assert.match(deals, /\["Available"/);
  assert.match(deals, /\["Wanted"/);
  assert.match(deals, /\["Max trade"/);
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
  assert.match(browse, /formatGoldAmount\(multiplyDecimal\(order\.unitPrice, order\.quantity\)\)/);
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

test("Deals sorts every data column from raw values and keeps Map static", () => {
  const deals = source("../src/pages/market/MarketDeals.tsx");

  assert.match(deals, /<DataTable[\s\S]*rows=\{rows\}[\s\S]*rowLimit=\{250\}/);
  assert.match(deals, /\["Available",[\s\S]*toNumber\(deal\.buyQuantity\)/);
  assert.match(deals, /\["Wanted",[\s\S]*toNumber\(deal\.sellQuantity\)/);
  assert.match(deals, /\["Gain",[\s\S]*percent/);
  assert.match(deals, /\["Map",[\s\S]*undefined,\s*false\]/);
  assert.doesNotMatch(deals, /<span>Sort<\/span>/);
});

test("Browse sorts the complete filtered order book before pagination", () => {
  const browse = source("../src/pages/market/MarketBrowse.tsx");
  const orderWorkspace = browse.slice(browse.indexOf('detailTab === "orders"'), browse.indexOf("pagination-row"));

  assert.match(orderWorkspace, /<DataTable/);
  assert.match(orderWorkspace, /rows=\{filteredOrders\}/);
  assert.match(orderWorkspace, /rowOffset=\{\(Math\.min\(page,\s*pageCount\) - 1\) \* pageSize\}/);
  assert.match(orderWorkspace, /rowLimit=\{pageSize\}/);
  assert.match(orderWorkspace, /\["Total",[\s\S]*multiplyDecimal\(order\.unitPrice, order\.quantity\)/);
  assert.match(orderWorkspace, /\["Map",[\s\S]*undefined,\s*false\]/);
  assert.doesNotMatch(orderWorkspace, /<span>Sort<\/span>/);
});

test("Browse groups availability controls and separates item identity metadata", () => {
  const browse = source("../src/pages/market/MarketBrowse.tsx");

  assert.match(browse, /className="market-toggle-group"/);
  assert.match(browse, /className="market-item-identity"/);
  assert.match(browse, /className="market-item-meta"/);
});

test("Browse invalidates on regional-market generation events and keeps history non-blocking", () => {
  const browse = source("../src/pages/market/MarketBrowse.tsx");
  const generationHook = source("../src/hooks/useGameDataGeneration.ts");

  assert.match(browse, /useGameDataGeneration\([^)]*"catalogs"[^)]*"regional-market"/s);
  assert.match(browse, /generationSequence/);
  assert.doesNotMatch(browse, /Promise\.all\(\[\s*fetch\(urls\.orderBook/);
  assert.match(generationHook, /new EventSource/);
  assert.match(generationHook, /setInterval/);
  assert.match(generationHook, /\/api\/local\/game-data\/generation/);
});

test("Market source copy identifies the live Relay browse path during migration", () => {
  const marketPage = source("../src/pages/MarketPage.tsx");

  assert.match(marketPage, /Browse and regional order books use live Relay data/);
  assert.doesNotMatch(marketPage, /Live market data is provided by BitJita/);
});

test("Deal Watch renders operational facts as labelled units", () => {
  const watch = source("../src/pages/market/DealWatchlist.tsx");

  assert.match(watch, /className="deal-watch-fact"/);
  assert.match(watch, />Region<\/span><strong>R\{watch\.regionId\}<\/strong>/);
  assert.match(watch, />Last checked<\/span><strong>/);
  assert.match(watch, />Last alert<\/span><strong>/);
});
