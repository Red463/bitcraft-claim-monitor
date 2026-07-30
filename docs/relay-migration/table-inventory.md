# Relay migration SQL table inventory

This is the authoritative ownership and retirement inventory required by the
[live-first data policy](./live-first-data-policy.md). It is updated as each
vertical domain moves from BitJita to Relay.

Disposition values:

- `keep-current`: materialized or derived current state needed for indexed
  local reads, process sharing, atomic generations, or last-good recovery;
- `keep-history`: locally observed event/history data Relay cannot recreate;
- `keep-user`: user-owned configuration, identity, privacy, or moderation data;
- `keep-operations`: health, delivery, security, or maintenance data;
- `retire`: legacy ingestion/cache state with a proven replacement;
- `review`: ownership changes later in the migration and deletion is not yet
  safe.

| Tables | Disposition | Owner and update trigger | Migration decision |
|---|---|---|---|
| `domain_payload_current` | keep-current | Current-state repository; atomic provider generation | Canonical last-good boundary for normalized domains. Inventory uses this table and adds no inventory-specific cache table; Craft Planner reads the same committed member and settlement-inventory generations directly. |
| `provider_source_health`, `provider_subscription_health` | keep-operations | Relay provider/runtime health events | Required for separate worker/web visibility, schema health, lag, and reconnect diagnostics. |
| `game_catalog_entities`, `game_catalog_source_state`, `game_catalog_descriptions` | keep-current | Global typed subscription generation | Durable normalized Relay catalog and exact item/cargo enrichment source. Craft Calculator and Craft Plan target search query this continuously updated local index directly. Craft Planner workstation presets join building descriptions, construction recipes, and exact item/cargo identities here without an upstream page-load request or workstation cache table. This projection is retained for measured indexed joins, worker/web process sharing, and immediate restart recovery—not to reproduce a BitJita cache. |
| `game_catalog_recipes`, `game_catalog_recipe_inputs`, `game_catalog_recipe_outputs`, `game_catalog_recipe_sources`, `game_catalog_recipe_output_components` | keep-current | Global typed subscription generation | Indexed Craft Planner and item-detail read model. Crafting and extraction rows now replace atomically in the same live generation as catalog descriptions. |
| `game_catalog_item_list_outputs`, `game_catalog_item_lists`, `game_catalog_item_list_possibilities`, `game_catalog_item_list_possibility_outputs`, `game_catalog_resources`, `game_catalog_resource_completion_outputs` | keep-current | Global typed subscription generation | Required for exact probabilistic output and gathering calculations; now replaced atomically from live item-list/resource descriptions without an external download. |
| `game_catalog_probability_snapshot`, `game_catalog_probability_sources`, `game_catalog_effort_weights` | keep-current | Global subscription generation plus immediate catalog-derived calculation | Compact planner projections with measured benefit. A full live generation currently applies in about 474 ms in disposable SQLite; no scheduled freshness owner is justified. |
| `recipe_catalog_entries` | retire | None | Removed from bootstrap and existing clone databases. `/api/local/recipe-detail` now composes the provider-neutral detail response directly from the continuously projected `game_catalog_*` catalog. |
| `game_catalog_refresh_runs`, `game_catalog_refresh_targets` | retire | None | Removed with the catalog crawl job, admin route, UI controls, recovery queue, repository methods, and prepared statements. Subscription generation/source health now owns catalog ingestion and restart recovery. |
| `settlement_state_current` | review | Settlement notification/activity derivation | Merge or retain as a narrow derived-current projection only if it has independent indexed or transition semantics beyond `domain_payload_current`. |
| `market_listings` | retire | None | Removed from bootstrap and existing clone databases. Current Local Market, Dashboard, and leaderboard listing state is projected directly from the latest complete generic `market` generation. Listing transitions are derived from consecutive Relay generations and appended independently to history; they do not justify a duplicate current-state table. |
| `market_buy_orders_current`, `market_regional_sale_averages_current` | retire | None | Removed from bootstrap and existing clone databases. Configured regional sessions merge exact buy-order generations into the generic `regional-market` last-good domain, and the local view filters, sorts, pages, and enriches that committed generation without a second SQL mirror. Regional sale averages are not retained because Relay has not yet proved an authoritative sold-versus-cancelled signal; the app returns no premium opportunity instead of persisting an invented baseline. |
| `market_events`, `market_trades` | keep-history | Normalized listing/trade transitions | Required for locally observed charts, sold-versus-removed evidence, deduplication, and notification history. They are not current order-book storage. |
| `global_market_price_snapshots` | retire | None | Removed with the legacy `global_market_insights` scheduled job and cached overview setting. Market Browse, Overview, and Deals compose current orders directly from the committed `regional-market` generation plus the live catalog. Future truthful price history belongs in durable observed trade/event history after an authoritative close signal is proven, not in a scheduled current-price mirror. |
| `activity_events` | keep-history | Normalized domain transitions; Relay storage-log events arrive from the 15-second live loop and deduplicate by region plus upstream log ID | Required for the Activity page and notification/audit history. Relay storage logs expire upstream, so this is durable history rather than a current-data cache. |
| `production_jobs`, `production_contributions` | keep-history | Craft lifecycle and proven contribution events | Required for lifecycle notifications and locally observed contribution history. Current craft state stays in normalized domains. |
| `empire_hexite_sweeps`, `empire_hexite_sweep_empires`, `empire_hexite_sources` | review | Legacy multi-region sweep orchestration | Replace scheduled current-state acquisition with the adaptive region-session pool. Retain only rows that prove durable diagnostic or reconciliation value. |
| `empire_hexite_targets` | keep-user | Admin-configured active-region/empire targets | User-owned configuration for bounded cross-region work. |
| `empire_hexite_snapshots` | keep-history | Locally observed reserve history | Preserve progressive history after current data becomes subscription-driven. |
| `empire_membership_tracking`, `empire_membership_periods` | keep-history | Normalized empire membership transitions | Required for locally observed membership periods and analytics. |
| `scheduled_jobs` | keep-operations | Maintenance/reporting/reconciliation scheduler | Keep the registry, but remove retired ingestion job keys and controls. Current user-facing data must remain live with ingestion jobs disabled. |
| `server_metric_buckets`, `server_health_incidents` | keep-operations | Runtime metric/health events | Required for soak evidence, lag/budget alerts, and operational diagnosis. |
| `admin_users`, `admin_sessions`, `user_accounts`, `user_sessions`, `user_legal_acceptances` | keep-user | Authenticated local requests and privacy workflows | User-owned identity/session/legal data; independent of game-data provider. |
| `app_settings`, `app_secrets` | keep-user | Authenticated admin configuration | Application configuration and secrets; independent of game-data provider. |
| `craft_plan_settings` | keep-user | Authenticated plan edits | Saved plan targets, sources, and overrides. |
| `craft_plan_progress_audit_snapshots`, `craft_plan_progress_audit_events`, `craft_plan_progress_audit_state` | keep-history | Normalized planner state transitions | Required for progress audit and restart continuity. |
| Selected-player inventory and housing state | no table | Bounded Relay entity-detail service; request with 15-second memory last-good | Members, Craft Planner, and its admin manager share the provider-neutral player-data service. Inventory and housing load only for a selected monitored member. No SQL current/cache table or scheduled refresh job is justified. |
| Browser page-navigation state | no table | In-memory last-rendered snapshot plus immediate provider-neutral local re-read | Migrated pages reuse visible data only to avoid a blank transition; the browser snapshot never suppresses a current-generation read and does not justify SQL persistence. |
| Barter stalls and current trade orders | no dedicated table | Bounded typed regional session plus generic `regional-market` generation | The adaptive regional market connection stages exact joins from the naturally bounded stall set into trade orders, buildings, nicknames, locations, claims, and owners. `/api/local/market/stalls` filters, pages, and catalog-enriches the committed generation on demand. No BitJita response cache, stall diagnostic setting, or scheduled ingestion job remains. |
| Activity member-filter roster | no table | Current Relay `members` domain passed through `AppShell` | The Activity page shares the normal live member generation and no longer performs or persists a separate roster fetch. |
| Craft Calculator and Sync opening state | no table | Their focused local/browser-owned services | Neither page consumes the central settlement payload, so opening them starts no legacy claim/member request and requires no replacement current table. |
| Public Craft Finder current jobs and monitored-settlement context | no dedicated table | Typed bounded regional sessions plus current Relay `claim` domain | The adaptive pool follows `public_progressive_action_state` markers through exact craft/building/claim/player/location subscriptions and commits one generic `public-crafts` generation to `domain_payload_current`. Global catalog rows enrich it at read time. There is no public-craft cache, pagination, refresh-run, or scheduled-ingestion table. |
| Adaptive regional connection state | no table | In-memory `AdaptiveRegionSessionPool` leases, health, hard cap, stagger, and idle sweep | Connection orchestration is ephemeral process state. Durable normalized generations remain in `domain_payload_current`; no session, lease, queue, or pagination table is justified. |
| Active-region population/control/name state | no dedicated table | Small typed global subscription plus generic `region` generation and persisted provider topology/subscription health | `/api/local/regions/active` composes the configured monitored/default/admin scope immediately from `region_population_info`, `region_control_info`, `world_region_name_state`, and operational health. Region-only events publish only this small domain and never rewrite the catalog projection. A throttled `provider_subscription_health` heartbeat exists only for worker/web visibility and reconnect diagnosis; it is not a data cache. The independently supervised subscription allows a bounded initial-apply grace, then reconnects with bounded jitter and fresh topology discovery. Claim changes fence every old claim-owned runtime before the new provider attempt. Arbitrary browser `include` values do not widen the configured scope, and browser last-good rows are keyed to the exact claim/scope. The BitJita calls and five-minute process cache are retired; no scheduled region ingestion or feature cache table is justified. |
| `market_deal_watches` | keep-user | Authenticated deal-watch edits | User-owned alert configuration. Every committed `regional-market` generation evaluates enabled watches immediately; the scheduled job is reconciliation only. The fresh clone stores the last exact baseline as text. |
| `market_deal_alerts` | keep-history | Live regional-order evaluation | Alert deduplication, acknowledgement, Discord delivery, and the exact baseline/listing evidence shown to the user. Exact quantity, price, total, and baseline projections use text affinity and the normalized evidence remains in `raw_json`. This is durable notification history, not a current-order cache. |
| Deal Watch current listings/baselines | no table | Current `regional-market` generation evaluated in process | The current regional sell-order median is calculated directly from exact typed live orders. No price-history crawl, scheduled baseline materialization, or Deal Watch current-state SQL mirror remains. |
| `admin_audit_log`, `admin_login_events` | keep-operations | Auth/admin security events | Security and accountability history. |
| `analytics_events` | keep-operations | Consent-gated local analytics | First-party operational/product analytics with existing retention. |
| `visitor_security_events`, `geoip_ranges`, `visitor_geoip_cache` | keep-operations | Visitor security and bounded GeoIP import/cache | Security subsystem; independent of game-data provider. |
| `discord_delivery_log`, `discord_notification_outbox`, `discord_craft_plan_report_occurrences` | keep-operations | Domain events, outbox claims, and delivery results | Required for record mode, deduplication, retries, and safe live delivery. |
| `discord_youtube_channels`, `discord_youtube_videos`, `discord_craft_watches` | keep-user | Authenticated Discord configuration and monitor observations | User-owned bot configuration and deduplicated monitor state. |
| `discord_mod_cases`, `discord_warnings`, `discord_mod_notes`, `discord_custom_commands`, `discord_component_votes`, `discord_component_messages`, `discord_temp_bans` | keep-user | Authenticated Discord moderation/community actions | Independent Discord feature state; not a game-data cache. |

