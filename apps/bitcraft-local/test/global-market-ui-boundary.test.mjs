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
  assert.match(stalls, /\/api\/local\/market\/stalls/);
  assert.match(stalls, /useGameDataGeneration\([^)]*"catalogs"[^)]*"regional-market"/s);
  assert.match(stalls, /selectedStallKey/);
  assert.match(stalls, /stalls\.find\(/);
  assert.doesNotMatch(stalls, /setSelectedStall\(stall\)/);
  assert.doesNotMatch(stalls, /api\/bitjita|BitJita/i);
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
  assert.match(deals, /formatGoldAmount\(bestRoutePotential\)/);
  assert.match(deals, /className="market-price-location"/);
  assert.match(browse, /formatGoldAmount\(multiplyDecimal\(order\.unitPrice, order\.quantity\)\)/);
  assert.doesNotMatch(overview, /formatCompactNumber\(row\.totalValue\)\}g/);
  assert.doesNotMatch(deals, /formatCompactNumber\(bestRoutePotential\)\}g/);
});

test("Overview top deals uses exact sortable values and omits unproven map data", () => {
  const overview = source("../src/pages/market/MarketOverview.tsx");

  assert.match(overview, /<DataTable[\s\S]*scrollLabel="Top global market deals"/);
  assert.match(overview, /\["Item",[\s\S]*deal\.itemName/);
  assert.match(overview, /\["Buy at",[\s\S]*\(deal\) => deal\.buyPrice/);
  assert.match(overview, /\["Profit",[\s\S]*\(deal\) => deal\.profit/);
  assert.doesNotMatch(overview, /\["Map"/);
});

test("Deals sorts exact current-order values and omits unproven map data", () => {
  const deals = source("../src/pages/market/MarketDeals.tsx");

  assert.match(deals, /<DataTable[\s\S]*rows=\{rows\}[\s\S]*rowLimit=\{250\}/);
  assert.match(deals, /\["Available",[\s\S]*\(deal\) => deal\.buyQuantity/);
  assert.match(deals, /\["Wanted",[\s\S]*\(deal\) => deal\.sellQuantity/);
  assert.match(deals, /\["Distance",[\s\S]*deal\.distance == null/);
  assert.match(deals, /\["Gain",[\s\S]*profitPercent/);
  assert.doesNotMatch(deals, /Route distance and map coordinates will appear/);
  assert.doesNotMatch(deals, /\["Map"/);
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

test("Browse consolidates availability and preserves an explicit result return path", () => {
  const browse = source("../src/pages/market/MarketBrowse.tsx");

  assert.match(browse, /className="field market-availability-field"/);
  assert.match(browse, /Back to results<\/button>/);
  assert.match(browse, /Clear filters<\/button>/);
  assert.match(browse, /aria-activedescendant=/);
  assert.match(browse, /role="option"/);
  assert.match(browse, /className="market-item-identity"/);
  assert.match(browse, /className="market-item-meta"/);
});

test("Overview and Deals use generation-invalidated local Relay projections", () => {
  const overview = source("../src/pages/market/MarketOverview.tsx");
  const deals = source("../src/pages/market/MarketDeals.tsx");

  for (const page of [overview, deals]) {
    assert.match(page, /useGameDataGeneration/);
    assert.match(page, /"catalogs", "regional-market"/);
    assert.doesNotMatch(page, /\/api\/bitjita/);
  }
  assert.match(overview, /\/api\/local\/market\/overview/);
  assert.match(overview, /Current liquidity/);
  assert.match(overview, /Recent open orders/);
  assert.match(deals, /\/api\/local\/market\/deals/);
  assert.match(deals, /search\.set\("regions", regions\.join\(","\)\)/);
  assert.match(deals, /marketFreshnessNotice/);
  assert.match(deals, /Best Route Potential/);
  assert.match(deals, /\["Distance"/);
  assert.match(deals, /deal\.distance == null/);
  assert.doesNotMatch(deals, /Visible Potential/);
  assert.doesNotMatch(deals, /Live order generation updated/);
  assert.doesNotMatch(deals, /Maximum distance/);
  assert.doesNotMatch(deals, /Route distance and map coordinates will appear/);
});

test("Browse follows the central page cycle and keeps history non-blocking", () => {
  const browse = source("../src/pages/market/MarketBrowse.tsx");
  const generationHook = source("../src/hooks/useGameDataGeneration.ts");
  const watcher = source("../src/refresh/generationWatcher.mjs");

  assert.match(browse, /useGameDataGeneration\([^)]*"catalogs"[^)]*"regional-market"/s);
  assert.match(browse, /generationSequence/);
  assert.doesNotMatch(browse, /Promise\.all\(\[\s*fetch\(urls\.orderBook/);
  assert.match(generationHook, /usePageRefresh\(\)\.cycle\?\.sequence/);
  assert.doesNotMatch(generationHook, /EventSource|setInterval|fetch\(/);
  assert.match(watcher, /new EventSourceClass/);
  assert.match(watcher, /setIntervalFn/);
  assert.match(watcher, /\/api\/local\/game-data\/generation/);
  assert.match(watcher, /let pollInFlight = false/);
  assert.match(watcher, /finally \{\s*pollInFlight = false/);
});

test("Market Overview tracks response parsing as part of page completion", () => {
  const overview = source("../src/pages/market/MarketOverview.tsx");

  assert.match(overview, /const refresh = fetch\(`\/api\/local\/market\/overview[\s\S]*response\.json\(\)[\s\S]*trackRefresh\(\s*"global-market-overview",\s*refresh\s*\)/);
  assert.doesNotMatch(overview, /trackRefresh\(\s*"global-market-overview",\s*fetch\(/);
});

test("Browse labels progressive locally observed history without blocking live orders", () => {
  const browse = source("../src/pages/market/MarketBrowse.tsx");

  assert.match(browse, /coverage === "collecting"/);
  assert.match(browse, /Collecting confirmed local sales/);
  assert.match(browse, /coverage === "locally-observed"/);
  assert.match(browse, /Local observation window began/);
  assert.doesNotMatch(browse, /not yet authoritative from Relay/);
});

test("Market removes the permanent technical source footer", () => {
  const marketPage = source("../src/pages/MarketPage.tsx");

  assert.doesNotMatch(marketPage, /global-market-source/);
  assert.doesNotMatch(marketPage, /Confirmed-sale charts contain only authoritative closures/);
});

test("global Market opens on Overview while Browse keeps its scannable catalog", () => {
  const marketPage = source("../src/pages/MarketPage.tsx");
  const browse = source("../src/pages/market/MarketBrowse.tsx");

  assert.match(marketPage, /id: "overview" as const, label: "Overview"/);
  assert.match(marketPage, /usePersistedState<GlobalMarketViewId>\("globalMarket\.view", "overview"\)/);
  assert.match(browse, /sort: catalogSort/);
  assert.match(browse, /catalogItems\.map/);
  assert.match(browse, /lowestSellPrice/);
  assert.match(browse, /highestBuyPrice/);
  assert.doesNotMatch(browse, /query\.trim\(\)\.length < 2 \|\| selectedItem/);
});

test("Deal Watch renders operational facts as labelled units", () => {
  const watch = source("../src/pages/market/DealWatchlist.tsx");

  assert.match(watch, /className="deal-watch-fact"/);
  assert.match(watch, />Region<\/span><strong>R\{watch\.regionId\}<\/strong>/);
  assert.match(watch, />Last checked<\/span><strong>/);
  assert.match(watch, />Last alert<\/span><strong>/);
});

test("favorite order-book failures fail the active page cycle without clearing last-good rows", () => {
  const overview = source("../src/pages/market/MarketOverview.tsx");

  assert.match(overview, /if \(!response\.ok\) throw new Error\(`favorite order book HTTP \$\{response\.status\}`\)/);
  assert.doesNotMatch(overview, /catch \{\s*return null;\s*\}/);
  assert.match(overview, /trackRefresh\("global-market-favorites",[\s\S]*\.catch\(\(\) => \{\}\)/);
});
