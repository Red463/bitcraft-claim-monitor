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
  750-millisecond local generation poll keeps the same invalidation path
  inside the one-second browser publication budget;
- a migrated feature is not accepted if disabling ingestion schedules makes
  its current data stop updating, even when a scheduled fallback could mask
  the problem in production.

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
effects and must never delay publication of the live generation.

Cross-region market orders use the adaptive regional-session pattern rather
than the legacy scheduled crawl. Each configured region publishes a bounded
typed buy/sell-order snapshot, and the runtime combines those snapshots into
the generic `regional-market` last-good domain. Market Browse search and order
books, Overview liquidity/hubs/open-order activity, and Deals arbitrage join
that generation to the continuously maintained local catalog on request; they
do not wait for a scheduled insight job. Local
filtering and catalog enrichment are fast enough without
`market_buy_orders_current`; the table and the unproven
`market_regional_sale_averages_current` projection are retired. The obsolete
`global_market_price_snapshots` table, cached overview setting, and
`global_market_insights` job are also retired. Completed
trade charts remain explicitly unavailable until Relay proves an authoritative
close/trade signal, rather than deriving sales from disappearing orders. Premium
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
independently of trade-history reads. Location distance/map actions remain
unavailable until the bounded location join is proven.

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
