# Global Market Workstation Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the global Market page as a decision-first workstation with Overview, Browse, Opportunities, Saved, and Stalls workspaces while preserving existing Relay data contracts and the settlement/local-market page.

**Architecture:** Keep the existing API-backed market components and introduce thin composition components for Opportunities and Saved. Put reusable UI calculations and keyboard navigation in pure market helpers, keep data fetching in the existing page components, and use the existing `market.css` stylesheet for a focused visual-system pass.

**Tech Stack:** React, TypeScript, Vite, plain CSS, Node test runner, Lucide icons.

**Spec:** `docs/superpowers/specs/2026-08-23-global-market-workstation-redesign.md`

## Global Constraints

- Change only the global Market page; do not edit or redesign `SettlementMarketPage.tsx`.
- Preserve existing `/api/local/market/*` contracts, Relay normalization, SQLite data, Discord delivery semantics, and admin permission rules.
- Add no dependency and no database migration.
- Keep locally observed sales clearly labelled as partial local observation.
- Preserve legacy Market query-string aliases and access-control targets.
- Use the smallest focused component extractions needed for the redesign.
- Preserve unrelated working-tree changes and commit only task files.

---

## File Structure

- Modify `apps/bitcraft-local/src/navigation/routeState.ts` for canonical workspace routing.
- Modify `apps/bitcraft-local/src/navigation.ts` and `apps/bitcraft-local/src/components/main/CommandPalette.tsx` for canonical Market links.
- Modify `apps/bitcraft-local/src/pages/MarketPage.tsx` for shared toolbar, access-aware workspace navigation, and composition.
- Create `apps/bitcraft-local/src/pages/market/MarketOpportunities.tsx` to compose Deals and high-value Buy Orders.
- Create `apps/bitcraft-local/src/pages/market/MarketSaved.tsx` to compose favorites and Deal Watch.
- Create `apps/bitcraft-local/src/pages/market/MarketFavorites.tsx` for reusable favorite order-book presentation.
- Create `apps/bitcraft-local/src/pages/market/MarketPriceChart.tsx` for the accessible SVG history chart.
- Create `apps/bitcraft-local/src/pages/market/marketUi.ts` for pure availability, keyboard-index, and chart-point helpers.
- Modify existing market workspace components only where their responsibility directly changes.
- Modify `apps/bitcraft-local/src/styles/market.css` for the visual hierarchy and responsive pass.
- Update focused tests under `apps/bitcraft-local/test/`.

---

### Task 1: Canonical Workspaces and Access-Aware Navigation

**Files:**
- Modify: `apps/bitcraft-local/src/navigation/routeState.ts`
- Modify: `apps/bitcraft-local/src/navigation.ts`
- Modify: `apps/bitcraft-local/src/components/main/CommandPalette.tsx`
- Modify: `apps/bitcraft-local/src/pages/MarketPage.tsx`
- Create: `apps/bitcraft-local/src/pages/market/MarketOpportunities.tsx`
- Create: `apps/bitcraft-local/src/pages/market/MarketSaved.tsx`
- Test: `apps/bitcraft-local/test/global-market-routing.test.mjs`
- Test: `apps/bitcraft-local/test/market-page-boundary.test.mjs`

**Interfaces:**
- Produces: `GlobalMarketViewId = "overview" | "browse" | "opportunities" | "saved" | "stalls"`.
- Produces: `MarketOpportunities` accepting existing Deals/Buy Order data and navigation props.
- Produces: `MarketSaved` accepting favorites, favorite actions, claim/region state, refresh props, and Discord login.
- Preserves: old access targets `deals`, `buy-orders`, and `deal-watch` as authorization inputs.

- [ ] **Step 1: Write failing canonical-routing tests**

Update expectations so `panelHref("market")` and `marketViewLocation(null)` resolve to `overview`; `deals` and `buyOrders` resolve to `opportunities`; `deal-watch` and `deal-watchlist` resolve to `saved`; settlement aliases remain unchanged.

```js
assert.equal(panelHref("market"), "/?page=market&tab=overview");
assert.equal(marketViewLocation(null).view, "overview");
assert.equal(marketViewLocation("deals").view, "opportunities");
assert.equal(marketViewLocation("buy-orders").view, "opportunities");
assert.equal(marketViewLocation("deal-watch").view, "saved");
```

