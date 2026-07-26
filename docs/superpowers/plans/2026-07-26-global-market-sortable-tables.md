# Global Market Sortable Tables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every meaningful column in the remaining static Global Market tables sortable through the existing accessible table-header interaction.

**Architecture:** Extend the shared `DataTable` with an opt-out for action-only columns and an optional post-sort row window for pagination. Convert Overview deals, Deals results, and Browse order books to `DataTable`, supplying explicit raw sort values and retaining their current initial order.

**Tech Stack:** React 19, TypeScript 5.9, plain CSS, Node.js 24 test runner, Vite, pnpm.

## Global Constraints

- Scope is limited to Global Market Overview deals, Deals, and Browse order books.
- Existing Buy Orders, price-history trades, and Settlement Market sortable tables remain unchanged.
- Deal Watch and Stalls remain card/list interfaces.
- Map and action-only columns must not expose sorting.
- Sorting is browser-local and does not modify the URL or API requests.
- Sorting must use raw numeric or text values, never compact formatted display strings.
- Browse sorting must run across all filtered orders before the 25-row pagination window is selected.
- Preserve existing filters, map actions, item/cargo identity, initial ordering, responsive overflow, and empty states.
- Do not add dependencies, server changes, or database migrations.

---

## File Map

- `apps/bitcraft-local/src/components/main/DataTable.tsx`: shared sortable header rendering and post-sort row window.
- `apps/bitcraft-local/src/utils/tableSort.ts`: pure row-window helper used after sorting.
- `apps/bitcraft-local/src/pages/market/MarketOverview.tsx`: sortable eight-row top-deals table.
- `apps/bitcraft-local/src/pages/market/MarketDeals.tsx`: sortable filtered deal table and removal of the redundant sort select.
- `apps/bitcraft-local/src/pages/market/MarketBrowse.tsx`: sortable paginated sell/buy order table and removal of the order-table sort select.
- `apps/bitcraft-local/src/styles/market.css`: filter-grid column counts after redundant sort controls are removed.
- `apps/bitcraft-local/test/table-sort.test.mjs`: pure row-window ordering coverage.
- `apps/bitcraft-local/test/shared-controls-boundary.test.mjs`: shared non-sortable header and pagination-window contract.
- `apps/bitcraft-local/test/global-market-ui-boundary.test.mjs`: Global Market caller contracts and explicit sort values.

---

### Task 1: Extend the shared table contract

**Files:**

- Modify: `apps/bitcraft-local/src/components/main/DataTable.tsx`
- Modify: `apps/bitcraft-local/src/utils/tableSort.ts`
- Modify: `apps/bitcraft-local/test/table-sort.test.mjs`
- Modify: `apps/bitcraft-local/test/shared-controls-boundary.test.mjs`

**Interfaces:**

- Produces:

```ts
export type DataTableColumn = [
  label: string,
  render: (row: AnyRecord, index: number) => React.ReactNode,
  sortValue?: (row: AnyRecord, index: number) => unknown,
  sortable?: boolean,
];

export function windowIndexedRows<Row>(
  rows: ReadonlyArray<IndexedRow<Row>>,
  offset?: number,
  limit?: number,
): Array<IndexedRow<Row>>;
```

- Adds optional `rowOffset?: number` and `rowLimit?: number` props to `DataTable`.
- Existing callers remain source-compatible because columns default to sortable and the row window defaults to the full sorted set.

- [ ] **Step 1: Write the failing pure row-window test**

Append to `apps/bitcraft-local/test/table-sort.test.mjs`:

```js
test("windowIndexedRows selects the requested page after rows are sorted", () => {
  const rows = [40, 10, 30, 20].map((price, index) => ({ row: { price }, index }));
  const sorted = tableSort.sortIndexedRows(rows, (row) => row.price, "asc");

  assert.deepEqual(
    tableSort.windowIndexedRows(sorted, 1, 2).map(({ row }) => row.price),
    [20, 30],
  );
  assert.deepEqual(
    tableSort.windowIndexedRows(sorted).map(({ row }) => row.price),
    [10, 20, 30, 40],
  );
});
```

This catches applying the page window before sorting or treating an omitted limit as an empty window.

- [ ] **Step 2: Write the failing shared-component boundary assertions**

Extend the existing `DataTable owns sort state on headers and accepts caller empty content` test in `apps/bitcraft-local/test/shared-controls-boundary.test.mjs`:

```js
assert.match(source, /sortable\?: boolean/);
assert.match(source, /rowOffset\?: number/);
assert.match(source, /rowLimit\?: number/);
assert.match(source, /sortable = true/);
assert.match(source, /windowIndexedRows\(sortedRows,\s*rowOffset,\s*rowLimit\)/);
```

These assertions catch a regression where Map columns regain sort buttons or pagination is applied outside the shared post-sort path.

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```sh
node --experimental-strip-types --test apps/bitcraft-local/test/table-sort.test.mjs apps/bitcraft-local/test/shared-controls-boundary.test.mjs
```

Expected: FAIL because `windowIndexedRows`, the optional column flag, and row-window props do not exist.

- [ ] **Step 4: Implement the pure row-window helper**

Add to `apps/bitcraft-local/src/utils/tableSort.ts`:

```ts
export function windowIndexedRows<Row>(
  rows: ReadonlyArray<IndexedRow<Row>>,
  offset = 0,
  limit?: number,
): Array<IndexedRow<Row>> {
  const start = Math.max(0, Math.trunc(offset));
  if (limit == null) return rows.slice(start);
  return rows.slice(start, start + Math.max(0, Math.trunc(limit)));
}
```

- [ ] **Step 5: Extend `DataTable` without changing existing defaults**

Update the tuple type and props, import `windowIndexedRows`, rename the current memo result to `sortedRows`, then derive the rendered rows:

```tsx
const sortedRows = React.useMemo(() => {
  if (!sort) return indexedRows;
  const [, render, sortValue] = columns[sort.column] ?? [];
  if (!render) return indexedRows;
  return sortIndexedRows(
    indexedRows,
    sortValue ?? ((row, index) => cellSortText(render(row, index))),
    sort.direction,
  );
}, [columns, indexedRows, sort]);

const visibleRows = React.useMemo(
  () => windowIndexedRows(sortedRows, rowOffset, rowLimit),
  [rowLimit, rowOffset, sortedRows],
);
```

Render each header with the optional fourth tuple member:

```tsx
{columns.map(([label, , , sortable = true], columnIndex) => (
  <th
    key={label}
    {...(sortable ? {
      "aria-sort": sort?.column === columnIndex
        ? (sort.direction === "asc" ? "ascending" : "descending")
        : "none",
    } : {})}
  >
    {sortable ? (
      <button
        type="button"
        className={`table-sort-button ${sort?.column === columnIndex ? "is-sorted" : ""}`}
        onClick={() => toggleSort(columnIndex)}
        aria-label={`Sort by ${label}`}
      >
        <span>{label}</span>
        <span className="table-sort-indicator">
          {sort?.column === columnIndex ? (sort.direction === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    ) : <span>{label}</span>}
  </th>
))}
```

- [ ] **Step 6: Run the focused tests and verify GREEN**

Run:

