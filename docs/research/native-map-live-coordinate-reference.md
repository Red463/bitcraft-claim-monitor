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