- [ ] **Step 2: Run the routing tests and confirm the expected failure**

Run: `node --experimental-strip-types --test apps/bitcraft-local/test/global-market-routing.test.mjs apps/bitcraft-local/test/market-page-boundary.test.mjs`

Expected: FAIL because the current canonical view is `browse` and the new composition components do not exist.

- [ ] **Step 3: Implement canonical routing and thin composition components**

Add alias mapping in `marketViewLocation`, update the default Market href, replace the six primary tabs with five workspaces, and render Opportunities/Saved through focused wrapper components. Use access descriptors such as:

```ts
{ id: "opportunities", accessTabs: ["deals", "buy-orders"] }
{ id: "saved", accessTabs: ["browse", "deal-watch"] }
```

Render each child mode only when its legacy access target is permitted. Add `aria-controls`, panel ids, and Left/Right/Home/End keyboard navigation to the primary tabs.

- [ ] **Step 4: Run the focused routing and boundary tests**

Run: `node --experimental-strip-types --test apps/bitcraft-local/test/global-market-routing.test.mjs apps/bitcraft-local/test/market-page-boundary.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the navigation slice**

```powershell
git add -- apps/bitcraft-local/src/navigation/routeState.ts apps/bitcraft-local/src/navigation.ts apps/bitcraft-local/src/components/main/CommandPalette.tsx apps/bitcraft-local/src/pages/MarketPage.tsx apps/bitcraft-local/src/pages/market/MarketOpportunities.tsx apps/bitcraft-local/src/pages/market/MarketSaved.tsx apps/bitcraft-local/test/global-market-routing.test.mjs apps/bitcraft-local/test/market-page-boundary.test.mjs
git commit -m "feat: reorganize global market workspaces"
```

### Task 2: Browse Filters, Result Context, and Keyboard Search

**Files:**
- Create: `apps/bitcraft-local/src/pages/market/marketUi.ts`
- Modify: `apps/bitcraft-local/src/pages/market/MarketBrowse.tsx`
- Test: `apps/bitcraft-local/test/market-ui.test.mjs`
- Test: `apps/bitcraft-local/test/global-market-ui-boundary.test.mjs`

**Interfaces:**
- Produces: `type MarketAvailability = "any" | "sell" | "buy" | "both"`.
- Produces: `availabilityFlags(value): { availableOnly: boolean; hasSell: boolean; hasBuy: boolean }`.
- Produces: `nextOptionIndex(current, count, key): number` for ArrowUp, ArrowDown, Home, and End.
- Consumes: unchanged market catalog and order-book API responses.

- [ ] **Step 1: Write failing pure-helper and Browse boundary tests**

Test all four availability mappings, wrapping keyboard navigation, a visible `Back to results` action, a `Clear filters` action, and combobox `aria-activedescendant`/keyboard handlers.

```js
assert.deepEqual(availabilityFlags("both"), {
  availableOnly: true,
  hasSell: true,
  hasBuy: true,
});
assert.equal(nextOptionIndex(0, 4, "ArrowUp"), 3);
assert.equal(nextOptionIndex(3, 4, "ArrowDown"), 0);
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --experimental-strip-types --test apps/bitcraft-local/test/market-ui.test.mjs apps/bitcraft-local/test/global-market-ui-boundary.test.mjs`

Expected: FAIL because `marketUi.ts` and the consolidated controls are absent.

- [ ] **Step 3: Implement the availability selector and result-context controls**

Replace the three checkboxes with one labelled segmented/select control. Derive the existing API flags through `availabilityFlags`. Add a clear action that resets query, category, availability, and sort. When an item is selected, show `Back to results`, retain the query/filter URL state, and restore the catalog without clearing those filters.

- [ ] **Step 4: Implement keyboard-complete catalog suggestions**

Track the active suggestion index, handle ArrowUp/ArrowDown/Home/End/Enter/Escape, add option ids and `aria-selected`, and close suggestions on selection or Escape. Do not change the API debounce or query semantics.

- [ ] **Step 5: Run focused Browse tests**

Run: `node --experimental-strip-types --test apps/bitcraft-local/test/market-ui.test.mjs apps/bitcraft-local/test/global-market-ui-boundary.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit the Browse interaction slice**

