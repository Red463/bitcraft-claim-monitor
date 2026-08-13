# Native Map Biome Rendering and Highlighting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correctly render every packed Relay biome blend and let map users hover, focus, or pin a biome from the key to isolate it visually.

**Architecture:** A shared provider-neutral biome module decodes packed `u32` identities/densities and owns the versioned numeric palette. The existing terrain build performs one render pass per tile and atomically installs terrain, water, and sparse per-biome mask channels; the browser reads catalogue metadata from the existing same-origin status route and displays at most one Leaflet mask layer above dimmed base panes.

**Tech Stack:** Node.js 24, React, TypeScript, Leaflet 1.9, Sharp/WebP, Node test runner, plain CSS, same-origin Node HTTP routes.

## Global Constraints

- Browsers must not contact Relay, BitJita, Prism, BitCraftMap, or a third-party tile host.
- Terrain remains pre-generated; opening or using the key must not trigger collection or regeneration.
- Packed values are decoded unsigned and least-significant-byte first.
- Numeric biome type is authoritative; display-name substring matching is removed.
- A bundle and all its mask channels install atomically; build failure retains the complete last-good bundle.
- Only non-empty mask tiles are stored, and at most one biome mask layer is mounted in Leaflet.
- Terrain and water use `filter: brightness(32%)` while a highlight is active; operational overlays remain undimmed.
- Hover/focus preview delay is exactly 100 ms. Pinning and clearing are immediate.
- Mask alpha is `round(255 * (0.45 + 0.55 * density / strongestDensity))`, clamped to `115..255`.
- The palette version increases from `3` to `4` so installed terrain regenerates once.
- No changelog or package-version update is included in this unreleased iteration.

---

## File Structure

- Create `apps/bitcraft-local/src/shared/terrainBiomes.mjs`: packed-value decoding, numeric palette lookup, weighted blending, mask alpha, current labels.
- Create `apps/bitcraft-local/src/shared/terrainBiomes.d.mts`: TypeScript declarations for browser consumers.
- Modify `apps/bitcraft-local/src/shared/terrainPaletteDefinition.mjs`: palette version, water legend, compatibility exports sourced from the biome module.
- Modify `apps/bitcraft-local/src/server/terrainPalette.mjs`: consume decoded contributors rather than biome names.
- Modify `apps/bitcraft-local/src/server/terrainTileRenderer.mjs`: decode once per sampled cell and emit terrain, water, and sparse mask buffers in one pass.
- Modify `apps/bitcraft-local/src/server/terrainTileStore.mjs`: install multi-channel output atomically and project catalogue/presence diagnostics.
- Modify `apps/bitcraft-local/src/server/terrainOverviewStore.mjs`: merge biome catalogues and mask diagnostics across layered manifests without inventing missing masks.
- Modify `apps/bitcraft-local/src/server/mapTiles.mjs`: validate and serve `biome-<id>` styles and expose catalogue metadata.
- Modify `apps/bitcraft-local/server.mjs`: provide the multi-channel renderer to the store.
- Modify `apps/bitcraft-local/src/pages/map/terrainTileStatus.mjs` and `.d.mts`: validate/catalogue status and construct mask URLs.
- Modify `apps/bitcraft-local/src/pages/map/MapBiomeKey.tsx`: accessible preview/pin interaction.
- Modify `apps/bitcraft-local/src/pages/map/NativeMap.tsx`: dim base panes and own exactly one mask tile layer.
- Modify `apps/bitcraft-local/src/styles/map.css`: key states, absent state, pinned state, and terrain-pane dimming.
- Modify focused tests under `apps/bitcraft-local/test/` named in each task.

---

### Task 1: Packed Biome Decoder and Numeric Palette

**Files:**
- Create: `apps/bitcraft-local/src/shared/terrainBiomes.mjs`
- Create: `apps/bitcraft-local/src/shared/terrainBiomes.d.mts`
- Modify: `apps/bitcraft-local/src/shared/terrainPaletteDefinition.mjs`
- Modify: `apps/bitcraft-local/test/terrain-palette-definition.test.mjs`
- Create: `apps/bitcraft-local/test/terrain-biomes.test.mjs`

