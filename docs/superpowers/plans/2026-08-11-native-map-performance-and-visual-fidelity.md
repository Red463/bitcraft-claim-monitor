# Native Map Performance and Visual Fidelity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce native-map browser and terrain-build cost while adding clearer first-party terrain, water, and marker presentation and removing banks from the map.

**Architecture:** Keep provider-neutral Relay snapshots and same-origin pre-rendered terrain tiles. Bound the React resource selector, reuse one Leaflet renderer for numerous ordinary markers, use a fixed local marker registry for low-volume POIs, and cache terrain lookup structures per normalized generation. Apply richer shading only during worker-owned tile generation so browser memory does not grow with visual fidelity.

**Tech Stack:** React 19, TypeScript, Leaflet 1.9, Node.js 24, Sharp/WebP, Node test runner, plain CSS, pnpm.

## Global Constraints

- Banks are absent from native-map collection, API scope, snapshot layers, renderer, legend, and acceptance checks; unrelated bank inventory features remain unchanged.
- The full Relay resource/enemy catalog remains searchable and selectable; render 80 matching rows initially and 80 more per activation.
- Native browser code contacts only same-origin `/api/local/map/*` and existing same-origin icon paths.
- Use only verified bundled game assets; missing POI artwork uses an app-owned fallback glyph.
- Terrain styling may shade source cells but must not change categorical land/water membership or coordinates.
- Preserve decimal-string entity and typed resource/enemy identities without JavaScript number coercion.
- Keep existing terrain tile, byte, bundle, deadline, and four-region safety limits.
- No new runtime dependency or state-management framework.

---

## File structure

- `src/pages/map/resourceFinderWindow.mjs`: pure 80-row batching rules.
- `src/pages/map/resourceFinderWindow.d.mts`: TypeScript surface for the batching helper.
- `src/pages/map/mapMarkerPresentation.mjs`: fixed kind-to-presentation registry using same-origin assets and app-owned glyphs.
- `src/pages/map/mapMarkerPresentation.d.mts`: TypeScript surface for marker presentation.
- `src/pages/map/mapDensePointPlan.mjs`: pure viewport filtering and deterministic 25,000-point draw budgeting.
- `src/pages/map/mapDensePointPlan.d.mts`: TypeScript surface for dense-point planning.
- `src/pages/MapPage.tsx`: consumes bounded resource matches and exposes `Show more`.
- `src/pages/map/NativeMap.tsx`: owns one shared Leaflet canvas renderer and low-volume image/glyph markers.
- `src/styles/map.css`: resource count/action and marker-frame styles.
- `src/server/game-data/mapSpatialProjection.ts`: removes map-specific bank query and normalization.
- `src/server/game-data/mapSpatialSession.ts`: removes bank table reads/listeners from the map session.
- `src/server/mapSnapshot.mjs`: removes `banks` from the public map contract while retaining waystones.
- `src/server/terrainTileRenderer.mjs`: prepares/reuses generation indexes and derives neighbour-based visual inputs.
- `src/server/terrainPalette.mjs`: deterministic palette version 2 colour calculation.
- Existing focused tests under `apps/bitcraft-local/test/` cover each seam.

---

### Task 1: Remove banks from the native-map contract and collector

**Files:**
- Modify: `apps/bitcraft-local/src/pages/map/nativeMapRequest.mjs`
- Modify: `apps/bitcraft-local/src/server/mapSnapshot.mjs`
- Modify: `apps/bitcraft-local/src/server/game-data/mapSpatialProjection.ts`
- Modify: `apps/bitcraft-local/src/server/game-data/mapSpatialSession.ts`
- Modify: `apps/bitcraft-local/src/pages/map/NativeMap.tsx`
- Modify: `apps/bitcraft-local/server.mjs`
- Modify: `apps/bitcraft-local/scripts/verify-relay-map-spatial-live.mjs`
- Test: `apps/bitcraft-local/test/native-map-request.test.mjs`
- Test: `apps/bitcraft-local/test/map-snapshot.test.mjs`
- Test: `apps/bitcraft-local/test/map-spatial-projection.test.mjs`
- Test: `apps/bitcraft-local/test/map-spatial-session.test.mjs`

