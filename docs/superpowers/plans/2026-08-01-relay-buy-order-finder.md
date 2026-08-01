# Relay Buy Order Finder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the dedicated Buy Order Finder using current Relay orders and exact seven-day same-region confirmed-sale baselines without adding a cache/current-state SQL table or scheduled ingestion job.

**Architecture:** Keep current orders in the committed `regional-market` generation and read only existing durable `market_trades` history. A focused server helper aggregates exact TEXT quantities/totals with `BigInt`; `regionalBuyOrdersView` combines those baselines with live rows; a dedicated React component consumes the existing provider-neutral route and generation stream.

**Tech Stack:** Node.js 24+, Node built-in SQLite, JavaScript ES modules, React 19, TypeScript 5.9, Vite, Node test runner, pnpm via Corepack.

## Global Constraints

- The monitored claim and configured active-region scope must be enforced before data is returned.
- Current orders come only from the committed `regional-market` Relay generation.
- Baselines contain only authoritative `market_trades` rows observed in the preceding seven days.
- Each order is compared only with the same `regionId`, `itemType`, and `itemId`.
- Item and Cargo identities remain distinct even when their numeric IDs collide.
- Quantities, prices, totals, averages, and premium comparisons use exact decimal strings and `BigInt`; eligibility must not depend on floating-point rounding.
- Opportunity eligibility requires at least three confirmed sale records and an exact strictly positive premium.
- No BitJita request, browser upstream request, scheduled market crawl, or new SQL table is permitted.
- Do not restore `market_buy_orders_current`, `market_regional_sale_averages_current`, or `global_market_price_snapshots`.
- Missing or failed history enrichment must not hide or fail current live orders.
- Current page data must update from generation notifications without waiting for a scheduled job.

---

## File map

- Create `apps/bitcraft-local/src/server/buyOrderSaleBaselines.mjs`: exact bounded `market_trades` reader and aggregation.
- Create `apps/bitcraft-local/test/buy-order-sale-baselines.test.mjs`: unit coverage for scope, cutoff, typed identity, and large decimal values.
- Modify `apps/bitcraft-local/src/server/regionalMarketViews.mjs`: attach baseline fields, exact premium comparison/sorting, and top opportunities.
- Modify `apps/bitcraft-local/test/regional-market-views.test.mjs`: projection, filtering, pagination, and exact boundary coverage.
- Modify `apps/bitcraft-local/server.mjs`: load baselines once per finder request and preserve current rows on history failure.
- Modify `apps/bitcraft-local/test/server.test.mjs`: provider-neutral route integration and scope/error behavior.
- Create `apps/bitcraft-local/src/pages/market/BuyOrderFinder.tsx`: dedicated live finder UI.
- Modify `apps/bitcraft-local/src/pages/MarketPage.tsx`: render the dedicated finder for the Buy Orders tab.
- Modify `apps/bitcraft-local/src/styles/market.css`: focused opportunity-strip and responsive finder styling.
- Modify `apps/bitcraft-local/test/buy-order-finder-boundary.test.mjs`: browser wiring, copy, invalidation, and last-good behavior.
- Modify `docs/relay-migration/parity-matrix.md`: record completed finder parity.
- Modify `docs/relay-migration/evidence-baseline.md`: replace the approval gate with implementation evidence.
- Modify `docs/relay-migration/table-inventory.md`: record the on-demand history join and confirm retired tables remain absent.

---

### Task 1: Exact seven-day sale-baseline reader

**Files:**
- Create: `apps/bitcraft-local/src/server/buyOrderSaleBaselines.mjs`
- Create: `apps/bitcraft-local/test/buy-order-sale-baselines.test.mjs`

**Interfaces:**
- Consumes: Node SQLite database with `market_trades`; `{ claimId, allowedRegionIds, itemKeys, nowMs }`.
- Produces:

```js
export function buyOrderBaselineKey(regionId, itemType, itemId)
export function readBuyOrderSaleBaselines(db, {
  claimId,
  allowedRegionIds,
  itemKeys,
  nowMs = Date.now(),
})
// => { baselines: Map<string, Baseline>, historyObservedSince: string | null, warnings: string[] }
```

- [ ] **Step 1: Write the failing exact-aggregation tests**

Create `test/buy-order-sale-baselines.test.mjs` with an in-memory database and
the production `market_trades` column affinities:

```js
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  buyOrderBaselineKey,
  readBuyOrderSaleBaselines,
} from "../src/server/buyOrderSaleBaselines.mjs";

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE market_trades (
      trade_id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL,
      region_id TEXT,
      item_id TEXT,
      item_type TEXT,
      quantity TEXT NOT NULL,
      total_price TEXT NOT NULL,
      occurred_at TEXT NOT NULL
    );
  `);
  return db;
}

function insert(db, row) {
  db.prepare(`
    INSERT INTO market_trades (
      trade_id, claim_id, region_id, item_id, item_type,
      quantity, total_price, occurred_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.tradeId, row.claimId, row.regionId, row.itemId, row.itemType,
    row.quantity, row.totalPrice, row.occurredAt,
  );
}

test("aggregates exact same-region typed seven-day baselines", () => {
  const db = database();
  insert(db, {
    tradeId: "a", claimId: "claim", regionId: "19", itemId: "43",
    itemType: "cargo", quantity: "9007199254740993",
    totalPrice: "180143985094819860", occurredAt: "2026-07-31T12:00:00.000Z",
  });
  insert(db, {
    tradeId: "b", claimId: "claim", regionId: "19", itemId: "43",
    itemType: "cargo", quantity: "7", totalPrice: "147",
    occurredAt: "2026-08-01T11:00:00.000Z",
  });
  insert(db, {
    tradeId: "wrong-type", claimId: "claim", regionId: "19", itemId: "43",
    itemType: "item", quantity: "1", totalPrice: "999",
    occurredAt: "2026-08-01T11:00:00.000Z",
  });
  const result = readBuyOrderSaleBaselines(db, {
    claimId: "claim",
    allowedRegionIds: ["19"],
    itemKeys: new Set([buyOrderBaselineKey("19", "cargo", "43")]),
    nowMs: Date.parse("2026-08-01T12:00:00.000Z"),
  });
  assert.deepEqual(
    result.baselines.get("19:cargo:43"),
    {
      regionId: "19",
      itemType: "cargo",
      itemId: "43",
      salesCount: 2,
      unitsSold: "9007199254741000",
      totalValue: "180143985094820007",
      observedSince: "2026-07-31T12:00:00.000Z",
      lastSoldAt: "2026-08-01T11:00:00.000Z",
    },
  );
});
```

Add tests proving an eight-day-old row, another claim, another region, an
unrequested item key, and a null region are excluded. Add a malformed
quantity/total row and assert it is skipped with one warning rather than
corrupting the aggregate.

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/buy-order-sale-baselines.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for
`buyOrderSaleBaselines.mjs`.

- [ ] **Step 3: Implement the exact bounded reader**

Create `src/server/buyOrderSaleBaselines.mjs` with these concrete rules:

```js
const DAY_MS = 86_400_000;

function decimal(value) {
  const text = String(value ?? "").trim();
  return /^\d+$/.test(text) ? text : null;
}

function normalizedItemType(value) {
  return value === 1 || value === "1" || String(value).toLowerCase() === "cargo"
    ? "cargo"
    : "item";
}

export function buyOrderBaselineKey(regionId, itemType, itemId) {
  return `${decimal(regionId) ?? "0"}:${normalizedItemType(itemType)}:${decimal(itemId) ?? "0"}`;
}

export function readBuyOrderSaleBaselines(db, options = {}) {
  const claimId = String(options.claimId ?? "").trim();
  const regionIds = [...new Set(
    (options.allowedRegionIds ?? []).map(String).filter((id) => /^\d+$/.test(id)),
  )];
  const itemKeys = options.itemKeys instanceof Set
    ? options.itemKeys
    : new Set(options.itemKeys ?? []);
  if (!claimId || !regionIds.length || !itemKeys.size) {
    return { baselines: new Map(), historyObservedSince: null, warnings: [] };
  }
  const cutoff = new Date((options.nowMs ?? Date.now()) - 7 * DAY_MS).toISOString();
  const placeholders = regionIds.map(() => "?").join(", ");
  const rows = db.prepare(`
    SELECT trade_id AS tradeId, region_id AS regionId, item_id AS itemId,
      item_type AS itemType, quantity, total_price AS totalPrice,
      occurred_at AS occurredAt
    FROM market_trades
    WHERE claim_id = ?
      AND region_id IN (${placeholders})
      AND occurred_at >= ?
    ORDER BY occurred_at ASC, trade_id ASC
  `).all(claimId, ...regionIds, cutoff);
  const baselines = new Map();
  const warnings = [];
  for (const row of rows) {
    const key = buyOrderBaselineKey(row.regionId, row.itemType, row.itemId);
    if (!itemKeys.has(key)) continue;
    const quantity = decimal(row.quantity);
    const totalPrice = decimal(row.totalPrice);
    if (!quantity || quantity === "0" || !totalPrice) {
      warnings.push(`Ignored malformed confirmed trade ${String(row.tradeId)}.`);
      continue;
    }
    const current = baselines.get(key) ?? {
      regionId: String(row.regionId),
      itemType: normalizedItemType(row.itemType),
      itemId: String(row.itemId),
      salesCount: 0,
      unitsSold: "0",
      totalValue: "0",
      observedSince: String(row.occurredAt),
      lastSoldAt: String(row.occurredAt),
    };
    current.salesCount += 1;
    current.unitsSold = (BigInt(current.unitsSold) + BigInt(quantity)).toString();
    current.totalValue = (BigInt(current.totalValue) + BigInt(totalPrice)).toString();
    current.lastSoldAt = String(row.occurredAt);
    baselines.set(key, current);
  }
  const observed = [...baselines.values()].map((row) => row.observedSince).sort();
  return {
    baselines,
    historyObservedSince: observed[0] ?? null,
    warnings,
  };
}
```

- [ ] **Step 4: Run the focused test**

Run:

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/buy-order-sale-baselines.test.mjs
```

Expected: all baseline-reader tests PASS.

- [ ] **Step 5: Commit Task 1**

```powershell
git add apps/bitcraft-local/src/server/buyOrderSaleBaselines.mjs apps/bitcraft-local/test/buy-order-sale-baselines.test.mjs
git commit -m "feat: aggregate exact buy order sale baselines"
```

---

### Task 2: Exact premium finder projection

**Files:**
- Modify: `apps/bitcraft-local/src/server/regionalMarketViews.mjs`
- Modify: `apps/bitcraft-local/test/regional-market-views.test.mjs`

**Interfaces:**
- Consumes: `options.saleBaselines`, a `Map` keyed by
  `buyOrderBaselineKey(regionId, itemType, itemId)`.
- Produces: enriched `rows`, up to ten `opportunities`,
  `baselineWindowDays: 7`, `minimumSales: 3`, and
  `historyObservedSince`.

- [ ] **Step 1: Write failing projection tests**

Append tests that pass exact baseline maps directly:

```js
test("buy-order view applies exact same-region baselines before paging", () => {
  const saleBaselines = new Map([
    ["19:cargo:43", {
      regionId: "19", itemType: "cargo", itemId: "43",
      salesCount: 3, unitsSold: "3", totalValue: "60",
      observedSince: "2026-07-28T00:00:00.000Z",
      lastSoldAt: "2026-07-31T00:00:00.000Z",
    }],
  ]);
  const result = views.regionalBuyOrdersView({
    orders: [
      { ...snapshot.orders[0], entityId: "low", price: "20" },
      { ...snapshot.orders[0], entityId: "high", price: "25" },
    ],
  }, {
    regionId: "19",
    page: 1,
    pageSize: 25,
    sort: "premium",
    direction: "desc",
    saleBaselines,
    getEntity: () => null,
  });
  assert.equal(result.rows[0].orderKey, "high");
  assert.equal(result.rows[0].averageUnitPrice, "20");
  assert.equal(result.rows[0].premiumPercent, "25");
  assert.equal(result.rows[0].opportunityEligible, true);
  assert.equal(result.rows[1].premiumPercent, "0");
  assert.equal(result.rows[1].opportunityEligible, false);
  assert.deepEqual(result.opportunities.map((row) => row.orderKey), ["high"]);
  assert.equal(result.baselineWindowDays, 7);
  assert.equal(result.minimumSales, 3);
});
```

Add:

- a two-sale baseline that shows a calculated premium but is ineligible;
- an Item/Cargo collision with separate averages;
- two fractional premiums whose exact order differs beyond display rounding;
- a negative premium;
- eleven eligible rows proving the top strip is capped at ten before table
  pagination; and
- a search proving opportunities come only from the filtered result.

- [ ] **Step 2: Run the projection test and confirm failure**

Run:

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/regional-market-views.test.mjs
```

Expected: FAIL because premium fields and opportunities are still empty.

- [ ] **Step 3: Implement exact premium helpers**

In `regionalMarketViews.mjs`, add:

```js
function baselineKey(row) {
  return `${row.regionId}:${row.itemType}:${row.itemId}`;
}

function divideRoundedHalfUp(numerator, denominator) {
  if (denominator <= 0n) return null;
  return ((2n * numerator + denominator) / (2n * denominator)).toString();
}

function premiumHundredths(unitPrice, baseline) {
  const units = BigInt(decimal(baseline.unitsSold));
  const total = BigInt(decimal(baseline.totalValue));
  if (units <= 0n || total <= 0n) return null;
  const delta = BigInt(decimal(unitPrice)) * units - total;
  const magnitude = delta < 0n ? -delta : delta;
  const rounded = (magnitude * 10_000n * 2n + total) / (2n * total);
  return delta < 0n ? -rounded : rounded;
}

function formatHundredths(value) {
  if (value == null) return null;
  const sign = value < 0n ? "-" : "";
  const magnitude = value < 0n ? -value : value;
  const whole = magnitude / 100n;
  const fraction = String(magnitude % 100n).padStart(2, "0").replace(/0+$/, "");
  return `${sign}${whole}${fraction ? `.${fraction}` : ""}`;
}

function comparePremium(left, right) {
  if (left._premiumNumerator == null) return right._premiumNumerator == null ? 0 : -1;
  if (right._premiumNumerator == null) return 1;
  const leftScaled = left._premiumNumerator * right._premiumDenominator;
  const rightScaled = right._premiumNumerator * left._premiumDenominator;
  return leftScaled < rightScaled ? -1 : leftScaled > rightScaled ? 1 : 0;
}

function publicBuyOrderRow(row) {
  const { _premiumNumerator, _premiumDenominator, ...visible } = row;
  return visible;
}
```

While mapping rows, build the existing visible row first, then join and attach
the exact baseline fields:

```js
const saleBaselines = options.saleBaselines instanceof Map
  ? options.saleBaselines
  : new Map();
const baseRow = {
  orderKey: decimal(order.entityId),
  regionId: decimal(order.regionId),
  regionName: String(order.regionName ?? `R${decimal(order.regionId)}`),
  marketClaimId: decimal(order.claimEntityId),
  marketClaimName: String(order.claimName ?? ""),
  buyerEntityId: decimal(order.ownerEntityId),
  buyerName: String(order.ownerUsername ?? ""),
  itemType,
  itemId,
  itemName: String(item.name ?? `${itemType === "cargo" ? "Cargo" : "Item"} #${itemId}`),
  tier: item.tier ?? null,
  rarity: String(item.rarity ?? ""),
  rarityStr: String(item.rarity ?? ""),
  iconAssetName: item.iconAssetName ?? null,
  quantity,
  unitPrice,
  totalValue: multiply(quantity, unitPrice),
  storedCoins: decimal(order.storedCoins),
  listedAt,
  firstSeen: listedAt,
  lastSeen: receivedAtByRegion.get(decimal(order.regionId)) ?? observedAt ?? listedAt,
};
const baseline = saleBaselines.get(baselineKey(baseRow));
if (!baseline) {
  return {
    ...baseRow,
    averageUnitPrice: null,
    salesCount: 0,
    premiumPercent: null,
    opportunityEligible: false,
    baselineObservedSince: null,
    baselineLastSoldAt: null,
    _premiumNumerator: null,
    _premiumDenominator: null,
  };
}
const units = BigInt(decimal(baseline.unitsSold));
const total = BigInt(decimal(baseline.totalValue));
const numerator = BigInt(unitPrice) * units - total;
return {
  ...baseRow,
  averageUnitPrice: divideRoundedHalfUp(total, units),
  salesCount: Number(baseline.salesCount) || 0,
  premiumPercent: formatHundredths(premiumHundredths(unitPrice, baseline)),
  opportunityEligible: Number(baseline.salesCount) >= 3 && numerator > 0n,
  baselineObservedSince: baseline.observedSince ?? null,
  baselineLastSoldAt: baseline.lastSoldAt ?? null,
  _premiumNumerator: numerator,
  _premiumDenominator: total,
};
```

Use the exact rational comparator for `sort === "premium"`:

```js
filteredRows.sort((left, right) => {
  const result = sort === "premium"
    ? comparePremium(left, right)
    : numericSorts.has(sort)
      ? compareBigInt(sorter(left), sorter(right))
      : compareText(sorter(left), sorter(right));
  return direction === "asc" ? result : -result;
});
```

Compute `opportunities` from all text-filtered rows before slicing the table
page:

```js
const opportunities = filteredRows
  .filter((row) => row.opportunityEligible)
  .sort((left, right) => (
    comparePremium(right, left)
    || compareBigInt(right.unitPrice, left.unitPrice)
    || compareText(left.orderKey, right.orderKey)
  ))
  .slice(0, 10)
  .map(publicBuyOrderRow);

return {
  rows: filteredRows.slice(offset, offset + pageSize).map(publicBuyOrderRow),
  opportunities,
  baselineWindowDays: 7,
  minimumSales: 3,
  historyObservedSince: options.historyObservedSince ?? null,
  total,
  unfilteredRegionRows,
  page,
  pageSize,
  pageCount: Math.max(1, Math.ceil(total / pageSize)),
  sort,
  direction,
  regionId: selectedRegion || "all",
  sortableFields: Object.keys(sorters),
};
```

- [ ] **Step 4: Run the projection tests**

Run:

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/regional-market-views.test.mjs
```

Expected: all regional-market view tests PASS.

- [ ] **Step 5: Commit Task 2**

```powershell
git add apps/bitcraft-local/src/server/regionalMarketViews.mjs apps/bitcraft-local/test/regional-market-views.test.mjs
git commit -m "feat: score live buy order opportunities"
```

---

### Task 3: Provider-neutral route integration

**Files:**
- Modify: `apps/bitcraft-local/server.mjs`
- Modify: `apps/bitcraft-local/test/server.test.mjs`

**Interfaces:**
- Consumes: `readBuyOrderSaleBaselines`, current regional-market snapshot,
  configured claim, and configured active regions.
- Produces: enriched `GET /api/local/market/buy-orders` response while
  retaining existing scope/freshness fields.

- [ ] **Step 1: Replace the obsolete zero-opportunity route assertions**

In the existing server fixture, insert three exact same-region `market_trades`
for Cargo `43`, then assert:

```js
const buyOrdersAfterSales = await fetch(
  `${origin}/api/local/market/buy-orders?claimId=${claimId}&regionId=19&search=Leather&pageSize=25&sort=premium&direction=desc`,
).then((response) => response.json());

assert.equal(buyOrdersAfterSales.rows[0].salesCount, 3);
assert.equal(buyOrdersAfterSales.rows[0].averageUnitPrice, "20");
assert.equal(buyOrdersAfterSales.rows[0].premiumPercent, "25");
assert.equal(buyOrdersAfterSales.rows[0].opportunityEligible, true);
assert.deepEqual(
  buyOrdersAfterSales.opportunities.map((row) => row.orderKey),
  [buyOrdersAfterSales.rows[0].orderKey],
);
assert.equal(buyOrdersAfterSales.baselineWindowDays, 7);
assert.equal(buyOrdersAfterSales.minimumSales, 3);
```

Keep and extend the existing 403 assertions for foreign claims and
unconfigured regions. Add one Region 9 trade with the same Item/Cargo key and
prove it cannot affect the Region 19 average.

- [ ] **Step 2: Run the server integration test and confirm failure**

Run:

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/server.test.mjs
```

Expected: FAIL because `marketBuyOrders` does not read sale baselines.

- [ ] **Step 3: Integrate one history read per request**

Import the helper in `server.mjs`:

```js
import {
  buyOrderBaselineKey,
  readBuyOrderSaleBaselines,
} from "./src/server/buyOrderSaleBaselines.mjs";
```

Add a local candidate-key function that reads only buy orders in the selected
configured scope:

```js
function currentBuyOrderBaselineKeys(snapshot, regionId, allowedRegionIds) {
  const allowed = new Set(allowedRegionIds.map(String));
  const selected = String(regionId ?? "all").toLowerCase();
  return new Set((Array.isArray(snapshot?.orders) ? snapshot.orders : [])
    .filter((order) => String(order?.side ?? "buy").toLowerCase() !== "sell")
    .filter((order) => {
      const orderRegion = String(order?.regionId ?? "");
      return (!allowed.size || allowed.has(orderRegion))
        && (selected === "all" || orderRegion === selected);
    })
    .map((order) => buyOrderBaselineKey(
      order.regionId,
      order.itemType,
      order.itemId,
    )));
}
```

Update `marketBuyOrders`:

```js
let history = {
  baselines: new Map(),
  historyObservedSince: null,
  warnings: [],
};
try {
  history = readBuyOrderSaleBaselines(db, {
    claimId: id,
    allowedRegionIds,
    itemKeys: currentBuyOrderBaselineKeys(
      current?.data,
      params.regionId,
      allowedRegionIds,
    ),
  });
} catch (error) {
  history.warnings = [
    `Confirmed-sale history is temporarily unavailable: ${
      error instanceof Error ? error.message : String(error)
    }`,
  ];
}
const view = regionalBuyOrdersView(current?.data, {
  ...params,
  allowedRegionIds,
  observedAt: current?.provenance?.receivedAt ?? null,
  getEntity: (catalogKey) => providerCatalogRepository.getEntity(catalogKey),
  saleBaselines: history.baselines,
  historyObservedSince: history.historyObservedSince,
});
const status = regionalMarketStatus(current, {
  regionId: params.regionId,
  allowedRegionIds,
  runtimeHealth,
  staleAfterMs: relayRegionalMarketStaleMs,
});
return {
  ...view,
  ...status,
  warnings: [...new Set([
    ...(view.warnings ?? []),
    ...history.warnings,
    ...(status.warnings ?? []),
  ])],
  generatedAt: current?.provenance?.receivedAt ?? null,
  runtimeHealth,
};
```

Do not catch or replace current-order freshness errors inside the history
block.

- [ ] **Step 4: Run focused server tests**

Run:

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/buy-order-sale-baselines.test.mjs apps/bitcraft-local/test/regional-market-views.test.mjs apps/bitcraft-local/test/server.test.mjs
```

Expected: all focused tests PASS.

- [ ] **Step 5: Commit Task 3**

```powershell
git add apps/bitcraft-local/server.mjs apps/bitcraft-local/test/server.test.mjs
git commit -m "feat: join live buy orders to confirmed sales"
```

---

### Task 4: Dedicated live Buy Order Finder UI

**Files:**
- Create: `apps/bitcraft-local/src/pages/market/BuyOrderFinder.tsx`
- Modify: `apps/bitcraft-local/src/pages/MarketPage.tsx`
- Modify: `apps/bitcraft-local/src/styles/market.css`
- Modify: `apps/bitcraft-local/test/buy-order-finder-boundary.test.mjs`

**Interfaces:**
- Consumes:

```ts
type BuyOrderFinderProps = MarketRefreshProps & {
  claimId: string;
  regionId: string; // empty string means all configured active regions
  locationSearch: string;
  onQueryStateChange: () => void;
};
```

- Produces: dedicated Buy Orders workspace backed only by
  `/api/local/market/buy-orders`.

- [ ] **Step 1: Rewrite the browser boundary test to require the finder**

Replace the current negative assertions with:

```js
test("global Buy Orders renders the dedicated live Relay finder", () => {
  const marketPage = readFileSync(new URL("../src/pages/MarketPage.tsx", import.meta.url), "utf8");
  const finder = readFileSync(new URL("../src/pages/market/BuyOrderFinder.tsx", import.meta.url), "utf8");

  assert.match(marketPage, /from "\.\/market\/BuyOrderFinder"/);
  assert.match(marketPage, /currentView === "buy-orders"[\s\S]*<BuyOrderFinder/);
  assert.doesNotMatch(marketPage, /currentView === "buy-orders"[\s\S]{0,300}<MarketBrowse/);
  assert.match(finder, /\/api\/local\/market\/buy-orders/);
  assert.match(finder, /useGameDataGeneration\(claimId,\s*\["catalogs",\s*"regional-market"\]\)/);
  assert.match(finder, /Best Opportunities/);
  assert.match(finder, /locally observed confirmed sales/i);
  assert.doesNotMatch(finder, /cached orders|collector may not have populated|BitJita/i);
});
```

Add source assertions that the failed-fetch branch spreads the existing
successful state rather than replacing `data` with `null`, and that the
component uses `refreshSequence`, `refreshHeaders`, and `trackRefresh`.

- [ ] **Step 2: Run the boundary test and confirm failure**

Run:

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/buy-order-finder-boundary.test.mjs
```

Expected: FAIL because `BuyOrderFinder.tsx` does not exist and Market renders
`MarketBrowse mode="buy"`.

- [ ] **Step 3: Restore the focused component with live-first behavior**

Start from the legacy component at
`git show c301ddf^:apps/bitcraft-local/src/pages/market/BuyOrderFinder.tsx`,
then make these required changes:

```tsx
import { useGameDataGeneration } from "../../hooks/useGameDataGeneration";
import type { MarketRefreshProps } from "./globalMarket";

type Props = MarketRefreshProps & {
  claimId: string;
  regionId: string;
  locationSearch: string;
  onQueryStateChange: () => void;
};

export function BuyOrderFinder({
  claimId,
  regionId,
  locationSearch,
  onQueryStateChange,
  refreshSequence,
  refreshHeaders,
  trackRefresh,
}: Props) {
  const initial = React.useMemo(
    () => new URLSearchParams(locationSearch).get("buyQ") ?? "",
    [locationSearch],
  );
  const [search, setSearch] = React.useState(initial);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = usePersistedState("market.buyOrders.pageSize", "50");
  const [sort, setSort] = React.useState("unitPrice");
  const [direction, setDirection] = React.useState<"asc" | "desc">("desc");
  const [state, setState] = React.useState<LoadState<AnyRecord>>({
    data: null, error: null, loading: true,
  });
  const generationSequence = useGameDataGeneration(
    claimId,
    ["catalogs", "regional-market"],
  );
```

The fetch effect must build:

```tsx
const params = new URLSearchParams({
  claimId,
  regionId: regionId || "all",
  search: search.trim(),
  page: String(page),
  pageSize: String(pageSize),
  sort,
  direction,
});
trackRefresh(
  "buy-order-finder",
  fetch(`/api/local/market/buy-orders?${params}`, {
    headers: refreshHeaders,
    signal: controller.signal,
  }),
)
  .then((response) => response.ok
    ? response.json()
    : Promise.reject(new Error(`buy orders HTTP ${response.status}`)))
  .then((payload) => setState({ data: payload, error: null, loading: false }))
  .catch((error) => {
    if (!controller.signal.aborted) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : String(error),
        loading: false,
      }));
    }
  });