```powershell
git add -- apps/bitcraft-local/src/pages/market/marketUi.ts apps/bitcraft-local/src/pages/market/MarketBrowse.tsx apps/bitcraft-local/test/market-ui.test.mjs apps/bitcraft-local/test/global-market-ui-boundary.test.mjs
git commit -m "feat: improve global market browsing"
```

### Task 3: Accessible Price-History Visualization

**Files:**
- Create: `apps/bitcraft-local/src/pages/market/MarketPriceChart.tsx`
- Modify: `apps/bitcraft-local/src/pages/market/marketUi.ts`
- Modify: `apps/bitcraft-local/src/pages/market/MarketBrowse.tsx`
- Test: `apps/bitcraft-local/test/market-ui.test.mjs`
- Test: `apps/bitcraft-local/test/global-market-ui-boundary.test.mjs`

**Interfaces:**
- Produces: `marketChartPoints(rows, width, height)` returning normalized `{ x, y, price, label }[]`.
- Produces: `MarketPriceChart({ rows, range, formatPrice })` with labelled SVG and accessible point values.

- [ ] **Step 1: Write failing chart geometry tests**

Cover empty rows, one point, constant prices, rising prices, decimal-safe labels, and bounds within the requested SVG dimensions.

```js
const points = marketChartPoints([{ price: 10 }, { price: 20 }], 100, 50);
assert.deepEqual(points.map(({ x }) => x), [0, 100]);
assert.ok(points[1].y < points[0].y);
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --experimental-strip-types --test apps/bitcraft-local/test/market-ui.test.mjs`

Expected: FAIL because chart helpers and component are absent.

- [ ] **Step 3: Implement the chart helper and component**

Render an SVG polyline/area with visible low/high labels, start/end time labels, focusable point controls, an accessible summary, and a compact empty state. Preserve `coverage === "collecting"` and `coverage === "locally-observed"` notices below it.

- [ ] **Step 4: Replace the proportional bar strip in Browse**

Use `MarketPriceChart` inside the existing Stats workspace and keep the existing range control and recent trades.

- [ ] **Step 5: Run chart and boundary tests**

Run: `node --experimental-strip-types --test apps/bitcraft-local/test/market-ui.test.mjs apps/bitcraft-local/test/global-market-ui-boundary.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit the chart slice**

```powershell
git add -- apps/bitcraft-local/src/pages/market/MarketPriceChart.tsx apps/bitcraft-local/src/pages/market/marketUi.ts apps/bitcraft-local/src/pages/market/MarketBrowse.tsx apps/bitcraft-local/test/market-ui.test.mjs apps/bitcraft-local/test/global-market-ui-boundary.test.mjs
git commit -m "feat: add accessible market price history"
```

### Task 4: Personal Overview and Saved Workspace

**Files:**
- Create: `apps/bitcraft-local/src/pages/market/MarketFavorites.tsx`
- Modify: `apps/bitcraft-local/src/pages/market/MarketOverview.tsx`
- Modify: `apps/bitcraft-local/src/pages/market/MarketSaved.tsx`
- Modify: `apps/bitcraft-local/src/pages/market/DealWatchlist.tsx`
- Test: `apps/bitcraft-local/test/global-market-ui-boundary.test.mjs`

**Interfaces:**
- Produces: reusable `MarketFavorites` with current order-book values and `onOpenItem`.
- Consumes: existing favorite keys and refresh tracking.
- Preserves: browser-local favorite storage and account-backed Deal Watch APIs.

- [ ] **Step 1: Write failing Overview/Saved boundary tests**

Require Overview to use `MarketFavorites`, omit Recent Open Orders and Active Order Hubs, require Saved to compose favorites and Deal Watch, and require one signed-out Discord prompt in Deal Watch.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --experimental-strip-types --test apps/bitcraft-local/test/global-market-ui-boundary.test.mjs`

Expected: FAIL because favorites are inline and the duplicate signed-out prompt remains.

- [ ] **Step 3: Extract favorite order-book rendering**

Move the favorite fetch, best-price calculation, spread, and compact current-order presentation into `MarketFavorites`. Use it in Overview and Saved without duplicating fetch logic.