**Interfaces:**
- Consumes: existing `MapSpatialScope`, `parseMapScope`, and `buildMapSnapshot` contracts.
- Produces: `MAP_LAYER_KEYS` without `banks`; normalized map-spatial data `{ regionId, players, resources, enemies, waystones }`; server flag `MAP_WAYSTONE_COORDINATES_VERIFIED`.

- [ ] **Step 1: Write failing contract tests**

Update the request expectation to omit `banks`, assert `parseMapScope(...layers=banks...)` throws `MapSnapshotError` status 422, and assert the map-spatial query list starts with waystones rather than banks:

```js
assert.equal(request.layers.includes("banks"), false);
assert.throws(
  () => parseMapScope(new URLSearchParams({ regions: "19", layers: "banks" }), { allowedRegionIds: ["19"] }),
  (error) => error.statusCode === 422 && /Unknown map layer/.test(error.message),
);
assert.equal(mapSpatialQueries(scope).some((query) => query.includes("bank_state")), false);
assert.equal("banks" in normalizeMapSpatial(fixture).data, false);
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
node --test test/native-map-request.test.mjs test/map-snapshot.test.mjs test/map-spatial-projection.test.mjs test/map-spatial-session.test.mjs
```

Expected: failures show `banks` remains in the request/layer list, query list, and normalized payload.

- [ ] **Step 3: Remove only map-specific bank behavior**

Make these exact contract changes:

```js
export const MAP_LAYER_KEYS = [
  "claims", "markets", "waystones", "empire-settlements", "empire-territory",
  "watchtowers", "players", "resources", "enemies",
];
```

```ts
return { data: { regionId, players, resources, enemies, waystones }, warnings };
```

Remove `bank_state` from `mapSpatialQueries`, `bankState` from the map session binding shape, table reads, row counts, listeners, and normalizer inputs. In `mapSnapshot.mjs`, keep the waystone verification path and warning under `waystoneCoordinatesVerified`; do not change regional or inventory bank collection outside these map modules. Rename the server constant and `buildMapSnapshot` option from `bankWaystoneCoordinatesVerified` to `waystoneCoordinatesVerified`. Remove the `bank` entry from `NativeMap.tsx` marker colours so the renderer has no bank presentation path.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command. Expected: all four files pass with zero failures.

- [ ] **Step 5: Commit**

```powershell
git add apps/bitcraft-local/src/pages/map/nativeMapRequest.mjs apps/bitcraft-local/src/pages/map/NativeMap.tsx apps/bitcraft-local/src/server/mapSnapshot.mjs apps/bitcraft-local/src/server/game-data/mapSpatialProjection.ts apps/bitcraft-local/src/server/game-data/mapSpatialSession.ts apps/bitcraft-local/server.mjs apps/bitcraft-local/scripts/verify-relay-map-spatial-live.mjs apps/bitcraft-local/test/native-map-request.test.mjs apps/bitcraft-local/test/map-snapshot.test.mjs apps/bitcraft-local/test/map-spatial-projection.test.mjs apps/bitcraft-local/test/map-spatial-session.test.mjs
git commit -m "feat(map): remove bank tracking"
```

### Task 2: Bound the resource finder while preserving full selection

**Files:**
- Create: `apps/bitcraft-local/src/pages/map/resourceFinderWindow.mjs`
- Create: `apps/bitcraft-local/src/pages/map/resourceFinderWindow.d.mts`
- Modify: `apps/bitcraft-local/src/pages/MapPage.tsx`
- Modify: `apps/bitcraft-local/src/styles/map.css`
- Create: `apps/bitcraft-local/test/map-resource-window.test.mjs`
- Modify: `apps/bitcraft-local/test/map-page-boundary.test.mjs`

**Interfaces:**
- Produces: `RESOURCE_FINDER_BATCH_SIZE = 80`, `visibleResourceMatches(matches, limit)`, and `nextResourceLimit(current, total)`.
- Consumes: the existing fully filtered/sorted `visibleResources` array and typed selection tokens.

