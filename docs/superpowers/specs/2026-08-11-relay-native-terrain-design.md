# Relay-native terrain design

## Outcome

The app-owned map will show land, water, and biome detail without any browser or server dependency on BitCraftMap, Prism, BitJita, or a third-party tile host. Terrain will be derived from verified BitCraft Relay `terrain_chunk_state` generations and served through the existing same-origin WebP tile route.

The first visual target is an accurate semantic map, not a copy of BitCraftMap's artwork. Land/water classification and world placement must be correct. Styling can improve after the geometry is accepted.

## Evidence gate

No terrain generation is enabled merely because generated bindings exist. A read-only live verifier must capture a bounded regional fixture and prove all of the following:

1. The subscribed regional database returns overworld `terrain_chunk_state` rows with `dimension = 1`.
2. `biomes`, `biome_density`, `elevations`, `water_levels`, `water_body_types`, `zoning_types`, and `original_elevations` have a consistent cell count for every accepted chunk.
3. That cell count is a perfect square and therefore yields one observed side length. The implementation must not hard-code `96`, `64`, or another unverified size.
4. Array index order and chunk origin are established by comparing at least three independently known points: one inland settlement/claim, one coastline, and one open-water point.
5. The resulting world points use the renderer's existing `{x,z}`, GeoJSON `[x,z]`, and Leaflet `[z,x]` contract and remain inside `0..38400`.
6. `water_body_types` values map to the generated `SurfaceType` order only after live samples agree with known land, lake/river, and ocean points.
7. Row count, encoded byte size, initial subscription time, and generated tile size remain within the budgets below.

If any check fails, the terrain layer remains unavailable and the current coordinate fallback stays visible. The verifier records aggregate array lengths, hashes, bounds, and explicitly approved public sample cells; it does not record player positions.

## Data ownership and collection

A focused `RelayTerrainRegionSession` owns one configured region and follows the established regional runtime patterns:

- Topology discovery and schema-fingerprint validation happen before bindings load.
- The session subscribes only to `world_region_state`, `terrain_chunk_state` for overworld dimension `1`, and `biome_desc`.
- Regional scope is checked against the configured active-region set. Rows outside the verified region bounds or dimension are rejected.
- Insert, update, and delete events rebuild a complete normalized terrain generation. A malformed chunk is reported as an unavailable/partial region rather than rendered with invented geometry.
- The primary region stays warm. Additional configured regions use shared leases and the existing idle-release policy.
- Browser requests never create an unbounded world subscription.

The normalized generation contains chunk coordinates, dimension, validated side length, compact typed arrays, biome descriptions, observation time, schema fingerprint, and warnings. Entity/chunk identifiers remain decimal strings.

## Tile generation and storage

Terrain generations are converted server-side into a deterministic tile pyramid for zooms `-5..0`.

- A cell is classified first by verified `SurfaceType`; water is never inferred solely from elevation colour.
- Ground cells use a stable, documented semantic biome palette derived from `biome_desc.name`. Unknown biome IDs receive a conspicuous neutral colour and a generation warning.
- Elevation may adjust lightness within a small bounded range, but cannot change land/water classification.
- The first version uses nearest-cell rasterisation so coastlines do not acquire interpolated false water or land. Later visual smoothing must retain a semantic comparison test.
- Tile coordinates preserve legitimate negative Y values and the existing `38400 x 38400`, apothem `2 / sqrt(3)` projection.

Generation writes to a sibling staging directory under `data/map-tiles/.staging-<generation>`. After every expected tile and `manifest.json` has been written and validated, the server atomically installs the versioned bundle and updates a small current-manifest pointer. A failed or interrupted build leaves the previous bundle readable. Old bundles are pruned only after the replacement is committed and no active response references them.

The manifest records provider, generation, generated/observed times, schema fingerprint, region IDs, dimension, source row/cell counts, world bounds, zoom range, palette version, tile count, total bytes, freshness, and warnings. Raw Relay terrain arrays are not exposed to browsers and are not retained as history after a successful tile build.

## Same-origin API and renderer

The existing route remains the byte-serving boundary:

```text
GET /api/local/map/tiles/terrain/{z}/{x}/{y}.webp
```

Add one bounded status route:

```text
GET /api/local/map/tiles/status
```

It returns the public manifest fields, layer availability, last-good age, and warnings without filesystem paths or Relay wire data. Tile responses are immutable for a generation; the renderer appends the manifest generation as a query value when it changes. Missing tiles return `404` and reveal no directory information.

The React map loads status first, then enables the terrain tile layer only when a usable manifest exists. Loading, stale, unavailable, and last-good states are shown separately from marker-layer freshness. The coordinate grid remains beneath terrain as a durable fallback. Page visibility pauses status refresh and resumes with a latest-generation check.

## Budgets and failure behaviour

Initial hard ceilings are intentionally conservative:

- One terrain build at a time.
- Four configured regions per build.
- 20,000 chunks or 128 MiB of normalized typed-array data, whichever is reached first.
- 100,000 generated WebP tiles or 512 MiB per installed bundle.
- Ten-minute build deadline.
- A tile response reads at most 2 MiB.

Phase-zero measurements may lower these ceilings. Raising them requires a recorded benchmark and test update.

Schema mismatch, disconnect, malformed arrays, bounds failure, budget exhaustion, encoding failure, or atomic-install failure preserves the previous complete tile bundle and marks it stale/partial with a warning. No player data participates in terrain generation.

## Verification

Automated tests cover:

- Terrain row normalization, equal array lengths, square side derivation, dimension and bounds rejection, decimal chunk IDs, updates, and deletes.
- Fixture-proven cell index-to-world conversion, including negative projected tile Y and world edges.
- Water classification, biome palette stability, elevation shading bounds, and deterministic image hashes.
- Atomic staging/install failure, last-good retention, manifest validation, bundle pruning, path traversal, byte limits, and missing tiles.
- Status freshness and warnings without server paths or Relay payloads.
- Renderer lifecycle, generation cache-busting, grid fallback, visibility pause/resume, and no third-party requests.
- A visual golden fixture containing verified inland, coast, river/lake, and ocean cells.

Live acceptance requires the generated map to place the three evidence points correctly, show recognizable land/water boundaries around the monitored settlement, serve a warm viewport without third-party requests, and keep the current marker layers aligned while panning and zooming.

## Deferred work

This terrain milestone does not add roads, caves, claim polygons, dungeons, or the remaining BitCraftMap POIs. Their parity work continues after the basemap is trustworthy. It also does not reproduce proprietary textures or styling from BitCraftMap/Prism.
