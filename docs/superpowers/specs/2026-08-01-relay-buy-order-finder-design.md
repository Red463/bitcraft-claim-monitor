# Relay Buy Order Finder Design

## Status

The design direction was approved on 2026-08-01. This written specification is
awaiting the required user review before implementation planning begins.

## Objective

Restore the dedicated Buy Order Finder from the maintained application's
pre-migration feature set while keeping the Relay clone live-first. The finder
must combine current typed Relay buy orders with confirmed sales observed
locally during the preceding seven days. It must not restore a BitJita request,
a scheduled market crawl, a current-order SQL mirror, or a materialized
regional-average table.

## Locked product behavior

The Market **Buy Orders** tab is a dedicated finder rather than a buy-mode
variant of Market Browse. Market Browse remains the item-first order-book and
price-history workspace.

The finder provides:

- current buy-order count and visible demand/value summaries;
- search across item, buyer, settlement, region, and rarity;
- configured-region and all-active-region selection;
- sortable, paginated current buy orders;
- a premium column comparing each order with its same-region seven-day
  confirmed-sale average;
- a Best Opportunities strip containing only rows with at least three
  confirmed sale records and a positive premium; and
- explicit progressive-history and freshness messaging.

The existing legacy semantics are retained:

- the comparison window is seven days;
- the minimum confidence threshold is three sale records;
- an opportunity exists only when the buy-order unit price is strictly above
  the same-region weighted average confirmed sale price; and
- Item and Cargo identities with the same numeric ID remain different.

## Data ownership

Current orders come only from the committed `regional-market` generation. The
generation is maintained by typed regional subscriptions and is already
available through the provider-neutral server boundary.

Sale evidence comes only from durable `market_trades` rows created by
authoritatively corroborated Relay closed-listing transitions. Disappearing,
ambiguous, returned, or cancelled listings never contribute to an average.

No new SQL table is introduced. In particular, the implementation must not
restore:

- `market_buy_orders_current`;
- `market_regional_sale_averages_current`;
- `global_market_price_snapshots`; or
- a scheduled market-insights/history acquisition job.

`market_trades` remains because it is locally observed history, not a current
state cache. Its existing claim/region/item/time indexes support the bounded
seven-day read.

## Server design

### Baseline reader

Add a focused helper under `apps/bitcraft-local/src/server/` that reads
confirmed trades for:

- the configured monitored claim;
- only configured active regions;
- `occurred_at >= now - 7 days`; and
- the exact Item/Cargo keys present in the current buy-order candidate set.

The helper performs one bounded database read per finder request, not one query
per buy order. It returns a map keyed by
`<regionId>:<itemType>:<itemId>`.

SQLite must return `quantity` and `total_price` as stored TEXT values. The
helper aggregates with `BigInt` in JavaScript so 64-bit IDs, quantities,
prices, and totals never pass through SQLite floating-point arithmetic.

Each baseline contains:

```ts
type BuyOrderSaleBaseline = {
  regionId: string;
  itemType: "item" | "cargo";
  itemId: string;
  salesCount: number;
  unitsSold: string;
  totalValue: string;
  observedSince: string;
  lastSoldAt: string;
};
```

`salesCount` counts confirmed trade records, matching the legacy three-sale
confidence rule. The weighted average is represented internally by the exact
rational value `totalValue / unitsSold`.

### Finder projection

Extend `regionalBuyOrdersView` to accept the baseline map. It continues to own
scope enforcement, catalog enrichment, search, sorting, and pagination.

For each current order:

- `averageUnitPrice` is the weighted seven-day average rounded to the nearest
  whole Hex Coin for display;
- `salesCount` is the number of confirmed sale records;
- `premiumPercent` is an exact decimal string rounded half-up to at most two
  decimal places;
- `opportunityEligible` is true only when `salesCount >= 3` and the exact
  buy-order price is greater than the exact rational baseline; and
- `baselineObservedSince` and `baselineLastSoldAt` expose the progressive local
  observation window.

Eligibility and premium sorting use exact integer/rational comparisons before
any display conversion. The server calculates hundredths of one percent with
integer arithmetic and serializes the result as a decimal string. A rounded
display value must never turn an equal or lower order into an opportunity.

The top-level response retains the current route contract and adds:

```ts
type BuyOrderFinderResponse = {
  rows: BuyOrderFinderRow[];
  opportunities: BuyOrderFinderRow[];
  total: number;
  page: number;
  pageSize: 25 | 50 | 100;
  pageCount: number;
  regionId: string;
  baselineWindowDays: 7;
  minimumSales: 3;
  historyObservedSince: string | null;
  generatedAt: string | null;
  freshness: "fresh" | "stale" | "unavailable";
  ageMs: number | null;
  warnings: string[];
};
```

