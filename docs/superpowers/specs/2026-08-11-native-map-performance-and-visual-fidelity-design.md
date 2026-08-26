# Native map performance and visual fidelity design

Date: 2026-08-11

## Objective

Make the app-owned BitCraft map materially faster and less memory-hungry while improving the readability and game familiarity of terrain, water, and operational markers. All map assets remain same-origin. Visual improvements must preserve authoritative Relay geography and must not invent unavailable features.

## Measured baseline

The smoke web process used approximately 95 MB RSS and answered health and terrain-status requests in 1–4 ms. The primary performance problem is browser rendering rather than the same-origin HTTP server.

The loaded Map page rendered 658 resource-selection buttons, approximately 602 resource images, and hundreds of Leaflet canvases. The marker loop creates a fresh `L.canvas()` renderer for every ordinary feature. Terrain bundle generation also reconstructs the complete chunk and biome lookup maps for every tile. These are the first optimization targets.

## Scope

This stage includes:

- A shared Leaflet renderer for ordinary operational geometry.
- Bounded resource-finder rendering without reducing the selectable catalog.
- Game-aligned local icons for low-volume interactive markers.
- A deterministic terrain palette and shading upgrade derived from existing Relay fields.
- Terrain-build lookup reuse and measured browser/server performance regression coverage.
- Clear visual fallbacks for features without a verified bundled game asset.

Banks are removed from native-map collection, API requests, layer status, rendering, and acceptance criteria. Bank inventory and other non-map settlement operations remain unchanged elsewhere in the application.

This stage does not add roads, caves, dungeons, portals, claim polygons, new terrain sources, third-party tiles, or unverified icons.

## Chosen approach

Use a hybrid renderer:

- Claims and other numerous ordinary operational points share one Leaflet canvas renderer.
- Resources and enemies continue using the existing viewport-culled dense canvas layers.
- Low-volume, recognizable POIs use same-origin image markers where a verified local game asset exists.
- Missing POI assets use a small, consistent app-owned SVG/glyph marker rather than copied or invented game artwork.

This retains interactive tooltips and keyboard-accessible alternatives without the cost of a DOM/image marker for every feature. Rendering everything on one canvas would be lighter but would weaken interaction and accessibility. Rendering every feature as an image marker would improve icon flexibility but repeat the current browser-object problem.

## Resource finder

The resource finder remains the player's way to select which resources and enemy types are tracked. Filtering continues to search the entire Relay catalog, not only the currently rendered batch.

- Render the first 80 matching rows.
- Provide a `Show more` action that reveals the next 80 matching rows.
- Reset the visible limit when search, tier, or category changes.
- Keep selected resources visible in the existing selected-resource strip even if their catalog row is outside the current batch.
- Preserve typed identities such as `resource:54` and `enemy:8` without numeric coercion.
- Announce the displayed and total matching counts for assistive technology.

No catalog entry becomes unselectable: users can search/filter it or reveal additional batches.

## Marker icons

Marker presentation follows an explicit, same-origin registry:

- Bank has no entry because banks are removed from the map.
- Waystones use the verified bundled Waystone Crystal asset.
- Markets use the verified bundled Hexcoin Purse asset as the closest available game-aligned trading symbol.
- Resource and enemy selection rows keep their existing verified catalog icons.
- Claims, empire settlements, watchtowers, players, and focus waypoints use app-owned marker glyphs until a verified local game asset is available.

Icons sit in a common high-contrast marker frame so their meaning remains readable over every biome. Marker colour remains a secondary layer cue and is never the only distinction. Tooltips retain the feature name and north/east coordinates.

## Terrain and water rendering

Palette version 2 improves the generated first-party tiles without changing coordinates or topology:

- Biome base colours become more distinct while staying suitable for the dark operational UI.
- Elevation and original-elevation neighbours provide bounded directional relief shading.
- Biome density provides subtle deterministic colour variation.
- Water body type and water level provide lake, river, ocean, and swamp differentiation.
- Land/water edges receive a restrained shoreline contrast derived only from neighbouring source cells.

Categorical land/water membership remains authoritative. Smoothing or shading must never move a coastline, join separate water bodies, or create terrain detail not present in Relay data. Rendering remains deterministic for the same normalized generation and palette version.

The terrain renderer builds its chunk and biome indexes once per generation and reuses them for every output tile. Tile encoding stays sequential and bounded to avoid exchanging lower build time for a large RAM spike. A palette-version change creates a new atomic bundle and retains the previous last-good bundle until installation completes.

## Data and error behaviour

No new browser-to-provider connection is introduced. The browser continues to request bounded snapshots, events, status, and tiles from `/api/local/map/*` only.

Missing icon assets fall back locally without failing a layer. Missing or stale terrain keeps the coordinate grid and existing freshness warning. Terrain build failure retains the last-good bundle. Dense spatial layers stay fail-closed under their existing verification gates.

## Performance budgets

- At most one shared Leaflet canvas renderer for ordinary feature markers, plus the two existing dense resource/enemy canvases and the bounded coordinate-grid tiles visible in the viewport.
- No more than 80 matching resource rows and their images on initial render.
- The complete catalog remains searchable and selectable.
- No third-party image, data, or tile requests in native mode.
- Web-process RSS must not materially exceed the measured 95 MB smoke baseline after the Map page is loaded.
- A 25,000-point dense fixture remains interactively pannable without DOM-marker growth.
- Terrain tile output stays within the existing bundle, tile-size, byte, and build-deadline limits.
- Terrain lookup preparation occurs once per generation, not once per tile.

## Verification

Test-first coverage will include:

- A renderer lifecycle test proving ordinary features reuse one renderer and clean it up.
- Resource-finder tests for the 80-row initial batch, repeated `Show more`, filter reset, selected-resource retention, and full-catalog search.
- Marker-registry tests for verified same-origin assets, app-owned fallbacks, and the absence of a bank marker.
- Terrain palette tests for deterministic relief, density variation, water priority, and unchanged shoreline membership.
- Terrain renderer tests proving one prepared lookup serves multiple tiles and output remains deterministic and bounded.
- Boundary/API tests proving banks are absent from native requests, snapshots, legends, and spatial collection queries.
- Production build and full application test suite.
- Browser smoke checks at desktop and mobile widths, including DOM/canvas/image counts and visual inspection of land, water, markers, filtering, and `Show more`.

## Acceptance

The stage is accepted when the smoke map visibly renders improved first-party land and water, recognizable same-origin marker icons, no bank layer, and a responsive resource finder whose complete catalog remains selectable. The measured per-marker canvas explosion and initial 658-row resource render must be gone, all safety budgets must pass, and native mode must make no third-party requests.
