# Global and Local Market Visual Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved Split Exchange design to Global Market, make regional comparison the visual answer, eliminate mobile overlap/clipping, and bring Local Market into the same contextual market mode without changing market APIs or semantics.

**Architecture:** Preserve existing Market workspaces, URL routing, data fetches, helpers, storage, and permissions. Restructure `MarketBrowse` into catalogue and instrument panes, add one exact-decimal regional projection helper, extract workspace navigation for responsive presentation, and own all market visuals in the existing focused `market.css`.

**Tech Stack:** React, TypeScript, Vite, plain CSS, Node test runner, existing market components, existing exact-decimal helpers, Lucide icons.

**Spec:** `docs/superpowers/specs/2026-08-24-whole-application-visual-system-design.md`

## Global Constraints

- Execute after `2026-08-24-visual-foundations-and-shell.md`.
- Preserve Overview, Browse, Opportunities, Saved, and Stalls workspaces and all current route aliases.
- Preserve current APIs, Relay normalization, browser favorites, account-backed watches, history coverage copy, stalls, dialogs, permissions, and URL state.
- Preserve typed item/cargo identity and decimal-string/BigInt arithmetic.
- Do not make stale or incomplete data appear fresh.
- Do not change default Market routing as part of this visual release.
- Do not add a chart or UI dependency.
- Local Market functionality and settlement filtering remain unchanged.

---

### Task 1: Add an exact regional quote projection

**Files:**
- Modify: `apps/bitcraft-local/src/pages/market/marketUi.ts`
- Modify: `apps/bitcraft-local/test/market-ui.test.mjs`

**Interfaces:**
- Produces: `RegionalMarketQuote`.
- Produces: `regionalMarketQuotes(orders: Array<Record<string, unknown>>): RegionalMarketQuote[]`.
- Sorts: regions with a sell ask first by ascending ask, then remaining regions by descending bid, then name.
- Preserves: prices and quantities as decimal strings.

- [ ] **Step 1: Write failing projection tests**

Add tests covering best ask/bid, exact quantities, freshness, missing region, and stable sorting:

```js
const quotes = regionalMarketQuotes([
  { side: "sell", regionId: "19", regionName: "Shardvale", unitPrice: "340", quantity: "3", lastSeen: "2026-08-24T20:00:00Z" },
  { side: "sell", regionId: "19", regionName: "Shardvale", unitPrice: "360", quantity: "4", lastSeen: "2026-08-24T20:01:00Z" },
  { side: "buy", regionId: "19", regionName: "Shardvale", unitPrice: "320", quantity: "12", lastSeen: "2026-08-24T20:02:00Z" },
  { side: "sell", regionId: "22", regionName: "Ironwood", unitPrice: "1120", quantity: "5", lastSeen: "2026-08-24T19:59:00Z" },
]);
assert.deepEqual(quotes[0], {
  regionKey: "19", regionId: "19", regionName: "Shardvale",
  bestSell: "340", bestBuy: "320", sellQuantity: "7", buyQuantity: "12",
  sellOrders: 2, buyOrders: 1, lastSeen: "2026-08-24T20:02:00Z",
});
assert.equal(quotes[1].regionName, "Ironwood");
```

Add a value above `Number.MAX_SAFE_INTEGER` and assert the exact string is retained.

