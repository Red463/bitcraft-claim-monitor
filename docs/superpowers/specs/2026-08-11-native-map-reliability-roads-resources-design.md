# Native Map Reliability, World Overview, Roads, and Resources

## Outcome

The native map remains wholly app-owned and same-origin, but becomes usable as an everyday replacement for BitCraftMap: the basemap is always present, the whole world remains visible at low zoom, claim badges are not clipped, selected resources load from Relay, roads are displayed from a verified Relay-backed source, and map refreshes do not cause request storms.

## Product behavior

- Terrain and water form one permanent basemap. They are not user-toggleable.
- Markets, waystones, and empire settlements are not separate map layers or toggles. Claim markers remain the settlement-level representation; market and waystone availability may be shown as claim metadata when verified.
- User controls remain for claims, claim areas, roads, watchtowers, selected players, resources, and enemies.
- Resource markers appear only for resource types selected in the resource finder.
- Roads appear only when their coordinate source has passed the same live-verification standard as other spatial layers. An unavailable road source is reported explicitly; coordinates are never inferred from opaque IDs.
- Claim badges use the supplied isolated tier artwork with sufficient transparent padding and a non-clipping wrapper.

## Basemap architecture

BitCraftMap serves a pre-generated static tile pyramid and does not regenerate its basemap for each browser session or live entity generation. The native map will follow the same operating model without copying or hotlinking third-party assets.

Two app-owned tile products are used:

1. A durable world overview for zooms `-5..-2`, generated from verified overworld terrain snapshots collected sequentially by region. It covers the complete `38,400 x 38,400` world and is replaced atomically only after all configured overview regions are available.
2. Detailed regional terrain for zooms `-1..0`, generated for active regions and overlaid on the overview.

The server serves detailed tiles when available and falls back to the overview. Unknown regions are never fabricated. Until a complete overview generation exists, the status panel reports the missing coverage rather than presenting the grid as terrain.

Tile generation is server-owned, content-addressed, and independent of browser requests. A persisted semantic source hash prevents rebuilding unchanged data across process restarts. A new generation starts only after a complete source set changes, not after each row update or partially received region. Builds are serialized and atomically installed; last-good tiles remain available during collection or build failure.

## Spatial collection

Resources use the existing bounded `resource_state.resource_id` to `location_state.entity_id` join. The verified region-19 fixture for resource type 54 contains 916 overworld features and establishes direct static `{x,z}` coordinates. Resource collection can therefore be enabled while player, enemy, and waystone gates remain independent.

Road collection starts with a live verifier for `paved_tile_state` joined to a coordinate-bearing table. The production gate is enabled only if the verifier establishes current overworld coordinates, deletion behavior, bounds, and payload size. If the direct join is invalid, the layer stays unavailable while the decoder/source is investigated; the application will not consume BitCraftMap CDN tiles or third-party GeoJSON as production data.

## Request lifecycle and limits

- Snapshot fetches and long-lived event streams use separate rate-limit buckets.
- Opening a stream does not cause a second initial snapshot fetch when its announced generation matches the snapshot already loaded.
- At most one snapshot request is in flight per canonical scope. Later generation notifications coalesce into one follow-up fetch.
- Scope changes abort obsolete requests without presenting `AbortError` as a user-visible failure.
- SSE reconnects use bounded backoff and do not consume the expensive-snapshot budget.
- Dense subscriptions remain shared by canonical scope and are released after the existing idle timeout.
- Coordinates, full selections, and response bodies remain absent from logs.

## Failure and freshness behavior

- Terrain, resource, and road layers expose independent freshness and warnings.
- A schema mismatch or unverified coordinate source makes only that layer unavailable.
- Last-good static terrain and roads remain visible during source outages.
- Volatile player positions continue to disappear when their current live generation is invalid.
- HTTP `429` includes a usable retry delay; the client backs off and retains the last-good snapshot.

## Verification

- Boundary tests lock the reduced control list, permanent basemap, and unclipped badge geometry.
- Coordinate/session tests cover resource joins and the verified road source.
- API tests cover independent rate limits, canonical scope sharing, generation notifications, last-good responses, and bounds.
- Tile tests cover overview/detail fallback, full-world low-zoom coverage, persisted content hashes, complete-set builds, and atomic last-good retention.
- Browser smoke checks confirm that zooming to `-5` retains a world basemap and that selecting resource type 54 displays markers without fetch/429 churn.

