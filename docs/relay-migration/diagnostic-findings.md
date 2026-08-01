# Relay diagnostic findings

## Barter stall ownership and live-read path — 2026-07-30

Region 19 exposed 312 `barter_stall_state` rows and 23,693
`trade_order_state` rows during the diagnostic. Of those trade orders, 3,263
were non-traveller orders, 2,720 joined to a known barter-stall entity, and
2,684 had positive remaining stock across 180 stalls.

Every observed `barter_stall_state.market_mode_enabled` value was `false`.
That field therefore does not qualify as an active-stall filter. The
provider instead uses barter-stall membership, joins trade orders by
`shop_entity_id`, and excludes rows with a non-null
`traveler_trade_order_id`.

The regional market session subscribes to the naturally bounded stall table,
then issues chunked equality subscriptions for only those stall entity IDs
against trade orders, buildings, nicknames, and locations. A second bounded
stage follows the resulting claim and constructed-by player IDs for names.
Exact item/cargo identities and quantities are normalized before the generic
`regional-market` generation commits; catalog labels are joined locally at
read time.

The first production-shaped verification exposed and fixed a staging race:
initial rows delivered while the detail subscription was applying could
restart that subscription before publication. Focused coverage now proves
that initial staged inserts do not restart the in-flight generation, while
real base or detail changes observed during staging trigger another bounded
discovery pass before publication. A final live apply proof remains pending
because the Relay health source changed region 19 upstream state to `down`
before the post-fix rerun.

Barter Stalls uses no dedicated SQL table, refresh ledger, or scheduled
ingestion job. The browser reads `/api/local/market/stalls`, invalidates on
catalog or `regional-market` generation changes, and keeps last-good
freshness visible.

## Storage activity semantics and retention — 2026-07-30

The public Relay storage endpoint was exercised against a monitored claim
container using:

```text
/storage-logs?storageId=1369094286778488967&region=19&limit=5000
```

- Rows carry stable decimal log, claim, building, player, item, and region IDs.
- `action` is `deposit` or `withdraw`; `item_type` is independently `Item` or
  `Cargo`, so catalog identity remains typed.
- Building, claim, and player names are joined by Relay. Item display metadata
  is joined locally from the continuously maintained global catalog.
- The observed container returned 344 rows from 2026-07-18 through
  2026-07-29, confirming the documented expiring history window and that a
  large initial limit is accepted.
- The durable source key is `relay-storage:<region>:<upstream log id>`.
  Re-reading the live tail is therefore idempotent across retries and restarts.

Runtime consequence: a bounded service rotates through current claim storage
containers on the 15-second Relay loop. A newly seen container receives a
retained-window backfill and subsequent passes request only the newest 100
rows. This work is independent of current inventory rendering and no longer
waits for the settlement collector. `activity_events` remains necessary as
durable local history; no storage-specific current-state or refresh table is
created.

## Recruitment state semantics — 2026-07-30

The generated regional binding was exercised against the topology-discovered
region 19 source using a claim-filtered subscription:

```sql
SELECT * FROM claim_recruitment_state
WHERE claim_entity_id = 1369094286777412590
```

- Timbersteel had exactly one recruitment posting: entity
  `1369094286821318198`.
- `claim_entity_id` is the monitored claim ID and is directly filterable.
- The live row reported `remaining_stock = 19`, `required_skill_id = 1`,
  `required_skill_level = 1`, and `required_approval = false`.
- `entity_id` is the posting identity; it is not the claim ID.
- `remaining_stock > 0` proves that the posting is currently recruiting.
- The generated remove-recruitment contract deletes by posting identity, so no
  matching row is an authoritative closed state rather than an ingestion
  warning.
- The skill ID joins to the continuously maintained global `skill_desc`
  catalog. The Relay row contains no free-form description and is not an
  applicant list, so neither is fabricated by normalization.

Runtime consequence: Recruitment is part of the continuously connected primary
regional session, skill identity is joined at the provider-neutral local route,
and Members renders the committed live state. No Recruitment SQL table,
scheduled ingestion job, or Relay polling request is justified.

## Research state and availability semantics — 2026-07-30

The generated regional binding was exercised against the topology-discovered
region 19 source using a subscription filtered to the configured claim:

```sql
SELECT * FROM claim_tech_state
WHERE entity_id = 1369094286777412590
```

- `claim_tech_state.entity_id` is the claim entity ID.
- Timbersteel had exactly one state row, 53 distinct learned technology IDs,
  `researching = 0`, and no scheduled research ID at observation time.
- `researching = 0` is the no-current-research sentinel. A non-zero value is a
  `claim_tech_desc.id`; `start_timestamp` and `scheduled_id` belong to that
  current research.