- [ ] **Step 2: Run the helper test and verify RED**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/market-ui.test.mjs
```

Expected: FAIL because `regionalMarketQuotes` is absent.

- [ ] **Step 3: Implement the exact projection**

Add this public type:

```ts
export type RegionalMarketQuote = {
  regionKey: string;
  regionId: string;
  regionName: string;
  bestSell: string | null;
  bestBuy: string | null;
  sellQuantity: string;
  buyQuantity: string;
  sellOrders: number;
  buyOrders: number;
  lastSeen: string | null;
};
```

Use `exactMarketInteger` for comparisons and sums. Group `null`/missing region IDs under `unknown:${regionName}`. Choose the lexically greatest ISO timestamp only after normalising missing values to `null`. Return plain strings, never `number` prices.

- [ ] **Step 4: Run focused tests**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/market-ui.test.mjs test/exact-decimal.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit the regional projection**

```powershell
git add -- apps/bitcraft-local/src/pages/market/marketUi.ts apps/bitcraft-local/test/market-ui.test.mjs
git commit -m "test: define regional market quote projection"
```

### Task 2: Restructure Browse as the desktop Split Exchange

**Files:**
- Modify: `apps/bitcraft-local/src/pages/market/MarketBrowse.tsx`
- Modify: `apps/bitcraft-local/src/styles/market.css`
- Modify: `apps/bitcraft-local/test/global-market-ui-boundary.test.mjs`
- Modify: `apps/bitcraft-local/test/market-page-shared-browser-utils.test.mjs`
- Modify: `apps/bitcraft-local/test/responsive-layout-boundary.test.mjs`

**Interfaces:**
- Consumes: `regionalMarketQuotes(orders)` from Task 1.
- Produces: `.market-split-exchange`, `.market-catalog-pane`, `.market-instrument-pane`, `.market-regional-book`, and `.market-region-card`.
- Preserves: search/filter URL state, catalogue scroll restoration, keyboard suggestions, favorites, watches, map actions, order filters, pagination, stats/history, and recent trades.

- [ ] **Step 1: Write failing Split Exchange boundary tests**

Require persistent pane markup and regional rows:

```js
for (const className of [
  "market-split-exchange", "market-catalog-pane", "market-instrument-pane",
  "market-regional-book", "market-region-card",
]) assert.match(browse, new RegExp(className));

assert.match(browse, /regionalMarketQuotes\(orders\)/);
assert.match(browse, /Back to results/);
assert.match(browse, /aria-label="Regional order comparison"/);
```

Require desktop CSS to use a two-column grid and both panes to set `min-width: 0`.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/global-market-ui-boundary.test.mjs test/market-page-shared-browser-utils.test.mjs test/responsive-layout-boundary.test.mjs
```

Expected: FAIL because Browse currently swaps results and detail rather than composing both desktop panes.

- [ ] **Step 3: Restructure markup without moving hooks**

Keep all hooks and derived values in their current top-level order. Replace only the final render composition with:

```tsx
<section className={`global-market-workspace market-browse ${selectedItem ? "has-selection" : ""}`}>
  <div className="market-split-exchange">
    <section className="market-catalog-pane" aria-label="Market item catalogue">
      {existingSearchFiltersAndCatalogue}
    </section>
    <section className="market-instrument-pane" aria-label="Selected item regional market">
      {selectedItem ? existingItemDetail : existingChooseItemState}
    </section>
  </div>
</section>
```

Do not duplicate search/filter state or render two copies of the catalogue. The mobile back action changes only the visible composition class and restores saved scroll.

- [ ] **Step 4: Render the aligned regional comparison**

Derive:

```ts
const regionalQuotes = React.useMemo(() => regionalMarketQuotes(orders), [orders]);
```

Render a semantic table for desktop with Region, Best ask, Sell quantity, Best bid, Buy quantity, Orders, and Seen. Render a compact supporting region snapshot only when it adds a route/freshness cue not already repeated in the row.

Use existing `formatGoldAmount`, `formatNumber`, and `timeAgo` functions. Label unavailable values with `—` or `Unavailable`; do not invent zeroes.

- [ ] **Step 5: Apply desktop Split Exchange styling**

Use:

```css
.market-split-exchange {
  display: grid;
  grid-template-columns: minmax(300px, .78fr) minmax(520px, 1.22fr);
  gap: var(--space-3);
  min-height: 0;
}
.market-catalog-pane,
.market-instrument-pane { min-width: 0; }
.market-catalog-pane { position: sticky; top: 50px; align-self: start; }
```

Catalogue rows align icon, identity, coverage, and lowest price. The selected row uses an inset gold marker. Numeric values use `var(--font-data)`. Avoid scan-line texture behind body text.

- [ ] **Step 6: Run focused tests and build**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/market-ui.test.mjs test/global-market-ui-boundary.test.mjs test/market-page-shared-browser-utils.test.mjs test/responsive-layout-boundary.test.mjs test/market-page-boundary.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: PASS.

- [ ] **Step 7: Commit Split Exchange structure**

```powershell
git add -- apps/bitcraft-local/src/pages/market/MarketBrowse.tsx apps/bitcraft-local/src/styles/market.css apps/bitcraft-local/test/global-market-ui-boundary.test.mjs apps/bitcraft-local/test/market-page-shared-browser-utils.test.mjs apps/bitcraft-local/test/responsive-layout-boundary.test.mjs
git commit -m "style: build global market Split Exchange"
```

