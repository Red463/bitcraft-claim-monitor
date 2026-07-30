# Relay migration parity matrix

Status values: `baseline`, `in progress`, `blocked on evidence`, `blocked on assets`, `ready for soak`.

| Surface | Current source/owner | Relay target | Status |
|---|---|---|---|
| Dashboard claim summary | Provider-neutral local game-data route | Relay HTTP claim snapshot | in progress |
| Members roster | Provider-neutral local game-data route | Relay HTTP members snapshot | in progress |
| Member activity and skills | Provider-neutral local game-data route | Relay HTTP citizen levels plus member-filtered regional player subscription | ready for soak |
| Member equipment and buffs | Members reads the live regional equipment/buff/preset domain; selected-member Toolbelt uses a monitored-member-only Relay HTTP lookup with 15-second memory last-good caching and no SQL table | Proven member-filtered regional subscription, global equipment/tool/buff descriptions, and bounded Relay player inventory | ready for soak |
| Inventory | Provider-neutral shared-storage page with local Relay catalog enrichment; Town Bank/player-bank coverage remains | Relay HTTP joined inventory plus proven Town Bank owner join | in progress |
| Active/passive crafts | Provider-neutral current page; Relay incomplete/completed claim rows split by typed recipe metadata | Relay HTTP plus global recipe catalog | ready for soak |
| Craft contributions | BitJita craft contribution route | Proven regional mapping | blocked on evidence |
| Construction | Provider-neutral page and all remaining server compositions read the claim-filtered regional generation plus global catalogs; the legacy BitJita construction writer and collector control are retired | Regional state plus global catalogs | ready for soak |
| Research | Provider-neutral page and Craft Planner tier presets over claim-filtered regional technology state and the global technology catalog; scheduled collector retired | Regional tech state plus global catalogs | ready for soak |
| Recruitment | Members reads claim-filtered live regional posting state enriched from the global skill catalog; legacy endpoint and collector ownership retired | Regional recruitment state plus global skill catalog | ready for soak |
| Storage activity | Relay live HTTP tail on the 15-second provider loop, with bounded container rotation, exact item/cargo catalog enrichment, and idempotent durable copy into `activity_events`; legacy scheduled collector retired | Relay storage-log durable copy | ready for soak |
| Settlement market | BitJita listings | Proven regional buy/sell order state | baseline |
| Global market tools | BitJita search/history/trades | Local aggregation and region pool | baseline |
| Market sale notifications | BitJita trade corroboration | Authoritative close/trade evidence | blocked on evidence |
| Region | BitJita region/status/trade volume | Configured regional sessions | baseline |
| Empires/watchtowers/siege | BitJita empire routes | Proven global rows or regional sessions | blocked on evidence |
| Deposits | Empires Hexite Deposits tab reads the provider-neutral 15-second Relay snapshot with last-good fallback; `unknown` and overdue rows are never promoted to active; no deposit-specific table or scheduled job | Relay HTTP deposits with explicit state | ready for soak |
| Map/layout | BitJita layout/player routes | Claim parents and bounded location rows | blocked on evidence |
| Catalogs/planner inputs | Typed global item/cargo repository live. Craft Planner settlement members/inventories now read the committed Relay generation and selected-player inventories use the bounded 15-second Relay service with no dedicated SQL cache; building reconciliation, workstation definitions, crafts/passive crafts, probabilities, and remaining description reads still require migration | Global typed subscriptions plus normalized current domains | in progress |
| Item/cargo icons | BitJita image URLs | Digest-verified local assets; permission confirmation recorded | blocked on assets |
| Activity/history/charts | Local SQLite derived from BitJita | Local SQLite derived from normalized domains | baseline |
| Discord outbox and delivery | Local outbox, delivery gated by environment | Same outbox, default record mode until approval | in progress |
| Admin health | Mixed legacy collector diagnostics plus Relay | Provider topology/freshness/generation | in progress |
| Sync and public tools | Mixed BitJita/local | Provider-neutral domain repository | baseline |

## Scheduled/background inventory

The worker currently owns settlement snapshots, market listings/history,
production lifecycle/contributions, trade backfill, regional
buy-order averages, catalog refreshes, empire Hexite refreshes, Discord outbox,
scheduled reports, health evaluation, and notification generation. Each job
must be reconnected to normalized domains before its BitJita path is removed.

Storage activity is no longer a scheduled ingestion job. The Relay live loop
backfills each newly observed storage container from the retained upstream
window and then reads a small tail, rotating bounded batches without delaying
the current inventory snapshot. SQLite remains only as durable event history
because Relay expires storage logs after roughly 15-16 days.

Current-state ingestion must become subscription-driven or use a bounded
single-flight Relay HTTP refresh loop. Scheduled jobs may reconcile, repair,
retain, aggregate, report, or deliver, but no current-data page may wait for a
periodic ingestion job. Each vertical milestone must also classify and remove
legacy tables that exist only for BitJita bulk-fetch, pagination, rate-limit,
or refresh-run bookkeeping. See
[live-first-data-policy.md](./live-first-data-policy.md).
