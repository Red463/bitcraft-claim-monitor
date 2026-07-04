import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

test("Market page replaces the legacy MainPages bundle", () => {
  const mainPagesUrl = new URL("../src/pages/MainPages.tsx", import.meta.url);
  const marketPage = readFileSync(new URL("../src/pages/MarketPage.tsx", import.meta.url), "utf8");
  const appShell = readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8");

  assert.equal(existsSync(mainPagesUrl), false);
  assert.match(marketPage, /export function Market\b/);
  assert.match(marketPage, /from "\.\/market\/PriceFinder"/);
  assert.match(marketPage, /from "\.\/market\/BuyOrderFinder"/);
  assert.match(marketPage, /from "\.\/market\/DealWatchlist"/);
  assert.match(appShell, /from "\.\/pages\/MarketPage"/);
  assert.doesNotMatch(appShell, /from "\.\/pages\/MainPages"/);
});
test("Market page exposes a dedicated deal watchlist tool tab", () => {
  const marketPage = readFileSync(new URL("../src/pages/MarketPage.tsx", import.meta.url), "utf8");
  const commandPalette = readFileSync(new URL("../src/components/main/CommandPalette.tsx", import.meta.url), "utf8");

  assert.match(marketPage, /"dealWatchlist"/);
  assert.match(marketPage, /deal-watchlist/);
  assert.match(marketPage, /Deal Watchlist/);
  assert.match(marketPage, /<DealWatchlist monitoredRegionId=\{String\(data\.claim\?\.regionId \?\? "19"\)\} \/>/);
  assert.match(commandPalette, /deal-watchlist/);
  assert.match(commandPalette, /Deal Watchlist/);
});
test("Market mini-stat values leave room for descenders", () => {
  const marketCss = readFileSync(new URL("../src/styles/market.css", import.meta.url), "utf8");
  const valueRule = marketCss.match(/\.market-page \.mini-stat strong\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";

  assert.match(valueRule, /line-height:\s*1\.18\b/);
  assert.match(valueRule, /padding-bottom:\s*1px\b/);
});

test("Market tool tabs accept app access-control decisions", () => {
  const marketPage = readFileSync(new URL("../src/pages/MarketPage.tsx", import.meta.url), "utf8");

  assert.match(marketPage, /type EffectiveAccess/);
  assert.match(marketPage, /targetIdForTab\("market"/);
  assert.match(marketPage, /marketViews/);
  assert.match(marketPage, /effectiveTargetAllowed/);
});