**Interfaces:**
- Produces: `decodeTerrainBiomeBlend(packedBiomes, packedDensities) -> Array<{ biomeType: number; density: number }>`.
- Produces: `terrainBiomeColour(biomeType) -> readonly [number, number, number, number]`.
- Produces: `blendTerrainBiomeColours(contributors, warnings?) -> readonly [number, number, number, number]`.
- Produces: `terrainBiomeMaskAlpha(density, strongestDensity) -> number`.
- Produces: `TERRAIN_BIOME_DEFINITIONS`, keyed by IDs `0..18` with exact current Relay labels and RGBA values.

- [ ] **Step 1: Write failing decoder and palette tests**

Add tests proving unsigned byte order, malformed density fallback, all current identities, weighted blend, future fallback, and mask alpha:

```js
test("packed terrain biomes decode least-significant byte first", () => {
  assert.deepEqual(decodeTerrainBiomeBlend(0x0102040a, 0x0a404a80), [
    { biomeType: 10, density: 128 },
    { biomeType: 4, density: 74 },
    { biomeType: 2, density: 64 },
    { biomeType: 1, density: 10 },
  ]);
});

test("a missing packed density preserves only the primary biome", () => {
  assert.deepEqual(decodeTerrainBiomeBlend(0x00000201, null), [{ biomeType: 1, density: 128 }]);
});

test("biome zero is retained only when its primary density proves a Dev cell", () => {
  assert.deepEqual(decodeTerrainBiomeBlend(0, 128), [{ biomeType: 0, density: 128 }]);
  assert.deepEqual(decodeTerrainBiomeBlend(0, 0), []);
});

test("the numeric palette covers every current Relay biome", () => {
  assert.deepEqual(TERRAIN_BIOME_DEFINITIONS.map(({ biomeType }) => biomeType), Array.from({ length: 19 }, (_, index) => index));
  assert.equal(TERRAIN_BIOME_DEFINITIONS[1].label, "Calm Forest");
  assert.equal(TERRAIN_BIOME_DEFINITIONS[2].label, "Pine Woods");
  assert.deepEqual(terrainBiomeColour(255), TERRAIN_UNKNOWN_GROUND_COLOUR);
});

test("biome colours blend by density and mask alpha is bounded", () => {
  assert.deepEqual(blendTerrainBiomeColours([
    { biomeType: 1, density: 128 },
    { biomeType: 2, density: 64 },
  ]), [35, 63, 46, 255]);
  assert.equal(terrainBiomeMaskAlpha(128, 128), 255);
  assert.equal(terrainBiomeMaskAlpha(1, 128), 116);
});
```

Use these exact base colours:

```js
[
  [0, "Dev", [84, 89, 80, 255]],
  [1, "Calm Forest", [38, 66, 45, 255]],
  [2, "Pine Woods", [29, 58, 47, 255]],
  [3, "Snowy Peaks", [184, 197, 195, 255]],
  [4, "Breezy Grasslands", [75, 91, 54, 255]],
  [5, "Autumn Forest", [102, 78, 42, 255]],
  [6, "Misty Tundra", [119, 132, 130, 255]],
  [7, "Desert Wasteland", [148, 119, 64, 255]],
  [8, "Swamp", [50, 75, 55, 255]],
  [9, "Rocky Garden", [94, 88, 75, 255]],
  [10, "Open Ocean", [20, 43, 72, 255]],
  [11, "Safe Meadows", [91, 111, 67, 255]],
  [12, "Cave", [58, 60, 63, 255]],
  [13, "Jungle", [29, 75, 42, 255]],
  [14, "Sapwoods", [56, 88, 56, 255]],
  [15, "Deserted Beach", [161, 139, 89, 255]],
  [16, "Tropical Canopy", [38, 91, 51, 255]],
  [17, "Volcanic Crag", [84, 55, 50, 255]],
  [18, "Uncharted Ocean", [13, 31, 55, 255]],
]
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --test test/terrain-biomes.test.mjs test/terrain-palette-definition.test.mjs
```

Expected: FAIL because `terrainBiomes.mjs` and its numeric exports do not exist and palette version is still `3`.

- [ ] **Step 3: Implement the minimal shared decoder and palette**

Implement the byte decoder with unsigned shifts:

```js
export function decodeTerrainBiomeBlend(packedBiomes, packedDensities) {
  const biomes = Number(packedBiomes) >>> 0;
  const hasDensities = packedDensities !== null && packedDensities !== undefined && Number.isFinite(Number(packedDensities));
  const densities = hasDensities ? Number(packedDensities) >>> 0 : 0;
  if (!biomes && (!hasDensities || (densities & 0xff) === 0)) return [];
  const result = [];
  for (let shift = 0; shift <= 24; shift += 8) {
    const biomeType = (biomes >>> shift) & 0xff;
    if (!biomeType && shift > 0) continue;
    const density = hasDensities ? (densities >>> shift) & 0xff : shift === 0 ? 128 : 0;
    if (density > 0) result.push({ biomeType, density });
  }
  return result;
}
```

Implement weighted RGB rounding as `Math.round(sum(channel * density) / sum(density))`, preserve alpha `255`, deduplicate bounded warning strings, and implement the exact mask formula from Global Constraints. Export `TERRAIN_PALETTE_VERSION = 4` through `terrainPaletteDefinition.mjs`; keep `TERRAIN_WATER_COLOURS` and the water legend there.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run the Task 1 command again. Expected: all tests PASS with no warnings.

- [ ] **Step 5: Commit Task 1**

```powershell
git add apps/bitcraft-local/src/shared/terrainBiomes.mjs apps/bitcraft-local/src/shared/terrainBiomes.d.mts apps/bitcraft-local/src/shared/terrainPaletteDefinition.mjs apps/bitcraft-local/test/terrain-biomes.test.mjs apps/bitcraft-local/test/terrain-palette-definition.test.mjs
git commit -m "fix(map): decode packed terrain biomes"
```

---

### Task 2: Blended Terrain Rendering and Sparse Mask Channels

**Files:**
- Modify: `apps/bitcraft-local/src/server/terrainPalette.mjs`
- Modify: `apps/bitcraft-local/src/server/terrainTileRenderer.mjs`
- Modify: `apps/bitcraft-local/test/terrain-tile-renderer.test.mjs`

**Interfaces:**
- Consumes: Task 1 `decodeTerrainBiomeBlend`, `blendTerrainBiomeColours`, and `terrainBiomeMaskAlpha`.
- Produces: `renderTerrainTileChannels(...) -> Promise<{ terrain: Buffer; water: Buffer; biomeMasks: Map<number, Buffer> }>`.
- Produces: `terrainCellRgba({ surface, biomeContributions, ... })` with no display-name lookup.

- [ ] **Step 1: Write failing blended-render and mask tests**

Extend the renderer fixture with packed biome `0x00000201` and packed density `0x00004080`. Assert that prepared cells decode both IDs, the terrain colour differs from unknown ground, both masks exist, mask `1` has stronger alpha than mask `2`, and a biome absent from the tile has no buffer:

```js
test("terrain renderer blends packed biomes and emits sparse masks", async () => {
  const fixture = terrainFixture({ packedBiomes: 0x00000201, packedDensity: 0x00004080 });
  const channels = await renderer.renderTerrainTileChannels({ ...fixture, zoom: 0, x: 0, y: -1, tileSize: 4 });
  assert.ok(channels.terrain.byteLength > 0);
  assert.ok(channels.biomeMasks.get(1)?.byteLength > 0);
  assert.ok(channels.biomeMasks.get(2)?.byteLength > 0);
  assert.equal(channels.biomeMasks.has(3), false);
  const primary = await sharp(channels.biomeMasks.get(1)).ensureAlpha().raw().toBuffer();
  const secondary = await sharp(channels.biomeMasks.get(2)).ensureAlpha().raw().toBuffer();
  assert.ok(Math.max(...primary.filter((_, index) => index % 4 === 3)) > Math.max(...secondary.filter((_, index) => index % 4 === 3)));
});
```

Add a water-cell assertion that Open Ocean receives a biome mask while the visible base pixel retains the water-surface colour.