## Default for remaining live domains

The remaining operational verticals begin with no dedicated current-state SQL
table. Their latest complete state belongs in the provider's in-memory
generation plus `domain_payload_current` for durable last-good recovery.

| Domain | Default SQL decision | Live update path |
|---|---|---|
| Construction | No dedicated table | Claim-filtered regional subscription; recipe/building enrichment from the continuously maintained global catalog |
| Research and recruitment | No dedicated table | Claim-filtered regional subscriptions with incremental catalog joins |
| Equipment, buffs, and player state | No dedicated table | Member-filtered regional subscriptions |
| Claim layout and current locations | No dedicated table | Bounded claim/entity-filtered regional subscriptions |
| Current empire, watchtower, and siege state | No dedicated table | Global rows where proven complete; otherwise bounded adaptive regional sessions |
| Current Hexite deposit state | No dedicated table | Bounded Relay HTTP snapshot on the 15-second live loop with durable last-good recovery in `domain_payload_current` |
| Current market orders and listings | No raw mirror table by default | Order subscriptions and incremental transition handling |
| Current cross-region public crafts | No dedicated table | Bounded typed regional subscriptions through the adaptive session pool; normalized combined generation in `domain_payload_current` |

An implementation may retain or add a compact derived-current index only after
recording measured query cost, row count, indexes, restart cost, all readers
and writers, and the user-visible latency improvement. Its update trigger must
be a committed domain event, not a scheduled ingestion sweep.