```

Include `claimId`, `regionId`, `generationSequence`, `refreshSequence`,
search, page, page size, sort, and direction in the dependencies.

Render the legacy metrics/opportunity/table structure with these copy changes:

- “live buy orders,” never “cached orders”;
- “Requires 3+ same-region confirmed sales observed locally in the last 7
  days”;
- `premiumPercent == null` -> “Insufficient local sales history”;
- history coverage uses `historyObservedSince`;
- stale order state displays `freshness`, `ageMs`, and route warnings while
  retaining rows; and
- no opportunities copy explains that current orders still appear below.

Update `buyQ` through `updateQueryState` after the existing 250 ms debounce and
call `onQueryStateChange`.

- [ ] **Step 4: Wire the page and restore focused styles**

In `MarketPage.tsx`:

```tsx
import { BuyOrderFinder } from "./market/BuyOrderFinder";

{currentView === "buy-orders" ? (
  <BuyOrderFinder
    {...marketRefresh}
    claimId={claimId}
    regionId={regionId}
    locationSearch={locationSearch}
    onQueryStateChange={onQueryStateChange}
  />
) : null}
```

Remove only the `mode="buy"` render; retain `MarketBrowse mode="browse"`.

Restore the focused legacy CSS from
`git show c301ddf^:apps/bitcraft-local/src/styles/market.css`:

```css
.buy-order-opportunities {
  border: 1px solid rgba(108, 123, 145, .24);
  border-radius: 7px;
  background:
    radial-gradient(circle at 100% 0%, rgba(240, 198, 79, .08), transparent 35%),
    linear-gradient(180deg, rgba(11, 16, 22, .97), rgba(6, 9, 14, .99));
  padding: 18px;
}

