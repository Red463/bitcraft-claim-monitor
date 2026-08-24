# Immersive Map Visual Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the Obsidian Ledger immersive-map mode so the map owns the viewport while search, layers, players, resources, status, and selection tools remain legible, bounded, and responsive.

**Architecture:** Preserve the existing native map renderer, data loaders, layer preferences, and tool state. Limit implementation to structural class additions where needed and a focused `map.css` token/responsive pass; do not alter rendering, subscriptions, spatial logic, marker identity, or performance paths.

**Tech Stack:** React, TypeScript, native canvas map, plain CSS, Node test runner, existing map components and Lucide icons.

**Spec:** `docs/superpowers/specs/2026-08-24-whole-application-visual-system-design.md`

## Global Constraints

- Execute after `2026-08-24-visual-foundations-and-shell.md`.
- Do not change native map data requests, rendering cadence, worker behaviour, packed resources, marker semantics, region filtering, or player tracking logic.
- Preserve dedicated-map routing and query state.
- All tool panels, popovers, dialogs, and controls remain inside the current viewport.
- Keep mobile primary controls at least 44px and preserve keyboard labels/focus.
- Use map transparency only where terrain remains readable beneath the control.
- Do not create page-level scrolling in dedicated map mode.

---

### Task 1: Tokenise the map chrome and establish the immersive hierarchy

**Files:**
- Modify: `apps/bitcraft-local/src/pages/MapPage.tsx`
- Modify: `apps/bitcraft-local/src/pages/map/NativeMap.tsx`
- Modify: `apps/bitcraft-local/src/styles/map.css`
- Create: `apps/bitcraft-local/test/map-visual-boundary.test.mjs`
- Modify: `apps/bitcraft-local/test/map-page-boundary.test.mjs`
- Modify: `apps/bitcraft-local/test/theme-contract.test.mjs`

**Interfaces:**
- Produces: `.map-surface`, `.map-viewport`, `.map-chrome`, `.map-status-chip`, and `.map-selection-banner` visual boundaries.
- Consumes: existing `.surface-mode-map` shell class.
- Preserves: `.map-panel`, `.native-map-shell`, `.native-map-host`, `.native-map-canvas`, dedicated mode, and focus state classes used by current tests.

- [ ] **Step 1: Write failing visual-boundary tests**

Require the map roots and token use:

```js
assert.match(mapPage, /map-surface/);
assert.match(nativeMap, /map-viewport/);
for (const className of ["map-chrome", "map-status-chip", "map-selection-banner"]) {
  assert.match(mapCss, new RegExp(`\\.${className}`), className);
}
assert.doesNotMatch(mapCss, /background:\s*#030303/);
assert.match(mapCss, /\.map-panel\.is-dedicated\s*\{[^}]*height:\s*100dvh/s);
```

