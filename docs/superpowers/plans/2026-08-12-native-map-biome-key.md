# Native Map Biome Key Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an accessible Key button beside Layers that displays the canonical land-biome and water colours used by native terrain tiles.

**Architecture:** Move canonical palette definitions into one browser-safe shared module. The server terrain renderer and a focused React biome-key component both consume that module, ensuring a palette update changes tiles and legend swatches together without a new API request.

**Tech Stack:** React, TypeScript, plain CSS, JavaScript ESM modules, Node test runner, Vite.

## Global Constraints

- The key must use the terrain renderer's canonical colours; React and CSS must not duplicate palette values.
- Include grasslands, forest, desert, tundra, mountains, wetlands, volcanic terrain, unknown ground, lake, river, ocean, and swamp water.
- Explain that terrain shading varies with elevation, density, relief, coordinate texture, depth, and shorelines.
- Keep the key keyboard accessible, viewport-bounded, scrollable, and usable at mobile widths.
- Do not change map-layer visibility, persisted resource/enemy selections, tile generation semantics, or terrain shading.
- Do not add dependencies or network requests.

---

### Task 1: Establish a Shared Terrain Palette Definition

**Files:**
- Create: `apps/bitcraft-local/src/shared/terrainPaletteDefinition.mjs`
- Create: `apps/bitcraft-local/src/shared/terrainPaletteDefinition.d.mts`
- Modify: `apps/bitcraft-local/src/server/terrainPalette.mjs`
- Create: `apps/bitcraft-local/test/terrain-palette-definition.test.mjs`

**Interfaces:**
- Produces: `TERRAIN_PALETTE_VERSION: number`.
- Produces: `TERRAIN_WATER_COLOURS`, `TERRAIN_BIOME_COLOURS`, and `TERRAIN_UNKNOWN_GROUND_COLOUR` as read-only RGBA tuples.
- Produces: `TERRAIN_LEGEND_GROUPS`, an ordered read-only array of `{ key, label, entries }` groups whose entries are `{ key, label, rgba }`.
- Consumes: the same constants from `terrainPalette.mjs`; no duplicate renderer palette remains.

- [ ] **Step 1: Write the failing shared-definition test**

Create `terrain-palette-definition.test.mjs` that imports the wished-for shared module and asserts the exact public behavior:

```js
import test from "node:test";
import assert from "node:assert/strict";

import {
  TERRAIN_BIOME_COLOURS,
  TERRAIN_LEGEND_GROUPS,
  TERRAIN_UNKNOWN_GROUND_COLOUR,
  TERRAIN_WATER_COLOURS,
} from "../src/shared/terrainPaletteDefinition.mjs";

test("terrain legend entries reference the canonical renderer colour tuples", () => {
  const entries = TERRAIN_LEGEND_GROUPS.flatMap((group) => group.entries);
  const byKey = new Map(entries.map((entry) => [entry.key, entry]));

  assert.equal(byKey.get("grasslands").rgba, TERRAIN_BIOME_COLOURS.grasslands);
  assert.equal(byKey.get("mountains").rgba, TERRAIN_BIOME_COLOURS.mountains);
  assert.equal(byKey.get("unknown-ground").rgba, TERRAIN_UNKNOWN_GROUND_COLOUR);
  assert.equal(byKey.get("lake").rgba, TERRAIN_WATER_COLOURS.lake);
  assert.equal(byKey.get("river").rgba, TERRAIN_WATER_COLOURS.river);
  assert.equal(byKey.get("ocean").rgba, TERRAIN_WATER_COLOURS.ocean);
  assert.equal(byKey.get("swamp-water").rgba, TERRAIN_WATER_COLOURS.swamp);
  assert.deepEqual(TERRAIN_LEGEND_GROUPS.map((group) => group.label), ["Land biomes", "Water types"]);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```sh
