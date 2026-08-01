# BitCraft Claim Monitor Relay migration

This directory is the durable implementation record for the standalone Relay
clone. The public product name remains **BitCraft Claim Monitor**.

Locked deployment identity:

- application: `/opt/bitcraft-claim-monitor-relay`
- data: `/var/lib/bitcraft-claim-monitor-relay`
- backups: `/var/backups/bitcraft-claim-monitor-relay`
- environment: `/etc/bitcraft-claim-monitor-relay.env`
- preview: `relay.timbersteeltrade.com`
- development ports: `19428` (Vite) and `19430` (local API)
- production port: `19430`

The maintained application remains unchanged and recoverable. This clone starts
with a fresh database and does not import accounts, settings, secrets, or
history.

Live-first data policy:

- the optimization target is the shortest correct Relay-to-screen path, not
  the fewest SQL tables;
- current screens and tools are event-driven and must never depend on a
  scheduled ingestion job becoming due;
- subscription-backed domains publish validated changes continuously;
- HTTP-only domains use bounded single-flight refresh loops rather than
  page-triggered upstream fan-out;
- the committed in-memory provider generation is the healthy current-state
  source, with `domain_payload_current` retained only as the generic durable
  last-good boundary;
- open pages receive local provider-neutral generation notifications;
- scheduled ingestion is a reconciliation mechanism, never something users
  normally wait for;
- new Relay domains add no dedicated current-state SQL table by default;
- a derived-current table is retained only with measured indexed-query,
  cross-process, or restart-recovery value and must update from domain events;
- a table that duplicates committed current state or inserts scheduled
  materialization delay is removed in the same vertical-domain migration;
- legacy tables that only supported BitJita bulk fetching, rate limiting, or
  refresh orchestration are removed after dependency and recovery proofs;
- table retirement is part of each vertical-domain delivery, not a cleanup
  deferred until the end of the migration;
- calculation-heavy features such as Craft Planner execute against
  continuously maintained local normalized indexes, so they neither repeat
  large Relay reads nor wait for a scheduled catalog build;
- current generations publish before history, notification, analytics, report,
  or reconciliation side effects, so those durable workflows cannot delay an
  operational page;
- after restart, the API serves the durable last-good generation immediately
  without waiting for Relay reconnection, while a first-ever empty clone
  publishes ready domains independently instead of waiting for a full-system
  load;
- browser requests and scheduled jobs never own live-data freshness: page
  navigation reads an already committed generation, while subscriptions and
  bounded provider refresh loops keep the next generation ready;
- committed domain generations notify open browsers through the
  provider-neutral local event stream; when streaming is unavailable, a
  single-flight 750-millisecond local generation poll keeps the same
  invalidation path inside the one-second browser publication budget without
  accumulating requests behind a slow response;
- a migrated feature is not accepted if disabling ingestion schedules makes
  its current data stop updating, even when a scheduled fallback could mask
  the problem in production;
- each migrated page and tool must be usable from the latest committed local
  generation immediately after navigation; no loading state may be extended
  merely because a collector, cache rebuild, or materialization job has not
  reached its next scheduled run;
- table retirement is the default outcome when a table only duplicates current
  Relay state. Retention requires a recorded benchmark showing that removing
  the table would miss an interactive latency or restart-recovery budget, plus
  proof that the retained projection is updated by the source generation
  rather than a timer.

SQL decisions are therefore locked as follows:

| Data responsibility | Plan decision |
|---|---|
| Current Relay state | Serve the committed in-memory generation and retain only the generic `domain_payload_current` last-good copy by default; do not add a domain-specific current table. |
| Heavy interactive joins, including Craft Planner | Keep a compact subscription-fed normalized index only when representative benchmarks prove it is required to meet the local API latency budget. It must update immediately from the committed generation, never from a scheduled crawl. |
| BitJita rate-limit caches, bulk-fetch staging, crawl cursors, and refresh ledgers | Remove them with the domain that replaces their final reader and writer. |
| History, observed events, notification deduplication/outbox, user configuration, audit, and provider health | Keep them because they provide durable local behavior that Relay current state does not replace. |
| Scheduled jobs | Limit them to maintenance, retention, reports, delivery retries, integrity checks, and reconciliation. Disabling scheduled ingestion must not make any current user-facing feature stale. |

Every vertical milestone must update the SQL table inventory, remove obsolete
schema and job definitions in the same delivery, and prove both that the
feature updates without a scheduler tick and that its local read path meets
the recorded latency budget. A vertical is blocked from completion if its
normal healthy-state data path includes “wait for the next scheduled run.”