Retain current map routing and canvas boundary assertions.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/map-visual-boundary.test.mjs test/map-page-boundary.test.mjs test/map-fullscreen-routing.test.mjs test/theme-contract.test.mjs
```

Expected: FAIL because the approved visual boundaries are absent and fixed literals remain.

- [ ] **Step 3: Add structural classes only**

Append `map-surface` to the existing Map root, `map-viewport` to the native viewport shell, and `map-selection-banner` to the existing focus banner. Add `map-chrome` only to existing tool/status containers; do not wrap the canvas in new positioned elements that could affect pointer coordinates.

- [ ] **Step 4: Replace fixed chrome colours with semantic tokens**

Use:

```css
.map-surface {
  --map-chrome-bg: color-mix(in srgb, var(--surface-1) 88%, transparent);
  --map-chrome-border: color-mix(in srgb, var(--line-strong) 76%, transparent);
  --map-chrome-shadow: 0 12px 32px rgb(0 0 0 / 34%);
  background: var(--canvas);
}
.map-chrome {
  border: 1px solid var(--map-chrome-border);
  background: var(--map-chrome-bg);
  box-shadow: var(--map-chrome-shadow);
  backdrop-filter: blur(10px);
}
```

Use gold for selected context, green for live/healthy player state, red for errors, and blue for neutral map information. Preserve resource/tier/marker colours.

- [ ] **Step 5: Reduce non-functional visual weight**

Remove wide resting shadows and duplicate gradients from nested resource/player panels. Keep one raised boundary per dock/popover. Use data font for coordinates, counts, and timestamps; retain Outfit for control labels.

- [ ] **Step 6: Run focused tests and build**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/map-visual-boundary.test.mjs test/map-page-boundary.test.mjs test/map-fullscreen-routing.test.mjs test/theme-contract.test.mjs test/map-marker-presentation.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: PASS.

- [ ] **Step 7: Commit the immersive foundation**

```powershell
git add -- apps/bitcraft-local/src/pages/MapPage.tsx apps/bitcraft-local/src/pages/map/NativeMap.tsx apps/bitcraft-local/src/styles/map.css apps/bitcraft-local/test/map-visual-boundary.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs apps/bitcraft-local/test/theme-contract.test.mjs
git commit -m "style: establish immersive map chrome"
```

### Task 2: Compose desktop docks and viewport-safe overlays

**Files:**
- Modify: `apps/bitcraft-local/src/pages/map/MapToolDock.tsx`
- Modify: `apps/bitcraft-local/src/pages/map/MapLayersControl.tsx`
- Modify: `apps/bitcraft-local/src/pages/map/MapPlayerTrackingPanel.tsx`
- Modify: `apps/bitcraft-local/src/pages/map/MapResourceFinderPanel.tsx`
- Modify: `apps/bitcraft-local/src/styles/map.css`
- Modify: `apps/bitcraft-local/test/map-tool-dock.test.mjs`
- Modify: `apps/bitcraft-local/test/css-ownership.test.mjs`
- Modify: `apps/bitcraft-local/test/modal-foundation-boundary.test.mjs`

**Interfaces:**
- Preserves: current `MapToolDock` tabs/state, layer control state, player manager, resource finder, and query preferences.
- Produces: one primary edge dock, bounded popovers, and visually consistent tool panels.
- Preserves: existing aria labels and dialog semantics.

- [ ] **Step 1: Add failing dock/containment tests**

Extend map tests to require:

```js
assert.match(mapCss, /\.native-map-controls\s*\{[^}]*position:\s*absolute[^}]*inset:/s);
assert.match(mapCss, /\.native-map-tool-panel\s*\{[^}]*max-height:\s*calc\(100dvh\s*-\s*[^)]+\)[^}]*overflow:/s);
assert.match(mapCss, /\.native-map-layers-popover\s*\{[^}]*max-width:\s*min\(/s);
assert.match(mapCss, /\.native-map-layers-popover\s*\{[^}]*max-height:\s*min\([^}]*overflow:\s*auto/s);
```

Keep tests that prevent duplicate desktop declarations inside mobile queries.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/map-tool-dock.test.mjs test/css-ownership.test.mjs test/modal-foundation-boundary.test.mjs
```

Expected: new exact containment assertions fail before styling.

- [ ] **Step 3: Establish one primary dock geometry**

Position the existing tool dock against a safe viewport edge, leaving space for zoom/map controls and the dedicated-tab link. Use bounded dimensions:

```css
.native-map-tool-panel {
  width: min(360px, calc(100vw - 32px));
  max-height: calc(100dvh - 32px);
  overflow: hidden;
}
.native-map-tool-panel > :last-child {
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
}
```

Do not create multiple independent vertical docks that obscure the same map edge.

- [ ] **Step 4: Harmonise layers, resources, and players**

Use a shared heading/control rhythm, consistent selected tabs, search fields, count/status labels, and internal scrolling. Preserve each tool's existing state and action ordering.

- [ ] **Step 5: Keep dialogs on the shared modal foundation**

If player/resource management still uses custom modal markup, either migrate it to `Dialog` or retain equivalent fixed inset, focus containment, Escape close, focus restore, max-height, and internal scrolling. Do not weaken `modal-foundation-boundary.test.mjs`.

- [ ] **Step 6: Run focused map tests and build**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/map-tool-dock.test.mjs test/map-player-tracking-panel.test.mjs test/map-resource-finder-panel.test.mjs test/css-ownership.test.mjs test/modal-foundation-boundary.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: PASS.

- [ ] **Step 7: Commit dock composition**

```powershell
git add -- apps/bitcraft-local/src/pages/map/MapToolDock.tsx apps/bitcraft-local/src/pages/map/MapLayersControl.tsx apps/bitcraft-local/src/pages/map/MapPlayerTrackingPanel.tsx apps/bitcraft-local/src/pages/map/MapResourceFinderPanel.tsx apps/bitcraft-local/src/styles/map.css apps/bitcraft-local/test/map-tool-dock.test.mjs apps/bitcraft-local/test/css-ownership.test.mjs apps/bitcraft-local/test/modal-foundation-boundary.test.mjs
git commit -m "style: compose map tool docks"
```

### Task 3: Implement deliberate tablet/phone map composition and verify live states

**Files:**
- Modify: `apps/bitcraft-local/src/styles/map.css`
- Modify: `apps/bitcraft-local/test/responsive-layout-boundary.test.mjs`
- Modify: `apps/bitcraft-local/test/map-tool-dock.test.mjs`
- Modify: `apps/bitcraft-local/test/map-visual-boundary.test.mjs`

**Interfaces:**
- Consumes: existing mobile tool toggles and dock state.
- Produces: bottom/edge tool composition at tablet/phone widths without page scrolling.
- Preserves: map canvas pointer area, zoom, region selector, layer toggles, player/resource actions, and dedicated route link.

- [ ] **Step 1: Add failing phone-layout tests**

Require the existing phone media query to enforce:

```js
assert.match(phone, /\.native-map-controls\s*\{[^}]*inset:\s*auto\s+[^;]+\s+[^;]+\s+[^;]+/s);
assert.match(phone, /\.native-map-tool-panel\s*\{[^}]*width:\s*calc\(100vw\s*-\s*[^)]+\)/s);
assert.match(phone, /\.native-map-tool-panel\s*\{[^}]*max-height:\s*min\(/s);
assert.match(phone, /\.native-map-layer-row\s*\{[^}]*min-height:\s*44px/s);
assert.doesNotMatch(phone, /height:\s*100vh/);
```

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/responsive-layout-boundary.test.mjs test/map-tool-dock.test.mjs test/map-visual-boundary.test.mjs
```

Expected: at least the new dock sizing assertions fail.

- [ ] **Step 3: Add tablet and phone compositions**

At tablet width, reduce the dock and collapse secondary summaries. At phone width, keep a compact tool trigger row and open one bounded bottom/side panel at a time. Use `100dvh`, safe insets, and internal scrolling. Never set the overall map page to `overflow-y: auto`.

- [ ] **Step 4: Verify focus and selected-location banners**

Long resource/player/location names must ellipsize inside their copy area while coordinates remain visible. Focus/clear controls remain touch-sized and never cover zoom/layer controls.

- [ ] **Step 5: Run the map regression set and build**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/map-page-boundary.test.mjs test/map-tool-dock.test.mjs test/map-player-tracking-panel.test.mjs test/map-resource-finder-panel.test.mjs test/map-marker-presentation.test.mjs test/map-pane-order.test.mjs test/map-fullscreen-routing.test.mjs test/responsive-layout-boundary.test.mjs test/map-visual-boundary.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: PASS.

- [ ] **Step 6: Browser-check representative live map states**

At 1440×900, 1024×768, 768×1024, and 390×844 inspect:

```text
default map, dedicated map, focused location, layers open, resource finder open,
player tracking open, long result list, loading resources, stale/error status,
multiple selected resources, and a viewport with dense markers
```

Verify terrain stays visible, all panels are bounded, map pan/zoom still works, no page scroll appears, and no control covers another required control.

- [ ] **Step 7: Commit responsive map styling**

```powershell
git add -- apps/bitcraft-local/src/styles/map.css apps/bitcraft-local/test/responsive-layout-boundary.test.mjs apps/bitcraft-local/test/map-tool-dock.test.mjs apps/bitcraft-local/test/map-visual-boundary.test.mjs
git commit -m "style: make map chrome responsive"
```
