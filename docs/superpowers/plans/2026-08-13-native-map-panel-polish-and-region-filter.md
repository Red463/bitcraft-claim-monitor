# Native Map Panel Polish and Global Region Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the native map player/resource panels and replace the Resource Finder's Region field with one toolbar-level region scope that filters region-scoped map features and resource subscriptions.

**Architecture:** Keep the persisted `map.regions` state in `MapPage` as the single source of truth. Pass a compact native select into the existing tool dock, use the selected scope for resource partitions, and apply a small pure region-visibility predicate to rendered operational features while exempting tracked players. CSS changes remain isolated to `styles/map.css`.

**Tech Stack:** React, TypeScript, plain CSS, Leaflet, Node test runner, Vite.

## Global Constraints

- Preserve the existing `map.regions` browser preference; no migration or database change.
- `All regions` means every Relay-ready resource region and every configured operational region.
- Claims, claim areas, watchtowers, and other region-tagged operational features follow the selected region where data is available.
- Player markers do not follow the region filter.
- Whole-world pre-generated terrain and road tiles remain installed once and are not regenerated or refetched when the selector changes.
- Only the resource result list scrolls on desktop; the mobile bottom sheet remains viewport-bounded as a safety fallback.
- Do not change Relay schemas, subscriptions, resource identities, player-coordinate logic, or the failed global-player gate.

---

### Task 1: Region-Scoped Feature Visibility

**Files:**
- Create: `apps/bitcraft-local/src/pages/map/mapRegionVisibility.mjs`
- Create: `apps/bitcraft-local/src/pages/map/mapRegionVisibility.d.mts`
- Create: `apps/bitcraft-local/test/map-region-visibility.test.mjs`
- Modify: `apps/bitcraft-local/src/pages/map/NativeMap.tsx`

**Interfaces:**
- Produces: `mapFeatureInRegionScope(feature: { kind?: unknown; regionId?: unknown }, selectedRegionIds?: string[]): boolean`.
- `NativeMap` gains `visibleRegionIds: string[]`; empty means all operational features.

- [ ] **Step 1: Write the failing behavior test**

```js
import { mapFeatureInRegionScope } from "../src/pages/map/mapRegionVisibility.mjs";

test("region scope filters operational features but never tracked players", () => {
  assert.equal(mapFeatureInRegionScope({ kind: "claim", regionId: "19" }, ["19"]), true);
  assert.equal(mapFeatureInRegionScope({ kind: "claim", regionId: "12" }, ["19"]), false);
  assert.equal(mapFeatureInRegionScope({ kind: "player", regionId: "12" }, ["19"]), true);
  assert.equal(mapFeatureInRegionScope({ kind: "watchtower", regionId: "12" }, []), true);
  assert.equal(mapFeatureInRegionScope({ kind: "claim", regionId: "019" }, ["19"]), false);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
corepack pnpm exec node --test test/map-region-visibility.test.mjs
```

Expected: FAIL because `mapRegionVisibility.mjs` does not exist.

- [ ] **Step 3: Implement the minimal predicate**

```js
export function mapFeatureInRegionScope(feature, selectedRegionIds = []) {
  if (String(feature?.kind ?? "") === "player") return true;
  const selected = new Set(selectedRegionIds.filter((value) => /^(?:0|[1-9]\d*)$/.test(value)));
  if (!selected.size) return true;
  return selected.has(String(feature?.regionId ?? ""));
}
```

Use it in the Leaflet marker loop and accessible-feature projection. Preserve the full provider snapshot and player marker colour calculation.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```powershell
corepack pnpm exec node --test test/map-region-visibility.test.mjs test/native-map-request.test.mjs test/map-page-boundary.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/bitcraft-local/src/pages/map/mapRegionVisibility.mjs apps/bitcraft-local/src/pages/map/mapRegionVisibility.d.mts apps/bitcraft-local/src/pages/map/NativeMap.tsx apps/bitcraft-local/test/map-region-visibility.test.mjs
git commit -m "feat(map): scope operational markers by region"
```

---

### Task 2: Toolbar Region Selector and Resource Finder Simplification

**Files:**
- Create: `apps/bitcraft-local/src/pages/map/MapRegionSelect.tsx`
- Modify: `apps/bitcraft-local/src/pages/map/MapToolDock.tsx`
- Modify: `apps/bitcraft-local/src/pages/map/NativeMap.tsx`
- Modify: `apps/bitcraft-local/src/pages/map/MapResourceFinderPanel.tsx`
- Modify: `apps/bitcraft-local/src/pages/MapPage.tsx`
- Modify: `apps/bitcraft-local/test/map-resource-finder-panel.test.mjs`
- Modify: `apps/bitcraft-local/test/map-page-boundary.test.mjs`

**Interfaces:**
- `MapRegionSelect({ value, options, onChange })`, where `value` is `"All" | RegionId` and options are `{ id: string; label: string }[]`.
- `MapToolDock` gains `trailingControl?: React.ReactNode`.
- `NativeMap` gains `regionControl?: React.ReactNode` and passes it to `MapToolDock`.
- `MapResourceFinderPanel` removes `regionValue`, `regionOptions`, and `onRegionChange`.

- [ ] **Step 1: Write failing boundary tests for the requested control ownership**

Add assertions that:

```js
assert.doesNotMatch(resourceFinderSource, /regionValue|regionOptions|onRegionChange|>Region</);
assert.match(mapPageSource, /<MapRegionSelect/);
assert.match(mapPageSource, /visibleRegionIds=\{resourceRegions\}/);
assert.match(nativeMapSource, /regionControl=\{regionControl\}/);
```

