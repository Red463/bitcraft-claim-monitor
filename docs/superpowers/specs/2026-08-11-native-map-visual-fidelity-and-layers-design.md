# Native Map Visual Fidelity and Layer Controls Design

**Date:** 2026-08-11  
**Status:** Approved for implementation planning

## Objective

Raise the app-owned native map's visual quality toward the supplied BitCraftMap reference while preserving the local-first, same-origin, provider-neutral architecture and the performance gains already accepted. This stage adds tier-specific claim badges and user-controlled layers. Roads and claim areas enter the public layer vocabulary but remain unavailable until their Relay coordinate decoding is verified.

The reference screenshot is a visual target for contrast, hierarchy, density, and colour mood only. No BitCraftMap imagery, tiles, code, or private data will be copied or requested by the native renderer.

## Scope

This stage includes:

- Isolated T1 through T10 claim badge artwork supplied by the user.
- A richer server-rendered terrain palette with olive land, deep navy water, clearer coastlines, stronger elevation relief, and subtle deterministic texture.
- A compact first-party Layers control.
- Independent visibility toggles for terrain, water, claims, markets, waystones, empire settlements, watchtowers, players, resources, enemies, roads, and claim areas.
- Persisted layer choices on the local browser.
- Visible disabled states and explanations for road and claim-area layers while their coordinate contracts remain unverified.
- Desktop and phone-width browser acceptance against the supplied visual reference.

This stage does not invent road geometry, decode claim tiles speculatively, copy third-party basemap assets, add bank tracking, or enable an unverified live layer.

## Claim Badge Assets

The ten supplied PNG files are copied into a focused same-origin public map-assets directory without altering the source files. The renderer displays only the central hexagonal badge by applying a CSS polygon clip and sizing/positioning the source image so its surrounding square canvas does not appear on the map.

Claim feature metadata already contains a normalized integer `tier`. The presentation seam maps tiers 1 through 10 to the corresponding local asset. Values outside that range, missing tiers, and malformed values use a neutral claim fallback rather than selecting an incorrect badge. Claim IDs remain decimal strings.

Claim badges use ordinary DOM markers because the live configured-region count is low enough for accessible interactive markers. Each marker remains keyboard focusable and exposes the claim name, tier, and coordinates in its accessible label and tooltip. The existing bounded canvas alternative remains for any claim fallback that must use canvas.

At lower zoom levels, badge size stays compact and claim labels remain tooltip-only. At useful settlement zoom levels the marker grows within a bounded range; it does not create permanent text clutter.

## Terrain and Water Rendering

Terrain remains generated server-side from verified normalized `terrain_chunk_state` generations and served through the existing same-origin tile API. Browser code does not receive raw terrain arrays and does not connect to Relay.

Palette version 3 will:

- Shift common ground toward the dark olive/forest family visible in the reference.
- Keep biome distinctions readable without creating saturated patchwork.
- Deepen ocean and lake blues while keeping rivers legible.
- Add a light shallow-water/shore band and a darker deep-water progression.
- Strengthen directional elevation relief using existing and original elevation samples.
- Add low-amplitude deterministic texture derived from map cell coordinates, biome density, and elevation. The texture must be stable across rebuilds and must not use randomness.
- Preserve transparent pixels outside verified terrain coverage so the coordinate fallback remains visible.

All palette inputs participate in the render hash. Palette-version changes create a new atomic tile generation; readers continue receiving the previous complete bundle until installation succeeds. Tile generation retains the current effort, response-size, and last-good protections.

Water visibility is independently toggleable even though terrain and water share one generated tile source. The renderer therefore produces separate terrain-ground and water tile channels from the same verified generation. Both channels share coordinates, generation identity, and atomic installation. Turning off water exposes the coordinate-grid fallback in water cells; turning off terrain does the same for ground cells.

## Layer Control

The native map gains a compact Layers button and popover placed inside the map viewport. It follows existing dashboard styling and remains usable by keyboard and touch.

