# Native Map Marker and Biome Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct clipped NPC badges, install a smaller supplied watchtower badge, and make the Biomes panel concise and generation-relevant.

**Architecture:** Keep marker asset selection centralized in `mapMarkerPresentation.mjs`, give NPC claims and watchtowers independent presentation classes instead of sharing tier-badge crop geometry, and derive the Biomes panel directly from current terrain `present` flags and palette definitions.

**Tech Stack:** React, TypeScript, Leaflet 1.9.4, plain CSS, Lucide icons, Node test runner.

## Global Constraints

- Use the supplied raster assets without AI regeneration or remote image dependencies.
- NPC and watchtower badges use isolated presentation geometry; watchtowers render smaller than claims.
- Biome and water colours continue to come from the live terrain palette definitions.
- The Biomes panel shows only entries present in the current generated terrain data.
- Preserve hover preview, click pinning, Escape clearing, keyboard focus, layer toggles, and marker tooltips.
- Do not alter resource architecture, terrain generation, road generation, package version, or changelog in this plan.

---

## File Structure

- Copy `C:/Users/Tom/Pictures/Bitcraft Calim Monitor/map icons/claim/watchtower.png` to `apps/bitcraft-local/public/map-icons/claims/watchtower.png`.
- Modify `apps/bitcraft-local/src/pages/map/mapMarkerPresentation.mjs`: return distinct NPC and watchtower presentation variants.
- Modify `apps/bitcraft-local/src/pages/map/mapMarkerPresentation.d.mts`: type the presentation variant/class field.
- Modify `apps/bitcraft-local/src/pages/map/NativeMap.tsx`: attach variant classes to Leaflet marker HTML.
- Modify `apps/bitcraft-local/src/styles/map.css`: independent NPC and watchtower sizes/crops.
- Modify `apps/bitcraft-local/src/pages/map/MapBiomeKey.tsx`: rename, filter, reorder helper text, and change icon.
- Modify `apps/bitcraft-local/src/server/terrainTileRenderer.mjs`: report the water surface keys encountered while rendering.
- Modify `apps/bitcraft-local/src/server/terrainTileStore.mjs`: persist present water keys in the installed terrain manifest.
- Modify `apps/bitcraft-local/src/server/mapTiles.mjs`: expose only normalized public water-presence metadata.
- Modify `apps/bitcraft-local/src/pages/map/terrainTileStatus.mjs` and `.d.mts`: validate and type water-presence metadata.
- Modify focused marker, biome, and boundary tests.

### Task 1: Isolate NPC and watchtower badge geometry

**Files:**
- Copy: `C:/Users/Tom/Pictures/Bitcraft Calim Monitor/map icons/claim/watchtower.png`
- Create: `apps/bitcraft-local/public/map-icons/claims/watchtower.png`
- Modify: `apps/bitcraft-local/src/pages/map/mapMarkerPresentation.mjs`
- Modify: `apps/bitcraft-local/src/pages/map/mapMarkerPresentation.d.mts`
- Modify: `apps/bitcraft-local/src/pages/map/NativeMap.tsx`
- Modify: `apps/bitcraft-local/src/styles/map.css`
- Test: `apps/bitcraft-local/test/map-marker-presentation.test.mjs`
- Test: `apps/bitcraft-local/test/map-page-boundary.test.mjs`

**Interfaces:**
- `MapMarkerPresentation` gains `variant?: "claim-tier" | "claim-npc" | "watchtower"`.
- `claimMarkerPresentation(tier, true)` returns the NPC image with `variant: "claim-npc"` and no tier crop flag.
- `mapMarkerPresentation("watchtower")` returns `/map-icons/claims/watchtower.png` with `variant: "watchtower"`.
- `markerIcon` adds `native-map-marker--<variant>` to the generated root class.

- [ ] **Step 1: Copy the supplied watchtower asset**

Use a binary-safe filesystem copy from the exact supplied path to the maintained public icon directory. Confirm source and destination SHA-256 hashes match.

- [ ] **Step 2: Write RED presentation tests**

```js
test("NPC claims use uncropped isolated badge geometry", () => {
  assert.deepEqual(claimMarkerPresentation(7, true), {
    mode: "image", iconUrl: "/map-icons/claims/claim_npc.png", glyph: "NPC", variant: "claim-npc",
  });
});

test("watchtowers use the supplied isolated badge", () => {
  assert.deepEqual(mapMarkerPresentation("watchtower"), {
    mode: "image", iconUrl: "/map-icons/claims/watchtower.png", glyph: "T", variant: "watchtower",
  });
});
```

- [ ] **Step 3: Run focused tests and confirm RED**