- The global catalog contained 146 `claim_tech_desc` rows.
- A technology is completed when its ID is in `learned`, current when its ID
  equals the non-zero `researching` value, immediately available when every
  `requirements` ID is learned, and otherwise locked.
- The catalog fields `members`, `area`, `supplies`, `xp_to_mint_hex_coin`, and
  `unlocks_techs` are progression data and must survive normalization.

Runtime consequence: subscribe only to the configured claim's regional state,
join all technology descriptions from the continuously maintained global
catalog at the local route, and derive completed/current/available/locked
states without a Relay research poller or dedicated research table.

## Construction ownership and material semantics — 2026-07-30

The generated regional binding was exercised against the topology-discovered
region 19 source, `relay-mirror-bc19`, using filtered official TypeScript
subscriptions.

- `project_site_state.owner_id` is the claim entity ID. Filtering
  `owner_id = 1369094286777412590` returned exactly the monitored claim's one
  active project while the region contained 803 active project rows.
- An unbuilt project entity is not yet a `building_state` entity. Claim
  ownership must therefore use `owner_id`, not an entity-ID join to completed
  buildings.
- `project_site_state.items` and `.cargos` are contributed quantities. A live
  Exquisite Smithing Station row contained the three recipe requirements that
  had been fully supplied and omitted the fourth missing requirement. Other
  sampled projects contained partial cargo quantities below their global
  recipe requirement.
- `construction_recipe_desc.consumed_item_stacks` and
  `.consumed_cargo_stacks` are the authoritative required quantities.
- `construction_recipe_desc.building_description_id` joins to
  `building_desc.id`; item and cargo inputs join to their typed global catalog
  identities.
- Timbersteel's observed project was construction recipe `442905423`, Sturdy
  Large Residential House. Its five required cargo rows were present in the
  global catalog and its regional contributed arrays were empty at observation
  time.

Runtime consequence: subscribe only to
`project_site_state WHERE owner_id = <configured claim id>` and
`building_state WHERE claim_entity_id = <configured claim id>`, preserve
project, building, and material IDs as decimal strings, and build
required/contributed material rows from the global catalog at the
provider-neutral local route. The filtered completed-building rows also drive
Craft Planner workstation progress immediately. No dedicated construction or
building SQL table or scheduled ingestion job is justified.

The legacy construction collector was retired on 2026-07-30. It had no
independent construction event/history or notification store to preserve; it
only refreshed current BitJita project state and could overwrite the Relay
provider's canonical `domain_payload_current` row. Dashboard fallback and
background compositions now use the same catalog-enriched Relay projection as
the provider-neutral page. Craft Planner building-progress reconciliation now
uses the claim-filtered `building_state` rows from that same committed regional
generation.

Captured: 2026-07-29
Claim: `1369094286777412590`
Derived region: `19`

The relationship findings below came from bounded, read-only observations
using Relay's documented `v1.json.spacetimedb` diagnostic protocol. Production
ingestion does not use that protocol: the global catalog path now uses official
generated TypeScript bindings and the SpacetimeDB 2.7.0 SDK.

## Typed global subscription proof

The pinned generated global bindings compiled with the application and
completed a live SDK subscription against the topology-discovered source:

| Field | Observed value |
|---|---|
| URI | `wss://relay.bitcraftsync.app:3000` |
| Database | `relay-mirror-bc-global` |
| Schema fingerprint | `cebd889939799c6317f12d86799a4ac38dde43dad265ff92ab7e03f6c8cb4f49` |
| Normalized items | 8,167 |
| Normalized cargo | 636 |
| Crafting recipes | 7,747 |
| Construction recipes | 829 |
| Buildings | 1,084 |
| Skills | 20 |
| Resources | 616 |
| Equipment descriptions | 2,166 |
| Buff descriptions | 271 |
| Claim technologies | 146 |

The subscription is restricted to the ten required global description tables.
All 21,682 normalized rows are copied atomically into the provider-neutral
catalog repository; React and SQLite never receive the generated wire rows
directly. Insert, update, and delete listeners trigger a new numbered catalog
generation.

Live rows also established that negative `tier` values are non-tiered
sentinels. Values `-1` and `-2` were observed and normalize to `null`; real
non-negative tiers remain integers.

Binding generation currently uses the pinned official CLI's undocumented
`--module-def` bridge because the 2.7.0 public CLI has no documented
remote-schema codegen command. The bridge, CLI commit, fingerprints, and one
generator repair are recorded in
`apps/bitcraft-local/src/server/game-data/bindings/README.md`. A schema
fingerprint change stops ingestion and requires regeneration rather than
silently decoding with stale bindings.

## Precision warning