- [ ] **Step 1: Write the pure failing batching tests**

```js
import { RESOURCE_FINDER_BATCH_SIZE, nextResourceLimit, visibleResourceMatches } from "../src/pages/map/resourceFinderWindow.mjs";

test("resource finder reveals deterministic batches without losing the catalog", () => {
  const rows = Array.from({ length: 205 }, (_, id) => ({ id }));
  assert.equal(RESOURCE_FINDER_BATCH_SIZE, 80);
  assert.deepEqual(visibleResourceMatches(rows, 80).map((row) => row.id), Array.from({ length: 80 }, (_, id) => id));
  assert.equal(nextResourceLimit(80, rows.length), 160);
  assert.equal(nextResourceLimit(160, rows.length), 205);
  assert.equal(nextResourceLimit(205, rows.length), 205);
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run `node --test test/map-resource-window.test.mjs` from `apps/bitcraft-local`.

Expected: module-not-found failure for `resourceFinderWindow.mjs`.

- [ ] **Step 3: Implement the pure batching helper**

```js
export const RESOURCE_FINDER_BATCH_SIZE = 80;

export function visibleResourceMatches(matches, limit = RESOURCE_FINDER_BATCH_SIZE) {
  return matches.slice(0, Math.max(0, Math.min(Number(limit) || 0, matches.length)));
}

export function nextResourceLimit(current, total) {
  const boundedTotal = Math.max(0, Number(total) || 0);
  return Math.min(boundedTotal, Math.max(RESOURCE_FINDER_BATCH_SIZE, Number(current) || 0) + RESOURCE_FINDER_BATCH_SIZE);
}
```

Declare the matching generic array signatures in `resourceFinderWindow.d.mts`.

- [ ] **Step 4: Run the pure test and verify GREEN**

Run `node --test test/map-resource-window.test.mjs`. Expected: one passing test.

- [ ] **Step 5: Write failing Map-page boundary expectations**

Assert `MapPage.tsx` imports the helper, initializes the limit to 80, resets it when `resourceSearch`, `resourceTier`, or `resourceCategory` changes, maps only `renderedResources`, and renders a `Show more` button plus displayed/total count.

- [ ] **Step 6: Run the Map boundary test and verify RED**

Run `node --test test/map-page-boundary.test.mjs`. Expected: new batching assertions fail.

- [ ] **Step 7: Wire batching into the resource finder**

Add:

```tsx
const [resourceVisibleLimit, setResourceVisibleLimit] = React.useState(RESOURCE_FINDER_BATCH_SIZE);
React.useEffect(() => setResourceVisibleLimit(RESOURCE_FINDER_BATCH_SIZE), [resourceSearch, resourceTier, resourceCategory]);
const renderedResources = React.useMemo(
  () => visibleResourceMatches(visibleResources, resourceVisibleLimit),
  [visibleResources, resourceVisibleLimit],
);
```

Render `renderedResources`, keep the selected-resource strip based on the full `resourceByToken`, and add:

```tsx
<span aria-live="polite">Showing {renderedResources.length} of {visibleResources.length}</span>
{renderedResources.length < visibleResources.length ? (
  <button type="button" className="toolbar-button" onClick={() => setResourceVisibleLimit((current) => nextResourceLimit(current, visibleResources.length))}>
    Show more
  </button>
) : null}
```

Style the count/action as a compact sticky footer inside the finder, not a new card.

- [ ] **Step 8: Run focused tests and build**

Run:

```powershell
node --test test/map-resource-window.test.mjs test/map-page-boundary.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: tests and production build pass.

- [ ] **Step 9: Commit**

```powershell
git add apps/bitcraft-local/src/pages/map/resourceFinderWindow.mjs apps/bitcraft-local/src/pages/map/resourceFinderWindow.d.mts apps/bitcraft-local/src/pages/MapPage.tsx apps/bitcraft-local/src/styles/map.css apps/bitcraft-local/test/map-resource-window.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs
git commit -m "perf(map): bound resource finder rendering"
```

### Task 3: Reuse one ordinary-marker renderer and add local POI presentation