### Task 3: Add deliberate mobile workspace and drill-in navigation

**Files:**
- Create: `apps/bitcraft-local/src/pages/market/MarketWorkspaceNav.tsx`
- Modify: `apps/bitcraft-local/src/pages/MarketPage.tsx`
- Modify: `apps/bitcraft-local/src/pages/market/MarketBrowse.tsx`
- Modify: `apps/bitcraft-local/src/styles/market.css`
- Modify: `apps/bitcraft-local/test/global-market-ui-boundary.test.mjs`
- Modify: `apps/bitcraft-local/test/market-page-boundary.test.mjs`
- Modify: `apps/bitcraft-local/test/responsive-layout-boundary.test.mjs`

**Interfaces:**
- Produces: `MarketWorkspaceNavItem = { id: GlobalMarketViewId; label: string; Icon: LucideIcon }`.
- Produces: `MarketWorkspaceNav({ items, currentView, onSelect })` with desktop tablist and mobile labelled menu.
- Preserves: Left/Right/Home/End desktop tab navigation and current query-state callbacks.

- [ ] **Step 1: Write failing navigation tests**

Require the component to expose:

```js
assert.match(nav, /role="tablist"/);
assert.match(nav, /className="global-market-mobile-nav"/);
assert.match(nav, /aria-label="Choose Global Market workspace"/);
assert.match(nav, /aria-current=\{currentView === item\.id \? "page" : undefined\}/);
assert.doesNotMatch(page, /global-market-tabs-hint/);
```

Require phone CSS to hide the desktop tablist and show the mobile menu without horizontal clipping.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/global-market-ui-boundary.test.mjs test/market-page-boundary.test.mjs test/responsive-layout-boundary.test.mjs
```

Expected: FAIL because the clipped tab row/hint is still present.

- [ ] **Step 3: Extract workspace navigation**

Use the existing workspace array and selection callback. Desktop renders the current accessible tablist. Mobile renders a labelled `<details>` menu or select with every allowed workspace; selecting an item calls `onSelect(item.id)` and closes the menu.

Do not render disallowed tabs. Do not change canonical URL values.

- [ ] **Step 4: Implement mobile catalogue/detail composition**

At `max-width: 720px`:

```css
.market-split-exchange { display: block; }
.market-browse:not(.has-selection) .market-instrument-pane { display: none; }
.market-browse.has-selection .market-catalog-pane { display: none; }
.market-back-results { display: inline-flex; min-height: 42px; }
```

Ensure the detail pane starts with Back, item identity, best price/route metrics, and regional comparison. Avoid `display: contents` for interactive row structures.

- [ ] **Step 5: Fix result and region row wrapping**

At 390px, use explicit grid areas for icon, name, price, and metadata. Apply `min-width: 0`, `overflow-wrap: anywhere` only to names/locations, and `white-space: nowrap` to numeric values. Do not absolutely position labels over values.

- [ ] **Step 6: Run focused tests and build**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/global-market-ui-boundary.test.mjs test/market-page-boundary.test.mjs test/responsive-layout-boundary.test.mjs test/market-ui.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: PASS.

- [ ] **Step 7: Browser-check the mobile flow**

At 390×844 use live-like data to search for an item, select it, compare regions, open Orders/Stats, and return to results. Verify search/scroll state is preserved, no tab is clipped, and no result label overlaps `Unavailable` or a price.

- [ ] **Step 8: Commit mobile navigation**

```powershell
git add -- apps/bitcraft-local/src/pages/market/MarketWorkspaceNav.tsx apps/bitcraft-local/src/pages/MarketPage.tsx apps/bitcraft-local/src/pages/market/MarketBrowse.tsx apps/bitcraft-local/src/styles/market.css apps/bitcraft-local/test/global-market-ui-boundary.test.mjs apps/bitcraft-local/test/market-page-boundary.test.mjs apps/bitcraft-local/test/responsive-layout-boundary.test.mjs
git commit -m "style: add deliberate mobile market navigation"
```

### Task 4: Harmonise Market status and all retained workspaces

**Files:**
- Modify: `apps/bitcraft-local/src/pages/MarketPage.tsx`
- Modify: `apps/bitcraft-local/src/pages/market/MarketOverview.tsx`
- Modify: `apps/bitcraft-local/src/pages/market/MarketOpportunities.tsx`
- Modify: `apps/bitcraft-local/src/pages/market/MarketDeals.tsx`
- Modify: `apps/bitcraft-local/src/pages/market/BuyOrderFinder.tsx`
- Modify: `apps/bitcraft-local/src/pages/market/MarketSaved.tsx`
- Modify: `apps/bitcraft-local/src/pages/market/MarketFavorites.tsx`
- Modify: `apps/bitcraft-local/src/pages/market/DealWatchlist.tsx`
- Modify: `apps/bitcraft-local/src/pages/market/MarketStalls.tsx`
- Modify: `apps/bitcraft-local/src/pages/SettlementMarketPage.tsx`
- Modify: `apps/bitcraft-local/src/styles/market.css`
- Modify: `apps/bitcraft-local/test/current-market-views.test.mjs`
- Modify: `apps/bitcraft-local/test/global-market-ui-boundary.test.mjs`
- Modify: `apps/bitcraft-local/test/market-page-boundary.test.mjs`
- Modify: `apps/bitcraft-local/test/market-ui.test.mjs`

**Interfaces:**
- Preserves: all current workspace IDs and storage/API models.
- Produces: shared market header/status, filter toolbar, metric strip, table, empty-state, and responsive patterns.
- Preserves: `Dialog` focus contract for Stalls or migrates the custom Stall modal to shared `Dialog` without changing actions.

- [ ] **Step 1: Write failing retained-workspace tests**

Require every Global Market workspace root to include `market-workspace`, require compact `global-market-data-status`, and require Local Market root to include `local-market-workspace`. Retain all existing workspace ids, tab roles, sign-in prompts, favorite/watch storage expectations, and stall actions.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/current-market-views.test.mjs test/global-market-ui-boundary.test.mjs test/market-page-boundary.test.mjs test/deal-watchlist-boundary.test.mjs test/modal-foundation-boundary.test.mjs
```

