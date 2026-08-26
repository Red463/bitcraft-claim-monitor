# Native Map Synthetic Ocean Colour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the synthetic ocean underlay use the same deep-water shading as generated ocean tiles so zoomed-out region boundaries blend into the background.

**Architecture:** Extract the existing water-channel shading into the shared terrain-palette boundary so the server renderer and browser underlay consume one implementation. Then simplify the synthetic SVG to one uniform deep-ocean rectangle, leaving all layer lifecycle, bounds, and terrain-pack behavior unchanged.

**Tech Stack:** JavaScript ES modules, TypeScript declaration files, Node.js test runner, React/Leaflet SVG overlay.

## Global Constraints

- Change only the decorative synthetic-ocean colour treatment and the shared water-colour calculation it consumes.
- Keep world bounds, pane ordering, terrain availability rules, and provider-neutral data flow unchanged.
- Do not regenerate terrain packs or introduce synthetic terrain, water, or biome records.
- Do not add dependencies, remote assets, animation, browser-side Relay access, or a second independently maintained ocean palette.
- Use test-first development and memory-cap every local Node process with `--max-old-space-size=256`.
- Do not run the local full suite, full build, world generation, or dense benchmark on this workstation; GitHub CI owns broad verification if the branch is published.

---

### Task 1: Share the canonical water-shading calculation

**Files:**
- Modify: `apps/bitcraft-local/src/shared/terrainPaletteDefinition.mjs`
- Modify: `apps/bitcraft-local/src/shared/terrainPaletteDefinition.d.mts`
- Modify: `apps/bitcraft-local/src/server/terrainPalette.mjs`
- Test: `apps/bitcraft-local/test/terrain-palette-definition.test.mjs`
- Test: `apps/bitcraft-local/test/terrain-tile-renderer.test.mjs`

**Interfaces:**
- Consumes: `TERRAIN_WATER_COLOURS: Readonly<Record<string, TerrainRgba>>`.
- Produces: `terrainWaterRgba(options): TerrainRgba | null`, where `options` is `{ surface: string; depth?: number; shoreline?: boolean; texture?: number }`.
- Preserves: the exact existing depth, shoreline, texture, clamping, and alpha behavior of `terrainCellRgba()`.

- [ ] **Step 1: Write the failing shared-palette tests**

Add the import and assertions to `terrain-palette-definition.test.mjs`:

```js
import {
  TERRAIN_PALETTE_VERSION,
  TERRAIN_LEGEND_GROUPS,
  TERRAIN_WATER_COLOURS,
  terrainWaterRgba,
} from "../src/shared/terrainPaletteDefinition.mjs";

test("shared water shading exposes the renderer's deep-ocean colour", () => {
  assert.deepEqual(
    terrainWaterRgba({ surface: "ocean", depth: 24, shoreline: false, texture: 0 }),
    [8, 31, 78, 255],
  );
  assert.deepEqual(
    terrainWaterRgba({ surface: "ocean", depth: 2, shoreline: true, texture: 0 }),
    [32, 55, 78, 255],
  );
  assert.equal(terrainWaterRgba({ surface: "ground" }), null);
});
```

In `terrain-tile-renderer.test.mjs`, import the shared helper, retain the existing deep/coast tests, and add a comparison proving the renderer consumes the shared function:

```js
import { terrainWaterRgba } from "../src/shared/terrainPaletteDefinition.mjs";

assert.deepEqual(
  paletteModule.terrainCellRgba({
    surface: "ocean",
    biomeContributions: [],
    elevation: -10,
    depth: 24,
    shoreline: false,
    mapX: 0,
    mapZ: 0,
  }),
  terrainWaterRgba({ surface: "ocean", depth: 24, shoreline: false, texture: -3 }),
);
```

- [ ] **Step 2: Run the tests to verify RED**

Run from `apps/bitcraft-local`:

```powershell
node --max-old-space-size=256 --test test/terrain-palette-definition.test.mjs test/terrain-tile-renderer.test.mjs
```

Expected: FAIL because `terrainWaterRgba` is not exported.

- [ ] **Step 3: Implement the shared water function**

Add to `terrainPaletteDefinition.mjs` after `TERRAIN_WATER_COLOURS`:

```js
const clampWaterChannel = (value) => Math.max(0, Math.min(255, value));

export function terrainWaterRgba({ surface, depth = 0, shoreline = false, texture = 0 } = {}) {
  const water = TERRAIN_WATER_COLOURS[surface];
  if (!water) return null;
  const boundedDepth = Math.max(0, Math.min(24, Number(depth) || 0));
  const depthShade = Math.trunc(boundedDepth / 2);
  const coastShade = shoreline ? 13 : 0;
  return [
    clampWaterChannel(water[0] - depthShade + coastShade + texture),
    clampWaterChannel(water[1] - depthShade + coastShade + texture),
    clampWaterChannel(water[2] + Math.trunc(depthShade / 2) + Math.trunc(coastShade / 2) + texture),
    255,
  ];
}
```

Add this declaration to `terrainPaletteDefinition.d.mts`:

```ts
export function terrainWaterRgba(options: Readonly<{
  surface: string;
  depth?: number;
  shoreline?: boolean;
  texture?: number;
}>): TerrainRgba | null;
```

Update `src/server/terrainPalette.mjs` to import `terrainWaterRgba` and replace its inline water block with:

```js
const water = terrainWaterRgba({ surface, depth, shoreline, texture });
if (water) return water;
```

Keep the existing local `clamp()` function because ground shading still uses it.

- [ ] **Step 4: Run the focused tests to verify GREEN**

Run:

```powershell
node --max-old-space-size=256 --test test/terrain-palette-definition.test.mjs test/terrain-tile-renderer.test.mjs
```

Expected: all tests PASS with existing water-renderer assertions unchanged.

- [ ] **Step 5: Commit Task 1**

```powershell
git add apps/bitcraft-local/src/shared/terrainPaletteDefinition.mjs apps/bitcraft-local/src/shared/terrainPaletteDefinition.d.mts apps/bitcraft-local/src/server/terrainPalette.mjs apps/bitcraft-local/test/terrain-palette-definition.test.mjs apps/bitcraft-local/test/terrain-tile-renderer.test.mjs
git commit -m "refactor(map): share terrain water shading"
```

---

### Task 2: Render one uniform deep-ocean underlay

**Files:**
- Modify: `apps/bitcraft-local/src/pages/map/syntheticOceanUnderlay.mjs`
- Modify: `apps/bitcraft-local/src/pages/map/syntheticOceanUnderlay.d.mts`
- Test: `apps/bitcraft-local/test/native-map-synthetic-ocean.test.mjs`
- Test: `apps/bitcraft-local/test/map-page-boundary.test.mjs`

**Interfaces:**
- Consumes: `terrainWaterRgba({ surface: "ocean", depth: 24, shoreline: false, texture: 0 }): TerrainRgba` from Task 1.
- Produces: `syntheticOceanColours(): Readonly<{ base: string }>`.
- Preserves: `SYNTHETIC_OCEAN_LEAFLET_BOUNDS`, `terrainStatusSupportsSyntheticOcean()`, `createSyntheticOceanLayerController()`, and the existing Leaflet pane lifecycle.

- [ ] **Step 1: Write the failing SVG tests**

Replace the current colour and SVG shape assertions in `native-map-synthetic-ocean.test.mjs` with:

```js
import { terrainWaterRgba } from "../src/shared/terrainPaletteDefinition.mjs";

test("synthetic ocean uses the canonical deep-ocean renderer colour", () => {
  const [red, green, blue] = terrainWaterRgba({
    surface: "ocean",
    depth: 24,
    shoreline: false,
    texture: 0,
  });
  assert.deepEqual(syntheticOceanColours(), { base: `rgb(${red} ${green} ${blue})` });
});

test("synthetic ocean SVG is a uniform decorative world-sized fill", () => {
  const svg = createSyntheticOceanSvg(fakeDocument);
  assert.equal(svg.tagName, "svg");
  assert.equal(svg.attributes.get("viewBox"), "0 0 38400 38400");
  assert.equal(svg.attributes.get("preserveAspectRatio"), "none");
  assert.equal(svg.attributes.get("aria-hidden"), "true");
  assert.equal(svg.attributes.get("focusable"), "false");
  assert.deepEqual(svg.children.map(({ tagName }) => tagName), ["rect"]);
  assert.equal(svg.children[0].attributes.get("fill"), syntheticOceanColours().base);
  assert.doesNotMatch(svgAttributeText(svg), /gradient|ellipse|https?:|animation|animate/i);
});
```

Retain all existing bounds, status, controller cleanup, and failure-containment tests. Add a boundary assertion to `map-page-boundary.test.mjs` that the native map still constructs one non-interactive SVG overlay in the `native-map-ocean` pane; do not assert internal SVG shape there.

- [ ] **Step 2: Run the tests to verify RED**