.opportunity-strip {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}

.opportunity-card {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 10px;
  min-width: 0;
  border: 1px solid rgba(240, 198, 79, .2);
  border-radius: 7px;
  background: rgba(240, 198, 79, .055);
  padding: 10px;
}
```

Add the existing two-column breakpoint under `max-width: 1100px` and
single-column breakpoint under `max-width: 700px`. Do not append unrelated
market styling.

- [ ] **Step 5: Run browser boundary and production build**

Run:

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/buy-order-finder-boundary.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: boundary test PASS and build exits 0.

- [ ] **Step 6: Commit Task 4**

```powershell
git add apps/bitcraft-local/src/pages/market/BuyOrderFinder.tsx apps/bitcraft-local/src/pages/MarketPage.tsx apps/bitcraft-local/src/styles/market.css apps/bitcraft-local/test/buy-order-finder-boundary.test.mjs
git commit -m "feat: restore live buy order finder"
```

---

### Task 5: Migration evidence and complete verification

**Files:**
- Modify: `docs/relay-migration/parity-matrix.md`
- Modify: `docs/relay-migration/evidence-baseline.md`
- Modify: `docs/relay-migration/table-inventory.md`

**Interfaces:**
- Consumes: passing feature/build/full-suite evidence from Tasks 1-4.
- Produces: accurate parity and SQL-ownership record; no runtime changes.

- [ ] **Step 1: Run the focused feature suite**

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/buy-order-sale-baselines.test.mjs apps/bitcraft-local/test/regional-market-views.test.mjs apps/bitcraft-local/test/buy-order-finder-boundary.test.mjs apps/bitcraft-local/test/server.test.mjs
```