Run: `node --experimental-strip-types --test apps/bitcraft-local/test/map-marker-presentation.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs`

Expected: FAIL because NPC still uses `badgeCrop` and watchtower still uses a glyph.

- [ ] **Step 4: Implement presentation variants**

Keep tier claims on the current `claim-tier` crop. Return distinct variants for NPC and watchtower. Update `markerIcon` to append the variant class without changing popup, tooltip, keyboard, or pane behavior.

- [ ] **Step 5: Add independent CSS geometry**

Use these constraints rather than the tier badge's clipped 48-in-36 overscan:

```css
.native-map-marker--claim-npc { width: 32px; height: 32px; }
.native-map-marker--claim-npc .native-map-marker-content { width: 32px; height: 32px; overflow: visible; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
.native-map-marker--claim-npc img { width: 32px; height: 32px; object-fit: contain; }
.native-map-marker--watchtower { width: 24px; height: 24px; }
.native-map-marker--watchtower .native-map-marker-content { width: 24px; height: 24px; overflow: visible; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
.native-map-marker--watchtower img { width: 24px; height: 24px; object-fit: contain; }
```

Adjust only if browser inspection shows transparent source margins require a smaller CSS inset; never apply the tier badge clip-path to these variants.

- [ ] **Step 6: Run focused tests and build**

Run: `node --experimental-strip-types --test apps/bitcraft-local/test/map-marker-presentation.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs`

Run: `corepack pnpm --filter @workspace/bitcraft-local run build`

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

```powershell
git add apps/bitcraft-local/public/map-icons/claims/watchtower.png apps/bitcraft-local/src/pages/map/mapMarkerPresentation.mjs apps/bitcraft-local/src/pages/map/mapMarkerPresentation.d.mts apps/bitcraft-local/src/pages/map/NativeMap.tsx apps/bitcraft-local/src/styles/map.css apps/bitcraft-local/test/map-marker-presentation.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs
git commit -m "fix(map): polish NPC and watchtower badges"
```

### Task 2: Show only present terrain entries in Biomes

**Files:**
- Modify: `apps/bitcraft-local/src/pages/map/MapBiomeKey.tsx`
- Modify: `apps/bitcraft-local/src/pages/map/NativeMap.tsx`
- Modify: `apps/bitcraft-local/src/server/terrainTileRenderer.mjs`
- Modify: `apps/bitcraft-local/src/server/terrainTileStore.mjs`
- Modify: `apps/bitcraft-local/src/server/mapTiles.mjs`
- Modify: `apps/bitcraft-local/src/pages/map/terrainTileStatus.mjs`
- Modify: `apps/bitcraft-local/src/pages/map/terrainTileStatus.d.mts`
- Modify: `apps/bitcraft-local/src/styles/map.css`
- Test: `apps/bitcraft-local/test/terrain-tile-renderer.test.mjs`
- Test: `apps/bitcraft-local/test/terrain-tile-store.test.mjs`
- Test: `apps/bitcraft-local/test/map-tiles.test.mjs`
- Test: `apps/bitcraft-local/test/map-biome-key.test.mjs`
- Test: `apps/bitcraft-local/test/map-page-boundary.test.mjs`

**Interfaces:**
- Toolbar label and popover accessible name become `Biomes`.
- The toolbar uses Lucide `Trees`.
- `presentBiomes = biomes.filter((biome) => biome.present).sort(...)`.
- `MapBiomeKey` receives `waterTypes: string[]` from `terrainStatus.waterTypes`.
- Terrain status adds `waterTypes: string[]`, restricted to keys exported by `TERRAIN_WATER_COLOURS`.
- Water entries remain palette-derived and are filtered to `waterTypes`, mapping the public `swamp-water` legend key to the renderer surface key `swamp`.

- [ ] **Step 1: Write RED component boundary tests**

Assert that source:

- imports `Trees`, not `Palette`;
- renders `<span>Biomes</span>`;
- filters `biome.present` before mapping;
- does not render `Not present in this terrain generation`;
- places `Hover or focus to preview; click to pin.` before the biome grid;
- retains both Biomes and Water types sections.

- [ ] **Step 2: Write RED terrain water-presence tests**

Add renderer/store/status cases proving a fixture containing `lake` and `ocean` returns `waterTypes: ["lake", "ocean"]`, persists those keys in the installed manifest, exposes them from `/api/local/map/tiles/status`, and rejects unknown keys in the browser validator.

- [ ] **Step 3: Run focused tests and confirm RED**

Run: `node --experimental-strip-types --test apps/bitcraft-local/test/terrain-tile-renderer.test.mjs apps/bitcraft-local/test/terrain-tile-store.test.mjs apps/bitcraft-local/test/map-tiles.test.mjs apps/bitcraft-local/test/map-biome-key.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs`