```sh
node --experimental-strip-types --test apps/bitcraft-local/test/table-sort.test.mjs apps/bitcraft-local/test/shared-controls-boundary.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit the shared contract**

```sh
git add apps/bitcraft-local/src/components/main/DataTable.tsx apps/bitcraft-local/src/utils/tableSort.ts apps/bitcraft-local/test/table-sort.test.mjs apps/bitcraft-local/test/shared-controls-boundary.test.mjs
git commit -m "feat: support static and paged table columns"
```

---

### Task 2: Convert Overview top deals

**Files:**

- Modify: `apps/bitcraft-local/src/pages/market/MarketOverview.tsx`
- Modify: `apps/bitcraft-local/test/global-market-ui-boundary.test.mjs`

**Interfaces:**

- Consumes: `DataTableColumn` fourth tuple member `sortable?: boolean`.
- Produces: a sortable `DataTable` over `deals.slice(0, 8)` with Map declared non-sortable.

- [ ] **Step 1: Write the failing Overview boundary test**

Add to `apps/bitcraft-local/test/global-market-ui-boundary.test.mjs`:

```js
test("Overview top deals uses explicit sortable values and a static Map column", () => {
  const overview = source("../src/pages/market/MarketOverview.tsx");

  assert.match(overview, /<DataTable[\s\S]*scrollLabel="Top global market deals"/);
  assert.match(overview, /\["Item",[\s\S]*deal\.itemName[\s\S]*\]/);
  assert.match(overview, /\["Buy at",[\s\S]*toNumber\(deal\.buyPrice\)/);
  assert.match(overview, /\["Profit",[\s\S]*toNumber\(deal\.profit \?\? deal\.profitPerUnit\)/);
  assert.match(overview, /\["Map",[\s\S]*undefined,\s*false\]/);
});
```

This catches restoring static headers, sorting formatted gold strings, or making Map interactive.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```sh
node --test apps/bitcraft-local/test/global-market-ui-boundary.test.mjs
```

Expected: FAIL because Overview still renders a manual table.

- [ ] **Step 3: Replace the manual table with `DataTable`**

Import `DataTable`, then render:

```tsx
<DataTable
  rows={deals.slice(0, 8)}
  scrollLabel="Top global market deals"
  emptyState={state.loading ? "Loading deals…" : "No qualifying deals."}
  columns={[
    [
      "Item",
      deal => <button className="market-item-link" onClick={() => onOpenItem(itemShape(deal))}>
        <ItemLabel item={itemShape({ ...deal, iconAssetName: deal.itemIconAssetName })} />
      </button>,
      deal => String(deal.itemName ?? deal.name ?? ""),
    ],
    [
      "Buy at",
      deal => <span className="market-price-location"><strong>{formatGoldAmount(deal.buyPrice)}</strong><small>{deal.buyLocation ?? "Unknown"}</small></span>,
      deal => toNumber(deal.buyPrice),
    ],
    [
      "Sell at",
      deal => <span className="market-price-location"><strong>{formatGoldAmount(deal.sellPrice)}</strong><small>{deal.sellLocation ?? "Unknown"}</small></span>,
      deal => toNumber(deal.sellPrice),
    ],
    ["Profit", deal => <span className="positive">{formatGoldAmount(deal.profit ?? deal.profitPerUnit)}</span>, deal => toNumber(deal.profit ?? deal.profitPerUnit)],
    ["Qty", deal => formatNumber(deal.maxQuantity ?? deal.maxTrade ?? deal.tradeQuantity), deal => toNumber(deal.maxQuantity ?? deal.maxTrade ?? deal.tradeQuantity)],
    ["Distance", deal => formatCompactNumber(deal.distance), deal => toNumber(deal.distance)],
    [
      "Map",
      deal => <div className="market-map-actions">
        <button className="icon-button" title="Show buy location" onClick={() => onShowMap(
          { name: String(deal.buyLocation), locationX: toNumber(deal.buyLocationX), locationZ: toNumber(deal.buyLocationZ) },
          String(deal.buyRegionId ?? ""),
        )}><MapPin size={13} /></button>
        <button className="icon-button" title="Show sell location" onClick={() => onShowMap(
          { name: String(deal.sellLocation), locationX: toNumber(deal.sellLocationX), locationZ: toNumber(deal.sellLocationZ) },
          String(deal.sellRegionId ?? ""),
        )}><MapPin size={13} /></button>
      </div>,
      undefined,
      false,
    ],
  ]}
/>
```

- [ ] **Step 4: Run the focused test and build**

Run:

```sh
node --test apps/bitcraft-local/test/global-market-ui-boundary.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: PASS.

- [ ] **Step 5: Commit Overview sorting**

```sh
git add apps/bitcraft-local/src/pages/market/MarketOverview.tsx apps/bitcraft-local/test/global-market-ui-boundary.test.mjs
git commit -m "feat: sort global market overview deals"
```

---

### Task 3: Convert the Deals results

**Files:**

- Modify: `apps/bitcraft-local/src/pages/market/MarketDeals.tsx`
- Modify: `apps/bitcraft-local/src/styles/market.css`
- Modify: `apps/bitcraft-local/test/global-market-ui-boundary.test.mjs`
- Modify: `apps/bitcraft-local/test/market-page-boundary.test.mjs`

**Interfaces:**

- Consumes: shared `DataTable`.
- Produces: a sortable table over all filtered deal rows with a 250-row post-sort display window.
- Preserves: default highest-unit-profit ordering and every existing route filter.

- [ ] **Step 1: Write the failing Deals boundary assertions**

Add:

```js
test("Deals sorts every data column from raw values and keeps Map static", () => {
  const deals = source("../src/pages/market/MarketDeals.tsx");

  assert.match(deals, /<DataTable[\s\S]*rows=\{rows\}[\s\S]*rowLimit=\{250\}/);
  assert.match(deals, /\["Available",[\s\S]*toNumber\(deal\.buyQuantity\)/);
  assert.match(deals, /\["Wanted",[\s\S]*toNumber\(deal\.sellQuantity\)/);
  assert.match(deals, /\["Gain",[\s\S]*percent/);
  assert.match(deals, /\["Map",[\s\S]*undefined,\s*false\]/);
  assert.doesNotMatch(deals, /<span>Sort<\/span>/);
});
```

Extend `market-page-boundary.test.mjs`:

```js
assert.match(css, /\.market-specialized-filters\s*\{[^}]*repeat\(4,\s*minmax\(140px,\s*1fr\)\)/s);
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```sh
node --test apps/bitcraft-local/test/global-market-ui-boundary.test.mjs apps/bitcraft-local/test/market-page-boundary.test.mjs
```

Expected: FAIL because Deals still uses a manual table, a sort select, and a five-column filter grid.

- [ ] **Step 3: Preserve the default ordering and remove redundant sort state**

Delete the `sort` state and sort select. Replace the conditional comparator with:

```ts
}).sort(
  (a, b) => toNumber(b.profit ?? b.profitPerUnit) - toNumber(a.profit ?? a.profitPerUnit),
), [maximumDistance, maximumProfit, minimumProfit, minimumQuantity, regions, state.rows]);
```

Change:

```css
.market-specialized-filters {
  grid-template-columns: repeat(4, minmax(140px, 1fr));
}
```

- [ ] **Step 4: Convert the result table**

Import `DataTable`, pass `rows={rows}` and `rowLimit={250}`, and provide columns for Item, Buy at, Sell at, Available, Wanted, Max trade, Unit profit, Gain, Distance, and Map.

Every data column must provide a raw accessor. Derive display-only values inside renderers exactly as the current rows do:

```tsx
["Available", deal => formatNumber(deal.buyQuantity), deal => toNumber(deal.buyQuantity)],
["Wanted", deal => formatNumber(deal.sellQuantity), deal => toNumber(deal.sellQuantity)],
[
  "Max trade",
  deal => formatNumber(deal.maxQuantity ?? deal.maxTrade ?? deal.tradeQuantity ?? Math.min(toNumber(deal.buyQuantity), toNumber(deal.sellQuantity))),
  deal => toNumber(deal.maxQuantity ?? deal.maxTrade ?? deal.tradeQuantity ?? Math.min(toNumber(deal.buyQuantity), toNumber(deal.sellQuantity))),
],
[
  "Unit profit",
  deal => <span className="positive">{formatGoldAmount(deal.profit ?? deal.profitPerUnit ?? toNumber(deal.sellPrice) - toNumber(deal.buyPrice))}</span>,
  deal => toNumber(deal.profit ?? deal.profitPerUnit ?? toNumber(deal.sellPrice) - toNumber(deal.buyPrice)),
],
[
  "Gain",
  deal => {
    const profit = toNumber(deal.profit ?? deal.profitPerUnit ?? toNumber(deal.sellPrice) - toNumber(deal.buyPrice));
    const percent = toNumber(deal.profitPercent ?? deal.gainPercent ?? (toNumber(deal.buyPrice) ? (profit / toNumber(deal.buyPrice)) * 100 : 0));
    return <span className="positive">{formatNumber(percent)}%</span>;
  },
  deal => {
    const profit = toNumber(deal.profit ?? deal.profitPerUnit ?? toNumber(deal.sellPrice) - toNumber(deal.buyPrice));
    return toNumber(deal.profitPercent ?? deal.gainPercent ?? (toNumber(deal.buyPrice) ? (profit / toNumber(deal.buyPrice)) * 100 : 0));
  },
],
```

Use this exact Map column so missing coordinates retain the current unavailable behavior:

```tsx
[
  "Map",
  deal => <div className="market-map-actions">
    {toNumber(deal.buyLocationX) || toNumber(deal.buyLocationZ)
      ? <button className="icon-button" title="Show buy location" onClick={() => onShowMap(
        { name: String(deal.buyLocation ?? "Buy market"), locationX: toNumber(deal.buyLocationX), locationZ: toNumber(deal.buyLocationZ) },
        String(deal.buyRegionId ?? ""),
      )}><MapPin size={14} /></button>
      : null}
    {toNumber(deal.sellLocationX) || toNumber(deal.sellLocationZ)
      ? <button className="icon-button" title="Show sell location" onClick={() => onShowMap(
        { name: String(deal.sellLocation ?? "Sell market"), locationX: toNumber(deal.sellLocationX), locationZ: toNumber(deal.sellLocationZ) },
        String(deal.sellRegionId ?? ""),
      )}><Route size={14} /></button>
      : null}
  </div>,
  undefined,
  false,
],
```

- [ ] **Step 5: Run focused tests and build**

Run:

```sh
node --test apps/bitcraft-local/test/global-market-ui-boundary.test.mjs apps/bitcraft-local/test/market-page-boundary.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: PASS.

