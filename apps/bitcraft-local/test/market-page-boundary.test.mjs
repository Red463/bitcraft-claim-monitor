import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const marketPageSource = readFileSync(new URL("../src/pages/MarketPage.tsx", import.meta.url), "utf8");

test("Market renders a restricted state when every tool view is denied", () => {
  assert.match(marketPageSource, /resolveAllowedView\([\s\S]*?views\.map\(\(entry\) => entry\.id\)\)/);
  assert.match(marketPageSource, /No global market workspaces are available for your account\./);
  assert.match(marketPageSource, /updateQueryState\(\{ page: "market", tab:[^}]+\}, "push"\)/);
});

test("Market synchronizes URL subviews without turning normalization into navigation", () => {
  assert.match(marketPageSource, /locationSearch: string/);
  assert.match(marketPageSource, /marketViewLocation\(new URLSearchParams\(locationSearch\)\.get\("tab"\)\)/);
  assert.match(marketPageSource, /if \(location\.page === "settlement-market"\)[\s\S]*?onNavigate\("settlement-market", location\.canonicalTab\)/);
  assert.match(marketPageSource, /if \(location\.shouldReplace \|\| currentView !== location\.view\)[\s\S]*?updateQueryState\(\{ page: "market", tab: currentView \}\)/);
  assert.match(marketPageSource, /updateQueryState\(\{ page: "market", tab: next[^}]+\}, "push"\);[\s\S]*?onQueryStateChange\(\)/);
});

test("Market page replaces the legacy MainPages bundle", () => {
  const mainPagesUrl = new URL("../src/pages/MainPages.tsx", import.meta.url);
  const marketPage = readFileSync(new URL("../src/pages/MarketPage.tsx", import.meta.url), "utf8");
  const appShell = readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8");

  assert.equal(existsSync(mainPagesUrl), false);
  assert.match(marketPage, /export function Market\b/);
  assert.match(marketPage, /from "\.\/market\/MarketBrowse"/);
  assert.match(marketPage, /from "\.\/market\/MarketOverview"/);
  assert.match(marketPage, /from "\.\/market\/MarketDeals"/);
  assert.match(marketPage, /from "\.\/market\/MarketStalls"/);
  assert.match(marketPage, /from "\.\/market\/DealWatchlist"/);
  assert.match(appShell, /React\.lazy\(\(\) => import\("\.\/pages\/MarketPage"\)/);
  assert.match(appShell, /React\.lazy\(\(\) => import\("\.\/pages\/SettlementMarketPage"\)/);
  assert.doesNotMatch(appShell, /from "\.\/pages\/MainPages"/);
});
test("Market page exposes a dedicated deal watchlist tool tab", () => {
  const marketPage = readFileSync(new URL("../src/pages/MarketPage.tsx", import.meta.url), "utf8");
  const commandPalette = readFileSync(new URL("../src/components/main/CommandPalette.tsx", import.meta.url), "utf8");

  assert.match(marketPage, /id: "deal-watch"/);
  assert.match(marketPage, /label: "Deal Watch"/);
  assert.match(marketPage, /<DealWatchlist[^>]*monitoredRegionId=\{regionId \|\| fallbackRegionId\}[^>]*onDiscordLogin=\{onDiscordLogin\}/);
  assert.match(commandPalette, /deal-watch/);
  assert.match(commandPalette, /Deal Watch/);
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
  assert.match(marketPage, /MARKET_VIEWS/);
  assert.match(marketPage, /effectiveTargetAllowed/);
});

test("Market summaries and form controls stack on phones", () => {
  const css = readFileSync(new URL("../src/styles/market.css", import.meta.url), "utf8");

  assert.match(css, /@media \(max-width:\s*700px\)[\s\S]*\.market-summary,[^{]*\.market-filter-grid,[^{]*\.opportunity-strip\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(css, /@media \(max-width:\s*900px\)[\s\S]*\.market-member-field\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(css, /@media \(max-width:\s*700px\)[\s\S]*\.market-member-placeholder\s*\{[^}]*justify-content:\s*flex-start[^}]*white-space:\s*normal/s);
});

test("Market tool tabs cannot impose their max-content width on compact layouts", () => {
  const css = readFileSync(new URL("../src/styles/market.css", import.meta.url), "utf8");
  const compactStart = css.indexOf("@media (max-width: 900px)");
  const compactEnd = css.indexOf("@media (max-width: 640px)", compactStart);
  const compactCss = css.slice(compactStart, compactEnd);

  assert.notEqual(compactStart, -1);
  assert.notEqual(compactEnd, -1);
  assert.match(compactCss, /\.market-tabs\s*\{[^}]*min-width:\s*0[^}]*display:\s*grid[^}]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(compactCss, /\.market-tabs button\s*\{[^}]*width:\s*100%[^}]*min-width:\s*0[^}]*white-space:\s*normal/s);
});

test("Market header metadata wraps under text scaling on phones", () => {
  const css = readFileSync(new URL("../src/styles/market.css", import.meta.url), "utf8");

  assert.match(css, /\.market-page > \*\s*\{[^}]*min-width:\s*0/s);
  assert.match(css, /\.market-topbar\s*\{[^}]*min-width:\s*0/s);
  assert.match(css, /@media \(max-width:\s*900px\)[\s\S]*\.market-page \.dashboard-top-meta\s*\{[^}]*flex-wrap:\s*wrap/s);
});