The v1 JSON protocol emits 64-bit entity IDs as JSON numbers. A normal
`JSON.parse` rounded values such as the configured claim ID. Exact identifiers
were retained only from raw diagnostic row strings when a follow-up equality
query was necessary.

This proves that v1 JSON must not feed normalized state or SQLite history.
Production IDs remain decimal strings and the typed SDK/binding path is
mandatory.

## Claim-scoped regional rows

A single filtered initial subscription in region 19 returned:

| Table | Rows | Finding |
|---|---:|---|
| `claim_state` | 1 | Exact claim filter works. |
| `claim_member_state` | 18 | Claim roster is directly filterable. |
| `building_state` | 196 | Layout parents can be claim-filtered before location subscriptions. |
| `marketplace_state` | 1 | The market building joins directly to the claim. |
| `bank_state` | 1 | The Town Bank building joins directly to the claim. |
| `sell_order_state` | 33 | Current settlement sell listings are claim-filterable. |
| `buy_order_state` | 0 | No current rows were present during this observation. |
| `claim_recruitment_state` | 1 | Recruitment is directly claim-filterable. |
| `empire_settlement_state` | 1 | Settlement-to-empire membership is directly claim-filterable. |

## Typed primary-region player subscription proof

The generated regional bindings and SpacetimeDB 2.7.0 SDK completed a live
subscription against the topology-discovered region-19 source. The session
issued one equality-filtered `player_state` query per current claim member; it
did not subscribe to the whole regional table.

| Field | Observed value |
|---|---|
| Database | `relay-mirror-bc19` |
| Schema fingerprint | `762aeaa1449c53d5f400d72bb82f71a049997d34e28c6844ce8f3899d1cb6312` |
| Claim members | 18 |
| Regional player rows | 18 |
| Signed-in members at observation | 2 |
| Normalization warnings | 0 |

An end-to-end worker run on 2026-08-01 against a fresh temporary SQLite
database, with scheduled jobs and browser activity disabled, published fresh
joined `claim`, `members`, `citizens`, `inventories`, `crafts`, and `deposits`
generations from the Relay cache. It independently published authoritative
`players`, `equipment`, `construction`, `research`, `recruitment`, and Town
Bank generations from `region:19`, plus global `catalogs`, `skills`, and
`region`, all within the bounded startup window. Dashboard, Members,
Professions, and Leaderboard therefore do not depend on a scheduled
acquisition job or an open browser. Route tests separately prove `503` before
any requested domain has loaded and a `200` stale envelope with age and cause
when last-good data exists.

## Claim craft cache proof

The ready Relay HTTP cache was queried for the configured claim using both
bounded current-state filters:

| Route | Rows observed | Finding |
|---|---:|---|
| `/claim/1369094286777412590/crafts?completed=false` | 77 | Current progressive and processing passive crafts are returned together. |
| `/claim/1369094286777412590/crafts?completed=true` | 559 | Ready-to-collect passive crafts and completed progressive crafts are returned together. |

Rows carried exact craft, building, claim, owner, recipe, and output identities
plus the joined building and owner names. The HTTP rows do not label a recipe
as passive; that distinction is joined locally from the typed global
`crafting_recipe_desc.is_passive` field. The provider therefore fetches both
current-state filters, deduplicates by exact craft entity ID, and the local
projection separates:

- incomplete non-passive recipes into active Production cards;
- passive recipes into `processing` or `complete` rows from the explicit
  `completed` flag;
- completed non-passive recipes out of the current Production view.

This replaces the Production page's claim/member BitJita craft fan-out and its
per-member passive-craft helper. Contributor amounts remain excluded because
the separate contributor mapping is not proven.

The same committed claim generation now supplies Craft Planner. The planner
classifies rows from the typed recipe catalog, counts every unfinished
ordinary craft in the monitored claim, and counts completed ordinary or
active/completed passive crafts only for configured tracked players. This
preserves the legacy source-selection behavior without issuing one claim
request plus ordinary/passive requests for every selected member. Missing
recipe descriptions remain explicitly unresolved and are not guessed as
ordinary or passive. Planner result reuse is keyed to the current members,
inventories, crafts, construction, and catalog generations, so any committed
source change invalidates the result immediately; the remaining
calculation-only fallback TTL is five seconds.

## Town Bank inventory

The observed `bank_state.building_entity_id` was used in a second bounded
subscription:

```sql
SELECT * FROM inventory_state WHERE owner_entity_id = <bank building id>
```

It returned 25 inventory rows. Each row also carried
`player_owner_entity_id`, proving the ownership join needed to distinguish
personal Town Bank inventories. Querying `inventory_state.entity_id` with the
bank building ID returned no rows; `owner_entity_id` is the required edge.