## Inventory vertical evidence

- Browser source: `InventoryPage.tsx` contacts only provider-neutral local
  routes.
- Current state: `domain_payload_current` owns the Relay inventory generation.
- Enrichment: only stack keys present in the requested snapshot are resolved
  from `game_catalog_entities`.
- Item and cargo identities are separate (`items:<id>` and `cargo:<id>`).
- Quantities remain decimal strings and are summed/formatted with `BigInt`.
- Item detail is composed locally from `game_catalog_descriptions`; it does not
  fetch a BitJita detail route.
- No SQL table was added for the Inventory cutover.
- Town Bank and player-bank parity remain incomplete and block marking the
  whole inventory domain ready for soak.

## Settlement market current-state evidence

- A claim-scoped typed regional session continuously subscribes to
  `sell_order_state`, `buy_order_state`, and `marketplace_state`.
- Owner names are loaded in a second staged subscription containing equality
  filters only for owner IDs present in the current order generation.
- The live 2026-07-30 verifier returned 33 sell orders, zero buy orders, one
  marketplace, and zero warnings for Timbersteel Trade.
- Every row is checked against the configured claim and derived region before
  the generic `market` generation commits.
- Item and Cargo identities remain distinct and catalog enrichment happens
  locally.
- Local Market and Dashboard read this generic generation immediately; no
  market-specific current-state table or scheduled acquisition job was added.
