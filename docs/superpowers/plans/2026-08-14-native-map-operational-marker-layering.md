# Native Map Operational Marker Layering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep claims, watchtowers, other operational markers, player dots, and all map tooltips visible above dense resource nodes.

**Architecture:** Add one dependency-light pane-order module that owns the browser map's semantic z-index hierarchy and applies it to Leaflet pane elements during map initialization. Keep resource rendering, marker creation, and tooltip behavior unchanged except that the shared operational canvas renderer explicitly targets Leaflet's marker pane.

**Tech Stack:** React, TypeScript, Leaflet 1.9.x, JavaScript ES modules, Node's built-in test runner.

## Global Constraints

- Preserve the exact stacking order `resources 550 < operational markers 600 < players 700 < tooltips 750`.
- Claims with missing or invalid tier metadata must use the operational marker pane through the shared canvas renderer.
- Do not change marker size, color, shape, hit targets, tracked features, data flow, resource loading, pagination, culling, terrain, water, roads, or biome rendering.
- Do not add dependencies or remote assets.
- Do not run the local full build, full suite, world generation, or dense benchmark; broad Node workloads previously exhausted workstation memory.
- Run every local Node check with `--max-old-space-size=256`.

---

## File Structure

- Create `apps/bitcraft-local/src/pages/map/mapPaneOrder.mjs`: dependency-light semantic pane ordering and application function.
- Create `apps/bitcraft-local/src/pages/map/mapPaneOrder.d.mts`: TypeScript declaration for the pane target and exported API.
- Create `apps/bitcraft-local/test/map-pane-order.test.mjs`: behavior test for the actual applied pane order.
- Modify `apps/bitcraft-local/src/pages/map/NativeMap.tsx`: apply the shared order during Leaflet initialization and place the operational canvas renderer in `markerPane`.
- Modify `apps/bitcraft-local/test/map-page-boundary.test.mjs`: retain the React/Leaflet integration boundary without duplicating numeric order assertions.

---

### Task 1: Enforce the semantic Leaflet pane hierarchy

**Files:**
- Create: `apps/bitcraft-local/src/pages/map/mapPaneOrder.mjs`
- Create: `apps/bitcraft-local/src/pages/map/mapPaneOrder.d.mts`
- Create: `apps/bitcraft-local/test/map-pane-order.test.mjs`
- Modify: `apps/bitcraft-local/src/pages/map/NativeMap.tsx:340-385`
- Modify: `apps/bitcraft-local/test/map-page-boundary.test.mjs:200-225`

**Interfaces:**
- Consumes: four Leaflet pane-like values with mutable `style.zIndex` strings.
- Produces: `NATIVE_MAP_PANE_Z_INDEX`, a frozen numeric record, and `applyNativeMapPaneOrder(panes): void`.

- [ ] **Step 1: Add a behavior test that fails without the pane-order module**

Create `apps/bitcraft-local/test/map-pane-order.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";

let paneOrderModule = null;
try {
  paneOrderModule = await import("../src/pages/map/mapPaneOrder.mjs");
} catch {
  // RED: the semantic pane-order module has not been added yet.
}

test("native map pane order keeps resources below icons and tooltips above players", () => {
  assert.ok(paneOrderModule, "native map pane-order module must exist");
  const panes = {
    resources: { style: { zIndex: "" } },
    markers: { style: { zIndex: "" } },
    players: { style: { zIndex: "" } },
    tooltips: { style: { zIndex: "" } },
  };

  paneOrderModule.applyNativeMapPaneOrder(panes);

  const applied = [
    Number(panes.resources.style.zIndex),
    Number(panes.markers.style.zIndex),
    Number(panes.players.style.zIndex),
    Number(panes.tooltips.style.zIndex),
  ];
  assert.deepEqual(applied, [550, 600, 700, 750]);
  assert.ok(applied.every((value, index) => index === 0 || applied[index - 1] < value));
});
```

This test fails if resources rise above operational icons, players fall below icons, or tooltips stop being the highest map layer. Its expected values are hand-derived from the approved design.

- [ ] **Step 2: Change the React integration boundary so it also fails before implementation**

In `apps/bitcraft-local/test/map-page-boundary.test.mjs`, rename the existing test to:

```js
test("Native map keeps resources below operational markers, players, and tooltips", () => {
```

Replace the obsolete literal resource/player z-index assertions with:

```js
assert.match(nativeMap, /applyNativeMapPaneOrder/);
assert.match(nativeMap, /resources:\s*resourcePane/);
assert.match(nativeMap, /markers:\s*map\.getPane\("markerPane"\)/);
assert.match(nativeMap, /players:\s*playerPane/);
assert.match(nativeMap, /tooltips:\s*map\.getPane\("tooltipPane"\)/);
assert.match(nativeMap, /L\.canvas\(\{ padding: 0\.25, pane: "markerPane" \}\)/);
```

Retain the existing assertions that the resource dense layer uses `native-map-resources`, players use `native-map-players`, and the resource outline is drawn.

In the earlier `"Native map reuses one canvas renderer and fixed marker presentations"` test, replace both exact `L.canvas({ padding: 0.25 })` expectations with the explicit operational pane form:

```js
assert.equal((nativeMap.match(/L\.canvas\(\{ padding: 0\.25, pane: "markerPane" \}\)/g) ?? []).length, 1);
assert.match(nativeMap, /ordinaryRendererRef\.current = L\.canvas\(\{ padding: 0\.25, pane: "markerPane" \}\)/);
```

