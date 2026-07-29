# Live-first data and table-retirement policy

This policy is part of the Relay migration plan. It applies to every domain,
page, collector, notification, and database table delivered by Milestones 1-7.

## Objective

The application must expose normalized Relay data as soon as it is safely
available. A user must not have to wait for a daily, hourly, or multi-minute
scheduled ingestion job before a page or feature becomes useful.

SQLite remains the application's durable local read model, history store, and
cross-process boundary. It must not retain tables, queues, or job state whose
only purpose was working around BitJita bulk-request sizes or rate limits.

The public browser remains isolated from Relay and SpacetimeDB. It reads local
provider-neutral routes only.

## Update paths

| Source class | Normal update path | Scheduled work allowed |
|---|---|---|
| SpacetimeDB global/regional rows | A long-lived filtered subscription applies insert, update, and delete events to a numbered staging generation, validates it, then atomically publishes the affected normalized domains. | Reconciliation, schema checks, reconnect recovery, and health evaluation only. |
| Relay HTTP-only joined domains | A provider-owned, bounded, single-flight refresh loop updates normalized snapshots. Active operational domains refresh at the shortest interval permitted by measured Relay capacity and operator guidance. | Periodic reconciliation may detect missed or inconsistent results, but pages do not wait for it. |
| Locally derived current data | Recompute incrementally after the source generation commits. Batch only work that cannot be updated correctly from the changed entity set. | Full rebuilds are repair operations and must not be the normal user path. |
| History and events | Append idempotently as normalized state transitions are observed. | Retention, compaction, integrity checking, and aggregate repair. |
| User-owned and operational data | Write synchronously through local authenticated routes. | Backups, privacy retention, report delivery, outbox retries, and maintenance. |

Browser navigation must never fan out into Relay HTTP calls or create a new
SpacetimeDB subscription. Multiple users share the provider's existing
connections and the same committed local generation.

## Browser delivery

`GET /api/local/game-data` returns the latest complete local envelopes
immediately. If an HTTP-backed domain is older than its freshness budget, the
server requests a priority single-flight refresh without making the current
page wait for unrelated domains.

Add a provider-neutral local event stream:

```http
GET /api/local/game-data/events?claimId=1369094286777412590&domains=claim,members
```

The stream emits generation metadata only:

```ts
type GameDataGenerationEvent = {
  generation: number;
  generatedAt: string;
  changedDomains: DomainKey[];
};
```

React invalidates and re-reads only the affected local domains. It never
receives Relay wire rows. Event notifications may be coalesced briefly to
avoid render storms, but must not be held for a scheduled batch. If the stream
is unavailable, the browser falls back to a low-cost local poll; that fallback
still contacts only this application.

Opening a page therefore follows this sequence:

1. render the last complete local snapshot;
2. show its freshness and age;
3. start or join a priority refresh when needed;
4. update the affected UI when the next generation commits.

A feature with no first generation yet shows a domain-level loading or
unavailable state. It must not block unrelated domains that are already ready.

## Freshness and latency budgets

These budgets measure time under this application's control. Upstream Relay
observation delay is reported separately and must not be hidden inside local
apply time.

| Path | Required budget while healthy |
|---|---|
| Committed snapshot to local API visibility | p95 at or below 250 ms |
| Received subscription change to committed normalized generation | p95 at or below 2 seconds; p99 at or below 5 seconds |
| Committed generation to an open browser update | p95 at or below 1 second |
| Incremental derived-current update after its source generation | p95 at or below 2 seconds |
| Primary HTTP operational domains | Provisional refresh target of 15 seconds, tightened only within confirmed Relay limits |
| Lower-change HTTP domains | Provisional refresh target of 60 seconds, with immediate priority refresh when requested and safe |

The Admin provider-health view records, per source and domain:

- upstream source-observed time when available;
- Relay receive time and local receive time;
- generation commit time;
- browser-visible publication time where measurable;
- current age and freshness budget;
- p50, p95, and p99 apply lag;
- refresh queue time, coalesced request count, and circuit-breaker state;
- reconnect count, dropped/malformed rows, and last error.

Breaching a budget changes the envelope to `stale` or `unavailable` according
to the existing last-good rules and creates an observable health warning. It
must not silently display old data as live.

## Scheduled-job boundary

Scheduled jobs remain appropriate for backups, privacy retention, periodic
reports, Discord outbox retries, history retention/compaction, integrity
checks, and low-priority reconciliation.

They are not permitted to be the primary update path for:

- claim, member, citizen, profession, or player state;
- inventories, active/passive crafts, or contributions;
- construction, research, recruitment, equipment, or buffs;
- market orders/listing transitions or current regional aggregates;
- layout, location, empire, watchtower, siege, or deposit current state;
- catalog and Craft Planner source data.

Disabling reconciliation and reporting jobs in a test environment must not
stop healthy subscriptions and HTTP refresh loops from keeping user-facing
current state fresh.

## Table classification and retirement

Before completing each vertical domain, record every table it reads or writes
in a table-ownership inventory with:

```ts
type TableDisposition =
  | "retire"
  | "materialized-current"
  | "derived-current"
  | "history-event"
  | "user-owned"
  | "operations";

type TableInventoryEntry = {
  table: string;
  disposition: TableDisposition;
  owner: string;
  writers: string[];
  readers: string[];
  updateTrigger: "subscription" | "http-loop" | "domain-event" | "request" | "maintenance";
  retention: string;
  replacement: string | null;
  removalMilestone: number | null;
};
```