- `market_listings` has been removed from schema bootstrap, prepared
  statements, admin inspection, scheduled collectors, runtime readers, and
  runtime writers.
- Consecutive Relay generations produce idempotent `new_listing`,
  `partial_quantity_drop`, and `removed_or_cancelled` events. The first
  generation is a baseline and does not emit notification spam.
- Event/history/outbox persistence is queued after the current generation
  commits. A persistence failure is reported through provider health but does
  not hold back or roll back live page data.
- Configured regional market sessions subscribe to `buy_order_state` and
  `sell_order_state`, derive bounded claim and owner equality joins, and merge
  independently complete regions into the generic `regional-market`
  generation.
- The regional buy-order view and Market Browse order books perform
  exact-decimal filtering, sorting, paging, and catalog enrichment directly
  over that generation. Market catalog search uses the continuously maintained
  `game_catalog_entities` index and joins current order counts in memory. No
  measured query cost justified another SQL current-state projection.
- `/api/local/market/catalog` and `/api/local/market/order-book` enforce the
  configured claim and active-region scope and return per-region
  freshness/last-good state combined with global catalog health. Catalog
  candidates are filtered by live order availability before the response
  limit is applied. `/api/local/market/price-history` returns an
  explicit unavailable coverage state until an authoritative Relay trade
  signal is proven; disappearing orders are not labelled as completed sales.
- `/api/local/market/overview` and `/api/local/market/deals` derive current
  liquidity, active-order hubs, open-order activity, and arbitrage directly
  from the same committed generation. Their browser views invalidate on
  `regional-market` and `catalogs` generation commits and preserve exact
  decimal strings through sorting and display. Deal-region selection is
  enforced before the bounded server projection, stale last-good responses
  retain their age/cause, and summary potential reports the best individual
  route rather than adding overlapping order capacity.