The primary-region typed session now performs this as a two-stage bounded
subscription. It first follows only `bank_state` rows for the monitored claim,
then opens equality-filtered `inventory_state.owner_entity_id` subscriptions
for the discovered Town Bank building IDs. A complete bank generation is
normalized into the generic `inventory-banks` last-good domain and composed
with Relay HTTP shared storage only at the provider-neutral Inventory route.
The shared-storage generation remains independently useful while the regional
session reconnects, and a missing bank generation is surfaced as partial
rather than silently presented as complete.

The 2026-08-01 live verifier applied the current `bitcraft-live-19` schema and
observed 25 personal Town Bank inventories containing 863 occupied stacks,
with exact building/player ownership, all 18 monitored member player rows,
and zero normalization warnings. Item and Cargo identities remain distinct.
Town Bank changes invalidate the public `inventories` generation immediately;
open pages do not wait for an HTTP refresh or scheduled job.

No Town Bank, player-bank, crawl, or refresh-ledger SQL table was added.
`domain_payload_current` remains the sole durable last-good boundary. Selected
member inventory and housing continue to use the bounded 15-second
provider-neutral Relay HTTP service, which already exposes claim-bank
categories for Craft Planner source selection.

## Equipment and buffs

For one member ID obtained from Relay HTTP:

- `equipment_state.entity_id = player_entity_id` returned one current equipment
  row;
- `equipment_preset_state.player_entity_id = player_entity_id` returned two
  preset rows with an explicit `active` flag;
- `active_buff_state.entity_id = player_entity_id` returned one active-buff
  row.

The rows use generated algebraic encodings for optional equipment stacks and
buff values. They must be decoded by generated bindings, then enriched from
global equipment and buff descriptions.

The primary-region runtime now subscribes to these four member-filtered tables
with one bounded predicate per table: `player_state`, `equipment_state`,
`equipment_preset_state`, and `active_buff_state`. A fresh live verification on
2026-07-29 loaded all 18 monitored members and atomically published the
`players` and `equipment` domains. Zero-valued inactive buff slots are omitted.
The remaining `OnlineTimestamp` values are preserved as exact source counters
with no calendar date because live rows prove the field is not consistently a
Unix timestamp.

The Relay's bounded `GET /player/:playerId/inventory` route returns named
inventory categories including `toolbelt`, `pockets`, `wallet`, `wagon`, and
claim-bank inventories. Item and Cargo identities remain separate even when
their numeric IDs collide. The application now requests this route only for
the selected monitored member, enriches regular Toolbelt items from typed
global `item_desc` and `tool_desc` rows, and exposes them through
`/api/local/player-data`. Concurrent requests coalesce and successful results
remain in process memory for 15 seconds; no player-inventory SQL table or
scheduled fan-out job was added.

The same selected-member boundary now exposes
`GET /player/:playerId/housing`. A live Timbersteel member sample returned one
house plus four named storage buildings with exact Item identities. Housing
has an independent 15-second memory last-good entry, so opening a profile does
not wait for a scheduled job or create a housing table.

Member quests come from filtered regional `traveler_task_state` rows joined to
typed `traveler_task_desc` rows in the already-connected primary-region
session. The 2026-07-30 live verifier applied 432 task rows for the 18
Timbersteel members, including four completed rows, with no normalization or
description-join warnings. The previous Market Collections request had no
rendered consumer and was removed; no replacement cache or table was created.

## Craft contributors

Focused live observation on 2026-08-01 proved the regional transaction mapping
for craft `1369094287428103662`:

- three `progressive_action_state` transactions increased `progress` by exactly
  `24`;
- each current row carried owner entity `576460752388321942`;
- the independently observed accumulated contribution identified that same
  entity as Mosswick and matched the craft's accumulated progress;
- preparation-only updates had a zero delta and are not contributions;
- subscription initial-state inserts use `SubscribeApplied` and must establish
  a baseline rather than append history.

The primary regional session now subscribes only to current monitored-claim
craft IDs. A positive `Transaction` progress delta is attributed to the current
row owner and appended immediately with the transaction ID, region, craft ID,
exact progress delta, and catalog metadata. Initial apply, zero/negative deltas,
unknown crafts, and non-transaction callbacks fail closed. Durable event
receipts deduplicate replays before the event-driven contribution aggregate is
incremented.

## Global versus regional completeness

### Active-region scope and population

The generated global binding exposes three small authoritative control tables:
`region_population_info` (`region_id`, signed-in players, queued players),
`region_control_info` (initialization and player/spawn admission), and
`world_region_name_state` (player-facing names). They are subscribed together
and published as the normalized `region` generation. Regional database
readiness remains topology-owned and is joined from persisted provider source
health at the local route.