`opportunities` contains at most ten eligible orders across the entire
filtered result, ordered by exact premium descending, then unit price
descending, then stable order key. It is calculated before table pagination so
the strip is not accidentally limited to the visible page.

The route keeps its existing configured-claim and configured-region guards.
The `all` selection means all configured active regions; each order is compared
only with sales from its own region.

### Freshness independence

Live order freshness and local history coverage are separate:

- stale last-good orders remain visible with the existing Relay freshness
  warning;
- missing or immature history leaves the current order visible with
  `premiumPercent: null`;
- failure to read history returns current orders with a warning rather than
  failing or delaying the live order response; and
- no history operation may replace, suppress, or relabel the current Relay
  generation.

## Browser design

Restore a focused
`apps/bitcraft-local/src/pages/market/BuyOrderFinder.tsx` component and render
it for `currentView === "buy-orders"` in `MarketPage.tsx`.

The component follows the legacy dense operational layout:

1. a compact live-status header;
2. search, region, and page-size controls;
3. current-order summary metrics;
4. Best Opportunities cards;
5. the sortable current-order table; and
6. pagination plus observation-window/freshness copy.

All legacy “cached orders,” “collector,” and “may not have populated” wording
is replaced. The UI says **live orders** for the committed Relay generation
and **locally observed confirmed sales** for the historical baseline.

Rows without three confirmed sales display **Insufficient local sales
history**. Rows with three or more sales but no positive premium display the
calculated non-positive premium and do not enter Best Opportunities.

The component uses `useGameDataGeneration(claimId, ["catalogs",
"regional-market"])` so current order or catalog commits trigger a local
refetch. Manual refresh uses the existing `MarketRefreshProps` coordination.
Search remains debounced, in-flight reads are aborted on dependency changes,
and the last rendered successful payload stays visible when a later request
fails.

The shared Market region selector remains authoritative. The finder does not
add a second conflicting persisted region preference; it receives the selected
region from `MarketPage`. Existing `buyQ` query-state handling may remain for
deep links, while paging and sorting stay component-local.

## Error and empty states

- No first order generation: show the route's unavailable/loading state.
- Relay outage with last-good data: keep rows visible and show age/cause.
- No current buy orders: show a truthful empty current-demand message.
- No qualifying opportunities: show that current orders are still available
  below and that opportunities require three confirmed same-region sales.
- No baseline for one row: show insufficient local history, not zero premium.
- History read failure: keep current orders and show a history-only warning.
- Aborted superseded browser request: do not clear the last successful data.

## Testing

### Server unit coverage

- exact weighted averages from TEXT quantities/totals larger than
  `Number.MAX_SAFE_INTEGER`;
- Item/Cargo numeric-ID collisions;
- same item in two regions receives two independent baselines;
- three-sale threshold and strict positive-premium boundary;
- exact premium ordering before display rounding;
- seven-day cutoff excludes older trades;
- ambiguous/non-sale events never enter `market_trades` baselines;
- filtering occurs before opportunity selection while pagination occurs after
  selection;
- history read failure preserves current order rows with a warning; and
- unconfigured claim/region requests remain rejected.

### Browser boundary coverage

- Market Buy Orders renders `BuyOrderFinder`, not `MarketBrowse mode="buy"`;
- browser source uses only `/api/local/market/buy-orders`;
- copy contains no cache, collector, or BitJita ownership language;
- generation invalidation and manual refresh participate in refetches;
- stale/error responses preserve the last rendered successful payload; and
- empty, immature-history, eligible-opportunity, sorting, and pagination
  states render without hook-order regressions.

### Regression and ownership coverage

- no retired market table returns to schema bootstrap or migrations;
- the SQL table inventory still classifies current buy-order/average tables as
  retired;
- the zero-BitJita source, bundle, route, CSP, asset, and fetch-interception
  checks remain green; and
- production build and the complete application test suite pass.

## Acceptance criteria

The feature is complete when:

1. the dedicated Buy Orders tab restores the legacy finder workflow;
2. every current order comes from the latest committed Relay generation;
3. every premium baseline comes from confirmed same-region local
   `market_trades` observations in the preceding seven days;
4. opportunities require three confirmed sales and a strictly positive exact
   premium;
5. the feature updates without a scheduled job or browser upstream request;
6. current orders remain usable when history is absent or temporarily
   unreadable;
7. no new current-state/cache SQL table exists; and
8. build, tests, ownership checks, and zero-BitJita checks pass.

## Non-goals

- Inferring purchaser identity.
- Treating removed or cancelled listings as sales.
- Restoring a global historical dataset that predates local observation.
- Creating a new notification or Deal Watch rule.
- Changing Market Browse, Deals, Overview, or Local Market behavior.
- Changing the configured region-session pool.
