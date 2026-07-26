# Market Visual Polish and Settlement Listings Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore live monitored-settlement listings and make the global Market balanced, compact and legible across desktop and narrow layouts.

**Architecture:** Keep the existing Market page/component boundaries and fix the missing route-to-endpoint mapping in `useBitjitaData`. Add small semantic wrappers/classes to the existing market components, reuse `formatGoldAmount` for currency, and implement the visual changes in the owned `market.css` stylesheet.

**Tech Stack:** React 19, TypeScript, plain CSS, Node test runner, Vite.

## Global Constraints

- No Hexite Exchange functionality.
- No navigation, routing or data-source redesign.
- No new UI framework or state library.
- No broad shared-component refactor.
- No change to global Market business rules, Deal Watch persistence or background aggregation.
- No destructive database change.
- Preserve item/cargo identity and existing map behavior.

---

### Task 1: Restore Settlement Market live listings

**Files:**
- Modify: `apps/bitcraft-local/src/api/bitjita.ts`
- Create: `apps/bitcraft-local/test/bitjita-page-endpoints.test.mjs`
- Modify: `apps/bitcraft-local/src/pages/SettlementMarketPage.tsx`

**Interfaces:**
- Produces: `marketEndpointMap(claimId: string, activePanel?: ActivePanel): Record<string, string>`
- Consumes: existing `useBitjitaData` and `requestAllMarketListings`

- [ ] **Step 1: Write the failing endpoint-selection test**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { marketEndpointMap } from "../src/api/bitjita.ts";

test("Settlement Market requests the monitored claim listing feed", () => {
  const endpoints = marketEndpointMap("claim-42", "settlement-market");
  assert.equal(endpoints.market, "/claims/claim-42/market/listings?limit=200");
});