The app deliberately returns only the monitored claim region, configured
default region, and admin overrides. A browser `include` query is compatibility
input only and cannot authorize a new cross-region scope. This replaces the
legacy interpretation of every BitJita-listed region as automatically
queryable.

The global session is supervised independently of the Relay HTTP provider.
Disconnects and startup failures retain the last complete `region` generation,
rediscover topology, and retry on the required jittered
1/2/4/8/16/30-second schedule. A throttled operational heartbeat lets the web
process distinguish a live worker subscription from stale last-good state
without adding a region feature cache. Claim changes restart the provider and
all claim-owned regional runtimes; those old runtimes are fenced before the
new provider is attempted, including when that new provider cannot start.
Connecting global sessions receive a bounded 30-second initial-apply grace,
while explicit disconnect/error states retry immediately through the backoff
supervisor. Browser last-good preservation is keyed to the same claim and
configured-region scope.

The same claim-scoped query set was applied to the global and region-19
mirrors:

| Table | Region 19 | Global |
|---|---:|---:|
| `claim_state` | 1 | 1 |
| `sell_order_state` | 33 | 0 |
| `buy_order_state` | 0 | 0 |
| `empire_settlement_state` | 1 | 1 |

Global is therefore not a complete current market source. Market ingestion must
use regional sessions. The one matching empire-settlement row is useful but
does not prove global completeness for empire nodes, siege, watchtowers, or
membership; those remain subject to regional comparison.

## Typed settlement market subscription proof

The generated regional bindings completed the staged Local Market subscription
against the topology-discovered region-19 source on 2026-07-30:

| Field | Observed value |
|---|---|
| Claim | `1369094286777412590` |
| Database | `relay-mirror-bc19` |
| Schema fingerprint | `762aeaa1449c53d5f400d72bb82f71a049997d34e28c6844ce8f3899d1cb6312` |
| Sell orders | 33 |
| Buy orders | 0 |
| Marketplace rows | 1 |
| Normalization warnings | 0 |

The first stage contains only exact `claim_entity_id` filters for sell orders,
buy orders, and marketplace state. The second stage derives current owner IDs
and subscribes to bounded equality filters in `player_username_state`. Item and
Cargo identities are projected through separate local catalog keys. No
cross-claim row is allowed to commit.

This claim-scoped current state is stored only as the generic `market`
last-good domain and is consumed by Local Market and Dashboard. The duplicate
`market_listings` table has been retired; transition history and notifications
consume consecutive committed generations asynchronously.

Cross-region buy-order acquisition now follows the same typed pattern through
bounded configured-region sessions and publishes a combined
`regional-market` last-good generation. `market_buy_orders_current` and
`market_regional_sale_averages_current` are retired. The latter is deliberately
not replaced: the observed close state does not distinguish a completed sale
from a cancelled listing, so premium-opportunity scoring stays unavailable
until an authoritative same-region sale signal is proven. Region snapshots
retain independent receive times; capped non-primary sessions rotate on a
provider-owned loop, disconnected sockets retry with bounded jittered backoff,
and selected-region API freshness becomes stale when its own observation is
old or its live session is disconnected.

## Hexite deposit HTTP semantics

The Region 19 Relay deposit route was sampled again on 2026-07-30. It returned
10 exact-identity rows. Five rows supplied a future `respawn_at`; the other
five omitted it. Of those without a respawn time, one explicitly reported
`status: "unknown"` and four omitted status entirely.

Only an explicit `status: "active"` is therefore treated as active. A future
`respawn_at` is normalized as `respawning`; missing or unrecognized state is
`unknown`. Even after a recorded respawn time passes, the UI reports
`Respawn overdue` and waits for Relay confirmation instead of assuming the
deposit is harvestable.

The domain refreshes on the 15-second Relay HTTP loop and manual refresh uses
the same single-flight provider coordination. Current rows live only in
`domain_payload_current`; there is no deposit-specific SQL table or scheduled
ingestion job.

## Global recipe and probability projection

The global schema exposes all inputs previously downloaded or crawled on a
schedule:

- `crafting_recipe_desc`;
- `extraction_recipe_desc`;
- `item_list_desc`;
- `resource_desc`;
- `building_type_desc`, `skill_desc`, `item_desc`, and `cargo_desc` for joins.

A live verification on 2026-07-30 loaded 7,747 crafting recipes, 552
extraction recipes, 2,428 item lists, 616 resources, and 72 building types.
The complete provider generation projected into disposable SQLite as 8,170
usable recipe rows, 2,428 item lists, 616 resources, and 4,161 lowest-effort
planner weights in 474.08 ms. `PRAGMA quick_check` returned `ok`.

