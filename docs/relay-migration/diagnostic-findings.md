# Relay diagnostic findings

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
`project_site_state WHERE owner_id = <configured claim id>`, preserve project
and material IDs as decimal strings, and build required/contributed material
rows from the global catalog at the provider-neutral local route. No dedicated
construction SQL table or scheduled construction ingestion job is justified.

The legacy construction collector was retired on 2026-07-30. It had no
independent construction event/history or notification store to preserve; it
only refreshed current BitJita project state and could overwrite the Relay
provider's canonical `domain_payload_current` row. Dashboard fallback and
background compositions now use the same catalog-enriched Relay projection as
the provider-neutral page. The temporary legacy building-count fetch remains
owned by the claim collector until the layout/building vertical replaces it.

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

An end-to-end worker run against a fresh temporary SQLite database also stored
`citizens` from Relay HTTP, `players` from `region:19`, and `skills` from the
global typed subscription as independent generation-safe current domains.
Dashboard, Members, Professions, and Leaderboard now compose those local
domains without using their legacy BitJita page routes.

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

## Craft contributors

One active Relay HTTP craft was queried by its exact craft entity ID:

- `progressive_action_state.entity_id` returned the matching craft state;
- `contribution_state.enemy_entity_id` returned no rows;
- `contribution_state.entity_id` returned no rows.

The `contribution_state` schema is combat-shaped
(`player_entity_id`, `enemy_entity_id`, `contribution`) and is not evidence for
craft contributors. Contributor parity remains blocked; no mapping should be
invented.

## Global versus regional completeness

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

## Remaining diagnostic blockers

- authoritative evidence distinguishing a completed sale from removal or
  cancellation;
- craft contributor identity and amounts;
- complete global-versus-regional empire comparison;
- bounded claim-location joins for every required layout entity class;
- multi-region Hexite reserve aggregation.