The first cross-region implementation of this policy is Public Craft Finder:
configured regional sessions follow public markers through bounded typed
joins, merge complete generations into the generic current-state repository,
and project catalog labels locally. It adds no feature-specific SQL table and
remains usable from last-good state during a Relay outage.

Local Market follows the same rule for the monitored settlement: typed
claim-scoped order subscriptions and bounded owner joins continuously publish
the generic `market` generation used by Local Market and Dashboard.
`market_listings` has been retired rather than retained as a duplicate
current-state mirror. Durable `market_events`/`market_trades` history,
notifications, and any measured cross-region index remain separate side
effects and must never delay publication of the live generation. The same
claim-scoped session includes `closed_listing_state`: exact Hex Coin proceeds
confirm a sale only when they uniquely match one same-owner sell-order
transition, while exact returned item/cargo stacks confirm a non-sale.
Ambiguous closures remain unresolved. Confirmed transitions append immediately
and idempotently with exact TEXT amounts; no completed-sale schedule or
member-history crawl remains.

Cross-region market orders use the adaptive regional-session pattern rather
than the legacy scheduled crawl. Each configured region publishes a bounded
typed buy/sell/closed-listing snapshot before optional identity and active
barter-stall joins finish, and the runtime combines those snapshots into the
generic `regional-market` last-good domain. Market Browse search and order
books, Overview liquidity/hubs/open-order activity, and Deals arbitrage join
that generation to the continuously maintained local catalog on request; they
do not wait for a scheduled insight job. Initial applies and every later base
table change publish before optional enrichment reapplies. Failed transition
side effects are written as changed-region order/closure deltas to a compact
durable outbox in the same SQLite transaction as the current generation, then
retry idempotently across process restarts without rolling back or delaying
later live publication. Deal Watch
evaluation runs on a separate best-effort current-publication path, so a watch
failure cannot hold the ordered market-history writer. Local
filtering and catalog enrichment are fast enough without
`market_buy_orders_current`; the table and the unproven
`market_regional_sale_averages_current` projection are retired. The obsolete
`global_market_price_snapshots` table, cached overview setting, and
`global_market_insights` job are also retired. Exact regional Hex Coin proceeds
now confirm sales only when they uniquely match a same-region, same-market,
same-owner sell-order transition. Confirmed transitions append immediately to
the existing exact `market_events`/`market_trades` history, and Overview movers
use only the locally observed rolling 24-hour windows with an explicit
`observedSince`; they never wait for a history job or treat disappearing orders
as sales. Market Browse price history reads those durable confirmed events on
demand, calculates daily volume/value and progressive 24-hour, 7-day, and
30-day views in memory, and labels the local observation start. Item/type
filtering uses the indexed durable history before its bounded response limit,
including configured region scope, so unrelated high-volume items or regions
cannot hide a selected item. No price
snapshot, analytics materialization table, or scheduled chart rebuild exists.
Longer chart windows mature during the soak. Premium
opportunities remain unavailable until Relay exposes or proves an
authoritative same-region sale signal. The primary region remains pinned;
additional configured regions rotate within the connection cap on a
provider-owned 15-second loop, independently of HTTP refresh jobs. A newly
opened region is held until its first complete generation applies or its
30-second apply timeout expires, so connection setup cannot churn the pool
before useful rows arrive. Per-region receive ages and connection state prevent
a disconnected or delayed region from being reported as fresh. Browse
freshness also includes the global catalog subscription, so current orders
cannot hide a stale or disconnected enrichment source. Order books publish
independently of trade-history reads. The naturally bounded
`marketplace_state` table is part of the live base generation, so order-book
map actions and same-region/same-dimension Manhattan route distances update
with the orders and never wait for a scheduled job. Cross-region coordinate
spaces are not compared.

Barter Stalls shares those same regional sessions and the generic
`regional-market` generation. The provider keeps the complete stall marker
table bounded but follows only currently enabled stall IDs into trade orders,
buildings, nicknames, and locations, then follows only the resulting claim and
owner IDs. Inactive markers never delay order-book publication or appear as
actionable stalls. The local route performs search, active-order filtering,
pagination, and catalog enrichment on demand. No stall SQL table or scheduled
stall collector exists.

