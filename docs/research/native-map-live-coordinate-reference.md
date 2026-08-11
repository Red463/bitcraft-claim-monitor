# Native map live coordinate reference

Observed on 2026-08-11 against Relay region `19` (`bitcraft-live-19`) with regional schema fingerprint `762aeaa1449c53d5f400d72bb82f71a049997d34e28c6844ce8f3899d1cb6312`.

## Verified coordinate contract

- The live overworld dimension is decimal string `"1"`. Dimension `"0"` is not the overworld and must not be used as a fallback.
- Static coordinates retain `{x,z}`. GeoJSON order is `[x,z]`; Leaflet order is `[z,x]`.
- The Leaflet projection preserves X and projects Y as `-z / (2 / sqrt(3))`; its inverse is `z = -projectedY * (2 / sqrt(3))`. Do not scale X by the apothem.
- The world coordinate bounds used by the renderer are `0..38400` on both axes.
- A Relay route region ID is not the same identity as `world_region_state.id`; region `19` currently contains world-region row `12`. Route scope and world-row identity must remain separate fields.
- Empire chunk indices encode `chunkX = chunkIndex % 1000` and `chunkZ = floor(chunkIndex / 1000)`.
- The exact transform from chunk coordinates to map polygons is not verified. Multiplying decoded chunks by `96` does not contain all associated live watchtower points and must not be used for territory rendering.
- UI north/east display coordinates divide map `z/x` by `3`; this conversion is intentionally lossy and must not be used for joins.
- Entity, claim, region, building, chunk, player, and mobile identifiers remain decimal strings. Never coerce them to JavaScript `number`.

## Live fixtures

These fixtures are public game geometry and are intended for regression comparison. Player coordinates are deliberately not recorded.

| Kind | Identity | Region | X | Z | Dimension |
| --- | --- | ---: | ---: | ---: | ---: |
| Claim centre | `1369094286737189255` | 19 | 27361 | 23715 | 1 |
| Timbersteel marketplace | building `1369094286787745059` | 19 | 14734 | 25194 | 1 |
| Empire settlement | building `1369094286737189234` / claim `1369094286737189255` | 19 | 27361 | 23715 | 1 |
| Watchtower | `1369094286736647280` / chunk `285301` | 19 | 28866 | 27390 | 1 |

The captured regional generation contained 150 claim centres, 1 monitored marketplace, 53 empire settlements, and 58 watchtowers. A warm same-origin snapshot containing those layers was 54,067 uncompressed UTF-8 bytes and completed in 329 ms at the local server boundary.

## Verified Relay terrain layout

The accepted public fixture is `apps/bitcraft-local/test/fixtures/terrain-live-layout.json`. It contains no player identity or mobile coordinates.

- Region `19`, overworld dimension `1`: 6,400 chunks and 6,553,600 cells in a complete generation.
- Each chunk contains `32 x 32` cells. A cell spans 3 map units, so each chunk spans 96 map units.
- Arrays are Z-major and increase with world Z (`index = localZ * 32 + localX`). Chunk origin is `(0,0)`.
- Surface ordinals are `0 ground`, `1 lake`, `2 river`, `3 ocean`, `4 ocean-biome`, and `5 swamp`.
- Normalized in-memory array size was 104,857,600 bytes; the accepted capture completed in 4,764 ms.
- The accepted terrain SHA-256 is `0f74f5b02bde838ed59835ac14c207a8f4b47af9b714f1c522235971be045288`; the complete evidence-fixture hash is `14b800392b2f1386c6925cecb1407903ef76533446e1ad8fb469536b019b62e5`.
- Evidence points: inland `(27361,23715)` was ground; open water `(28672,23200)` was ocean-biome; coastline `(27456,23316)` contained both ground and water in its bounded neighbourhood.
- Orientation was independently resolved across 404,480 adjacent-cell pairs. The accepted Z-major/+Z layout had mean original-elevation discontinuity `1.6046` and water-edge mismatch `1.9509%`; the runner-up measured `11.7291` and `11.7615%` respectively.