**Files:**
- Create: `apps/bitcraft-local/src/pages/map/mapMarkerPresentation.mjs`
- Create: `apps/bitcraft-local/src/pages/map/mapMarkerPresentation.d.mts`
- Create: `apps/bitcraft-local/src/pages/map/mapDensePointPlan.mjs`
- Create: `apps/bitcraft-local/src/pages/map/mapDensePointPlan.d.mts`
- Modify: `apps/bitcraft-local/src/pages/map/NativeMap.tsx`
- Modify: `apps/bitcraft-local/src/styles/map.css`
- Create: `apps/bitcraft-local/test/map-marker-presentation.test.mjs`
- Create: `apps/bitcraft-local/test/map-dense-point-plan.test.mjs`
- Modify: `apps/bitcraft-local/test/map-page-boundary.test.mjs`

**Interfaces:**
- Produces: `MAP_MARKER_PRESENTATIONS`; `mapMarkerPresentation(kind)` returning `{ mode: "canvas", glyph }`, `{ mode: "image", iconUrl, glyph }`, or `{ mode: "glyph", glyph }`; `planDensePointDraw(points, isVisible, budget)` returning `{ visibleCount, points }`.
- Consumes: same-origin bundled icon paths and existing `MapFeature.kind`.

- [ ] **Step 1: Write failing marker-registry tests**

```js
assert.deepEqual(mapMarkerPresentation("waystone"), {
  mode: "image",
  iconUrl: "/game-icons/GeneratedIcons/Other/GeneratedIcons/Items/WaystoneCrystal.webp",
  glyph: "W",
});
assert.deepEqual(mapMarkerPresentation("market"), {
  mode: "image",
  iconUrl: "/game-icons/GeneratedIcons/Items/HexcoinPurse.webp",
  glyph: "M",
});
assert.equal(mapMarkerPresentation("claim").mode, "canvas");
assert.equal(Object.hasOwn(MAP_MARKER_PRESENTATIONS, "bank"), false);
assert.equal(mapMarkerPresentation("bank").mode, "glyph");
assert.doesNotMatch(JSON.stringify(mapMarkerPresentation("waystone")), /https?:\/\//);
```

- [ ] **Step 2: Run the registry test and verify RED**

Run `node --test test/map-marker-presentation.test.mjs`. Expected: module-not-found failure.

- [ ] **Step 3: Implement the fixed registry**

Export an immutable `MAP_MARKER_PRESENTATIONS` record for `waystone`, `market`, `claim`, `empire-settlement`, `watchtower`, `player`, and `focus`, with no `bank` key. `mapMarkerPresentation` returns the registered value or `{ mode: "glyph", glyph: "•" }` for an unknown kind.

- [ ] **Step 4: Run the registry test and verify GREEN**

Run `node --test test/map-marker-presentation.test.mjs`. Expected: all assertions pass.

- [ ] **Step 5: Write and run the failing dense-point planning test**

```js
const points = Array.from({ length: 50_001 }, (_, id) => ({ id, visible: id % 2 === 0 }));
const plan = planDensePointDraw(points, (point) => point.visible, 25_000);
assert.equal(plan.visibleCount, 25_001);
assert.ok(plan.points.length <= 25_000);
assert.deepEqual(plan.points.slice(0, 3).map((point) => point.id), [0, 4, 8]);
```

Run `node --test test/map-dense-point-plan.test.mjs`. Expected: module-not-found failure.

- [ ] **Step 6: Implement deterministic dense-point planning**

```js
export function planDensePointDraw(points, isVisible, budget = 25_000) {
  const visible = points.filter(isVisible);
  const stride = Math.max(1, Math.ceil(visible.length / budget));
  return { visibleCount: visible.length, points: visible.filter((_, index) => index % stride === 0) };
}
```

Validate `budget` as a positive safe integer in the implementation and declare generic signatures in `mapDensePointPlan.d.mts`. Run the new test and expect it to pass.

- [ ] **Step 7: Add failing shared-renderer boundary assertions**