- Movers, completed volume, trade activity, and distance/map actions remain
  explicitly unavailable until authoritative trade and bounded location joins
  are proven. Current order state is not relabelled as historical activity.
- The provider-neutral generation event stream invalidates an open Market
  Browse view immediately after commit, with a 750-millisecond local poll only
  as its fallback. Live order reads and optional history reads are independent,
  so history cannot delay or discard the current order book.
- The monitored region stays pinned. Additional configured regions rotate
  within the explicit connection cap on a provider-owned 15-second loop; this
  loop remains active when scheduled ingestion and reconciliation jobs are
  disabled. Each non-primary session remains in the pool until its first
  complete generation applies or a 30-second apply timeout expires.
- Disconnected sessions reconnect with 1/2/4/8/16/30-second jittered backoff.
  Failed claim/owner detail subscriptions clear their in-progress state and
  retry without replacing the last-good generation.
- Each committed region retains its own receive time. API freshness is derived
  from the selected region's age and live connection health, so a newer
  generation from another region cannot make old data appear fresh.
- Claim, primary-region, and configured active-region changes reconcile the
  runtime without requiring a process restart.
- `market_buy_orders_current` and `market_regional_sale_averages_current` have
  been removed from bootstrap, migrations, collectors, runtime reads/writes,
  and integration fixtures.
- `global_market_price_snapshots`, the `global_market_insights` scheduler key,
  and `global_market_overview_json` cache setting have been removed from fresh
  schema/runtime ownership and are deleted idempotently from existing clone
  databases.
- Opportunity scoring remains empty until an authoritative same-region sale
  signal is proven. Locally observed but region-ambiguous trades are not used
  to label a removed order as sold.

## Active/passive craft vertical evidence

- `domain_payload_current` owns the exact Relay craft snapshot; no craft-page
  cache table was added.
- The provider reads the claim-scoped incomplete and completed Relay filters in
  one refresh generation and deduplicates exact craft IDs.
- `game_catalog_descriptions` supplies passive classification, requirements,
  experience, and recipe/output metadata from the typed global subscription.
  The page projection performs indexed lookups only for recipe IDs present in
  the current snapshot; it does not scan or copy the full recipe catalog.
- The Production page no longer calls `/api/bitjita`,
  `/api/local/production/crafts`, or `/api/local/passive-crafts`.
- Craft Planner reads the same committed claim craft generation. It performs
  passive classification and configured tracked-player selection locally, so
  it makes no claim/member craft request fan-out and adds no planner craft
  cache table. Its process-memory calculation cache is generation-keyed and
  falls back to a five-second TTL, so a committed source change is visible on
  the next planner read without a scheduled rebuild.
- Craft Calculator and Craft Plan target search read the live-maintained
  `game_catalog_entities` index. Recipe trees compose direct and probabilistic
  item-list producer routes from the current normalized generation on demand;
  there is no search cache, recipe-detail cache, or scheduled rebuild.
- `production_jobs` and `production_contributions` remain history/event tables
  for lifecycle and notification semantics; they are not the current page's
  source of truth.
- Craft contributor parity and member Toolbelt eligibility remain explicitly
  unavailable until their regional subscription mappings are delivered.

## Member equipment and buff subscription evidence

- Professions and Leaderboard read the committed citizen/player generation
  directly through provider-neutral skill projections; no leaderboard or
  profession cache table exists.
- Current equipment, preset, and active-buff rows share
  `domain_payload_current` with the other provider domains.
- No equipment, preset, buff, or page cache table was added.
- Member-filtered player, equipment, preset, buff, and traveler-task
  subscriptions push changes immediately and swap `players` plus `equipment`
  in one repository generation. Traveler task descriptions are joined in that
  live regional session.
- Global equipment/buff descriptions remain in the existing indexed catalog
  read model. Toolbelt inventory and housing use one guarded provider-neutral
  selected-member request with separate 15-second memory last-good entries.