The production mutation caught is moving Region back inside the Resource Finder or failing to feed the selected scope to operational feature visibility.

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
corepack pnpm exec node --test test/map-resource-finder-panel.test.mjs test/map-page-boundary.test.mjs
```

Expected: FAIL because Region is still owned by `MapResourceFinderPanel` and no toolbar selector exists.

- [ ] **Step 3: Implement the toolbar selector**

Create `MapRegionSelect.tsx` with a native labelled select:

```tsx
export function MapRegionSelect({ value, options, onChange }: Props) {
  return (
    <label className="native-map-region-select">
      <MapPinned size={16} aria-hidden="true" />
      <span className="native-map-region-label">Region</span>
      <select aria-label="Map region" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="All">All regions</option>
        {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
    </label>
  );
}
```

In `MapPage`, compute the valid value from `resourceRegions`, keep `setResourceRegion`, remove Region props from `resourceFinder`, and pass the selector to `NativeMap`. Pass `resourceRegions` as `visibleRegionIds`; an empty array means All. Keep `mapRegionIds` as the bounded configured operational request scope and `resourceMapRegionIds` as the selected/all Relay-ready resource scope.

In `MapToolDock`, render `trailingControl` after the four tool triggers inside the toolbar row.

- [ ] **Step 4: Run focused tests and build**

Run:

```powershell
corepack pnpm exec node --test test/map-resource-finder-panel.test.mjs test/map-page-boundary.test.mjs test/map-tool-dock.test.mjs test/native-map-request.test.mjs test/map-region-visibility.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/bitcraft-local/src/pages/map/MapRegionSelect.tsx apps/bitcraft-local/src/pages/map/MapToolDock.tsx apps/bitcraft-local/src/pages/map/NativeMap.tsx apps/bitcraft-local/src/pages/map/MapResourceFinderPanel.tsx apps/bitcraft-local/src/pages/MapPage.tsx apps/bitcraft-local/test/map-resource-finder-panel.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs
git commit -m "feat(map): move region scope to toolbar"
```

---

### Task 3: Player Dots, Close Buttons, and Resource Scrolling

**Files:**
- Modify: `apps/bitcraft-local/src/pages/map/MapPlayerTrackingPanel.tsx`
- Modify: `apps/bitcraft-local/src/styles/map.css`
- Modify: `apps/bitcraft-local/test/map-player-tracking-panel.test.mjs`
- Modify: `apps/bitcraft-local/test/map-page-boundary.test.mjs`

**Interfaces:**
- Player rows retain the current input, `PlayerColour`, and copy but use named wrapper classes for stable grid placement.
- No data or action prop changes.

- [ ] **Step 1: Add failing regression coverage**

Assert the player row exposes distinct toggle/colour/copy hooks and that the panel CSS contract has:

```js
assert.match(playerSource, /map-player-toggle/);
assert.match(playerSource, /map-player-row-colour/);
assert.match(playerSource, /map-player-row-copy/);
assert.match(mapCss, /\.native-map-tool-panel-header \.icon-button\s*\{[^}]*width:\s*28px;[^}]*height:\s*28px;/s);
assert.match(mapCss, /\.native-map-tool-panel--resources\s*\{[^}]*overflow:\s*hidden;/s);
assert.match(mapCss, /\.native-map-tool-panel--resources \.map-resource-list\s*\{[^}]*overflow-y:\s*auto;/s);
```

These tests catch regression to overlapping player columns, oversized inherited close controls, and nested whole-panel scrolling.

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
corepack pnpm exec node --test test/map-player-tracking-panel.test.mjs test/map-page-boundary.test.mjs
```

Expected: FAIL because the wrapper hooks and CSS contracts are absent.

- [ ] **Step 3: Implement the minimal markup and CSS**

Wrap the settlement checkbox, colour, and copy in their named classes. Use explicit grid columns with the colour after the toggle and `position: relative; z-index: 1` on the dot wrapper.

Style the panel close control independently from the global `.icon-button`: transparent background, 28px square, 15px icon, muted rest colour, visible border/colour on hover and focus.

Set desktop resource panels to `overflow: hidden`, make `.map-resource-finder` consume the available height, and give `.map-resource-list` `min-height: 0; overflow-y: auto`. Keep the existing mobile fixed-sheet overflow fallback. Change Resource Finder filters to two equal columns.

- [ ] **Step 4: Run focused tests and build**

Run:

```powershell
corepack pnpm exec node --test test/map-player-tracking-panel.test.mjs test/map-page-boundary.test.mjs test/map-resource-finder-panel.test.mjs test/map-tool-dock.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: PASS.

- [ ] **Step 5: Smoke desktop and mobile**

Run:

```powershell
node scripts/start-bitcraft-local-smoke.mjs --restart
curl.exe -s http://127.0.0.1:18449/api/local/health
```

Verify in the running map:

- Region select visually aligns with the tool buttons and changes claims/resources for a chosen region.
- Player colour dots are visible beside both checked and unchecked toggles.
- All panel X controls are centred and readable at rest/hover/focus.
- Resource panel chrome stays fixed while only results scroll.
- Mobile toolbar fits and the bottom sheet remains fully inside the viewport.
- No new console errors or failed same-origin map requests occur.

- [ ] **Step 6: Run the full suite and commit**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local test
git diff --check
```

Expected: all tests pass, aside from established environment skips.

Commit:

```powershell
git add apps/bitcraft-local/src/pages/map/MapPlayerTrackingPanel.tsx apps/bitcraft-local/src/styles/map.css apps/bitcraft-local/test/map-player-tracking-panel.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs
git commit -m "fix(map): polish native tool panels"
```