Expected: all focused tests PASS.

- [ ] **Step 2: Run the required production build**

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: server/provider compilation, asset verification, TypeScript
typecheck, and Vite build all exit 0.

- [ ] **Step 3: Run the complete test suite**

```powershell
corepack pnpm --filter @workspace/bitcraft-local test
```

Expected: every application test PASS.

- [ ] **Step 4: Run zero-BitJita and SQL-ownership checks**

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/task-4-legacy-surface-retirement.test.mjs apps/bitcraft-local/test/no-bitjita-fetch.test.mjs apps/bitcraft-local/test/sql-table-inventory-boundary.test.mjs
rg -n -i "bitjita" apps/bitcraft-local/src apps/bitcraft-local/server.mjs apps/bitcraft-local/package.json apps/bitcraft-local/README.md apps/bitcraft-local/PRODUCT.md --glob "!src/server/game-data/bindings/**"
rg -n "market_buy_orders_current|market_regional_sale_averages_current|global_market_price_snapshots" apps/bitcraft-local/src/server/schemaBootstrap.mjs apps/bitcraft-local/server.mjs
```

Expected: tests PASS; both `rg` commands return no runtime/schema matches.
Historical tests, migration docs, and the asset provenance manifest are not
runtime dependencies and are outside the first scan.

- [ ] **Step 5: Update migration evidence**

In `parity-matrix.md`, change Global market tools from `in progress` to
`ready for soak` only if Tasks 1-4 and Steps 1-4 above passed. Record:

```markdown
The dedicated Buy Order Finder reads current buy orders from the committed
regional-market generation and joins exact seven-day same-region confirmed
sales from durable market_trades on request. Opportunity eligibility requires
three confirmed records and a strictly positive exact premium. Missing history
does not hide current orders, and no current-order, regional-average, price
snapshot, or scheduled insight table/job was restored.
```

In `evidence-baseline.md`, replace the finder approval/implementation gate with
the exact test/build evidence and leave siege semantics, operator confirmation,
soak, and cutover listed as remaining gates.

In `table-inventory.md`, extend the `market_events`, `market_trades` row to
state that Buy Order Finder performs a bounded exact seven-day on-demand read.
Keep the three retired market-current/snapshot table dispositions unchanged.

- [ ] **Step 6: Inspect the documentation diff**

```powershell
git diff --check
git diff -- docs/relay-migration/parity-matrix.md docs/relay-migration/evidence-baseline.md docs/relay-migration/table-inventory.md
```

Expected: no whitespace errors; documentation matches actual verification
output and does not claim the unresolved external gates are complete.

- [ ] **Step 7: Commit Task 5**

```powershell
git add docs/relay-migration/parity-matrix.md docs/relay-migration/evidence-baseline.md docs/relay-migration/table-inventory.md
git commit -m "docs: record relay buy order finder parity"
```

---

## Final review checklist

- [ ] Dedicated Buy Orders tab is restored without changing Market Browse.
- [ ] Current orders remain Relay-generation owned and live-invalidated.
- [ ] Seven-day baselines use only authoritative confirmed trades.
- [ ] Exact values remain strings/`BigInt` through eligibility and sorting.
- [ ] Three-sale and strict-positive thresholds are covered at boundaries.
- [ ] Item/Cargo and same-region isolation are covered.
- [ ] Current rows survive absent or failed history enrichment.
- [ ] No current-state/cache SQL table or scheduled acquisition job was added.
- [ ] Runtime and built output contain no BitJita traffic path.
- [ ] Focused tests, production build, full suite, and ownership checks pass.
- [ ] Parity evidence records only what the commands actually proved.