The land/water evidence was selected against the current public terrain rendering only as a visual reference. No third-party tile is committed, served, or required at runtime.

## Installed first-party terrain bundle

The live smoke acceptance on 2026-08-11 installed a complete region `19` bundle through the same storage and HTTP seam used in production:

- Bounds: map X/Z `23040..30720`, overworld dimension `1`.
- Zooms: `-5..0`, including legitimate negative tile-Y filenames and requests.
- Palette version: `3`.
- Output: 2,314 WebP tiles and 4,674,916 encoded bytes: aligned, independently toggleable `terrain` and `water` channels at every tile coordinate.
- Observed at `2026-08-11T21:45:44.893Z`; atomically installed at `2026-08-11T21:50:00.254Z` after approximately 269 seconds of live collection and encoding.
- Representative negative-zoom and zoom-zero requests returned `200 image/webp`. Browser inspection showed olive land, deep navy ocean, inland water, stronger shorelines/relief, and deterministic fine cell texture.
- The initial encoder effort exceeded the measured 600-second safety deadline and correctly left no partial pointer. WebP effort `1` completed the same semantic render within the deadline. This is an encoding-speed tradeoff only; the palette, coordinates, source cells, and response contract are unchanged.
- Identical render content is fingerprinted and skipped. If render-relevant terrain changes while a build is running, only the newest pending complete generation is retained for the next atomic build.

Production collection remains worker-owned and HTTP/tile reads remain web-owned. The smoke launcher defaults to the combined preview role so it can create a first bundle locally; set `BITCRAFT_SMOKE_PROCESS_ROLE=web` after a bundle is installed to inspect the last-good map without local collection competing with browser requests.

## Performance and visual acceptance

The completed palette-v2 smoke acceptance used `http://127.0.0.1:18449/?page=map&label=Zephra&x=27361&z=23715&regionId=19` at a `1146 x 912` browser viewport. No player coordinates were recorded.

- The resource finder rendered 80 of 658 initial matches. `Show more` rendered 160, searching for the beyond-first-batch `Key Pedestal` returned four matching catalog entries, and clearing the search reset the window to 80.
- Leaflet owned two `.native-map-dense-canvas` elements and one shared ordinary overlay canvas. The page had 23 canvases total because coordinate/terrain grid tiles are canvases; it did not create one canvas per ordinary feature.
- The accepted snapshot rendered 113 low-volume app-owned markers, including the same-origin Hexcoin purse market icon. Waystones were unavailable in this generation, so no coordinate-gated live marker was invented. The configured same-origin Waystone Crystal fallback returned `200 image/webp` (1,620 bytes) and was visually inspected in the smoke browser as a recognizable blue crystal; registry and presentation tests cover its marker wiring.
- The native map rendered no `.map-frame` iframe and loaded no remote image inside `.native-map-shell`. The six unrelated `about:blank` frames belong to the existing Featurebase shell integration, not map rendering.
- Browser console errors: 0. Page width was 1,146 CSS pixels with a matching 1,146-pixel scroll width, so the desktop page introduced no horizontal overflow. The shared ordinary canvas rendered 151 claims and the browser exposed all 151 through the bounded keyboard-readable canvas-point alternative.
- Warm same-origin operational snapshot: 54,119 uncompressed bytes, HTTP `200`, 34.1 ms at the server boundary.
- Stable web-role process measured between 96.8 and 131.7 MiB working set in the original acceptance and 97.6 MiB after the palette-v3 bundle was installed. The palette-v3 combined collector peaked around 1.56 GiB while collecting and encoding. Production and normal visual smoke keep collector and web roles separate.
- Final full suite after the layer-control acceptance fixes: 1,995 tests, 1,993 passed, 2 skipped, 0 failed, 163 seconds at the command boundary. The final production build is verified separately after commit.
- Palette-v3 status after installation: generation `1`, 2,314 tiles, 4,674,916 bytes. The optimized renderer produces both channels from one pixel scan and uses a bounded eight-entry promise cache; focused renderer/store/runtime tests pass. Leaflet supports viewer zoom `-6..5`; zoom `-6` scales the pre-generated `-5` overview down so the complete world fits beside the operational sidebar without another stored tile level.
- Claim tiers `1..10` use the supplied first-party badge assets with a hexagonal CSS crop that removes the source square background. The live viewport showed isolated Roman-numeral badges without square backplates.
- Terrain and water are permanent basemap channels rather than optional overlays. The Layers control now exposes claims, claim areas, roads, watchtowers, players, resources, and enemies. Markets, waystones, and empire settlements are not independently tracked on this map.