Assert `NativeMap.tsx` creates one `ordinaryRendererRef`, calls `L.canvas({ padding: 0.25 })` only once during map setup, passes `renderer: ordinaryRendererRef.current` to canvas markers, and contains no `renderer: L.canvas()` inside the feature loop. Assert image/glyph markers use `L.divIcon` with fixed registry output.

- [ ] **Step 8: Run the boundary test and verify RED**

Run `node --test test/map-page-boundary.test.mjs`. Expected: shared-renderer and registry-use assertions fail.

- [ ] **Step 9: Implement shared and low-volume marker paths**

Create the renderer during map initialization:

```tsx
ordinaryRendererRef.current = L.canvas({ padding: 0.25 });
```

Claims use `L.circleMarker(..., { renderer: ordinaryRendererRef.current, ... })`. Markets and waystones use `L.marker` with a fixed `L.divIcon` image frame. Empire settlements, watchtowers, players, and the focus waypoint use the fixed glyph-frame variant. Escape feature text by keeping names only in Leaflet `bindTooltip`; never interpolate feature text into `html`.

Clear the layer group on snapshot changes and set `ordinaryRendererRef.current = null` after `map.remove()`. Replace the inline dense-layer filter/stride calculation with `planDensePointDraw(this.#points, (point) => bounds.contains(leafletPoint(point.point)), 25_000)`; draw only `plan.points` and do not create DOM markers for dense points.

- [ ] **Step 10: Add compact marker CSS and run focused verification**

Add `.native-map-marker`, `.native-map-marker img`, and kind modifier styles with 28–32 px targets, high-contrast borders, no remote backgrounds, and no transitions on layout properties.

Run:

```powershell
node --test test/map-marker-presentation.test.mjs test/map-dense-point-plan.test.mjs test/map-page-boundary.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: focused tests and build pass.

- [ ] **Step 11: Commit**

```powershell
git add apps/bitcraft-local/src/pages/map/mapMarkerPresentation.mjs apps/bitcraft-local/src/pages/map/mapMarkerPresentation.d.mts apps/bitcraft-local/src/pages/map/mapDensePointPlan.mjs apps/bitcraft-local/src/pages/map/mapDensePointPlan.d.mts apps/bitcraft-local/src/pages/map/NativeMap.tsx apps/bitcraft-local/src/styles/map.css apps/bitcraft-local/test/map-marker-presentation.test.mjs apps/bitcraft-local/test/map-dense-point-plan.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs
git commit -m "perf(map): reuse marker renderer"
```

### Task 4: Prepare terrain generation indexes once

**Files:**
- Modify: `apps/bitcraft-local/src/server/terrainTileRenderer.mjs`
- Modify: `apps/bitcraft-local/test/terrain-tile-renderer.test.mjs`

**Interfaces:**
- Produces: `prepareTerrainRenderContext(generation)` returning `{ chunks, biomeNames }`; `renderTerrainTile` accepts optional `context` and otherwise uses a module-level `WeakMap` keyed by generation.
- Consumes: normalized terrain generations whose chunks and biome descriptions remain immutable for a build.

- [ ] **Step 1: Write the failing context-reuse test**

```js
const request = fixtureRequest();
const first = rendererModule.prepareTerrainRenderContext(request.generation);
const second = rendererModule.prepareTerrainRenderContext(request.generation);
assert.strictEqual(first, second);
assert.equal(first.chunks.get("0:0"), request.generation.chunks[0]);
assert.equal(first.biomeNames.get(7), "Grasslands");
```

- [ ] **Step 2: Run the renderer test and verify RED**

Run `node --test test/terrain-tile-renderer.test.mjs`. Expected: `prepareTerrainRenderContext is not a function`.

- [ ] **Step 3: Implement weakly cached preparation**

```js
const TERRAIN_CONTEXTS = new WeakMap();