- [ ] **Step 6: Commit Deals sorting**

```sh
git add apps/bitcraft-local/src/pages/market/MarketDeals.tsx apps/bitcraft-local/src/styles/market.css apps/bitcraft-local/test/global-market-ui-boundary.test.mjs apps/bitcraft-local/test/market-page-boundary.test.mjs
git commit -m "feat: sort global market deals"
```

---

### Task 4: Convert Browse order books with sort-before-pagination

**Files:**

- Modify: `apps/bitcraft-local/src/pages/market/MarketBrowse.tsx`
- Modify: `apps/bitcraft-local/src/styles/market.css`
- Modify: `apps/bitcraft-local/test/global-market-ui-boundary.test.mjs`
- Modify: `apps/bitcraft-local/test/market-page-boundary.test.mjs`

**Interfaces:**

- Consumes: `DataTable` `rowOffset` and `rowLimit`.
- Produces: sortable buy/sell order tables across the complete filtered result set.
- Preserves: catalog search sorting; only the order-table sort dropdown is removed.

- [ ] **Step 1: Write the failing Browse boundary assertions**

Add:

```js
test("Browse sorts the complete filtered order book before pagination", () => {
  const browse = source("../src/pages/market/MarketBrowse.tsx");
  const orderWorkspace = browse.slice(browse.indexOf('detailTab === "orders"'), browse.indexOf("pagination-row"));

  assert.match(orderWorkspace, /<DataTable/);
  assert.match(orderWorkspace, /rows=\{filteredOrders\}/);
  assert.match(orderWorkspace, /rowOffset=\{\(Math\.min\(page,\s*pageCount\) - 1\) \* pageSize\}/);
  assert.match(orderWorkspace, /rowLimit=\{pageSize\}/);
  assert.match(orderWorkspace, /\["Total",[\s\S]*order\.unitPrice \* order\.quantity/);
  assert.match(orderWorkspace, /\["Map",[\s\S]*undefined,\s*false\]/);
  assert.doesNotMatch(orderWorkspace, /<span>Sort<\/span>/);
});
```

