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

test("Market summaries and form controls stack on phones", () => {
  const css = readFileSync(new URL("../src/styles/market.css", import.meta.url), "utf8");

  assert.match(css, /@media \(max-width:\s*700px\)[\s\S]*\.market-summary,[^{]*\.market-filter-grid,[^{]*\.opportunity-strip\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(css, /@media \(max-width:\s*700px\)[\s\S]*\.market-member-field\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(css, /@media \(max-width:\s*700px\)[\s\S]*\.market-member-placeholder\s*\{[^}]*justify-content:\s*flex-start[^}]*white-space:\s*normal/s);
});

test("Market tool tabs cannot impose their max-content width on phones", () => {
  const css = readFileSync(new URL("../src/styles/market.css", import.meta.url), "utf8");

  assert.match(css, /@media \(max-width:\s*700px\)[\s\S]*\.market-tabs\s*\{[^}]*min-width:\s*0[^}]*display:\s*grid[^}]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /@media \(max-width:\s*700px\)[\s\S]*\.market-tabs button\s*\{[^}]*width:\s*100%[^}]*min-width:\s*0[^}]*white-space:\s*normal/s);
});