- [ ] **Step 2: Run the renderer test and verify RED**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --test test/terrain-tile-renderer.test.mjs
```

Expected: FAIL because the renderer still treats the packed value as a catalogue key and returns only terrain/water channels.

- [ ] **Step 3: Implement one-pass blended rendering**

In `sampleCell`, replace `biomeName` with:

```js
biomeContributions: decodeTerrainBiomeBlend(chunk.biomes[cellIndex], chunk.biomeDensity[cellIndex]),
```

In `terrainCellRgba`, obtain the base from `blendTerrainBiomeColours(biomeContributions, warnings)`, then retain the existing water, elevation, relief, depth, shoreline, and deterministic texture calculations.

Allocate mask RGBA buffers lazily. For each rendered pixel and contributor, copy the final visible RGB into that contributor's mask and set alpha with `terrainBiomeMaskAlpha(contributor.density, strongestDensity)`. Encode only masks containing at least one pixel. Use the existing WebP parameters and return the `Map<number, Buffer>`.

Keep the existing `renderTerrainTile` terrain/water compatibility wrapper during this task so the production server remains buildable. Extend its cached channel result without exposing biome-mask styles through the wrapper; Task 3 will switch the store to `renderTerrainTileChannels` and then remove the obsolete wrapper/cache.

- [ ] **Step 4: Run the renderer test and verify GREEN**

Run the Task 2 command again. Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```powershell
git add apps/bitcraft-local/src/server/terrainPalette.mjs apps/bitcraft-local/src/server/terrainTileRenderer.mjs apps/bitcraft-local/test/terrain-tile-renderer.test.mjs
git commit -m "feat(map): render blended biome masks"
```

---

### Task 3: Atomic Multi-channel Tile Storage and Catalogue Status

**Files:**
- Modify: `apps/bitcraft-local/src/server/terrainTileStore.mjs`
- Modify: `apps/bitcraft-local/src/server/terrainOverviewStore.mjs`
- Modify: `apps/bitcraft-local/src/server/mapTiles.mjs`
- Modify: `apps/bitcraft-local/server.mjs`
- Modify: `apps/bitcraft-local/test/terrain-tile-store.test.mjs`
- Modify: `apps/bitcraft-local/test/terrain-overview-store.test.mjs`
- Modify: `apps/bitcraft-local/test/map-tiles.test.mjs`

**Interfaces:**
- Consumes: Task 2 `renderTerrainTileChannels`.
- Changes store encoder contract to `encoder(request) -> Promise<{ terrain: Buffer; water: Buffer; biomeMasks: Map<number, Buffer> }>`.
- Extends terrain manifest and status with `biomes` plus `channels.biomeMasks` diagnostics.
- Extends `readTile({ style })` to accept `biome-<0..255>`.

- [ ] **Step 1: Write failing atomic-store tests**

Change the store fixture encoder to return both base channels and two sparse masks:

```js
const encoder = async ({ generation: value, zoom, x, y }) => ({
  terrain: Buffer.from(`${value.generation}:terrain:${zoom}:${x}:${y}`),
  water: Buffer.from(`${value.generation}:water:${zoom}:${x}:${y}`),
  biomeMasks: new Map([
    [1, Buffer.from(`${value.generation}:biome-1:${zoom}:${x}:${y}`)],
    [2, Buffer.from(`${value.generation}:biome-2:${zoom}:${x}:${y}`)],
  ]),
});
```

Add `generation.biomes` descriptors for IDs 1, 2, and 3. Assert:

```js
assert.equal((await store.readTile({ style: "biome-1", z: -5, x: 0, y: -1 })).bytes.toString(), "1:biome-1:-5:0:-1");
assert.equal(await store.readTile({ style: "biome-3", z: -5, x: 0, y: -1 }), null);
assert.deepEqual(first.biomes.map(({ biomeType, present }) => [biomeType, present]), [[1, true], [2, true], [3, false]]);
assert.equal(first.channels.biomeMasks.tileCount, 2 * first.channels.terrain.tileCount);
```

Retain the forced-failure assertion and prove no generation-2 base or mask becomes current.

- [ ] **Step 2: Write failing route and overview tests**

In `map-tiles.test.mjs`, assert a valid mask request is served and IDs above `255`, malformed styles, path traversal, and invalid zoom return `400`:

```js
assert.equal(await serveLocalMapTile("/api/local/map/tiles/biome-2/-5/0/-2.webp", res, store), true);
assert.deepEqual(store.requests.at(-1), { style: "biome-2", z: -5, x: 0, y: -2 });
for (const pathname of [
  "/api/local/map/tiles/biome-256/-5/0/-2.webp",
  "/api/local/map/tiles/biome-x/-5/0/-2.webp",
  "/api/local/map/tiles/biome-2/-5/0/../../secret.webp",
]) assert.equal((await responseFor(pathname)).status, 400);
```

Assert the status response contains sanitized descriptor fields and presence but excludes `iconAddress` and raw terrain arrays. In overview tests, assert catalogue entries merge by numeric ID and `present` is true when any installed manifest marks it present.

- [ ] **Step 3: Run store/route tests and verify RED**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --test test/terrain-tile-store.test.mjs test/terrain-overview-store.test.mjs test/map-tiles.test.mjs
```