Catalog identities, descriptions, normalized recipes, probability rows,
effort weights, and source generation now commit in one SQLite transaction.
A malformed generation rolls all of those writes back and preserves the last
good generation. Relay extraction `probability` values are non-negative
occurrence rates and live rows include values greater than one; they must not
be clamped to a percentage.

`tool_desc.id` and `tool_desc.item_id` have different roles. Live data contains
multiple tool rows for one item, so the description table retains the tool-row
ID and records `itemId` separately. Toolbelt enrichment resolves the strongest
matching row by item ID. Keying tool descriptions directly by item ID would
silently collapse valid rows.

## Public craft regional join proof

A bounded 2026-07-30 region-19 diagnostic observed 551 rows in
`public_progressive_action_state`. Exact equality subscriptions proved this
join chain:

1. public marker `entity_id` to `progressive_action_state.entity_id`;
2. marker `building_entity_id` to `building_state.entity_id`;
3. building `claim_entity_id` to `claim_state.entity_id`;
4. marker/craft `owner_entity_id` to `player_username_state.entity_id`;
5. craft-building ID to `location_state.entity_id`;
6. claim `owner_building_entity_id` to the settlement location row.

The claim entity ID itself had no location row in the bounded sample, so the
implementation does not use it as a location key. The long-lived base
subscription now uses indexed two-table joins from the naturally bounded
public-marker table into craft details, buildings, nicknames, and exact
workstation locations. Only referenced owner and claim IDs use staged,
chunked equality subscriptions. It never subscribes to all `location_state`.
The settlement-totem location is optional enrichment and does not delay the
usable generation; Public Craft Finder maps to it when present and otherwise
uses the exact workstation location.

Each complete regional join is normalized with exact decimal-string IDs,
staged as one numbered generation, and merged into the generic
`public-crafts` last-good domain. Marker/detail building or owner mismatches
reject the candidate generation. Missing optional labels or locations retain
the usable row with partial warnings.

Public Craft Finder consumes that local domain and global catalog projection
directly. It does not fetch from the browser, wait for a scheduled job, or own
a dedicated SQL cache table. Large total and remaining action counts stay
exact through `BigInt` calculation and formatting.

The production typed-session verifier is
`apps/bitcraft-local/scripts/verify-relay-public-crafts-live.mjs`. Its
2026-08-01 run applied generation 1 from `bitcraft-live-19` with schema
fingerprint
`762aeaa1449c53d5f400d72bb82f71a049997d34e28c6844ce8f3899d1cb6312`
and returned 560 usable public craft rows. The remaining warnings were
optional owner labels absent from `player_username_state`; they did not remove
crafts or invent names. The SDK also logged several upstream cache-update
inconsistencies for rapidly changing `progressive_action_state` rows, but the
indexed base generation still applied and later changes remain live. Marker
churn during staged enrichment now queues one coherent follow-up generation
instead of unsubscribing a generation while the SDK is applying it.

## Regional claim rankings — 2026-08-01

The regional database itself is the bounded source for `claim_state`,
`claim_local_state`, and `building_claim_desc`. Claim identity joins on
`entity_id`; current treasury, supplies, tile count, location, and building
description identity come from the matching local-state row. That
`building_description_id` joins `building_claim_desc.building_id` for tier
metadata.

Owner display names are the only unbounded secondary relation. The session
collects the exact `owner_player_entity_id` values present in the regional
claim rows and subscribes to `player_username_state` with indexed point
subscriptions for those IDs only. Live measurements found that Relay left
OR-combined username predicates unapplied even with only ten IDs, while 121
single-ID subscriptions applied the complete 1,115-claim projection in
seconds. It never opens an unfiltered username or location subscription.

The join is staged as a numbered `region-claims` generation and is published
only after its required subscriptions validate. Insert, update, delete,
reconnect, and region changes rebuild the complete projection; last-good data
remains available during failure. The Region page composes this current
generation with global region metadata without a scheduled ingestion job or
ranking-specific SQL table.

The read-only reconnect verifier
`apps/bitcraft-local/scripts/verify-relay-region-reconnect-live.mjs`
published the initial region-19 generation, injected one simulated socket
failure, then published a replacement generation through a second real
session. It observed exactly two sessions, one reconnect, 1,115 claims before
and after recovery, and repository generations 1 through 4 without
cross-claim or cross-region leakage. Intentional session shutdown is now
silent, so replacing a connection cannot schedule a second spurious
reconnect.

The legacy trade-volume values were scheduled BitJita aggregates, not fields
present in these authoritative current rows. Their cards and payloads are
retired rather than relabelled. They can return only after a completed-trade
signal is proven.

## Empire global-versus-regional completeness — 2026-07-30