- [ ] **Step 4: Refocus Overview and Saved**

Keep favorites, top deals, movers when populated, and liquidity. Remove hubs and recent open orders. In Saved, place favorites before watches with concise explanatory copy and item-open actions.

- [ ] **Step 5: Collapse Deal Watch signed-out UI to one state**

When unauthenticated, render one explanatory panel and one Discord sign-in button. When authenticated, retain add-watch controls and operational watch rows.

- [ ] **Step 6: Run the focused UI boundary tests**

Run: `node --experimental-strip-types --test apps/bitcraft-local/test/global-market-ui-boundary.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit the personalization slice**

```powershell
git add -- apps/bitcraft-local/src/pages/market/MarketFavorites.tsx apps/bitcraft-local/src/pages/market/MarketOverview.tsx apps/bitcraft-local/src/pages/market/MarketSaved.tsx apps/bitcraft-local/src/pages/market/DealWatchlist.tsx apps/bitcraft-local/test/global-market-ui-boundary.test.mjs
git commit -m "feat: unify saved market tools"
```

### Task 5: Unified Opportunities Workspace

**Files:**
- Modify: `apps/bitcraft-local/src/pages/market/MarketOpportunities.tsx`
- Modify: `apps/bitcraft-local/src/pages/market/MarketDeals.tsx`
- Modify: `apps/bitcraft-local/src/pages/market/BuyOrderFinder.tsx`
- Test: `apps/bitcraft-local/test/global-market-ui-boundary.test.mjs`
- Test: `apps/bitcraft-local/test/market-page-boundary.test.mjs`

**Interfaces:**
- `MarketOpportunities` owns `"routes" | "demand"` secondary mode.
- `MarketDeals` continues accepting `sharedRegionId` and explicit comparison regions.
- `BuyOrderFinder` keeps existing search, sorting, pagination, and confidence logic.

- [ ] **Step 1: Write failing Opportunities tests**

Require a labelled secondary tablist, access-aware mode fallback, canonical Opportunities rendering, compact trade-depth output, and reduced Buy Order metric presentation.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --experimental-strip-types --test apps/bitcraft-local/test/global-market-ui-boundary.test.mjs apps/bitcraft-local/test/market-page-boundary.test.mjs`

Expected: FAIL because Deals and Buy Orders remain separate primary tools.

- [ ] **Step 3: Implement access-aware Opportunities modes**

Render Routes when Deals access is allowed and Demand when Buy Orders access is allowed. When only one is permitted, select it without showing an unusable tab. Add tab/panel relationships and keyboard navigation.

- [ ] **Step 4: Simplify Deals and Buy Order summaries**

Replace the three quantity columns with one `Trade depth` cell showing available, wanted, and maximum trade on separate labelled lines while sorting by maximum trade. Keep unit profit, route potential, ROI, location, and distance. Reduce the Buy Order headline metrics to total orders, visible demand, and visible value; present market count and highest visible unit price as compact supporting facts.

- [ ] **Step 5: Run focused Opportunities tests**

Run: `node --experimental-strip-types --test apps/bitcraft-local/test/global-market-ui-boundary.test.mjs apps/bitcraft-local/test/market-page-boundary.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit the Opportunities slice**

```powershell
git add -- apps/bitcraft-local/src/pages/market/MarketOpportunities.tsx apps/bitcraft-local/src/pages/market/MarketDeals.tsx apps/bitcraft-local/src/pages/market/BuyOrderFinder.tsx apps/bitcraft-local/test/global-market-ui-boundary.test.mjs apps/bitcraft-local/test/market-page-boundary.test.mjs
git commit -m "feat: unify market opportunities"
```

### Task 6: Dialog Focus and Market Visual-System Pass

**Files:**
- Modify: `apps/bitcraft-local/src/pages/market/MarketStalls.tsx`
- Modify: `apps/bitcraft-local/src/styles/market.css`
- Modify: `apps/bitcraft-local/test/market-page-boundary.test.mjs`
- Modify: `apps/bitcraft-local/test/global-market-ui-boundary.test.mjs`

**Interfaces:**
- Preserves: Stalls API, pagination, active-only filter, offer identity, and map handoff.
- Produces: focus-contained dialog with focus restoration.

- [ ] **Step 1: Write failing dialog and CSS boundary tests**

Require a dialog ref, invoking focus on open, Tab containment, focus restoration, sticky shared toolbar, 12px minimum operational metadata, selected-result styling, chart SVG styling, and explicit mobile workspace overflow affordance.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --experimental-strip-types --test apps/bitcraft-local/test/market-page-boundary.test.mjs apps/bitcraft-local/test/global-market-ui-boundary.test.mjs`

