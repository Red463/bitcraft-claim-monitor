import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

test("global Browse replaces the settlement-scoped Price Finder", () => {
  const marketPage = readFileSync(new URL("../src/pages/MarketPage.tsx", import.meta.url), "utf8");
  const settlementMarket = readFileSync(new URL("../src/pages/SettlementMarketPage.tsx", import.meta.url), "utf8");
  const marketBrowse = readFileSync(new URL("../src/pages/market/MarketBrowse.tsx", import.meta.url), "utf8");
  const legacyPriceFinder = new URL("../src/pages/market/PriceFinder.tsx", import.meta.url);

  assert.doesNotMatch(marketPage, /from "\.\/market\/PriceFinder"/);
  assert.doesNotMatch(settlementMarket, /from "\.\/market\/PriceFinder"/);
  assert.equal(existsSync(legacyPriceFinder), false);
  assert.match(marketPage, /<MarketBrowse[^>]*mode="browse"/);
  assert.match(marketBrowse, /Search global catalog/);
});

test("Discord price lookup and autocomplete use the committed Relay market generation", () => {
  const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  const autocompleteStart = server.indexOf("async function discordAutocomplete");
  const autocompleteEnd = server.indexOf("function discordHelpCommand", autocompleteStart);
  const commandStart = server.indexOf("async function discordPriceCommand");
  const commandEnd = server.indexOf("async function registerDiscordCommands", commandStart);
  const autocomplete = server.slice(autocompleteStart, autocompleteEnd);
  const command = server.slice(commandStart, commandEnd);

  assert.match(autocomplete, /regionalMarketCatalogView/);
  assert.doesNotMatch(autocomplete, /fetchBitjita/);
  assert.match(command, /regionalMarketPriceQuote/);
  assert.match(command, /regionalMarketResponseStatus/);
  assert.doesNotMatch(command, /fetchBitjita|price-history|24h average|7d average|30d average/);
  assert.doesNotMatch(server, /Look up recent BitJita sale pricing|recent BitJita sale prices/);
});
test("Saved groups Deal Watch with Favorites while keeping Browse focused", () => {
  const marketPage = readFileSync(new URL("../src/pages/MarketPage.tsx", import.meta.url), "utf8");
  const marketSaved = readFileSync(new URL("../src/pages/market/MarketSaved.tsx", import.meta.url), "utf8");
  const marketBrowse = readFileSync(new URL("../src/pages/market/MarketBrowse.tsx", import.meta.url), "utf8");

  assert.match(marketPage, /const FAVORITES_KEY = "bitcraft\.market\.favorites\.v1"/);
  assert.match(marketPage, /<MarketSaved/);
  assert.match(marketSaved, /<DealWatchlist/);
  assert.match(marketSaved, /<MarketFavorites/);
  assert.match(marketBrowse, /onToggleFavorite/);
  assert.doesNotMatch(marketBrowse, /<DealWatchlist/);
});