Deal Watch is also a live consumer of the generic `regional-market`
generation. Every complete generation is evaluated immediately against the
current typed regional sell-order median, and newly enabled watches trigger an
immediate evaluation. The 30-minute scheduled job remains only as a
reconciliation guard. `market_deal_watches` stays as user-owned configuration
and `market_deal_alerts` stays as durable alert/delivery history; there is no
current-listing or baseline cache table. Because Relay has not yet proved a
completed-sale signal, the UI labels this baseline as a live median and never
presents it as historical sales evidence. Expired per-region last-good data
remains readable in market pages but cannot emit a new Deal Watch alert.

Discord `/price` and its autocomplete are live consumers of that same
generation and the continuously maintained catalog. The command reports
lowest sell, exact sell median, highest buy, liquidity, demand, and freshness
for one configured region. It does not call an upstream history endpoint or
describe open orders as completed trades. Market Browse replaces the retired
orphaned browser Price Finder, so no duplicate page, cache table, refresh
ledger, or scheduled price-ingestion job remains.

Map Resource Finder reads `resource_desc` and huntable `enemy_desc` rows from
the same continuously maintained global subscription. The provider-neutral
local map catalog route serves the atomic durable catalog projection, reports
freshness, and is invalidated by `catalogs` generation events. The legacy
ten-minute resources/creatures request cache is removed; no map-catalog table
or scheduled refresh job replaces it.

Active-region controls now read the small global
`region_population_info`, `region_control_info`, and
`world_region_name_state` tables through that same continuous typed
subscription. The normalized `region` generation is joined to persisted Relay
topology health and filtered to the monitored/default/admin-configured region
scope before it reaches the browser. Arbitrary `include` parameters cannot
widen that scope. The former BitJita region/status requests, five-minute
process cache, and browser wait for a refresh job are removed; no replacement
region cache table or ingestion schedule exists. Region-table events publish
only the small `region` domain; they do not rebuild or rewrite the much larger
catalog projection. The worker supervises this subscription independently of
Relay HTTP readiness, persists a throttled heartbeat for the web process, and
reconnects with 1/2/4/8/16/30-second backoff plus bounded jitter and fresh
topology discovery. A newly connected global session receives a bounded
30-second initial-apply grace period so a valid large generation is not torn
down while it is still staging. Claim changes first fence and stop every
claim-owned regional runtime, then attempt the new provider, so a failed new
claim cannot leave the old claim live. Claim and configured-region changes
otherwise reconcile immediately without a process restart, while browser
last-good rows are retained only for the exact same claim and configured
scope.

Empire overview, details, claim members, watchtowers, and current siege rows
now follow the same live-first rule. A continuously connected primary regional
session owns the replicated Empire/member identity graph, while bounded
secondary sessions use validated `world_region_state` geometry for local
settlements, nodes, chunks, claim members, and sieges. A complete regional
generation publishes immediately to the generic current-state repository;
membership-period history is updated from the committed primary generation
without waiting for a scheduled collector. Configuration changes prune retired
regions before reconnecting, and route freshness is calculated from exactly
the primary identity source plus the region being viewed. No Empire-specific
current SQL table exists. Unproven siege participant roles remain explicitly
unknown. The legacy six-hour Empire Hexite sweep and its five current/work
tables are retired: each committed Empire generation now publishes the exact
treasury amount immediately, while the continuously subscribed global Foundry
generation adds completed Capsules to the same clearly labelled known minimum
as soon as either source changes. Existing pooled regional sessions also stage
bounded local Empire, player, claim-building, and inventory predicates, then
publish only compact Hexite contributions and coverage metadata. Missing
configured regions or claims remain explicitly partial; the app does not
invent those amounts, add a current-state table, or make users wait for a
scheduled crawl.

Implementation is dependency-ordered:

1. evidence, isolation, and traffic guardrails;
2. provider contracts, Relay HTTP claim/member slice, and last-good snapshots;
3. pinned SpacetimeDB SDK/CLI and generated catalog/regional bindings;
4. settlement operations;
5. market state and locally observed history;
6. geography, region pool, and empires;
7. collectors, Discord parity, and zero-BitJita closure;
8. seven-day preview soak, operator approval, and controlled cutover.

See [evidence-baseline.md](./evidence-baseline.md),
[diagnostic-findings.md](./diagnostic-findings.md), and
[parity-matrix.md](./parity-matrix.md). The required freshness budgets,
scheduled-job boundary, and table-retirement gates are defined in
[live-first-data-policy.md](./live-first-data-policy.md). Current SQL ownership
and retirement decisions are tracked in
[table-inventory.md](./table-inventory.md).