test("global Market does not request monitored claim listings", () => {
  const endpoints = marketEndpointMap("claim-42", "market");
  assert.equal("market" in endpoints, false);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/bitjita-page-endpoints.test.mjs
```

Expected: FAIL because `marketEndpointMap` is not exported and the current `market` mapping incorrectly includes the claim market endpoint.

- [ ] **Step 3: Implement the route mapping**

Rename/export `endpointMap` as `marketEndpointMap`, update its call site, remove claim-market loading from the global `market` case, and add:

```ts
case "settlement-market":
  add("market");
  break;
```

Keep `requestAllMarketListings()` as the paginated loader for the selected monitored claim.

- [ ] **Step 4: Give Settlement Market accurate empty/error copy**

Use `loadState.error`, the unfiltered live-listing count and the filtered row count to distinguish:

```tsx
const marketLoadFailed = Boolean(loadState.error);
const hasLiveListings = allListings.length > 0;
```

Render “Unable to load live listings” on refresh failure, “This settlement has no live listings” when the successful feed is empty, and “No listings match the current filters” only when listings exist before filtering.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run the focused command from Step 2.

Expected: 2 tests pass.

- [ ] **Step 6: Commit**

```powershell
git add apps/bitcraft-local/src/api/bitjita.ts apps/bitcraft-local/src/pages/SettlementMarketPage.tsx apps/bitcraft-local/test/bitjita-page-endpoints.test.mjs
git commit -m "fix: load settlement market listings"
```

### Task 2: Correct market currency and metadata presentation

**Files:**
- Modify: `apps/bitcraft-local/test/global-market-ui-boundary.test.mjs`
- Modify: `apps/bitcraft-local/src/pages/market/MarketOverview.tsx`
- Modify: `apps/bitcraft-local/src/pages/market/MarketDeals.tsx`
- Modify: `apps/bitcraft-local/src/pages/market/MarketBrowse.tsx`

**Interfaces:**
- Consumes: `formatGoldAmount(value: unknown): string`
- Produces: `.market-price-location`, `.market-item-identity`, `.market-item-meta`, `.market-toggle-group`

- [ ] **Step 1: Add failing source-boundary tests**

Add assertions that:

```js
assert.match(overview, /formatGoldAmount\(deal\.buyPrice\)/);
assert.match(deals, /className="market-price-location"/);
assert.match(browse, /formatGoldAmount\(order\.unitPrice \* order\.quantity\)/);
assert.match(browse, /className="market-toggle-group"/);
assert.doesNotMatch(deals, /formatCompactNumber\(totalPotential\)\}g/);
```

- [ ] **Step 2: Run the focused test and verify RED**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --test test/global-market-ui-boundary.test.mjs
```

Expected: FAIL on the new formatter/wrapper assertions.

- [ ] **Step 3: Update currency rendering**

Import and use `formatGoldAmount` for monetary values in Overview, Deals and Browse. Keep `formatCompactNumber` only for quantities and distances.

```tsx
<strong>{formatGoldAmount(deal.buyPrice)}</strong>
```

- [ ] **Step 4: Add semantic layout wrappers**

Wrap deal price/location pairs:

```tsx
<td>
  <span className="market-price-location">
    <strong>{formatGoldAmount(deal.buyPrice)}</strong>
    <small>{deal.buyLocation ?? "Unknown"} · R{deal.buyRegionId ?? "?"}</small>
  </span>
</td>
```

Group Browse toggles in `.market-toggle-group`, and split the item header text into `.market-item-identity` and `.market-item-meta` so separators and wrapping are controlled.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run the command from Step 2.

Expected: all global-market UI boundary tests pass.

- [ ] **Step 6: Commit**

```powershell
git add apps/bitcraft-local/src/pages/market/MarketOverview.tsx apps/bitcraft-local/src/pages/market/MarketDeals.tsx apps/bitcraft-local/src/pages/market/MarketBrowse.tsx apps/bitcraft-local/test/global-market-ui-boundary.test.mjs
git commit -m "fix: clarify market values and metadata"
```

### Task 3: Apply the balanced density layout

**Files:**
- Modify: `apps/bitcraft-local/test/market-page-boundary.test.mjs`
- Modify: `apps/bitcraft-local/src/pages/market/DealWatchlist.tsx`
- Modify: `apps/bitcraft-local/src/pages/market/MarketStalls.tsx`
- Modify: `apps/bitcraft-local/src/styles/market.css`

**Interfaces:**
- Produces: responsive rules for existing Market markup plus `.market-watch-fact`
- Consumes: semantic classes from Task 2

- [ ] **Step 1: Add failing CSS/markup boundary tests**

Assert that the market stylesheet contains:

```js
assert.match(css, /\.market-order-summary\s*\{[^}]*repeat\(6,\s*minmax\(0,\s*1fr\)\)/s);
assert.match(css, /\.market-price-location\s*\{[^}]*display:\s*grid/s);
assert.match(css, /\.market-toggle-group\s*\{[^}]*display:\s*flex/s);
assert.match(css, /\.market-overview-section > \.empty-state\.compact\s*\{[^}]*min-height:\s*0/s);
assert.match(css, /\.market-stall-summary\s*\{[^}]*max-width:/s);
assert.match(css, /@media \(max-width:\s*1280px\)[\s\S]*\.market-order-summary\s*\{[^}]*repeat\(3,/s);
```

Assert Deal Watch uses labelled fact wrappers:

```js
assert.match(watch, /className="deal-watch-fact"/);
```

- [ ] **Step 2: Run the focused tests and verify RED**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --test test/market-page-boundary.test.mjs test/global-market-ui-boundary.test.mjs
```

Expected: FAIL because the balanced-density selectors and watch fact markup are absent.

- [ ] **Step 3: Implement the wide and medium layouts**

In `market.css`:

- make the Browse toolbar `search + category + sort + grouped switches`;
- use six metric columns on wide workspaces and three at `max-width: 1280px`;
- compact Overview Favorites empty state and Deals/Stalls summary cards;
- make region pills a single horizontally scrollable row;
- reduce stall-row padding and keep row actions together;
- keep normal table row heights and readable 11–14px supporting text.

- [ ] **Step 4: Structure Deal Watch metadata**

Render region, threshold, last checked and last alert as discrete `.deal-watch-fact` blocks, with labels and values. Retain the editable threshold input and existing mutation behavior.

- [ ] **Step 5: Implement narrow responsive behavior**

At existing narrow breakpoints:

- stack the Market command region selector below tabs;
- use two metric columns before switching to one on phones;
- let watch facts and stall actions wrap without overlap;
- keep tables horizontally scrollable;
- preserve the fixed stall modal.

- [ ] **Step 6: Run the focused tests and verify GREEN**

Run the command from Step 2.

Expected: all selected boundary tests pass.

- [ ] **Step 7: Commit**

```powershell
git add apps/bitcraft-local/src/pages/market/DealWatchlist.tsx apps/bitcraft-local/src/pages/market/MarketStalls.tsx apps/bitcraft-local/src/styles/market.css apps/bitcraft-local/test/market-page-boundary.test.mjs
git commit -m "style: balance global market density"
```

### Task 4: Verify behavior and visual quality

**Files:**
- Modify only if verification exposes a scoped regression.

**Interfaces:**
- Consumes: completed Tasks 1–3
- Produces: verified build, test and browser results

- [ ] **Step 1: Run formatting and repository checks**

```powershell
git diff --check origin/main...HEAD
corepack pnpm --filter @workspace/bitcraft-local run build
corepack pnpm --filter @workspace/bitcraft-local test
```

Expected: all commands exit 0.

- [ ] **Step 2: Start the smoke server**

```powershell
node scripts/start-bitcraft-local-smoke.mjs --force-restart
curl.exe -s http://127.0.0.1:18449/api/local/health
```

Expected: launcher returns promptly and health reports OK.

- [ ] **Step 3: Verify desktop behavior**

At `http://127.0.0.1:18449/?page=market&tab=overview` and each global Market tab, confirm:

- no concatenated prices/locations or `Kg` currency;
- Browse/Buy Orders metrics use available width without blank columns;
- Favorites, Deals, Deal Watch and Stalls are compact but readable;
- no browser console errors.

At `http://127.0.0.1:18449/?page=settlement-market&tab=live`, confirm the monitored claim’s live listings appear automatically.

- [ ] **Step 4: Verify narrow behavior**

At approximately 720px viewport width, confirm filter controls, metric grids, Deal Watch rows, stall rows and the fixed stall modal do not overlap or escape the viewport.

- [ ] **Step 5: Review the final diff**

```powershell
git status --short
git diff --stat origin/main...HEAD
git log --oneline origin/main..HEAD
```

Confirm the two unrelated untracked July 21 plan files remain unmodified and excluded.