- [ ] **Step 3: Run the focused tests and verify RED**

Run from `apps/bitcraft-local`:

```powershell
node --max-old-space-size=256 --test test/map-pane-order.test.mjs test/map-page-boundary.test.mjs
```

Expected: FAIL because `mapPaneOrder.mjs` does not exist, `NativeMap.tsx` does not call `applyNativeMapPaneOrder`, and the shared canvas renderer does not specify `markerPane`.

- [ ] **Step 4: Implement the dependency-light pane-order module**

Create `apps/bitcraft-local/src/pages/map/mapPaneOrder.mjs`:

```js
export const NATIVE_MAP_PANE_Z_INDEX = Object.freeze({
  resources: 550,
  markers: 600,
  players: 700,
  tooltips: 750,
});

export function applyNativeMapPaneOrder(panes) {
  for (const [name, zIndex] of Object.entries(NATIVE_MAP_PANE_Z_INDEX)) {
    const pane = panes?.[name];
    if (!pane?.style) throw new TypeError(`Native map ${name} pane is unavailable`);
    pane.style.zIndex = String(zIndex);
  }
}
```

Create `apps/bitcraft-local/src/pages/map/mapPaneOrder.d.mts`:

```ts
export type NativeMapPaneTarget = Readonly<{
  style: Pick<CSSStyleDeclaration, "zIndex">;
}>;

export const NATIVE_MAP_PANE_Z_INDEX: Readonly<{
  resources: 550;
  markers: 600;
  players: 700;
  tooltips: 750;
}>;

export function applyNativeMapPaneOrder(panes: Readonly<{
  resources: NativeMapPaneTarget | null | undefined;
  markers: NativeMapPaneTarget | null | undefined;
  players: NativeMapPaneTarget | null | undefined;
  tooltips: NativeMapPaneTarget | null | undefined;
}>): void;
```

- [ ] **Step 5: Apply the hierarchy during Leaflet map initialization**

In `apps/bitcraft-local/src/pages/map/NativeMap.tsx`, import:

```ts
import { applyNativeMapPaneOrder } from "./mapPaneOrder.mjs";
```

Remove the direct resource/player z-index assignments and call the helper after creating both custom panes:

```ts
const resourcePane = map.createPane("native-map-resources");
resourcePane.style.pointerEvents = "none";
const playerPane = map.createPane("native-map-players");
applyNativeMapPaneOrder({
  resources: resourcePane,
  markers: map.getPane("markerPane"),
  players: playerPane,
  tooltips: map.getPane("tooltipPane"),
});
```

Change the shared operational renderer to:

```ts
ordinaryRendererRef.current = L.canvas({ padding: 0.25, pane: "markerPane" });
```

Do not change the resource layer, player layer, tooltip bindings, or marker construction.

- [ ] **Step 6: Run focused GREEN verification**

Run from `apps/bitcraft-local`:

```powershell
node --max-old-space-size=256 --test test/map-pane-order.test.mjs test/map-page-boundary.test.mjs test/map-coordinates.test.mjs
```

Expected: PASS with zero failures and no warnings.

- [ ] **Step 7: Review the diff for scope and browser data boundaries**

Run from the repository root:

```powershell
git diff --check
git diff --stat
rg -n "https?://" apps/bitcraft-local/src/pages/map/mapPaneOrder.mjs apps/bitcraft-local/src/pages/map/NativeMap.tsx
```

Expected: the only URL match is an existing audited/static string outside the new module, or no match; no upstream or remote asset connection is added. The diff contains only the pane-order module, declarations, focused tests, and `NativeMap.tsx` initialization.

- [ ] **Step 8: Commit the implementation**

```powershell
git add -- apps/bitcraft-local/src/pages/map/mapPaneOrder.mjs apps/bitcraft-local/src/pages/map/mapPaneOrder.d.mts apps/bitcraft-local/src/pages/map/NativeMap.tsx apps/bitcraft-local/test/map-pane-order.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs
git commit -m "fix(map): keep operational markers above resources"
```

---

### Task 2: Publication-time visual acceptance

**Files:**
- No production file changes expected.

**Interfaces:**
- Consumes: the remotely built application containing Task 1.
- Produces: visual evidence that the approved hierarchy holds under dense resource rendering.

- [ ] **Step 1: Use remote CI for broad verification if publication is requested**

Push the focused branch and require the repository's clean-install application build and full test suite to pass before merge. Do not substitute a local full build or suite.

- [ ] **Step 2: Verify the deployed dense-resource view**

Open the production map with Terrain, Claims, Watchtowers, Players, and at least one dense Resource selection enabled. Confirm:

- Resource nodes remain below every claim and watchtower icon.
- Claims with missing tier metadata remain above resources through the shared operational canvas renderer.
- Player dots remain above operational icons.
- Hover and keyboard-focus tooltips remain above resources, operational icons, and player dots.
- Resource selection, panning, zooming, and canvas performance remain unchanged.

- [ ] **Step 3: Inspect the browser console and live status**

Confirm the deployed version is visible, the resource partition reaches `live`, and no new map-layer or Leaflet errors appear. Record unrelated pre-existing third-party warnings separately rather than treating them as map failures.