Run:

```powershell
node --max-old-space-size=256 --test test/native-map-synthetic-ocean.test.mjs test/map-page-boundary.test.mjs
```

Expected: FAIL because the current API returns light/dark colours and the SVG contains gradient definitions and ellipses.

- [ ] **Step 3: Implement the uniform underlay**

In `syntheticOceanUnderlay.mjs`:

- Import `terrainWaterRgba` instead of `TERRAIN_WATER_COLOURS`.
- Remove `clampChannel`, `mixChannel`, and `mixRgb`.
- Implement the colour seam as:

```js
export function syntheticOceanColours() {
  const ocean = terrainWaterRgba({ surface: "ocean", depth: 24, shoreline: false, texture: 0 });
  if (!ocean) throw new Error("Canonical ocean colour is unavailable");
  return Object.freeze({ base: rgb(ocean) });
}
```

- In `createSyntheticOceanSvg()`, append only:

```js
svg.appendChild(svgElement(documentLike, "rect", {
  width,
  height,
  fill: syntheticOceanColours().base,
}));
```

- Remove the `<defs>`, radial gradients, and three ellipses.
- Update `syntheticOceanUnderlay.d.mts` to return `Readonly<{ base: string }>`.

Do not change `NativeMap.tsx`, the pane order, bounds, controller, or status synchronization.

- [ ] **Step 4: Run focused map tests to verify GREEN**

Run:

```powershell
node --max-old-space-size=256 --test test/native-map-synthetic-ocean.test.mjs test/map-page-boundary.test.mjs test/terrain-palette-definition.test.mjs test/terrain-tile-renderer.test.mjs test/map-coordinates.test.mjs
```

Expected: all tests PASS.

- [ ] **Step 5: Run static safety checks**

Run from the repository root:

```powershell
rg -n "https?://|bitcraftmap|prism|bitjita" apps/bitcraft-local/src/pages/map/syntheticOceanUnderlay.mjs
git diff --check
```

Expected: the URL scan finds only the standard W3C SVG namespace URL; `git diff --check` exits 0.

- [ ] **Step 6: Commit Task 2**

```powershell
git add apps/bitcraft-local/src/pages/map/syntheticOceanUnderlay.mjs apps/bitcraft-local/src/pages/map/syntheticOceanUnderlay.d.mts apps/bitcraft-local/test/native-map-synthetic-ocean.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs
git commit -m "fix(map): blend synthetic ocean with deep water"
```

---

### Task 3: Verify the integrated visual result without stressing the workstation

**Files:**
- No production file changes.
- Review: `docs/superpowers/specs/2026-08-14-native-map-synthetic-ocean-colour-design.md`

**Interfaces:**
- Consumes: the shared water shading and uniform SVG from Tasks 1–2.
- Produces: verification evidence that the focused tests pass and the zoomed-out world has no abrupt synthetic-ocean rectangles.

- [ ] **Step 1: Run the complete focused test set once**

Run from `apps/bitcraft-local`:

```powershell
node --max-old-space-size=256 --test test/native-map-synthetic-ocean.test.mjs test/map-page-boundary.test.mjs test/terrain-palette-definition.test.mjs test/terrain-tile-renderer.test.mjs test/map-coordinates.test.mjs
```

Expected: all tests PASS under the 256 MiB heap cap.

- [ ] **Step 2: Confirm the final diff is scoped and clean**

Run from the repository root:

```powershell
git status --short
git diff --check origin/main...HEAD
git diff --stat origin/main...HEAD
```

Expected: only the approved spec/plan, shared water shading, synthetic underlay, declaration files, and focused tests differ; diff check exits 0.

- [ ] **Step 3: Delegate broad verification if publishing**

Do not run the local full build or suite. If the user requests publication, push the branch and require GitHub CI's clean-install application build and full test suite to pass before merge or deployment.

- [ ] **Step 4: Visually verify after a remotely built deployment**

Open the production map zoomed out to the whole world with Terrain enabled. Confirm:

- synthetic corner water is the same deep navy family as ocean at generated tile edges;
- no large light/dark radial patches remain;
- terrain, water, roads, claims, watchtowers, and selected resources still render;
- the browser reports no map, tile, resource, fetch, or 429 warnings.

If the branch is not being published in this execution, report that this visual step remains pending rather than using stale locally built assets.

- [ ] **Step 5: Record completion**

Report focused test counts, remote CI status if applicable, visual results if deployed, every skipped heavy local check, and whether any user/VPS action remains.