Expected: FAIL because focus management and the new market styling are absent.

- [ ] **Step 3: Implement stall dialog focus behavior**

Store the opener, focus the close button on open, contain Tab/Shift+Tab within the dialog, close on Escape/backdrop, and restore focus after close.

- [ ] **Step 4: Apply the focused CSS redesign**

Reduce nested surface borders, add the sticky toolbar and overflow cue, establish buy/profit/selection colors, raise micro typography, style the result/detail workflow and SVG chart, simplify metric grids, and keep tables dense. Preserve viewport-fixed stall modal behavior and existing app theme variables.

- [ ] **Step 5: Run the focused UI boundary tests**

Run: `node --experimental-strip-types --test apps/bitcraft-local/test/market-page-boundary.test.mjs apps/bitcraft-local/test/global-market-ui-boundary.test.mjs`

Expected: PASS.

- [ ] **Step 6: Run a production typecheck/build checkpoint**

Run: `corepack pnpm --filter @workspace/bitcraft-local run build`

Expected: exit 0 with Vite production assets generated and boundary verification passing.

- [ ] **Step 7: Commit the visual and accessibility slice**

```powershell
git add -- apps/bitcraft-local/src/pages/market/MarketStalls.tsx apps/bitcraft-local/src/styles/market.css apps/bitcraft-local/test/market-page-boundary.test.mjs apps/bitcraft-local/test/global-market-ui-boundary.test.mjs
git commit -m "feat: polish global market workstation"
```

### Task 7: Full Verification, Browser Smoke Test, and Review

**Files:**
- Modify only files required to correct verified regressions.

**Interfaces:**
- Consumes: all completed tasks and the specification acceptance criteria.
- Produces: verified, reviewed global Market redesign.

- [ ] **Step 1: Run all focused Market tests**

Run:

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/global-market-routing.test.mjs apps/bitcraft-local/test/global-market-ui-boundary.test.mjs apps/bitcraft-local/test/market-page-boundary.test.mjs apps/bitcraft-local/test/market-page-shared-browser-utils.test.mjs apps/bitcraft-local/test/market-ui.test.mjs
```

Expected: all tests pass with zero failures.

- [ ] **Step 2: Run the full maintained-app test suite**

Run: `corepack pnpm --filter @workspace/bitcraft-local test`

Expected: all tests pass with zero failures.

- [ ] **Step 3: Run a fresh production build**

Run: `corepack pnpm --filter @workspace/bitcraft-local run build`

Expected: exit 0.

- [ ] **Step 4: Start or refresh the stable smoke server**

Run: `node scripts/start-bitcraft-local-smoke.mjs --restart`

Expected: returns within 15 seconds. If it does not, inspect `.codex-dev/bitcraft-local-smoke.*` once and report the blocker.

- [ ] **Step 5: Browser-check the global Market**

Open `http://127.0.0.1:18449/?page=market&tab=overview` and check Overview, Browse result/detail/back, both Opportunities modes, Saved signed-out/auth state available locally, Stalls dialog, 760px responsive behavior, keyboard navigation, and console errors. Do not inspect or modify the settlement/local-market page.

- [ ] **Step 6: Review against Standards and Spec**

Invoke the repository code-review workflow against the pre-implementation commit. Correct confirmed findings through new failing tests before production edits, then rerun focused tests, full tests, and build.

- [ ] **Step 7: Inspect the final diff and commit any review fixes**

```powershell
git diff --check
git status --short
git add -- <only market redesign and test files>
git commit -m "fix: address global market redesign review"
```

- [ ] **Step 8: Report completion**

Report files changed, focused/full test and build evidence, browser coverage or its exact blocker, commits created, no version/changelog change, and no VPS action required.