The native map was also browser-smoked at an explicit `390 x 844` phone viewport. The controls stacked into the narrow layout, the map remained present below the finder, the layer panel remained usable at phone width, and no native map iframe appeared. The temporary viewport override was reset to the user's desktop size afterward. Final palette-v3 boundary inspection found 32 same-origin Leaflet tile images, zero remote images inside `.native-map-shell`, and zero map-owned iframes.

Real browser traffic also exposed and now regression-tests an atomic-store race: last-good tile reads used to prune the active `.staging-*` bundle. The store now protects only the current staging directory, allowing palette-v2 installation while readers continue receiving the previous complete bundle.

## Pre-generated world and road overlays

The current app follows BitCraftMap's static-artifact model instead of collecting and rendering the basemap on browser demand. Terrain and water are built per ready region at overview zooms `-5..-2`, then served as one layered world bundle with detailed tiles taking precedence where available. The accepted 13-region artifact covers the verified `0..38400` world bounds, contains 4,758 tiles across the combined detail and overview stores, and occupies 10,914,120 bytes. Region batches are processed one at a time to bound collector memory; the completed run peaked at approximately 1.48 GiB while the web process remained near 100 MiB.

Terrain has no automatic live rebuild by default. `build-relay-terrain-overview.mjs` uses a seven-day minimum-age gate, can be forced explicitly with `BITCRAFT_FORCE_TERRAIN_OVERVIEW=true`, and the continuous terrain collector remains disabled unless `ENABLE_RELAY_TERRAIN_LIVE_REBUILD=true` is deliberately set. This makes a scheduled weekly maintenance build—or an immediate build after a known world update—the intended production behavior.

Road verification in configured region `19` proved the indexed join `paved_tile_state.entity_id = location_state.entity_id` in overworld dimension `1`. The captured complete generation contained 597,426 paving points with X `23390..30166` and Z `23375..30325`; its normalized raw representation was approximately 69.3 MB, which is unsuitable for a browser snapshot. The pre-generated raster road bundle reduces this to 549 WebP tiles and 382,698 bytes. Road generation is independent of terrain and has a 24-hour minimum-age gate by default, so an operator can schedule it daily or less often without refreshing the terrain artifact. `BITCRAFT_FORCE_ROAD_TILES=true` bypasses the gate for a deliberate rebuild.

## Enemy identity mapping

`enemy_state.enemy_type` is the generated tagged `EnemyType` enum. Its ordinal matches `enemy_desc.id`: `PracticeDummy -> 1`, `DeerMale -> 8`, and `CrystalizedHexiteCrab -> 43`. Schema fingerprint validation protects this mapping; an unknown tag makes the affected row unavailable rather than inventing an ID.

## Required live acceptance still pending

### Regional Relay health evidence

At the end of this capture window, Relay region `19` advertised `ready:true` and the expected schema fingerprint, and its TLS/WebSocket handshake completed, but it delivered no identity or subscription messages within 120 seconds. A bounded HTTP SQL request to the same regional database also returned no bytes within 20 seconds. The existing claim-market control timed out identically, so this is an upstream region-19 availability fault rather than evidence against the map queries. In the same session, the global socket delivered identity in about 360 ms and region `12` delivered identity in about 332 ms. Treat topology readiness as advisory: an affected layer remains unavailable until its session produces a complete generation.