export function prepareTerrainRenderContext(generation) {
  const cached = TERRAIN_CONTEXTS.get(generation);
  if (cached) return cached;
  const context = {
    chunks: new Map(generation.chunks.map((chunk) => [`${chunk.chunkX}:${chunk.chunkZ}`, chunk])),
    biomeNames: new Map((generation.biomes ?? []).map((biome) => [biome.biomeType, biome.name])),
  };
  TERRAIN_CONTEXTS.set(generation, context);
  return context;
}
```

Use the prepared maps in `renderTerrainTile`; do not cache encoded tile buffers.

- [ ] **Step 4: Run renderer and store tests**

Run `node --test test/terrain-tile-renderer.test.mjs test/terrain-tile-store.test.mjs`. Expected: all pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/bitcraft-local/src/server/terrainTileRenderer.mjs apps/bitcraft-local/test/terrain-tile-renderer.test.mjs
git commit -m "perf(map): reuse terrain generation indexes"
```

### Task 5: Add deterministic terrain and water palette version 2

**Files:**
- Modify: `apps/bitcraft-local/src/server/terrainPalette.mjs`
- Modify: `apps/bitcraft-local/src/server/terrainTileRenderer.mjs`
- Modify: `apps/bitcraft-local/test/terrain-tile-renderer.test.mjs`

**Interfaces:**
- Produces: `TERRAIN_PALETTE_VERSION = 2`; `terrainCellRgba({ surface, biomeName, elevation, originalElevation, biomeDensity, relief, depth, shoreline, warnings })`.
- Consumes: existing normalized `biomes`, `biomeDensity`, `elevations`, `originalElevations`, `waterLevels`, and `waterBodyTypes` arrays.

- [ ] **Step 1: Write failing palette semantics tests**

Add literal expectations that prove behaviour without locking every colour channel:

```js
assert.equal(paletteModule.TERRAIN_PALETTE_VERSION, 2);
const flat = paletteModule.terrainCellRgba({ surface: "ground", biomeName: "Grasslands", elevation: 0, originalElevation: 0, biomeDensity: 50, relief: 0, depth: 0, shoreline: false });
const raised = paletteModule.terrainCellRgba({ surface: "ground", biomeName: "Grasslands", elevation: 8, originalElevation: 8, biomeDensity: 80, relief: 12, depth: 0, shoreline: false });
assert.notDeepEqual(raised, flat);
const deepOcean = paletteModule.terrainCellRgba({ surface: "ocean", biomeName: "Grasslands", elevation: -10, originalElevation: -10, biomeDensity: 50, relief: 0, depth: 12, shoreline: false });
const coastOcean = paletteModule.terrainCellRgba({ surface: "ocean", biomeName: "Grasslands", elevation: -2, originalElevation: -2, biomeDensity: 50, relief: 0, depth: 2, shoreline: true });
assert.notDeepEqual(deepOcean, coastOcean);
assert.equal(deepOcean[2] > deepOcean[0], true);
```

Retain the existing assertion that water surface type overrides a ground biome name.

- [ ] **Step 2: Run the renderer test and verify RED**

Run `node --test test/terrain-tile-renderer.test.mjs`. Expected: palette version and visual-input assertions fail.

- [ ] **Step 3: Implement bounded deterministic colour inputs**

Clamp density to `0..100`, relief to `-24..24`, and depth to `0..24`. Apply small integer RGB offsets only; keep alpha 255 for source cells. Water chooses its base before biome logic. Shoreline changes contrast but never surface classification.

In the renderer, add a cell sampler using the prepared chunk map. For each source cell, derive:

```js
const relief = (west.originalElevation - east.originalElevation) + (north.originalElevation - south.originalElevation);
const depth = Math.max(0, cell.waterLevel - cell.elevation);
const shoreline = [north, east, south, west].some((neighbor) => Boolean(neighbor) && neighbor.surface !== cell.surface && (neighbor.surface === "ground" || cell.surface === "ground"));
```

At missing chunk edges, substitute the current cell so outer bundle edges do not gain false coastlines.

- [ ] **Step 4: Prove topology is unchanged**

Extend the decoded-tile test so every source-covered pixel remains alpha 255, uncovered pixels remain alpha 0, and a known ground/water fixture stays on the same side of the categorical boundary before and after palette input changes.

- [ ] **Step 5: Run focused terrain verification**

Run:

```powershell
node --test test/terrain-tile-renderer.test.mjs test/terrain-tile-store.test.mjs test/map-tiles.test.mjs
```