Expected: FAIL because encoder output, mask styles, catalogue fields, and diagnostics are unsupported.

- [ ] **Step 4: Implement atomic multi-channel installation**

Enumerate each tile coordinate once. For every encoder result, write `terrain`, `water`, then each non-empty `biomeMasks` entry into `tiles/biome-<id>/<zoom>/<x>/<y>.webp`. Increment actual file count and byte budgets for every written channel before publishing the pointer.

Project manifest catalogue entries from `generation.biomes`, retaining only:

```js
{
  biomeType: Number(biome.biomeType),
  name: String(biome.name),
  description: String(biome.description ?? ""),
  hazardLevel: String(biome.hazardLevel ?? ""),
  disallowPlayerBuild: Boolean(biome.disallowPlayerBuild),
  present: presentBiomeIds.has(Number(biome.biomeType)),
}
```

Store mask diagnostics under:

```js
channels: {
  terrain: { tileCount, totalBytes },
  water: { tileCount, totalBytes },
  biomeMasks: { tileCount, totalBytes },
}
```

Project `channels` through `/api/local/map/tiles/status`. When no terrain manifest is installed, return `biomes: []` and zeroed terrain/water/biome-mask channel diagnostics.

Update layered/overview manifest merging by numeric ID. Do not mark a biome present when it exists only in a descriptor catalogue.

- [ ] **Step 5: Implement strict mask route parsing and server wiring**

Parse `terrain`, `water`, `game`, `roads`, or `biome-(\d{1,3})`; require mask ID `0..255`. Pass the canonical `biome-<id>` style to the terrain store. In `server.mjs`, replace the old per-style renderer callback with:

```js
encoder: async ({ generation, zoom, x, y, tileSize }) => {
  const { renderTerrainTileChannels } = await import("./src/server/terrainTileRenderer.mjs");
  return renderTerrainTileChannels({ generation, evidence: generation.evidence, zoom, x, y, tileSize });
},
```

After the server and store consume `renderTerrainTileChannels` directly, remove the unused `renderTerrainTile` compatibility wrapper and `TERRAIN_CHANNEL_PAIRS` cache from `terrainTileRenderer.mjs`.

- [ ] **Step 6: Run store/route tests and verify GREEN**

Run the Task 3 command again. Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```powershell
git add apps/bitcraft-local/src/server/terrainTileStore.mjs apps/bitcraft-local/src/server/terrainOverviewStore.mjs apps/bitcraft-local/src/server/mapTiles.mjs apps/bitcraft-local/server.mjs apps/bitcraft-local/test/terrain-tile-store.test.mjs apps/bitcraft-local/test/terrain-overview-store.test.mjs apps/bitcraft-local/test/map-tiles.test.mjs
git commit -m "feat(map): install sparse biome mask tiles"
```

---

### Task 4: Provider-neutral Browser Status and Key State Machine

**Files:**
- Modify: `apps/bitcraft-local/src/pages/map/terrainTileStatus.mjs`
- Modify: `apps/bitcraft-local/src/pages/map/terrainTileStatus.d.mts`
- Create: `apps/bitcraft-local/src/pages/map/biomeHighlightState.mjs`
- Create: `apps/bitcraft-local/src/pages/map/biomeHighlightState.d.mts`
- Modify: `apps/bitcraft-local/src/pages/map/MapBiomeKey.tsx`
- Modify: `apps/bitcraft-local/test/terrain-tile-status.test.mjs`
- Create: `apps/bitcraft-local/test/map-biome-highlight-state.test.mjs`
- Modify: `apps/bitcraft-local/test/map-biome-key.test.mjs`