Layer definitions live in a focused provider-neutral presentation module. Each definition specifies:

- Stable layer key and user-facing label.
- Default visibility.
- Layer group or tile channel controlled.
- Availability and optional unavailable reason.
- Whether a resource/enemy selection is also required.

The initial defaults retain today's useful view: terrain, water, claims, markets, waystones, empire settlements, watchtowers, players, resources, and enemies are on. Roads and claim areas are off and disabled until verified data is available.

Layer preferences are stored under a versioned local-storage key. Parsing is allowlisted and defensive: unknown keys are ignored, newly introduced layers receive their declared defaults, and invalid storage resets to defaults. Toggling resources or enemies only changes their visibility; it does not clear the selected resource/enemy types in the existing finder.

Map status and legend counts remain source-of-truth indicators. A hidden layer keeps its freshness information but is marked hidden. An unavailable layer is disabled and displays its server-supplied or evidence-gate reason.

## Roads and Claim Areas

The snapshot scope and feature vocabulary add `roads` and `claim-areas`, with request parsing, budgets, empty layer arrays, and warnings following the existing provider-neutral contract.

Their server availability gates default to false. The UI always displays both controls, disabled with the explanation `Unavailable — awaiting verified Relay coordinates` while gated. The server returns no road or claim-area features until all of the following are recorded in the coordinate reference and enforced by tests:

- The authoritative Relay source table and identity relationship.
- Exact tile/entity-to-map coordinate decoding.
- Dimension and region filtering.
- Update and deletion behavior.
- Known live fixtures aligned with in-game or independently verified map locations.
- Bounded row counts and payload sizes within existing map budgets.

Once verified, roads render as canvas polylines with deterministic level-of-detail and claim areas render as low-opacity polygons beneath operational markers. Enabling these future gates must not require changing the browser-facing layer-control contract.

## Performance and Accessibility

- Terrain detail remains rasterized once on the server rather than recomputed during browser pan/zoom.
- Ground and water tiles reuse the current tile pyramid and bounded cache strategy.
- Claim badges reuse ten static same-origin images; no base64 duplication or per-feature canvas renderer is introduced.
- The layer control does not recreate Leaflet map instances. It adds/removes existing layer groups and tile layers.
- Dense resource/enemy canvases stop drawing while hidden.
- Every toggle has an accessible label, state, and disabled explanation.
- Claim badge markers are keyboard focusable with non-visual name/tier/coordinate detail.
- The control fits within a 390 × 844 viewport without hiding the map or creating horizontal overflow.

## Testing and Acceptance

Automated tests will cover:

- Tier 1–10 asset selection and neutral fallback behavior.
- Same-origin asset URLs and absence of third-party map requests.
- Defensive layer-preference parsing, defaults, and persistence.
- Independent layer visibility without selection loss.
- Disabled road and claim-area controls and fail-closed empty API layers.
- Ground/water tile-channel separation and coordinate alignment.
- Palette version 3 colour, relief, shoreline, depth, deterministic texture, and unknown-biome behavior.
- Render-hash invalidation for every visual input and palette version.
- Atomic last-good installation for both tile channels.
- Desktop and phone-width CSS boundaries.

Browser acceptance will use the running smoke server and verify:

- T1–T10 badge presentation through deterministic fixtures, plus live tiers present in the configured region.
- Recognizable isolated badges without the source square background.
- Richer olive terrain, deep water, visible shoreline and relief hierarchy.
- Working toggles for every available layer.
- Disabled, explained road and claim-area toggles.
- No iframe or external map/tile/image request in native mode.
- Zero console errors and no horizontal overflow at desktop and 390 × 844 phone widths.
- Stable interactive pan/zoom and a lean web-role smoke process.

The full production build and application test suite must pass before this stage is committed as complete. No push occurs until the broader native-map live-coordinate gates and user acceptance are complete.
