# Relay migration parity matrix

Status values: `baseline`, `in progress`, `blocked on evidence`, `blocked on assets`, `ready for soak`.

| Surface | Current source/owner | Relay target | Status |
|---|---|---|---|
| Dashboard claim summary | Provider-neutral local game-data route | Relay HTTP claim snapshot | in progress |
| Shared refresh/error chrome | Provider-neutral live game-data status, stale-data warning, and automatic-recovery copy; never attributes a mixed migration page to BitJita | Current provider generation plus persisted last-good state | ready for soak |
| Browser current-data loader | `AppShell` uses provider-neutral `useGameData`; migrated pages paint the last rendered snapshot immediately and still re-read the current local generation on every navigation. The legacy 20-second request short-circuit is isolated behind `legacyPageEndpointMap` | Provider-neutral local domains; delete the compatibility branch after remaining pages migrate | in progress |
| Members roster | Provider-neutral local game-data route | Relay HTTP members snapshot | in progress |
| Member activity, skills, professions, Leaderboard, and quests | Professions and Leaderboard consume normalized Relay citizen/player domains with no provider-specific browser helper or copy; quests join member-filtered `traveler_task_state` with typed descriptions in the continuously connected primary-region session | Relay HTTP citizen levels plus member-filtered regional player/task subscription | ready for soak |
| Member equipment, buffs, Toolbelt, and housing | Members reads the live regional equipment/buff/preset domain; selected-member Toolbelt and housing use monitored-member-only Relay HTTP lookups with 15-second memory last-good caching and no SQL table | Proven member-filtered regional subscription, global equipment/tool/buff descriptions, and bounded Relay player inventory/housing | ready for soak |
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
| Catalogs/planner inputs | Typed global item/cargo, recipe, extraction, item-list, resource, building-type, skill, and equipment descriptions project atomically into the normalized catalog and planner effort indexes. Craft Calculator and Craft Plan target search use the live local catalog index, and recipe trees compose direct and item-list producer routes from the current generation. Craft Planner settlement members/inventories and active/passive crafts read committed Relay generations, selected-player inventories use the bounded 15-second Relay service with no dedicated SQL cache, and workstation progress uses claim-filtered live `building_state`; remaining legacy catalog consumers still require removal | Global and regional typed subscriptions plus normalized current domains | in progress |
| Item/cargo icons | BitJita image URLs | Digest-verified local assets; permission confirmation recorded | blocked on assets |
| Activity/history/charts | Activity member filters now receive the current Relay member generation through `AppShell` with no page-level provider request or roster cache table; retained event/chart rows still need every legacy collector reconnected | Local SQLite derived from normalized domain events | in progress |
| Discord outbox and delivery | Local outbox, delivery gated by environment | Same outbox, default record mode until approval | in progress |
| Admin health | Mixed legacy collector diagnostics plus Relay | Provider topology/freshness/generation | in progress |
| Sync and public tools | Craft Calculator and Sync no longer start the unused legacy claim/member request; Craft Calculator reads the live local catalog. Public Craft Finder still requires the adaptive regional session pool | Provider-neutral domain repository | in progress |

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