- The unused Market Collections request and the legacy Housing and Traveler
  Tasks browser calls are retired. No member-detail SQL table or scheduled
  refresh job was added.

## Construction vertical evidence

- `project_site_state.owner_id` was proven live to be the claim entity ID; the
  subscription is filtered to the configured monitored claim.
- Regional project stacks are normalized as exact contributed quantities and
  joined to authoritative global construction-recipe requirements.
- The Construction page is provider-neutral and combines the committed project
  generation with the existing live inventory generation.
- Global recipe, building, item, and cargo rows are resolved only for the
  projects/materials in the response.
- Claim-owned `building_state` rows publish in the same regional generation
  and drive Craft Planner workstation progress without another table or
  page-load fetch.
- `domain_payload_current` is the durable last-good boundary. No Relay
  construction table, refresh ledger, pagination state, or scheduled ingestion
  job was added.
- The legacy construction collector setting and BitJita writer were removed.
  Server fallback/background compositions now read the same normalized Relay
  projection. No independent construction notification/history rows existed
  to retain or migrate.
- Craft Planner no longer owns a legacy claim-buildings fetch. The later
  layout vertical may enrich these same filtered building rows with bounded
  location data; it must not add duplicate current-state ownership.

## Research vertical evidence

- `claim_tech_state.entity_id` was proven live to be the claim entity ID; the
  regional subscription is filtered to the configured monitored claim.
- Learned, current, available, and locked states are derived immediately from
  the claim state and global `claim_tech_desc.requirements`.
- The browser Research page reads only `/api/local/game-data`; the route joins
  the live regional generation to the continuously maintained global catalog.
- `domain_payload_current` remains the durable last-good boundary. No Relay
  research table, refresh ledger, or scheduled research ingestion job was
  added.
- The legacy scheduled Research collector was removed so it cannot overwrite a
  newer Relay generation. Dashboard aggregates and Craft Planner tier presets
  now compose from the same committed Relay state and local global catalog.

## Recruitment vertical evidence

- `claim_recruitment_state.claim_entity_id` was proven live to be the owning
  claim ID; the regional subscription is filtered to the configured claim.
- Posting, claim, stock, skill, and level identities remain decimal strings.
  Skill display identity is joined from the live global catalog.
- Members requests the provider-neutral Recruitment domain and displays the
  current stock, skill gate, and approval mode.
- The legacy BitJita endpoint and inventory-collector ownership were removed.
- `domain_payload_current` remains the durable last-good boundary. No
  Recruitment table, refresh ledger, or scheduled ingestion job was added.

## Live price lookup vertical evidence

- Market Browse is the browser price-search and order-book surface; the
  unreferenced legacy Price Finder component has been removed.
- Discord `/price` and autocomplete read `domain_payload_current`'s committed
  `regional-market` generation and the existing `game_catalog_entities`
  index.
- Price statistics are derived on request with exact `BigInt` arithmetic.
  Item and Cargo identities remain distinct, including when their numeric IDs
  collide.
- The command reports current orders and explicit freshness only. It does not
  call a completed-sale history endpoint or infer a sale from an order
  disappearing.
- No price-lookup table, cache, refresh ledger, or scheduled acquisition job
  was added. Current freshness remains owned by the adaptive regional session
  pool.

## Map resource catalog vertical evidence

- The typed global subscription includes `resource_desc` and `enemy_desc`.
  Enemy identity remains the exact decimal `enemy_type`, with huntable, tier,
  tag, rarity, and icon metadata normalized before persistence.
- `/api/local/map/catalog` reads the existing
  `game_catalog_descriptions` projection and reports global-catalog freshness.
  It does not contact Relay or another upstream service on a browser request.
- Open Map pages re-read the local catalog when the `catalogs` generation
  changes and preserve the last rendered rows when a local read fails.
- The BitJita-era ten-minute in-process map catalog cache is removed. No
  dedicated resource, creature, map-catalog, refresh-ledger, or scheduled-job
  table was added.
- Claim layout, player locations, and active-region discovery remain separate
  incomplete Map/Region verticals and are not inferred from catalog rows.