**Interfaces:**
- Produces: `biomeTileUrl(biomeType, generation)`.
- Produces: `TerrainBiomeStatus` and `TerrainTileStatus.biomes`.
- Produces: `createBiomeHighlightController({ delayMs, schedule, cancel, onChange })` with `preview`, `leave`, `pin`, `clear`, and `dispose` methods.
- Changes `MapBiomeKey` props to `{ biomes, activeBiomeType, pinnedBiomeType, onPreview, onLeave, onPin, onClear }`.

- [ ] **Step 1: Write failing status and state-machine tests**

Add status validation for the catalogue and URL:

```js
assert.equal(biomeTileUrl(2, "42"), "/api/local/map/tiles/biome-2/{z}/{x}/{y}.webp?generation=42");
assert.throws(() => biomeTileUrl(256, "42"), /Biome type/);
assert.equal(status.biomes[0].name, "Calm Forest");
```

Use injected fake scheduling to prove exactly 100 ms preview delay, immediate pin/clear, leave restoration, and dispose cancellation:

```js
controller.preview(2);
assert.deepEqual(changes, []);
clock.advance(99);
assert.deepEqual(changes, []);
clock.advance(1);
assert.deepEqual(changes, [{ active: 2, pinned: null }]);
controller.pin(2);
controller.preview(1);
controller.leave();
assert.deepEqual(changes.at(-1), { active: 2, pinned: 2 });
controller.clear();
assert.deepEqual(changes.at(-1), { active: null, pinned: null });
```

- [ ] **Step 2: Write failing key boundary assertions**

Require the key source to use buttons, `aria-pressed`, disabled absent rows, hover/focus callbacks, `Escape`, and exact instructional copy. Remove assertions for the old hard-coded `TERRAIN_LEGEND_GROUPS` biome rows while retaining water legend ownership.

- [ ] **Step 3: Run browser-module tests and verify RED**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --test test/terrain-tile-status.test.mjs test/map-biome-highlight-state.test.mjs test/map-biome-key.test.mjs
```

Expected: FAIL because catalogue parsing, URL construction, state controller, and interactive props do not exist.

- [ ] **Step 4: Implement strict status parsing and the state controller**

Validate each catalogue entry with numeric biome type `0..255`, non-empty name, strings for descriptive fields, and boolean `present`/`disallowPlayerBuild`. Reject the whole malformed status instead of partially trusting it.

Implement the controller so delayed preview never overwrites a later immediate pin or clear. `leave()` cancels pending preview and emits the pinned state. `dispose()` cancels the timer without emitting.

- [ ] **Step 5: Implement the accessible key**

Render all `biomes` sorted by numeric type, and obtain each swatch with `terrainBiomeColour(biome.biomeType)` from Task 1. Use one button per row with:

```tsx
disabled={!biome.present}
aria-pressed={pinnedBiomeType === biome.biomeType}
onPointerEnter={() => onPreview(biome.biomeType)}
onPointerLeave={onLeave}
onFocus={() => onPreview(biome.biomeType)}
onBlur={onLeave}
onClick={() => onPin(biome.biomeType)}
```

Handle `Escape` on the popover with `onClear()`. Show “Not present in this terrain generation” on absent rows and “Hover or focus to preview; click to pin.” above the existing terrain-shading note. Continue sourcing water entries from the shared water legend.

- [ ] **Step 6: Run browser-module tests and verify GREEN**

Run the Task 4 command again. Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```powershell
git add apps/bitcraft-local/src/pages/map/terrainTileStatus.mjs apps/bitcraft-local/src/pages/map/terrainTileStatus.d.mts apps/bitcraft-local/src/pages/map/biomeHighlightState.mjs apps/bitcraft-local/src/pages/map/biomeHighlightState.d.mts apps/bitcraft-local/src/pages/map/MapBiomeKey.tsx apps/bitcraft-local/test/terrain-tile-status.test.mjs apps/bitcraft-local/test/map-biome-highlight-state.test.mjs apps/bitcraft-local/test/map-biome-key.test.mjs
git commit -m "feat(map): add interactive biome key"
```

---

### Task 5: Leaflet Highlight Layer, Pane Isolation, and Styling

**Files:**
- Modify: `apps/bitcraft-local/src/pages/map/NativeMap.tsx`
- Modify: `apps/bitcraft-local/src/styles/map.css`
- Modify: `apps/bitcraft-local/test/map-page-boundary.test.mjs`
- Modify: `apps/bitcraft-local/test/provider-neutral-browser-data.test.mjs`

**Interfaces:**
- Consumes: Task 4 controller, `biomeTileUrl`, catalogue, and `MapBiomeKey` props.
- Produces: one `native-map-biome-mask` Leaflet pane at z-index `250`, below `overlayPane` and all marker panes.

- [ ] **Step 1: Write failing Leaflet lifecycle and CSS boundary tests**

Require `NativeMap.tsx` to create dedicated terrain (`200`), water (`210`), and mask (`250`) panes; set the terrain/water tile layer `pane` options; own `biomeMaskTilesRef`; remove the previous mask before adding another; and clean it up on unavailable terrain and unmount.

Require CSS:

```css
.native-map-canvas.is-biome-highlight-active .leaflet-native-map-terrain-pane,
.native-map-canvas.is-biome-highlight-active .leaflet-native-map-water-pane {
  filter: brightness(32%);
}
```

Require rows to have visible hover/focus, pinned, and unavailable states without hard-coded palette RGB values in the component or stylesheet.

- [ ] **Step 2: Run map boundary tests and verify RED**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --test test/map-page-boundary.test.mjs test/provider-neutral-browser-data.test.mjs
```

