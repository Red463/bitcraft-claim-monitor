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
- Palette version: `1`.
- Output: 1,157 WebP tiles and 2,115,562 encoded bytes.
- Observed at `2026-08-11T16:29:00.509Z`; atomically installed at `2026-08-11T16:32:10.172Z` (189,663 ms).
- A representative request, `/api/local/map/tiles/terrain/0/107/-86.webp`, returned `200 image/webp`; visual inspection showed semantic green land, lakes/rivers, and ocean water.
- The initial encoder effort exceeded the measured 600-second safety deadline and correctly left no partial pointer. WebP effort `1` completed the same semantic render within the deadline. This is an encoding-speed tradeoff only; the palette, coordinates, source cells, and response contract are unchanged.
- Identical render content is fingerprinted and skipped. If render-relevant terrain changes while a build is running, only the newest pending complete generation is retained for the next atomic build.

Production collection remains worker-owned and HTTP/tile reads remain web-owned. The smoke launcher defaults to the combined preview role so it can create a first bundle locally; set `BITCRAFT_SMOKE_PROCESS_ROLE=web` after a bundle is installed to inspect the last-good map without local collection competing with browser requests.

## Enemy identity mapping

`enemy_state.enemy_type` is the generated tagged `EnemyType` enum. Its ordinal matches `enemy_desc.id`: `PracticeDummy -> 1`, `DeerMale -> 8`, and `CrystalizedHexiteCrab -> 43`. Schema fingerprint validation protects this mapping; an unknown tag makes the affected row unavailable rather than inventing an ID.

## Required live acceptance still pending

At the end of this capture window, Relay accepted HTTP topology/catalog requests but new regional WebSocket sessions remained at `connected:false` without an application or schema error. The control claim-market verifier failed identically, so this was not isolated to map SQL.

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
4. Resource `54` joins `resource_state.entity_id` to `location_state.entity_id`, stays within region/world bounds, and remains under the configured row/response budgets.
5. Selected enemy types join the decoded tagged enum to `mobile_entity_state` and deletion removes their features.
6. Empire chunk rows align with an independently verified polygon transform; until then, territory remains unavailable.
7. Warm snapshots remain below 500 ms, 50,000 features, and 8 MiB uncompressed JSON.

The provider implementation now avoids the dense per-entity resource fan-out: selected resources and `location_state` are materialized with an indexed two-table subscription join. Enemy mobile subscriptions are derived only from locally selected enemy identities and split into batches of at most 100 entity IDs; player queries use the same limit. Normalization rejects missing/non-overworld dimensions and coordinates outside the verified `0..38400` world bounds (mobile fixed-point `0..38400000`).

Production deliberately keeps the combined `map-spatial` collector cold until the pending fixtures pass. Player, resource, enemy, bank, and waystone layers return explicit unavailable warnings rather than inferred coordinates. The two latest 120-second resource probes remained at `connected:false` / `stage:"idle"`, so they did not validate or reject the new indexed join. A schema mismatch or unverified source must remain unavailable and retain only independently verified last-good data.

## First-party renderer and BitCraftMap parity target

In this project, **native** means an app-owned renderer and same-origin API. It does not require a platform-native UI toolkit, and it does not permit the browser to contact BitCraftMap, Prism, BitJita, or a third-party tile host.

The current public BitCraftMap application was inspected on 2026-08-11. Its visible layer inventory is the parity target, not the older GitHub application's `23040 x 23040` image map:

- Terrain and game basemaps, including visible land and water.
- Events, wonders, hexite deposits, Maker's Trees, temples, ruined cities, traveler camps, volcanic geysers, hermit crab dens, shipwrecks, uncharted ruins, and silkmoth breeding grounds.
- Banks, markets, waystones, grids, dungeons, territories, watchtowers, claims by tier, caves by tier, roads, and custom waypoints.
- User-selected resources, enemies, and players.

The maintained app currently implements claims, markets, banks, waystones, empire settlements, watchtowers, selected players/resources/enemies, and custom focus/waypoints. A zero count means Relay returned no usable feature for that requested region/generation; it must not be presented as proof that the feature does not exist globally. On the map, a bank is a `bank_state` world marker. Settlement/player bank inventories are a separate operational feature and are not map geometry.

### Basemap ownership boundary

The current BitCraftMap browser uses `38400 x 38400` raster tiles, but no redistribution grant for those current tile assets was located. The old BSD-2-Clause GitHub repository contains a stale `23040 x 23040` map and is not projection-compatible with the current world. Consequently:

- Browsers request terrain only from `/api/local/map/tiles/terrain/{z}/{x}/{y}.webp`.
- The Relay worker builds versioned bundles under `data/map-tiles/versions/` and atomically switches `data/map-tiles/current.json`; the web process reads only the selected last-good version. Negative Y names are valid.
- Missing local tiles return `404` and leave the coordinate grid visible. The public status distinguishes `building`, unavailable, live, and stale last-good states without exposing filesystem paths or coordinates from private layers.
- Do not copy, hotlink, or redistribute current Prism/BitCraftMap tiles until their owner grants documented permission.
- The durable first-party alternative is now verified: a bounded Relay `terrain_chunk_state` collector can feed the app-owned tile generator using the accepted fixture above.

### Remaining parity data work

| Parity group | Current source/status | Required work |
| --- | --- | --- |
| Terrain/game/water | Relay layout, renderer, atomic store, worker runtime, same-origin API, and Leaflet layer verified | Extend live bundle acceptance to each configured active region and benchmark multi-region update frequency |
| Banks/waystones | Regional `bank_state` / `waystone_state` | Validate live counts and known locations in every enabled region |
| Markets | Existing `marketplace_state` projection | Generalize beyond the monitored claim if parity requires all regional markets |
| Claims/watchtowers/settlements | Existing Relay projections | Add tier/icon controls and verify every active region |
| Resources/enemies/players | Bounded live sessions | Complete the pending live coordinate/deletion acceptance above |
| Roads | No active projection | Verify `paved_tile_state` coordinate decoding and build a bounded/vector or raster layer |
| Caves and world POIs | No active projection | Identify authoritative Relay tables/knowledge visibility, normalize, and fixture-test each kind |
| Territory/grids/dungeons | Partial bindings only | Verify chunk/tile transforms and dimension semantics before rendering |