### Region 12 resource fixture

The bounded resource verifier completed successfully against healthy Relay region `12`, schema fingerprint `762aeaa1449c53d5f400d72bb82f71a049997d34e28c6844ce8f3899d1cb6312`, with selected resource type `54`:

- Session completion: 468 ms on the captured run and 514 ms on an immediate repeat. This verifier starts timing after topology discovery and includes WebSocket startup, so it is not the server-boundary warm-snapshot benchmark; the configured-region API check remains pending.
- Normalized JSON: 248,563 uncompressed bytes.
- Features: 1,553 resources; zero requested players, enemies, or waystones.
- Bounds: X `11371..15232`, Z `15631..19879`, dimension `1`.
- Public fixtures: entity `864691128455284226` at `(13973,15784)`, entity `864691128455284353` at `(13978,15787)`, and entity `864691128455339589` at `(13898,15933)`.

The first two fixtures were independently compared with BitCraftMap's selected type-54 layer. At zoom `2`, the second marker appeared approximately 20 pixels east and 12 pixels north of a waypoint placed at the first coordinate, exactly matching the `(+5,+3)` map-coordinate delta at four pixels per map unit. This confirms static `{x,z}`, GeoJSON `[x,z]`, and Leaflet `[z,x]` for the resource/location join. The current BitCraftMap rejects the obsolete `roadsLayer` and `towersLayer` names in custom waypoint metadata. The legacy URL helper now omits those invalid names so `external` mode remains operable during rollback; this is an intentional compatibility exception to the otherwise unchanged external-renderer rollout contract and is not part of the coordinate evidence.

Region `12` is not in this installation's configured active-region scope. A later bounded verification on 2026-08-11 completed successfully in configured region `19` with the same schema fingerprint and selected resource type `54`:

- Session completion: 362 ms after topology discovery.
- Normalized JSON: 147,728 uncompressed bytes.
- Features: 916 resources; zero requested players, enemies, or waystones.
- Bounds: X `23462..25507`, Z `23794..28081`, dimension `1`.
- Public fixtures: entity `1369094286721380391` at `(24695,24067)`, entity `1369094286721433375` at `(24667,24077)`, and entity `1369094286721489149` at `(24638,24108)`.

This configured-region generation authorizes the bounded resource/location collector. It does not authorize player, enemy, or waystone coordinates, which remain independently disabled.