Apply these decisions:

- `retire`: BitJita response caches, pagination cursors, rate-limit recovery
  queues, catalog refresh-run ledgers, and duplicate source-specific snapshots
  that have no remaining independent consumer.
- `materialized-current`: normalized Relay projections needed for fast reads,
  cross-process sharing, atomic generations, or restart/outage recovery.
- `derived-current`: indexed planner, market, construction, or regional
  projections that materially reduce query cost and update incrementally from
  normalized domain events.
- `history-event`: observations needed for charts, membership periods,
  listing transitions, deduplication, audits, or notifications.
- `user-owned`: accounts, settings, saved plans, permissions, and preferences.
- `operations`: provider health, subscription generations, outbox delivery,
  backups, privacy, and diagnostics.

Initial candidates requiring explicit dependency proof are:

| Existing table or group | Planned disposition |
|---|---|
| `recipe_catalog_entries` | Retire after every planner/catalog reader uses the normalized `game_catalog_*` projection. |
| `game_catalog_refresh_runs`, `game_catalog_refresh_targets` | Retire when continuous global subscription health and generation state fully replace BitJita catalog refresh orchestration. |
| `settlement_state_current` | Merge or retire if `domain_payload_current` and typed projections become its only source and cover every reader. |
| `market_buy_orders_current`, `market_regional_sale_averages_current` | Keep only when they provide a measured indexed derived-current benefit; update them from order events rather than a long scheduled sweep. |
| `scheduled_jobs` | Keep for legitimate maintenance and delivery work; delete retired ingestion-job definitions and UI controls. |
| `domain_payload_current`, `provider_source_health`, `provider_subscription_health` | Keep as the atomic last-good and operational boundary unless a typed projection demonstrably replaces the same responsibility. |
| `game_catalog_*` normalized entity/recipe tables | Keep as the durable catalog read model; remove refresh bookkeeping that no longer applies. |
| Market, activity, membership, production, notification, and audit history | Keep according to explicit retention because Relay supplies current state, not the application's observation history. |

No table is kept merely because the legacy application had it, and no table is
removed merely because its data now originates from a subscription. Removal
requires all of the following:

1. every reader and writer is listed;
2. its replacement path has provider-neutral fixture coverage;
3. static search and runtime database tracing show no remaining access;
4. restart and Relay-outage tests prove required last-good behavior;
5. schema bootstrap, prepared statements, admin inspection, backups, retention,
   documentation, and tests are updated together;
6. the fresh-clone schema no longer creates the table;
7. any developer database migration is bounded to that exact table and is
   verified before destructive DDL runs.

The inventory is updated at the end of every vertical milestone. Final
BitJita closure includes an assertion that every `retire` entry is absent from
the schema and every retained table has a current owner and update trigger.

## Milestone integration

### Milestone 1

- Establish per-domain freshness budgets, generation publication, and latency
  metrics with the claim/member slice.
- Add the local generation event stream and browser invalidation path.
- Create the table-ownership inventory and classify the first-slice tables.
- Acceptance adds: claim/member changes appear without a scheduled collector,
  and an open page updates after a committed generation.

### Milestone 2

- Populate `game_catalog_*` continuously from typed global subscriptions.
- Move planner/catalog readers away from `recipe_catalog_entries`.
- Remove legacy catalog refresh runs/targets after static and runtime proofs.
- Acceptance adds: a catalog insert/update/delete reaches planner reads without
  a daily refresh job.

### Milestones 3-5

- Deliver each operational domain through its live update path before removing
  its legacy collector or cache.
- Update derived planner, market, construction, map, and empire projections
  incrementally from committed domain changes.
- Measure regional session and HTTP-loop load; adjust freshness intervals only
  from observed capacity and operator guidance.

### Milestone 6

- Remove obsolete ingestion scheduled jobs, UI controls, settings, tables,
  prepared statements, and diagnostics.
- Keep scheduled reporting and reconciliation explicitly separate from live
  ingestion.
- Acceptance adds: with scheduled ingestion disabled, all healthy current-data
  pages and notifications continue to update.

### Milestone 7

- Include freshness-budget compliance and scheduled-job independence in the
  seven-day soak.
- Cutover is blocked by silent staleness, repeated budget breaches, unbounded
  refresh queues, or a user-facing feature that waits for a periodic ingestion
  job.

## Automated acceptance

Add focused coverage proving:

- subscription insert, update, and delete events publish a new atomic
  generation and invalidate only affected browser domains;
- HTTP refreshes are single-flight across users, requests, and collectors;
- page requests return the current snapshot while stale-while-revalidate runs;
- reconnect and reconciliation do not duplicate history or notifications;
- a worker restart serves the durable last-good snapshot immediately;
- scheduled ingestion jobs can be disabled without stopping live current data;
- derived planner and market projections update incrementally;
- freshness transitions and latency metrics are accurate;
- retired tables and scheduled-job keys are absent from a fresh schema;
- runtime database tracing fails tests when removed table names are accessed;
- browser traffic never contacts Relay, SpacetimeDB, or BitJita directly.
