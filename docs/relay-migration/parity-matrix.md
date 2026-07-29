# Relay migration parity matrix

Status values: `baseline`, `in progress`, `blocked on evidence`, `blocked on assets`, `ready for soak`.

| Surface | Current source/owner | Relay target | Status |
|---|---|---|---|
| Dashboard claim summary | Provider-neutral local game-data route | Relay HTTP claim snapshot | in progress |
| Members roster | Provider-neutral local game-data route | Relay HTTP members snapshot | in progress |
| Member activity and skills | Provider-neutral local game-data route | Relay HTTP citizen levels plus member-filtered regional player subscription | ready for soak |
| Member equipment and buffs | BitJita player routes | Proven member-filtered regional subscription plus global descriptions | baseline |
| Inventory | Normalized Relay snapshot available; page still legacy | Relay HTTP joined inventory plus proven Town Bank owner join | in progress |
| Active/passive crafts | Normalized Relay active-craft snapshot available; page still legacy | Relay HTTP plus regional subscriptions | in progress |
| Craft contributions | BitJita craft contribution route | Proven regional mapping | blocked on evidence |
| Construction | BitJita construction/inventory joins | Regional state plus global catalogs | baseline |
| Research | BitJita research route | Regional tech state plus global catalogs | baseline |
| Recruitment | BitJita recruitment route | Regional recruitment state | baseline |
| Storage activity | BitJita storage logs | Relay storage-log durable copy | baseline |
| Settlement market | BitJita listings | Proven regional buy/sell order state | baseline |
| Global market tools | BitJita search/history/trades | Local aggregation and region pool | baseline |
| Market sale notifications | BitJita trade corroboration | Authoritative close/trade evidence | blocked on evidence |
| Region | BitJita region/status/trade volume | Configured regional sessions | baseline |
| Empires/watchtowers/siege | BitJita empire routes | Proven global rows or regional sessions | blocked on evidence |
| Deposits | Normalized Relay snapshot available; page still legacy | Relay HTTP deposits with explicit state | in progress |
| Map/layout | BitJita layout/player routes | Claim parents and bounded location rows | blocked on evidence |
| Catalogs/planner inputs | Typed global item/cargo repository live; remaining description tables and planner reads still legacy | Global typed subscriptions | in progress |
| Item/cargo icons | BitJita image URLs | Digest-verified local assets; permission confirmation recorded | blocked on assets |
| Activity/history/charts | Local SQLite derived from BitJita | Local SQLite derived from normalized domains | baseline |
| Discord outbox and delivery | Local outbox, delivery gated by environment | Same outbox, default record mode until approval | in progress |
| Admin health | Mixed legacy collector diagnostics plus Relay | Provider topology/freshness/generation | in progress |
| Sync and public tools | Mixed BitJita/local | Provider-neutral domain repository | baseline |

## Scheduled/background inventory

The worker currently owns settlement snapshots, market listings/history,
production lifecycle/contributions, storage activity, trade backfill, regional
buy-order averages, catalog refreshes, empire Hexite refreshes, Discord outbox,
scheduled reports, health evaluation, and notification generation. Each job
must be reconnected to normalized domains before its BitJita path is removed.