Extend the CSS boundary test:

```js
assert.match(css, /\.market-order-filters\s*\{[^}]*grid-template-columns:\s*auto\s+repeat\(4,\s*minmax\(130px,\s*1fr\)\)/s);
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```sh
node --test apps/bitcraft-local/test/global-market-ui-boundary.test.mjs apps/bitcraft-local/test/market-page-boundary.test.mjs
```

Expected: FAIL because Browse still sorts through a select and supplies only the current page to a manual table.

- [ ] **Step 3: Remove only the order-table sort state**

Keep `catalogSort` unchanged. Remove:

```ts
const [sort, setSort] = React.useState<"price" | "quantity" | "location" | "player">("price");
```

Keep filtering and restore the existing initial price order:

```ts
const filteredOrders = React.useMemo(() => orders.filter((order) => {
  if (order.side !== orderTab) return false;
  if (order.quantity < toNumber(minimumQuantity)) return false;
  if (orderTab === "buy" && order.unitPrice < toNumber(minimumPrice)) return false;
  if (locationFilter && !`${order.claimName} ${order.regionName}`.toLowerCase().includes(locationFilter.toLowerCase())) return false;
  if (playerFilter && !order.ownerName.toLowerCase().includes(playerFilter.toLowerCase())) return false;
  return true;
}).sort(
  (a, b) => orderTab === "buy"
    ? b.unitPrice - a.unitPrice
    : a.unitPrice - b.unitPrice,
), [locationFilter, minimumPrice, minimumQuantity, orderTab, orders, playerFilter]);
```

Remove `visibleOrders` because `DataTable` owns the post-sort page window.

- [ ] **Step 4: Convert the order table**

Import `DataTable` and render:

```tsx
<DataTable
  rows={filteredOrders}
  rowOffset={(Math.min(page, pageCount) - 1) * pageSize}
  rowLimit={pageSize}
  scrollLabel={`${orderTab} market orders table`}
  emptyState={`No ${orderTab} orders match these filters.`}
  columns={[
    ["Price", order => formatGoldAmount(order.unitPrice), order => order.unitPrice],
    ["Quantity", order => formatNumber(order.quantity), order => order.quantity],
    ["Total", order => formatGoldAmount(order.unitPrice * order.quantity), order => order.unitPrice * order.quantity],
    ["Region", order => order.regionName || (order.regionId ? `R${order.regionId}` : "—"), order => order.regionName || String(order.regionId ?? "")],
    ["Settlement", order => order.claimName || "Unknown settlement", order => order.claimName],
    [orderTab === "buy" ? "Buyer" : "Seller", order => order.ownerName || "—", order => order.ownerName],
    [
      "Map",
      order => order.locationX != null && order.locationZ != null
        ? <button className="icon-button" title="Show on map" onClick={() => onShowMap({ name: order.claimName || selectedItem.name, locationX: order.locationX!, locationZ: order.locationZ! }, String(order.regionId ?? ""))}><MapPin size={15} /></button>
        : "—",
      undefined,
      false,
    ],
  ]}