node --test apps/bitcraft-local/test/terrain-palette-definition.test.mjs
```

Expected: FAIL because `terrainPaletteDefinition.mjs` does not exist.

- [ ] **Step 3: Implement the shared definition**

Create the shared ESM module with the existing palette version and existing RGBA tuples. Preserve `mountain` and land `swamp` as renderer aliases, but expose only the approved legend entries. Build `TERRAIN_LEGEND_GROUPS` by referencing the exported tuples, not by copying arrays:

```js
export const TERRAIN_PALETTE_VERSION = 3;
export const TERRAIN_WATER_COLOURS = Object.freeze({
  lake: Object.freeze([35, 68, 103, 255]),
  river: Object.freeze([48, 92, 122, 255]),
  ocean: Object.freeze([20, 43, 72, 255]),
  "ocean-biome": Object.freeze([20, 43, 72, 255]),
  swamp: Object.freeze([43, 72, 65, 255]),
});
export const TERRAIN_BIOME_COLOURS = Object.freeze({
  grasslands: Object.freeze([67, 83, 53, 255]),
  forest: Object.freeze([39, 66, 45, 255]),
  desert: Object.freeze([130, 109, 61, 255]),
  tundra: Object.freeze([105, 116, 111, 255]),
  mountains: Object.freeze([89, 87, 82, 255]),
  mountain: Object.freeze([89, 87, 82, 255]),
  wetlands: Object.freeze([53, 75, 55, 255]),
  swamp: Object.freeze([53, 75, 55, 255]),
  volcanic: Object.freeze([78, 62, 57, 255]),
});
export const TERRAIN_UNKNOWN_GROUND_COLOUR = Object.freeze([84, 89, 80, 255]);
```

Add the ordered groups and a declaration file defining a read-only four-number tuple and the public structures. Update `terrainPalette.mjs` to import and use these constants, while continuing to export `TERRAIN_PALETTE_VERSION` for existing callers. Do not change `terrainCellRgba` calculations.

- [ ] **Step 4: Run focused palette tests and verify GREEN**

Run:

```sh
node --test apps/bitcraft-local/test/terrain-palette-definition.test.mjs apps/bitcraft-local/test/terrain-tile-renderer.test.mjs apps/bitcraft-local/test/terrain-tile-store.test.mjs apps/bitcraft-local/test/terrain-runtime.test.mjs
```

Expected: all tests PASS, including existing exact palette-version and shading assertions.

- [ ] **Step 5: Commit Task 1**

```sh
git add apps/bitcraft-local/src/shared/terrainPaletteDefinition.mjs apps/bitcraft-local/src/shared/terrainPaletteDefinition.d.mts apps/bitcraft-local/src/server/terrainPalette.mjs apps/bitcraft-local/test/terrain-palette-definition.test.mjs
git commit -m "refactor(map): share terrain palette definitions"
```

---

### Task 2: Add the Accessible Biome Key Control

**Files:**
- Create: `apps/bitcraft-local/src/pages/map/MapBiomeKey.tsx`
- Modify: `apps/bitcraft-local/src/pages/map/NativeMap.tsx`
- Modify: `apps/bitcraft-local/src/styles/map.css`
- Modify: `apps/bitcraft-local/test/map-page-boundary.test.mjs`
- Create: `apps/bitcraft-local/test/map-biome-key.test.mjs`

**Interfaces:**
- Consumes: `TERRAIN_LEGEND_GROUPS` from Task 1.
- Produces: `MapBiomeKey(): React.ReactElement`, a self-contained button/popover control with no props and no network access.
- NativeMap places `MapLayersControl` and `MapBiomeKey` inside `.native-map-controls`.

- [ ] **Step 1: Write failing component and boundary tests**

Create `map-biome-key.test.mjs` as a source boundary test that proves the component imports the canonical legend, exposes the accessible toggle contract, renders every group/entry, and contains no literal RGB/hex palette values:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("map biome key renders the shared land and water legend accessibly", async () => {
  const source = await readFile(new URL("../src/pages/map/MapBiomeKey.tsx", import.meta.url), "utf8");
  assert.match(source, /TERRAIN_LEGEND_GROUPS/);
  assert.match(source, /aria-expanded=\{open\}/);
  assert.match(source, /aria-controls="native-map-biome-key-popover"/);
  assert.match(source, /TERRAIN_LEGEND_GROUPS\.map/);
  assert.match(source, /group\.entries\.map/);
  assert.doesNotMatch(source, /#[0-9a-f]{3,8}|rgb\s*\(/i);
});
```

Extend `map-page-boundary.test.mjs` to require `<MapBiomeKey />`, a shared `.native-map-controls` wrapper, `>Key</span>`, the variation note, viewport-bounded popover CSS, and a two-column swatch grid that collapses on narrow screens.

