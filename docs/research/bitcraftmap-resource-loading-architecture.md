# BitCraftMap resource-loading architecture

Date: 2026-08-12  
Upstream revision reviewed: [`xCausxn/bitcraftmap@c75c600`](https://github.com/xCausxn/bitcraftmap/commit/c75c600746b92c16d676883967485a4c512c9496), current `main` at the time of review

## Executive conclusion

Current BitCraftMap does **not** serve resource positions from pre-generated GeoJSON, vector tiles, raster tiles, a REST resource API, or a periodically regenerated client bundle. Resource positions are live rows delivered directly to the browser through filtered SpacetimeDB subscriptions against `relay.bitjita.com`. The browser SDK cache is the working snapshot; insert/update/delete callbacks trigger a debounced rebuild of the selected resource layer.

Tiles and generated GeoJSON still exist, but for different concerns:

- raster WebP tiles provide terrain/game basemaps and roads;
- generated GeoJSON provides relatively static claims, caves, POIs, grids, towers, and similar overlays;
- the bundled TypeScript resource index provides descriptions/search metadata; and
- live Relay subscriptions provide selected resource, enemy, and player positions.

Claim Monitor's native-map worktree uses the same essential bounded resource join, but puts Relay behind a server-owned provider seam. A request creates or leases a per-selection, per-region server session; normalized complete generations are exposed through same-origin snapshots, while SSE carries generation notifications rather than raw Relay rows. This is the safer fit for Claim Monitor's architecture and should not be replaced by upstream's browser-direct connection.

## What the upstream browser loads

| Concern | Upstream delivery | Format | Live/cadence |
| --- | --- | --- | --- |
| Terrain/game basemap | BitJita exports CDN tile URLs | 256 px WebP raster tiles | Version/cadence not declared in reviewed source |
| Roads | BitJita exports CDN tile URLs | 256 px WebP raster tiles | Version/cadence not declared in reviewed source |
| Claims, caves, POIs, grids, towers | exports CDN or bundled `/assets/*` | GeoJSON | Produced outside the normal resource selection flow; cadence not declared |
| Resource/enemy catalog | checked-in generated TypeScript index | client bundle data | Manual GitHub Actions refresh |
| Selected resource positions | browser connection to regional Relay modules | typed `resource_state` + `location_state` SDK rows | Initial subscription snapshot plus live row changes |
| Selected enemies | browser connection to regional Relay modules | whole `enemy_mob_monitor_state`, filtered client-side | Initial snapshot plus live row changes |
| Selected players | browser connection to every discovered live region | filtered mobile/name/sign-in rows | Initial snapshot plus live row changes |

The current dependencies include the SpacetimeDB browser SDK alongside Leaflet; see the [package manifest](https://github.com/xCausxn/bitcraftmap/blob/c75c600746b92c16d676883967485a4c512c9496/package.json). Runtime configuration contains `relayHost` and `exportsCdn`, not the earlier resource REST/WebSocket endpoints; see [`src/lib/config/api.ts`](https://github.com/xCausxn/bitcraftmap/blob/c75c600746b92c16d676883967485a4c512c9496/src/lib/config/api.ts).

## Resource-position request and filtering flow

### 1. Selection creates a typed layer

`ResourceTracking.trackResource` records the selected resource ID, updates the shareable URL, creates one `ResourceCanvasLayer` for that resource type, and calls `relayTrackResource(resourceId, layer, activeRegions)`. Loading `?resourceId=` repeats the same path for each ID. Region changes call `relaySetRegions`; deselection calls `relayUntrackResource`. See [`resource-tracking.ts`](https://github.com/xCausxn/bitcraftmap/blob/c75c600746b92c16d676883967485a4c512c9496/src/lib/map/resource-tracking.ts).

Resource IDs and enemy IDs remain separate namespaces even where their numbers overlap. That matches Claim Monitor's existing `resource:<id>` / `enemy:<id>` identity boundary.

### 2. The browser lazily opens regional Relay connections

The upstream Relay service creates one light-mode `DbConnection` per wanted `bitcraft-live-{region}` module. A region connection exists only while that region has at least one wanted resource, enemy, or player subscription; when no wants remain, it disconnects and removes the connection. Region discovery makes a one-shot request to `${relayHost}/health`, with a hard-coded live-region fallback if discovery fails. See the architecture comment, region discovery, and connection lifecycle in [`relay-service.ts`](https://github.com/xCausxn/bitcraftmap/blob/c75c600746b92c16d676883967485a4c512c9496/src/lib/services/relay-service.ts).

For one selected resource type, the browser installs two indexed join subscriptions:

```sql
SELECT location_state.*
FROM location_state
JOIN resource_state ON location_state.entity_id = resource_state.entity_id
WHERE resource_state.resource_id = <selected-id>

SELECT resource_state.*
FROM resource_state
JOIN location_state ON resource_state.entity_id = location_state.entity_id
WHERE resource_state.resource_id = <selected-id>
```

One side supplies positions and the other supplies type attribution/lifecycle. Queries are created only for explicitly selected type IDs and regions; there is no default all-resource download. The exact query constructors and wanted-subscription keys are in [`relay-service.ts`](https://github.com/xCausxn/bitcraftmap/blob/c75c600746b92c16d676883967485a4c512c9496/src/lib/services/relay-service.ts#L74-L177).

### 3. SDK cache becomes the current snapshot

Subscription application fills the SpacetimeDB SDK's client cache. Upstream does not convert that initial snapshot into a fetched GeoJSON document. On `SubscriptionApplied`, and after relevant row callbacks, it scans the cached `resource_state` and `location_state` rows for the affected resource/region, joins them by entity ID, and calls `ResourceCanvasLayer.setRegionPoints(region, points)`.

Dirty resource/enemy triples are coalesced using a 300 ms rebuild debounce, preventing the initial insert burst and busy live regions from causing one redraw per wire row. Abnormal connection closure schedules reconnection after five seconds while subscriptions are still wanted; reconnect recreates wanted subscriptions from current selection state. These constants and lifecycle are in [`relay-service.ts`](https://github.com/xCausxn/bitcraftmap/blob/c75c600746b92c16d676883967485a4c512c9496/src/lib/services/relay-service.ts).

There is no durable browser cache or HTTP cache policy for resource positions in the reviewed code. The live SDK cache lasts for the connection/map lifetime. URL state and favourites persist what to track, not the position rows themselves.

### 4. Canvas renders points

Each selected type owns a custom Leaflet canvas layer. `setRegionPoints` stores separate latitude/longitude arrays by region. Redraws are scheduled with `requestAnimationFrame`, cull outside the visible map bounds, reuse buffers and a prebuilt dot sprite, and optionally apply deterministic level-of-detail sampling when the layer has more than 500 points and the map is below zoom -3. Hit testing considers only points drawn into the current screen buffer. See [`resource-canvas-layer.ts`](https://github.com/xCausxn/bitcraftmap/blob/c75c600746b92c16d676883967485a4c512c9496/src/lib/map/resource-canvas-layer.ts).

Resource coordinates from `location_state` are already map small-hex units. They are not stored in map tiles or generated as pixels. Player/mobile coordinates use the same grid multiplied by 1,000 and are scaled in the player marker layer; the current upstream commit explicitly documents that change in [`player-tracking.ts`](https://github.com/xCausxn/bitcraftmap/blob/c75c600746b92c16d676883967485a4c512c9496/src/lib/map/player-tracking.ts).

## Static generation and cadence

Upstream separates catalog generation from position delivery. The checked-in resource/enemy search index is updated by a GitHub Actions workflow that must be started with `workflow_dispatch`; it runs `update-resource-index.ts`, updates the Relay bindings submodule, commits changes, and pushes them. There is no cron in the workflow, so the repository proves only **manual/on-demand** index and binding refresh, not a periodic cadence. See [`update-data.yml`](https://github.com/xCausxn/bitcraftmap/blob/c75c600746b92c16d676883967485a4c512c9496/.github/workflows/update-data.yml).

The map's static GeoJSON generation script and CDN exports are independent from live selected-resource positions. Reviewed repository source does not establish a schedule, TTL, cache header, or automatic generation cadence for those exports. It would be inaccurate to infer one from file commit dates.

Likewise, tile URLs do not contain a generation identifier in the upstream client. Browser/CDN caching behavior is therefore governed externally; no explicit tile response policy is established by this repository's client source.

## Comparison with Claim Monitor's native-map worktree

### Shared core idea

Both implementations avoid an unbounded all-resource query and obtain resource positions with a filtered `resource_state` / `location_state` join keyed by entity ID. Both keep selected resource types and regions explicit, join normalized positions into per-type points, and use a canvas for dense rendering.

### Material differences

| Dimension | Current BitCraftMap | Claim Monitor native map |
| --- | --- | --- |
| Relay connection owner | Browser | Node server |
| Public/browser protocol | SpacetimeDB SDK directly to BitJita Relay | Same-origin HTTP snapshot + SSE generation notifications |
| Session key | Mutable tracked sets inside one browser map instance | Exact normalized claim/region/player/resource/enemy selection key |
| Regional topology | Browser fetches Relay `/health`; opens region modules directly | Server topology discovery; schema fingerprint required before session start |
| Initial state | SDK `SubscriptionApplied` populates client cache | Server waits up to 2 s for leased session snapshot, then returns normalized envelope |
| Updates | Raw row callbacks rebuild client layers | Server row callbacks create complete normalized generations; SSE tells browser to refetch |
| Batching | 300 ms timer before cache-to-layer rebuild | Row bursts coalesce by microtask into one generation; browser snapshot fetches are rate-coalesced to at most one start per 2 s |
| Cache/session reuse | Per-tab SDK cache; destroyed on map teardown | Up to 16 shared exact-scope sessions, reference-counted leases, retained 60 s after last lease |
| Failure behavior | Reconnect after 5 s; layer state is browser-local | Exponential restart up to 30 s, keeps last spatial snapshot, withholds last-known player positions while unhealthy |
| Data contract | Typed Relay rows reach browser map code | Decimal-string IDs and normalized provider-neutral map features reach React |
| Scope limits | Selection-driven, but no equivalent response envelope limits shown | 4 regions, 16 resource IDs, 16 enemy types, 250 players, 50,000 features, 8 MiB response |
| Security/access | Public browser chooses Relay queries | Server validates map access, active regions, monitored/online/non-excluded players, dimensions, bounds and selected IDs |
| Freshness | No provider-neutral freshness envelope | Generation, generated time, age, freshness, confidence, warnings and per-layer availability |

Claim Monitor's bounded subscription construction is in [`mapSpatialProjection.ts`](../../apps/bitcraft-local/src/server/game-data/mapSpatialProjection.ts). Its server session validates the regional schema fingerprint, imposes a 50,000-row default budget, reads typed SDK caches, normalizes complete generations, and serializes enemy-position subscription replacement in [`mapSpatialSession.ts`](../../apps/bitcraft-local/src/server/game-data/mapSpatialSession.ts).

Exact scopes are canonicalized as `claim|region|players|resources|enemies`. [`mapSpatialScopeManager.ts`](../../apps/bitcraft-local/src/server/game-data/mapSpatialScopeManager.ts) shares identical scopes, caps live sessions at 16, waits for first-generation readiness, retains idle scopes for 60 seconds, and restarts failures with exponential backoff. It does not write volatile scoped positions to SQLite.

The routes in [`server.mjs`](../../apps/bitcraft-local/server.mjs) acquire one lease per selected region, wait up to two seconds for the first snapshot, merge normalized spatial rows with other server-owned domains, and release snapshot leases after response. The parallel SSE route keeps the same leases alive, filters generation notifications by the exact spatial scope key, and sends 15-second heartbeats. The browser in [`NativeMap.tsx`](../../apps/bitcraft-local/src/pages/map/NativeMap.tsx) responds to a non-initial generation event by requesting another complete snapshot; [`mapSnapshotLoader.mjs`](../../apps/bitcraft-local/src/pages/map/mapSnapshotLoader.mjs) collapses concurrent requests and enforces a two-second minimum start interval.

The local server also makes semantics that upstream leaves implicit explicit: [`mapSnapshot.mjs`](../../apps/bitcraft-local/src/server/mapSnapshot.mjs) rejects missing/out-of-scope regions, requires selected IDs for dense layers, enforces response budgets, exposes coordinate-system metadata and freshness, and gates player/enemy/resource layers independently on live-verification flags.

### Enemy implementation is notably different

Current BitCraftMap subscribes the regional `enemy_mob_monitor_state` table as a whole because its sum-type enemy field cannot be numerically filtered in subscription SQL, then filters selected variants in the browser. Claim Monitor currently subscribes `enemy_state` when enemy types are requested, maps selected enemy entity IDs, and installs bounded `mobile_entity_state` queries for those entities using replacement-before-unsubscribe behavior. However, the native-map server still has `MAP_ENEMY_IDENTITY_VERIFIED = false`, so enemy position collection and exposure are disabled until live identity semantics are proven. This deliberate gate is safer than claiming upstream parity from generated types alone.

## Cache and lifecycle implications

Claim Monitor's per-selection session design trades extra server state for important properties:

- browsers never learn Relay topology or receive upstream wire records;
- identical requests can share a live scoped cache instead of opening duplicate upstream connections;
- selection changes form a new exact scope, preventing rows from one type selection leaking into another;
- a short idle grace period absorbs UI deselect/reselect and snapshot/SSE handoff churn;
- complete normalized generations preserve joins across update bursts; and
- access policy and response limits are enforced once on the server.

The main cost is potential scope cardinality. Unlike upstream's one mutable connection set per tab, distinct combinations consume distinct server sessions. The existing 16-session cap and 60-second idle eviction are therefore essential. Production telemetry should track scope count, row count, query count, restart attempts, initial readiness time, snapshot bytes, and how often capacity is exhausted. If exact combinations fragment excessively, optimize scope sharing only after measurements; do not merge differently selected types into one publicly visible cache without strict projection filtering.

## Licensing implications

The upstream repository uses the [BSD 2-Clause license](https://github.com/xCausxn/bitcraftmap/blob/c75c600746b92c16d676883967485a4c512c9496/LICENSE). Reusing or adapting its code requires retaining the copyright notice, license conditions, and disclaimer as applicable.

The live resource positions themselves are not bundled source assets in this architecture; they arrive from BitJita's Relay service. BSD licensing of the client code does not grant permission to use that third-party service, republish Relay data, or redistribute BitCraft-derived rasters/icons. Claim Monitor should continue using only its authorized server Relay path and provider-neutral projections.

Basemap tiles, generated map images, icons, and static GeoJSON have separate provenance questions. The upstream README says the map image is generated from BitCraft files; see its [overview](https://github.com/xCausxn/bitcraftmap/blob/c75c600746b92c16d676883967485a4c512c9496/README.md#overview--documentation). Those assets should not be copied merely because repository code is BSD-licensed. Claim Monitor's self-hosted terrain/tile pipeline must retain its own documented source permission and generation provenance.

Generated Relay bindings may also carry their own notices or upstream terms. Treat the bindings as schema interoperability material and retain applicable notices; do not assume the top-level code license resolves service/data rights.

## Recommendation

Keep Claim Monitor's present server-owned per-selection architecture.

Borrow upstream's proven query shape and rendering optimizations where useful, but do not adopt browser-direct Relay subscriptions, its health discovery, or its volatile SDK cache as the application data boundary. The local design is already closer to Claim Monitor's required properties: same-origin access, normalized domain envelopes, exact region/type scope, large-ID safety, schema gating, freshness, response budgets, no cross-selection cache reuse, and withheld sensitive last-known player positions during outages.

Before enabling remaining layers:

1. live-verify and then enable the enemy type/mobile identity mapping;
2. measure exact-scope cardinality and session-cap pressure under multiple users;
3. add health metrics for first snapshot latency, row budget, generation rate, and snapshot size;
4. confirm that resource delete/update bursts never publish a misleading intermediate generation under microtask coalescing; and
5. keep terrain/static asset generation and rights provenance separate from the volatile map-spatial service.