/>
```

Change the wide order filter grid:

```css
.market-order-filters {
  grid-template-columns: auto repeat(4, minmax(130px, 1fr));
}
```

Leave the existing tablet and phone collapse rules unchanged.

- [ ] **Step 5: Run focused tests and build**

Run:

```sh
node --test apps/bitcraft-local/test/global-market-ui-boundary.test.mjs apps/bitcraft-local/test/market-page-boundary.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: PASS.

- [ ] **Step 6: Commit Browse sorting**

```sh
git add apps/bitcraft-local/src/pages/market/MarketBrowse.tsx apps/bitcraft-local/src/styles/market.css apps/bitcraft-local/test/global-market-ui-boundary.test.mjs apps/bitcraft-local/test/market-page-boundary.test.mjs
git commit -m "feat: sort global market order books"
```

---

### Task 5: Full verification and browser acceptance

**Files:**

- Inspect: all files changed in Tasks 1–4.
- No production file changes are expected unless verification reveals a concrete defect.

**Interfaces:**

- Verifies the approved end-to-end behavior without adding new scope.

- [ ] **Step 1: Run the complete automated checks**

Run:

```sh
corepack pnpm --filter @workspace/bitcraft-local run build
corepack pnpm --filter @workspace/bitcraft-local test
```

Expected: build exits `0`; every test passes.

- [ ] **Step 2: Start the stable smoke server**

Run:

```powershell
node scripts/start-bitcraft-local-smoke.mjs --restart
curl.exe -s http://127.0.0.1:18449/api/local/health
```

Expected: health returns `"ok": true`.

- [ ] **Step 3: Browser-check Overview**

Open:

```txt
http://127.0.0.1:18449/?page=market&tab=overview
```

Verify:

- Item, prices, profit, quantity, and distance each cycle ascending, descending, and default.
- The active `<th>` exposes the matching `aria-sort`.
- Map has no sort button and both map actions remain usable.

- [ ] **Step 4: Browser-check Deals**

Open:

```txt
http://127.0.0.1:18449/?page=market&tab=deals
```

Verify all nine data headers sort correctly from raw values, filters still apply first, the old sort select is absent, and Map remains static.

- [ ] **Step 5: Browser-check Browse pagination**

Open:

```txt
http://127.0.0.1:18449/?page=market&tab=browse
```

Select an item with more than 25 orders. Sort Price, Quantity, Total, Region, Settlement, and Buyer/Seller; move between pages and confirm the order remains global rather than restarting on each page.

- [ ] **Step 6: Check narrow layout and console**

At approximately `390 × 844`, verify header buttons remain inside the horizontally scrollable table and filter grids stack without clipping. Confirm the browser console contains no warnings or errors.

- [ ] **Step 7: Inspect branch integrity**

Run:

```sh
git diff --check origin/main...HEAD
git status --short
git log --oneline origin/main..HEAD
```

Expected: no whitespace errors, no uncommitted files, and only the approved design, plan, tests, and implementation commits.