- [ ] **Step 2: Run tests and verify RED**

Run:

```sh
node --test apps/bitcraft-local/test/map-biome-key.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs
```

Expected: FAIL because `MapBiomeKey.tsx` and the control wrapper do not exist.

- [ ] **Step 3: Implement the focused React component**

Create `MapBiomeKey.tsx` with local open state, the Lucide `Map` or `Palette` icon, and the shared legend:

```tsx
export function MapBiomeKey() {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="native-map-biome-key">
      <button type="button" className="native-map-layers-button" aria-expanded={open}
        aria-controls="native-map-biome-key-popover" onClick={() => setOpen((value) => !value)}>
        <Palette size={16} aria-hidden="true" />
        <span>Key</span>
      </button>
      {open ? (
        <div id="native-map-biome-key-popover" className="native-map-biome-key-popover" role="group" aria-label="Terrain colour key">
          {TERRAIN_LEGEND_GROUPS.map((group) => (
            <section key={group.key} aria-labelledby={`native-map-biome-key-${group.key}`}>
              <h3 id={`native-map-biome-key-${group.key}`}>{group.label}</h3>
              <div className="native-map-biome-key-grid">
                {group.entries.map((entry) => (
                  <div className="native-map-biome-key-row" key={entry.key}>
                    <span className="native-map-biome-key-swatch" aria-hidden="true"
                      style={{ backgroundColor: `rgba(${entry.rgba[0]}, ${entry.rgba[1]}, ${entry.rgba[2]}, ${entry.rgba[3] / 255})` }} />
                    <span>{entry.label}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
          <p>Terrain shading varies with elevation, biome density, relief, texture, water depth, and shorelines.</p>
        </div>
      ) : null}
    </div>
  );
}
```

Import the component in `NativeMap.tsx` and render:

```tsx
<div className="native-map-controls">
  <MapLayersControl ... />
  <MapBiomeKey />
</div>
```

Move absolute top-left positioning from `.native-map-layers-control` to `.native-map-controls`. Give the wrapper an inline-flex row, give each child `position: relative`, and position both popovers below their own button. Use existing panel, border, text, and shadow tokens. Bound the key popover with `max-height: min(30rem, calc(100dvh - 8rem))` and `overflow: auto`. Use two swatch columns on desktop and one under `620px`.

- [ ] **Step 4: Run component tests and verify GREEN**

Run:

```sh
node --test apps/bitcraft-local/test/map-biome-key.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs apps/bitcraft-local/test/terrain-palette-definition.test.mjs
```

Expected: all tests PASS.

- [ ] **Step 5: Build the application**

Run:

```sh
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: exit 0 with the server, TypeScript, Vite, asset, and runtime-boundary checks passing.

- [ ] **Step 6: Verify in the smoke browser**

Run:

```powershell
node scripts/start-bitcraft-local-smoke.mjs --restart
curl.exe -s http://127.0.0.1:18449/api/local/health
```

At `http://127.0.0.1:18449/?page=map`, verify:

- `Key` is immediately beside `Layers`.
- Clicking `Key` opens and closes the terrain colour popover.
- Both land and water groups are visible.
- Swatches have computed colours from `TERRAIN_LEGEND_GROUPS`.
- The variation note is visible.
- The popover remains within the map viewport at desktop and mobile widths.
- Existing layer toggles and selected resources remain unchanged.
- The browser console has no errors.

- [ ] **Step 7: Commit Task 2**

```sh
git add apps/bitcraft-local/src/pages/map/MapBiomeKey.tsx apps/bitcraft-local/src/pages/map/NativeMap.tsx apps/bitcraft-local/src/styles/map.css apps/bitcraft-local/test/map-biome-key.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs
git commit -m "feat(map): add terrain colour key"
```

---

### Task 3: Final Regression Verification

**Files:**
- No production files expected.
- Modify only files implicated by a genuine failing regression.

**Interfaces:**
- Consumes: the completed shared palette and map key.
- Produces: final verification evidence at the committed head.

- [ ] **Step 1: Run the full application test suite**

```sh
corepack pnpm --filter @workspace/bitcraft-local test
```

Expected: all tests PASS except the repository's two documented Windows/environment skips.

- [ ] **Step 2: Check the final diff and worktree**

```sh
git diff --check
git status --short
```

Expected: no whitespace errors and no uncommitted task files.