Expected: FAIL for the new shared workspace/status classes.

- [ ] **Step 3: Compact the authoritative status presentation**

Combine freshness, region selector, and warning access into one compact row. Keep warning text in the DOM and accessible through status/details. The first viewport must show page purpose and workspace content even when stale, but stale state must remain visually prominent.

- [ ] **Step 4: Apply shared visual rules to retained workspaces**

- Overview: reduce nested cards; align top deals, movers, liquidity, and saved items.
- Opportunities: align filters, summary metrics, arbitrage table, and buy-order mode.
- Saved: align favorites and Deal Watch; keep signed-out prompt concise.
- Stalls: use dense rows, clear offer actions, and viewport-contained detail.
- Local Market: retain existing Live/History semantics and settlement filtering; apply the same header/filter/table tokens at a less intense density.

- [ ] **Step 5: Verify semantic tables and modal containment**

Keep table headers associated with cells. Ensure the stall detail uses the shared `Dialog` or continues to meet equivalent focus trap, Escape close, focus restore, fixed inset, max-height, and internal-scroll tests.

- [ ] **Step 6: Run focused tests and build**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/current-market-views.test.mjs test/global-market-ui-boundary.test.mjs test/market-page-boundary.test.mjs test/market-ui.test.mjs test/deal-watchlist-boundary.test.mjs test/buy-order-finder-boundary.test.mjs test/market-page-shared-browser-utils.test.mjs test/modal-foundation-boundary.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: PASS.

- [ ] **Step 7: Browser-check Global and Local Market**

Using representative live-like data, inspect all five Global workspaces and both Local Market tabs at 1440×900, 1024×768, 768×1024, and 390×844. Verify stale, empty, loading, error, signed-out Saved, item selected/unselected, no-result, opportunities, stalls, and long-location states.

- [ ] **Step 8: Commit retained workspace styling**

```powershell
git add -- apps/bitcraft-local/src/pages/MarketPage.tsx apps/bitcraft-local/src/pages/market apps/bitcraft-local/src/pages/SettlementMarketPage.tsx apps/bitcraft-local/src/styles/market.css apps/bitcraft-local/test/current-market-views.test.mjs apps/bitcraft-local/test/global-market-ui-boundary.test.mjs apps/bitcraft-local/test/market-page-boundary.test.mjs apps/bitcraft-local/test/market-ui.test.mjs
git commit -m "style: unify global and local market workspaces"
```