Expected: FAIL on missing water metadata, the old Key label, Palette icon, absent rows, and helper placement.

- [ ] **Step 4: Record actual water types during terrain generation**

In `renderTerrainTileChannels`, add each non-ground `cell.surface` to a `Set` and return a sorted `waterTypes` array with the encoded channels. In `terrainTileStore`, union those arrays across tiles and persist the sorted set in the manifest. In `mapTiles.mjs`, expose only `lake`, `river`, `ocean`, `ocean-biome`, and `swamp`; return `waterTypes: []` when no manifest exists. Update `terrainTileStatus` validation and types accordingly.

- [ ] **Step 5: Implement the present-only panel**

Replace `Palette` with `Trees`. Rename the control and accessible labels to Biomes. Pass `terrainStatus.waterTypes` from `NativeMap` to `MapBiomeKey`. Move both explanatory paragraphs directly below the popover heading, then render present biome entries and only water legend entries found in `waterTypes` (`swamp-water` matches `swamp`). Remove unavailable button classes, disabled states, titles, and `Not present` copy. Render `No biome or water colours are available for this terrain generation.` when neither group has entries.

- [ ] **Step 6: Preserve interactions**

Keep `onPointerEnter`, `onPointerLeave`, `onFocus`, `onBlur`, `onClick`, `aria-pressed`, and Escape handling unchanged for every rendered biome row. Water swatches remain informational and palette-derived.

- [ ] **Step 7: Adjust only necessary spacing**

Update the nearest `native-map-biome-key-*` rules so top helper text has compact spacing and the present-only list retains the existing dense operational layout. Do not restyle unrelated map controls.

- [ ] **Step 8: Run focused tests and build**

Run: `node --experimental-strip-types --test apps/bitcraft-local/test/terrain-tile-renderer.test.mjs apps/bitcraft-local/test/terrain-tile-store.test.mjs apps/bitcraft-local/test/map-tiles.test.mjs apps/bitcraft-local/test/map-biome-key.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs`

Run: `corepack pnpm --filter @workspace/bitcraft-local run build`

Expected: PASS.

- [ ] **Step 9: Commit Task 2**

```powershell
git add apps/bitcraft-local/src/pages/map/MapBiomeKey.tsx apps/bitcraft-local/src/pages/map/NativeMap.tsx apps/bitcraft-local/src/server/terrainTileRenderer.mjs apps/bitcraft-local/src/server/terrainTileStore.mjs apps/bitcraft-local/src/server/mapTiles.mjs apps/bitcraft-local/src/pages/map/terrainTileStatus.mjs apps/bitcraft-local/src/pages/map/terrainTileStatus.d.mts apps/bitcraft-local/src/styles/map.css apps/bitcraft-local/test/terrain-tile-renderer.test.mjs apps/bitcraft-local/test/terrain-tile-store.test.mjs apps/bitcraft-local/test/map-tiles.test.mjs apps/bitcraft-local/test/map-biome-key.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs
git commit -m "feat(map): simplify the Biomes key"
```

### Task 3: Visual acceptance on the smoke server

**Files:**
- Modify tests/CSS only if visual smoke exposes a reproducible defect.

**Interfaces:**
- Consumes Tasks 1 and 2.
- Produces visually verified native markers and Biomes controls.

- [ ] **Step 1: Build the frontend**

Run: `corepack pnpm --filter @workspace/bitcraft-local run build`

Expected: PASS.

- [ ] **Step 2: Ensure the smoke server is running**

Run: `node scripts/start-bitcraft-local-smoke.mjs --restart`

Expected: command returns within 15 seconds. A force restart is unnecessary when this plan follows the already restarted resource backend build.

- [ ] **Step 3: Inspect NPC and watchtower markers**

At `http://127.0.0.1:18449/?page=map`, verify the full NPC white/blue outline is visible, tier claim badges are unchanged, watchtowers use the supplied tower image, watchtowers are smaller than claims, and marker tooltips/toggles still work.

- [ ] **Step 4: Inspect the Biomes panel**

Verify the toolbar says Biomes with a tree icon; helper text appears above entries; absent biomes do not appear; water types remain; hover/focus highlights; click pins; Escape clears; and the panel is usable at desktop and mobile widths.

- [ ] **Step 5: Inspect console and network**

Confirm no React, Leaflet, asset 404, or accessibility console error, and no remote icon/tile request.

- [ ] **Step 6: Commit only a verified correction, if required**

If inspection requires a narrow CSS correction, add a focused boundary assertion where practical, rerun build, and commit it as `fix(map): refine native map badges`. Otherwise do not create an empty commit.