Before changing the renderer default or enabling exact player positions, rerun:

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
$env:BITCRAFT_MAP_RESOURCE_IDS='54'
$env:BITCRAFT_MAP_PLAYER_IDS='<currently-online-monitored-player-id>'
node apps/bitcraft-local/scripts/verify-relay-map-spatial-live.mjs
```

Acceptance requires a complete generation proving:

1. The selected player ID directly matches a `mobile_entity_state.entity_id` row.
2. Dividing live mobile `location_x/location_z` by `1000` agrees with the player's independently known in-game or trusted map position.
3. The mobile row uses dimension `1` and disappears from the public snapshot on logout, exclusion, disconnect, or deselection.
4. Resource `54` joins `resource_state.entity_id` to `location_state.entity_id`, stays within region/world bounds, and remains under the configured row/response budgets for a configured active region. Regions `12` and configured region `19` have passed this query/projection check.
5. Selected enemy types join the decoded tagged enum to `mobile_entity_state` and deletion removes their features.
6. Empire chunk rows align with an independently verified polygon transform; until then, territory remains unavailable.
7. Warm snapshots remain below 500 ms, 50,000 features, and 8 MiB uncompressed JSON.

The provider implementation now avoids the dense per-entity resource fan-out: selected resources and `location_state` are materialized with an indexed two-table subscription join. Enemy mobile subscriptions are derived only from locally selected enemy identities and split into batches of at most 100 entity IDs; player queries use the same limit. Normalization rejects missing/non-overworld dimensions and coordinates outside the verified `0..38400` world bounds (mobile fixed-point `0..38400000`).

Production starts a bounded `map-spatial` session only when a request contains selected resource IDs. Resources are enabled from the verified join; player, enemy, and waystone layers still return explicit unavailable warnings rather than inferred coordinates. A schema mismatch or unverified source must remain unavailable and retain only independently verified last-good data.

## First-party renderer and BitCraftMap parity target

In this project, **native** means an app-owned renderer and same-origin API. It does not require a platform-native UI toolkit, and it does not permit the browser to contact BitCraftMap, Prism, BitJita, or a third-party tile host.

The current public BitCraftMap application was inspected on 2026-08-11. Its visible layer inventory is a reference for possible parity, not a requirement to track banks and not the older GitHub application's `23040 x 23040` image map:

- Terrain and game basemaps, including visible land and water.
- Events, wonders, hexite deposits, Maker's Trees, temples, ruined cities, traveler camps, volcanic geysers, hermit crab dens, shipwrecks, uncharted ruins, and silkmoth breeding grounds.
- Banks, markets, waystones, grids, dungeons, territories, watchtowers, claims by tier, caves by tier, roads, and custom waypoints.
- User-selected resources, enemies, and players.

The maintained app currently implements claims, markets, waystones, empire settlements, watchtowers, selected players/resources/enemies, and custom focus/waypoints. Bank markers are deliberately outside the app-owned map scope. A zero count means Relay returned no usable feature for that requested region/generation; it must not be presented as proof that the feature does not exist globally.

### Basemap ownership boundary

The current BitCraftMap browser uses `38400 x 38400` raster tiles, but no redistribution grant for those current tile assets was located. The old BSD-2-Clause GitHub repository contains a stale `23040 x 23040` map and is not projection-compatible with the current world. Consequently:

- Browsers request terrain and water only from `/api/local/map/tiles/{terrain|water}/{z}/{x}/{y}.webp`.
- The Relay worker builds versioned bundles under `data/map-tiles/versions/` and atomically switches `data/map-tiles/current.json`; the web process reads only the selected last-good version. Negative Y names are valid.
- Missing local tiles return `404` and leave the coordinate grid visible. The public status distinguishes `building`, unavailable, live, and stale last-good states without exposing filesystem paths or coordinates from private layers.
- Do not copy, hotlink, or redistribute current Prism/BitCraftMap tiles until their owner grants documented permission.
- The durable first-party alternative is now verified: a bounded Relay `terrain_chunk_state` collector can feed the app-owned tile generator using the accepted fixture above.

### Remaining parity data work

| Parity group | Current source/status | Required work |
| --- | --- | --- |
| Terrain/game/water | Relay layout, renderer, atomic store, whole-world overview, same-origin API, and Leaflet layer verified | Rebuild the static artifact on its long maintenance cadence or after a game-world update |
| Waystones | Regional `waystone_state` | Validate live counts and known locations in every enabled region |
| Markets | Existing `marketplace_state` projection | Generalize beyond the monitored claim if parity requires all regional markets |
| Claims/watchtowers/settlements | Existing Relay projections | Add tier/icon controls and verify every active region |
| Resources/enemies/players | Bounded live sessions | Complete the pending live coordinate/deletion acceptance above |
| Roads | Verified `paved_tile_state.entity_id = location_state.entity_id` join and pre-generated same-origin raster overlay | Rebuild independently on its maintenance cadence |
| Caves and world POIs | No active projection | Identify authoritative Relay tables/knowledge visibility, normalize, and fixture-test each kind |
| Territory/grids/dungeons | Partial bindings only | Verify chunk/tile transforms and dimension semantics before rendering |