The read-only production verifier
`apps/bitcraft-local/scripts/verify-relay-empire-completeness-live.mjs`
compared every current region-19 primary key with an exact equality
subscription against the global mirror. It used generated SDK bindings and
topology discovery; it did not implement a wire codec or hard-code database
names.

At the observation time, all 221 `empire_state`, 10,778
`empire_player_data_state`, 2,200 `empire_rank_state`, 602
`empire_settlement_state`, 555 `empire_node_state`, and 21
`empire_node_siege_state` rows matched the global mirror. However, the global
mirror returned only 37,630 of the region's 37,631 `empire_chunk_state` rows;
chunk `113241` was missing.

That single missing live row is enough to reject the global mirror as the
authority for complete empire/watchtower coverage. Empire current state must
come from configured regional sessions. The primary region remains connected;
other configured regions use the bounded adaptive session pool. Global rows
may assist diagnostics, but they cannot silently fill or replace a regional
generation.

The observed keys also establish the current join direction:

- `empire_settlement_state` links an empire to its claim and settlement
  building;
- `empire_node_state` owns node/watchtower energy, active state, upkeep, and
  location;
- `empire_chunk_state.watchtower_entity_id` assigns covered chunks to a node;
- `empire_node_siege_state.building_entity_id` identifies the sieged building,
  while its `empire_entity_id` must not be labelled as attacker or defender
  until that role is proven from an authoritative transition.

Current rows belong in the provider's atomic last-good `empires` generation,
not feature-specific SQL cache tables. Durable membership periods,
notifications, and future locally observed siege transitions remain valid
history/event data.

The implemented runtime uses `world_region_state` as the spatial authority for
each session and validates that its region index matches the configured region
before accepting rows. Settlement and node IDs derived inside those bounds
drive bounded exact subscriptions for related claim members, chunks, and
sieges. Because the Empire, player-data, and rank rows observed above are
replicated, only the continuously connected primary region subscribes to and
publishes that identity graph. Secondary sessions publish local operational
rows and join them to the primary identities in the combined generation.

Each region keeps its own receive time, warnings, and last error. A route is
fresh only when both the requested region and the primary identity source are
fresh; failure in an unrelated configured region does not stale a healthy
view. Configuration reconciliation commits a scope fence that removes retired
regions before opening new sessions, and browser routes authorize from current
configuration rather than trusting persisted `activeRegionIds`. Complete
primary generations feed the existing membership-period repository
immediately, so no scheduled Empire membership acquisition job remains.

## Empire Hexite live-first ownership

The legacy reserve implementation was a six-hour BitJita crawl backed by
`empire_hexite_sweeps`, `empire_hexite_sweep_empires`,
`empire_hexite_targets`, `empire_hexite_sources`, and
`empire_hexite_snapshots`. Inspection proved that `targets` was sweep-owned
work state rather than user configuration, while `snapshots` overwrote one
current row per Empire rather than preserving append-only history. None of the
five tables therefore has independent ownership after the crawl is removed.

They are retired together with the scheduled job. Each complete typed Empire
generation already contains the exact treasury amount, so the local Empire
views now publish that value immediately as a known minimum. Missing player
and claim inventories, ready Capsules, and completed Foundry output are
reported as unavailable and are never coerced to zero.

The regional `inventory_state` schema exposes owner fields and inventory
pockets, but complete bounded joins across all Empire players and aligned
claims are not yet proven. Full reserve parity therefore remains blocked on a
filtered regional inventory diagnostic. The live treasury slice is useful
immediately without hiding that limitation or recreating a scheduled crawl.

## Remaining diagnostic blockers

- attacker/defender meaning and completion semantics for empire siege rows;
- bounded multi-region player/claim inventory and Foundry joins for complete
  Hexite reserve aggregation.

## Claim-market completed-sale evidence — 2026-08-01

The regional `closed_listing_state` table is claim-filterable and contains the
owner plus one exact typed item stack. Global catalog evidence proves regular
Item `1` is Hex Coin. A live Timbersteel Trade fixture then showed:

- a closed Hex Coin stack of quantity `10` for Jingle;
- the corresponding completed sell order had sold `10` units at one Hex Coin
  each; and
- non-Hex-Coin closed rows contained returned listing inventory.

The claim-market session now subscribes to closed listings in the same atomic
generation as active buy/sell orders. A newly observed Hex Coin row confirms a
sale only when its exact proceeds uniquely match one same-owner sell-order
quantity transition. A returned row confirms a non-sale only when owner,
typed item identity, and quantity uniquely match. Ambiguous evidence remains
`removed_or_cancelled`; disappearance alone never becomes a sale.