Expected: FAIL because the panes, mask lifecycle, and interactive styles do not exist.

- [ ] **Step 3: Implement highlight state ownership in `NativeMap`**

Add state:

```tsx
const [biomeHighlight, setBiomeHighlight] = React.useState<{ active: number | null; pinned: number | null }>({ active: null, pinned: null });
```

Create the Task 4 controller once with React refs and dispose it on unmount. Pass its operations and `terrainStatus?.biomes ?? []` into `MapBiomeKey`.

Create panes when Leaflet initializes:

```tsx
const terrainPane = map.createPane("native-map-terrain");
terrainPane.style.zIndex = "200";
const waterPane = map.createPane("native-map-water");
waterPane.style.zIndex = "210";
const maskPane = map.createPane("native-map-biome-mask");
maskPane.style.zIndex = "250";
maskPane.style.pointerEvents = "none";
```

Set `pane` on the base tile layers. When `active` and a matching `present` catalogue entry exist, create one `L.tileLayer(biomeTileUrl(active, generation), { ...tileOptions, pane: "native-map-biome-mask" })`. Remove the prior layer first and on cleanup. Toggle `is-biome-highlight-active` on `hostRef.current` only while that valid mask is mounted.

- [ ] **Step 4: Implement exact CSS interaction states**

Use shared inline swatch values supplied by the palette/catalogue, ordinary existing theme variables for row surfaces, a gold border for `.is-pinned`, muted copy and `cursor: not-allowed` for `.is-unavailable`, and the exact `brightness(32%)` selector. Add `transition: filter 120ms ease` only to the two base panes; do not animate operational overlays or the mask.

- [ ] **Step 5: Run map boundary tests and verify GREEN**

Run the Task 5 command again. Expected: PASS.

