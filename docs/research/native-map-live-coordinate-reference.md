# Native map live coordinate reference

Observed on 2026-08-11 against Relay region `19` (`bitcraft-live-19`) with regional schema fingerprint `762aeaa1449c53d5f400d72bb82f71a049997d34e28c6844ce8f3899d1cb6312`.

## Verified coordinate contract

- The live overworld dimension is decimal string `"1"`. Dimension `"0"` is not the overworld and must not be used as a fallback.
- Static coordinates retain `{x,z}`. GeoJSON order is `[x,z]`; Leaflet order is `[z,x]`.
- The Leaflet projection preserves X and projects Y as `-z / (2 / sqrt(3))`; its inverse is `z = -projectedY * (2 / sqrt(3))`. Do not scale X by the apothem.
- The world coordinate bounds used by the renderer are `0..38400` on both axes.
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

Until items 1–3 pass, the server deliberately returns no player coordinates. A schema mismatch or unverified source must remain an unavailable layer and retain only non-player last-good data.

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
- The server reads provisioned files from `data/map-tiles/terrain/<z>/<x>/<y>.webp`; negative Y names are valid.
- Missing local tiles return `404` and leave the coordinate grid visible with an explicit installation warning.
- Do not copy, hotlink, or redistribute current Prism/BitCraftMap tiles until their owner grants documented permission.
- The durable first-party alternative is a bounded Relay `terrain_chunk_state` collector and an offline/self-hosted tile generator. Its biome, elevation, and water-array-to-pixel semantics still require live fixture verification before implementation.

### Remaining parity data work

| Parity group | Current source/status | Required work |
| --- | --- | --- |
| Terrain/game/water | Same-origin tile seam; no tile set provisioned | Obtain a redistribution grant and provision a versioned bundle, or verify and render `terrain_chunk_state` |
| Banks/waystones | Regional `bank_state` / `waystone_state` | Validate live counts and known locations in every enabled region |
| Markets | Existing `marketplace_state` projection | Generalize beyond the monitored claim if parity requires all regional markets |
| Claims/watchtowers/settlements | Existing Relay projections | Add tier/icon controls and verify every active region |
| Resources/enemies/players | Bounded live sessions | Complete the pending live coordinate/deletion acceptance above |
| Roads | No active projection | Verify `paved_tile_state` coordinate decoding and build a bounded/vector or raster layer |
| Caves and world POIs | No active projection | Identify authoritative Relay tables/knowledge visibility, normalize, and fixture-test each kind |
| Territory/grids/dungeons | Partial bindings only | Verify chunk/tile transforms and dimension semantics before rendering |