Confirmed rows append immediately and idempotently to `market_events`,
`market_trades`, activity history, and the Discord outbox after current-state
publication. The scheduled completed-sale reconciler, member-history crawl,
resume state, admin control, and BitJita market calls are removed. Market
amount columns use TEXT affinity so Relay decimal strings remain exact.

## Relay topology and schema drift — 2026-07-31

The public Relay health contract changed from the earlier mirror-oriented
shape. Live sources now report `connectivity`, `connected_since`, `database`,
`port`, `schema_cached`, `tables_live`, and `tables_total`; they no longer
publish `metrics.publisher.fingerprint`. Database identities are currently
`bitcraft-live-global` and `bitcraft-live-{region}`.

Topology discovery now accepts a source as ready only when it is live, has a
cached schema, and reports every expected table live. When health does not
publish a fingerprint, discovery downloads that source's public SpacetimeDB
V9 schema from the discovered port and database and hashes the exact response
with SHA-256. Downloads are bounded, retried once for transient failures, and
single-flighted while in progress. Successful fingerprints remain reusable for
45 seconds, keyed by source URL, connection generation, and live-table counts,
so provider and runtime checks in the same observation window do not repeatedly
download all schemas. The cache expires within the 60-second topology cadence,
and a changed source generation bypasses it immediately. Individual typed
runtimes request only their global or primary-regional fingerprint; the
provider health pass can still verify every ready source. Failure to retrieve
a schema leaves the topology row ready but its fingerprint unavailable, so
the typed session cannot start and last-good data remains authoritative.

All thirteen observed regional schemas remained byte-identical at fingerprint
`762aeaa1449c53d5f400d72bb82f71a049997d34e28c6844ce8f3899d1cb6312`.
The global schema changed to
`5e44626f1c24e9f8392ebce8bdc9de135f76a58747b208d5e4aa455dd411036a`.
The first live verification correctly stopped on that mismatch. The global
bindings were then regenerated from the captured live module definition with
the pinned official SpacetimeDB CLI `2.7.0`; the resulting 697-file binding
set has the same public generated model as the previous set. The manifest now
records the live database identities and current fingerprints.

The rebuilt 2026-08-01 live checks then proved:

- the global catalog session applied 8,167 items, 636 cargo descriptions, and
  every required catalog family from `bitcraft-live-global`;
- the primary region session applied all 18 monitored members, 18 player
  rows, 432 traveler tasks, equipment/buffs, construction, research, and
  recruitment from `bitcraft-live-19` with no warnings;
- the production worker published fresh Relay-owned HTTP, global, and
  primary-region domains into a fresh database; and
- persisted provider health retained the exact discovered global and regional
  fingerprints instead of overwriting them with null values.

The HTTP provider retains one Relay client across those refreshes so its
failure window and circuit breaker cannot be reset by topology discovery.
Healthy global-catalog and primary-region runtimes also compare their active
database, WebSocket port, and fingerprint with freshly discovered topology
every 60 seconds. A changed source stops and replaces the affected session;
an incompatible fingerprint then fails closed at the generated-binding gate
while durable last-good data remains readable. Primary-region reconciliation
is single-flight, so simultaneous scheduled and manual refresh requests cannot
open competing replacement sessions.

This incident validates the fail-closed generation rule: health-contract
drift can be adapted without hard-coded database names, while schema drift
still requires regenerated bindings and a deployment before ingestion
resumes. The rebuilt global, primary-region, and combined provider apply gates
now pass against the public Relay; reconnect and soak drills remain separate
release gates.

## Deal Watch live-order baseline

Deal Watch no longer depends on the BitJita regional claim crawl or price
history endpoint. Its available authoritative input is the current typed
regional sell-order generation. For each exact `(region, itemType, itemId)`
key, the app calculates the median unit price from active listings and requires
the configured minimum sample count. A listing is an opportunity only when its
exact decimal-string price is below the configured percentage threshold.

This is deliberately named `current-sell-median`, not a sale average. Alert
evidence records the generation observation time, sample count, exact median,
and exact listing values. Even-sized samples retain an exact half-unit median
instead of rounding toward a false threshold. The existing watch and alert tables remain because
they own user configuration, deduplication, acknowledgement, and delivery
history; no current market data is copied into a Deal Watch-specific table.
Per-region `receivedAt` is checked against the regional-market stale budget,
so an expired last-good order book can still render with stale labelling but
cannot create a new notification.

Deal Watch region choices and server-side watch validation read only the
configured local `regional-market` scope. They do not call the legacy active
region endpoint or its BitJita-backed status helpers.

The runtime callback and unit/integration fixtures prove event-driven
evaluation and zero price-history requests. A fresh production-session apply
proof remains pending because region 19 readiness continued to flap during the
2026-07-30 verifier attempts; last-good behavior remains the safe fallback.