- [ ] **Step 6: Run all focused biome/terrain tests**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --test test/terrain-biomes.test.mjs test/terrain-palette-definition.test.mjs test/terrain-tile-renderer.test.mjs test/terrain-tile-store.test.mjs test/terrain-overview-store.test.mjs test/map-tiles.test.mjs test/terrain-tile-status.test.mjs test/map-biome-highlight-state.test.mjs test/map-biome-key.test.mjs test/map-page-boundary.test.mjs test/provider-neutral-browser-data.test.mjs
```

Expected: all focused tests PASS with zero failures.

- [ ] **Step 7: Commit Task 5**

```powershell
git add apps/bitcraft-local/src/pages/map/NativeMap.tsx apps/bitcraft-local/src/styles/map.css apps/bitcraft-local/test/map-page-boundary.test.mjs apps/bitcraft-local/test/provider-neutral-browser-data.test.mjs
git commit -m "feat(map): highlight biomes from the key"
```

---

### Task 6: Full Verification and Smoke Acceptance

**Files:**
- Modify only if verification exposes a requirement-specific defect in files already listed above.

**Interfaces:**
- Consumes the complete Tasks 1–5 implementation.
- Produces fresh build, full-suite, server-health, and browser acceptance evidence.

- [ ] **Step 1: Run the production build**

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: exit code `0`.

- [ ] **Step 2: Run the full application test suite once at final head**

```powershell
corepack pnpm --filter @workspace/bitcraft-local test
```

Expected: zero failed tests; only documented environment-specific skips are acceptable.

- [ ] **Step 3: Check the final diff and worktree scope**

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors and only intentional implementation/report files, if any, remain uncommitted.

- [ ] **Step 4: Restart the backend smoke server once**

Backend code changed, so run:

```powershell
node scripts/start-bitcraft-local-smoke.mjs --force-restart
curl.exe -s http://127.0.0.1:18449/api/local/health
```

Expected: launcher returns within 15 seconds and health returns HTTP `200` JSON.

- [ ] **Step 5: Wait for palette-version-4 terrain installation**

Poll no more often than every 15 seconds:

```powershell
curl.exe -s http://127.0.0.1:18449/api/local/map/tiles/status
```

Acceptance requires `available:true`, `paletteVersion:4`, a non-empty `biomes` array, and `channels.biomeMasks.tileCount > 0`. If the build exceeds its configured deadline, inspect `.codex-dev/bitcraft-local-smoke.err.log` once and report the exact blocker rather than repeatedly restarting.

- [ ] **Step 6: Browser-smoke the native map**

Open or reload:

```text
http://127.0.0.1:18449/?page=map&label=Zephra&x=27361&z=23715&regionId=19
```

Verify at desktop and mobile widths:

1. Key lists all live catalogue biomes and separately lists water types.
2. Calm Forest, Pine Woods, Breezy Grasslands, Misty Tundra, Swamp, Rocky Garden, Open Ocean, and Safe Meadows are marked present for the installed world.
3. Hovering a present biome after 100 ms dims only terrain/water and shows the mask.
4. Moving away restores a pinned biome or clears an unpinned preview.
5. Clicking pins; clicking again and pressing `Escape` clear.
6. Keyboard focus previews and buttons expose the correct pressed/disabled state.
7. Claims, roads, resources, players, controls, and popups remain undimmed and above the mask.
8. No browser console errors, repeated `404` storms, `429` responses, Relay requests, or third-party map/tile requests occur.

- [ ] **Step 7: Record final evidence and commit any verification-only test correction**

If verification required a narrow correction, repeat its RED/GREEN focused test, then repeat Steps 1–3 and commit only that correction:

```powershell
git add apps/bitcraft-local/src/shared/terrainBiomes.mjs apps/bitcraft-local/src/shared/terrainBiomes.d.mts apps/bitcraft-local/src/shared/terrainPaletteDefinition.mjs apps/bitcraft-local/src/server/terrainPalette.mjs apps/bitcraft-local/src/server/terrainTileRenderer.mjs apps/bitcraft-local/src/server/terrainTileStore.mjs apps/bitcraft-local/src/server/terrainOverviewStore.mjs apps/bitcraft-local/src/server/mapTiles.mjs apps/bitcraft-local/server.mjs apps/bitcraft-local/src/pages/map/terrainTileStatus.mjs apps/bitcraft-local/src/pages/map/terrainTileStatus.d.mts apps/bitcraft-local/src/pages/map/biomeHighlightState.mjs apps/bitcraft-local/src/pages/map/biomeHighlightState.d.mts apps/bitcraft-local/src/pages/map/MapBiomeKey.tsx apps/bitcraft-local/src/pages/map/NativeMap.tsx apps/bitcraft-local/src/styles/map.css apps/bitcraft-local/test/terrain-biomes.test.mjs apps/bitcraft-local/test/terrain-palette-definition.test.mjs apps/bitcraft-local/test/terrain-tile-renderer.test.mjs apps/bitcraft-local/test/terrain-tile-store.test.mjs apps/bitcraft-local/test/terrain-overview-store.test.mjs apps/bitcraft-local/test/map-tiles.test.mjs apps/bitcraft-local/test/terrain-tile-status.test.mjs apps/bitcraft-local/test/map-biome-highlight-state.test.mjs apps/bitcraft-local/test/map-biome-key.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs apps/bitcraft-local/test/provider-neutral-browser-data.test.mjs
git commit -m "fix(map): harden biome highlighting"
```

If no correction was needed, do not create an empty commit.