Expected: deterministic hashes match across repeated renders, palette version is 2, and all terrain/store/route tests pass.

- [ ] **Step 6: Commit**

```powershell
git add apps/bitcraft-local/src/server/terrainPalette.mjs apps/bitcraft-local/src/server/terrainTileRenderer.mjs apps/bitcraft-local/test/terrain-tile-renderer.test.mjs
git commit -m "feat(map): improve terrain and water shading"
```

### Task 6: Measure the complete page and document acceptance

**Files:**
- Modify: `apps/bitcraft-local/test/map-page-boundary.test.mjs`
- Modify: `docs/research/native-map-live-coordinate-reference.md`

**Interfaces:**
- Consumes: the completed native Map page, smoke server, status endpoint, and browser DOM counts.
- Produces: recorded post-change counts and any remaining multi-region/source blockers; no production API.

- [ ] **Step 1: Add final static boundary assertions**

Assert native browser source has no `bank` layer token, remote tile/image host, or per-feature `L.canvas()` construction. Keep the existing provider-neutral boundary assertions.

- [ ] **Step 2: Run full automated verification**

From the repository root run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
corepack pnpm --filter @workspace/bitcraft-local test
git diff --check
```

Expected: production build exits 0; full suite reports zero failures; diff check reports no errors.

- [ ] **Step 3: Refresh the stable smoke server**

Because backend and tile palette code changed, run:

```powershell
node scripts/start-bitcraft-local-smoke.mjs --force-restart
curl.exe -s http://127.0.0.1:18449/api/local/health
```

Expected: launcher returns within 15 seconds and health returns `{ "ok": true }` with the current build SHA. If restart exceeds 15 seconds, inspect `.codex-dev/bitcraft-local-smoke.err.log` and `.codex-dev/bitcraft-local-smoke.out.log` once and report the blocker.

- [ ] **Step 4: Perform browser acceptance at desktop and mobile widths**

Open `http://127.0.0.1:18449/?page=map&label=Zephra&x=27361&z=23715&regionId=19` and verify:

- Initial `.map-resource-list > button` count is at most 80.
- `Show more` increases the count by at most 80 and search still finds an item beyond the first batch.
- `.native-map-dense-canvas` count is 2.
- Ordinary feature rendering does not create one canvas per feature.
- Market/waystone local icons and fallback glyph markers are visible and tooltips remain readable.
- Land, water, shoreline contrast, and relief are visible without third-party requests.
- Page has no console error, keyboard focus reaches map controls, and the layout remains usable at desktop and mobile widths.

- [ ] **Step 5: Record exact evidence**

Append the measured browser element counts, web-process RSS, tile status/palette version, build time, visual fixture coordinates, and any unavailable layers to `docs/research/native-map-live-coordinate-reference.md`. Do not record player coordinates.

- [ ] **Step 6: Request two-axis code review and address findings**

Review the branch diff against `docs/superpowers/specs/2026-08-11-native-map-performance-and-visual-fidelity-design.md` and root `AGENTS.md`. Fix actionable standards and spec findings, then rerun the smallest affected focused tests and the full build/test commands if production code changes.

- [ ] **Step 7: Commit the acceptance evidence**

```powershell
git add apps/bitcraft-local/test/map-page-boundary.test.mjs docs/research/native-map-live-coordinate-reference.md
git commit -m "test(map): verify performance and visual acceptance"
```

## Completion checklist

- [ ] Banks are rejected by the map API and absent from map collection and rendering only.
- [ ] Resource finder renders at most 80 initial rows while every catalog entry remains selectable.
- [ ] Ordinary markers reuse one renderer; dense layers remain two bounded canvases.
- [ ] Local POI icons and app-owned fallbacks render without remote requests.
- [ ] Terrain indexes are prepared once per generation.
- [ ] Palette version 2 improves relief, biome variation, shoreline contrast, and water depth without changing topology.
- [ ] Build, full tests, desktop/mobile smoke, privacy/provider-neutral boundaries, and code review pass.
- [ ] Work is committed locally and not pushed until the user requests it.
