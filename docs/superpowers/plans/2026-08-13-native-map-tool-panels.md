# Native Map Tool Panels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the native map the full workspace by replacing the permanent Player Tracking row and Resource Finder sidebar with one accessible toolbar of exclusive Layers, Biomes, Players, and Resources panels.

**Architecture:** `MapPage` remains the owner of roster, catalog, filters, and persisted selections. It supplies focused Player and Resource panel content to `NativeMap`; `NativeMap` combines those tools with its renderer-owned Layers and Biomes content in a controlled `MapToolDock`. Desktop panels are anchored overlays and mobile panels are bottom sheets, so opening a tool never changes the Leaflet viewport size.

**Tech Stack:** React, TypeScript, Leaflet 1.9, plain CSS, Lucide icons, Node test runner, Vite.

## Global Constraints

- Preserve current native/external renderer modes, URL focus behavior, resource subscriptions, resource region scope, typed IDs, player marker colors, and Leaflet lifecycle.
- Keep settlement presets settlement-only. This plan creates the external-player UI seam but does not enable global search or external coordinates; those belong to the dependent global-player plan.
- Only one map tool is open at a time. Escape, the active trigger, the panel close button, or a map click outside the panel closes it; Escape restores trigger focus.
- Desktop panels overlay the map. At narrow widths the same content becomes an internally scrolling bottom sheet with the map still visible.
- Do not add a state library, component framework, or dependency.
- Remove the obsolete `map.resource-finder-collapsed` behavior. Leaving an old local-storage key unread is sufficient; no storage migration is required.
- Use focused tests first and commit after each task.

---

### Task 1: Controlled Tool Dock State and Accessibility

**Files:**
- Create: `apps/bitcraft-local/src/pages/map/mapToolDockState.mjs`
- Create: `apps/bitcraft-local/src/pages/map/mapToolDockState.d.mts`
- Create: `apps/bitcraft-local/src/pages/map/MapToolDock.tsx`
- Modify: `apps/bitcraft-local/test/map-page-boundary.test.mjs`
- Create: `apps/bitcraft-local/test/map-tool-dock.test.mjs`

**Interfaces:**

```ts
export type MapToolId = "layers" | "biomes" | "players" | "resources";

export type MapToolDescriptor = {
  id: MapToolId;
  label: string;
  count?: number;
  icon: React.ReactNode;
  panel: React.ReactNode;
  panelClassName?: string;
  primaryFocusSelector?: string;
};

export function nextMapTool(active: MapToolId | null, requested: MapToolId): MapToolId | null;
```

- [ ] **Step 1: Write failing pure state and source-boundary tests**

Test that requesting a closed tool opens it, requesting the active tool closes it, requesting another tool switches directly, the rendered toolbar exposes `aria-expanded`/`aria-controls`, and Escape/outside-click/focus-restoration handlers are present.

- [ ] **Step 2: Run the focused tests and verify RED**

```powershell
corepack pnpm exec node --test test/map-tool-dock.test.mjs test/map-page-boundary.test.mjs
```

Expected: FAIL because the shared state helper and dock do not exist.

- [ ] **Step 3: Implement the smallest controlled dock**

Implement `nextMapTool` as a pure helper. In `MapToolDock`, own only `activeTool`, trigger refs, outside-pointer handling, Escape handling, focus entry, and focus restoration. Render the active panel in one overlay container and use `data-map-tool-panel` to exclude panel interactions from outside-click closure. Do not move map data or selection state into the dock.

- [ ] **Step 4: Run focused verification and verify GREEN**

```powershell
corepack pnpm exec node --test test/map-tool-dock.test.mjs test/map-page-boundary.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

- [ ] **Step 5: Commit**

```powershell
git add apps/bitcraft-local/src/pages/map/mapToolDockState.mjs apps/bitcraft-local/src/pages/map/mapToolDockState.d.mts apps/bitcraft-local/src/pages/map/MapToolDock.tsx apps/bitcraft-local/test/map-tool-dock.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs
git commit -m "feat(map): add shared tool dock"
```

---

### Task 2: Move Layers and Biomes into the Shared Dock

**Files:**
- Modify: `apps/bitcraft-local/src/pages/map/MapLayersControl.tsx`
- Modify: `apps/bitcraft-local/src/pages/map/MapBiomeKey.tsx`
- Modify: `apps/bitcraft-local/src/pages/map/NativeMap.tsx`
- Modify: `apps/bitcraft-local/test/map-biome-key.test.mjs`
- Modify: `apps/bitcraft-local/test/map-page-boundary.test.mjs`

**Interfaces:**

```ts
export type NativeMapToolContent = {
  label: string;
  count: number;
  content: React.ReactNode;
  primaryFocusSelector?: string;
};

// New NativeMap props
playerTool: NativeMapToolContent;
resourceTool: NativeMapToolContent;
```

- [ ] **Step 1: Write failing tests for controlled Layers/Biomes content**

Lock that `MapLayersControl` and `MapBiomeKey` no longer own private `open` state or render independent triggers, while biome hover/pin/clear and layer toggling callbacks remain unchanged. Assert the dock order is Layers, Biomes, Players, Resources.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
corepack pnpm exec node --test test/map-biome-key.test.mjs test/map-page-boundary.test.mjs
```

- [ ] **Step 3: Convert the existing controls to panel bodies**

Keep renderer-owned state in `NativeMap`. Have it create descriptors with `Layers`, `Sprout`, `Users`, and `Pickaxe` Lucide icons, counts, and panel bodies. Render one `MapToolDock` in the existing `.native-map-controls` position. Preserve biome preview/pinning and all layer availability/count text.

- [ ] **Step 4: Run focused tests and build**

```powershell
corepack pnpm exec node --test test/map-biome-key.test.mjs test/map-page-boundary.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

- [ ] **Step 5: Commit**

```powershell
git add apps/bitcraft-local/src/pages/map/MapLayersControl.tsx apps/bitcraft-local/src/pages/map/MapBiomeKey.tsx apps/bitcraft-local/src/pages/map/NativeMap.tsx apps/bitcraft-local/test/map-biome-key.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs
git commit -m "refactor(map): unify native map controls"
```

---

### Task 3: Extract and Redesign the Resource Finder

**Files:**
- Create: `apps/bitcraft-local/src/pages/map/MapResourceFinderPanel.tsx`
- Modify: `apps/bitcraft-local/src/pages/MapPage.tsx`
- Create: `apps/bitcraft-local/test/map-resource-finder-panel.test.mjs`
- Modify: `apps/bitcraft-local/test/map-page-boundary.test.mjs`

**Interfaces:**

```ts
type MapResourceFinderPanelProps = {
  search: string;
  tier: string;
  category: string;
  selectedRegionIds: string[];
  availableRegions: Array<{ id: string; name: string }>;
  selectedResources: MapCatalogEntry[];
  visibleResources: MapCatalogEntry[];
  renderedResources: MapCatalogEntry[];
  totalMatching: number;
  resourceStatusByIdentity: Record<string, MapResourceSelectionStatus>;
  onSearchChange(value: string): void;
  onTierChange(value: string): void;
  onCategoryChange(value: string): void;
  onRegionsChange(regionIds: string[]): void;
  onToggle(resource: MapCatalogEntry): void;
  onRemove(identity: string): void;
  onClear(): void;
  onShowMore(): void;
};
```

- [ ] **Step 1: Write failing presentation and behavior tests**

Cover search-first ordering, compact Region/Tier/Category filters, tracked chips, full-row toggles, icon/name/category/tier presentation, sticky visible/total footer, Show more, clear/remove actions, and accessible checked state. Keep typed identity assertions for item/cargo-safe resource keys.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
corepack pnpm exec node --test test/map-resource-finder-panel.test.mjs test/map-page-boundary.test.mjs test/map-relay-catalog-boundary.test.mjs
```

- [ ] **Step 3: Extract presentation without moving data ownership**

Move only the current sidebar JSX into `MapResourceFinderPanel`. Pass existing persisted filter values, current catalog projections, partition readiness, and callbacks from `MapPage`. Preserve last-good points while new selections load and show per-selection loading/partial/unavailable feedback without clearing unrelated selections.

- [ ] **Step 4: Supply the Resources descriptor to `NativeMap`**

Remove `resourcePanelCollapsed` and the `<aside>`. Pass the extracted panel as `resourceTool.content`, with the selected count and the search input as the primary focus target.

- [ ] **Step 5: Run focused tests and build**

```powershell
corepack pnpm exec node --test test/map-resource-finder-panel.test.mjs test/map-page-boundary.test.mjs test/map-relay-catalog-boundary.test.mjs test/native-map-request.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

- [ ] **Step 6: Commit**

```powershell
git add apps/bitcraft-local/src/pages/map/MapResourceFinderPanel.tsx apps/bitcraft-local/src/pages/MapPage.tsx apps/bitcraft-local/test/map-resource-finder-panel.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs
git commit -m "feat(map): redesign resource finder panel"
```

---

### Task 4: Extract the Complete Settlement Player Panel

**Files:**
- Create: `apps/bitcraft-local/src/pages/map/MapPlayerTrackingPanel.tsx`
- Modify: `apps/bitcraft-local/src/pages/map/playerTracking.ts`
- Modify: `apps/bitcraft-local/src/pages/MapPage.tsx`
- Modify: `apps/bitcraft-local/test/map-player-tracking.test.mjs`
- Create: `apps/bitcraft-local/test/map-player-tracking-panel.test.mjs`
- Modify: `apps/bitcraft-local/test/map-page-boundary.test.mjs`

**Interfaces:**

```ts
export type MapTrackedExternalPlayer = { playerId: string; username: string };
export type MapPlayerPanelTab = "settlement" | "all-players" | "tracked";

type MapPlayerTrackingPanelProps = {
  settlementRows: MapPlayerTrackingRow[];
  selectedSettlementIds: string[];
  externalPlayers: MapTrackedExternalPlayer[];
  filter: MapPlayerFilter;
  onFilterChange(filter: MapPlayerFilter): void;
  onToggleSettlement(playerId: string): void;
  onTrackAuto(): void;
  onTrackOnline(): void;
  onTrackAll(): void;
  onTrackNone(): void;
  onRemoveExternal(playerId: string): void;
  onClearExternal(): void;
};
```

- [ ] **Step 1: Write failing settlement-only preset and panel tests**

Prove Auto/Online/All/None change only settlement IDs, never external selections. Cover Settlement/All players/Tracked tabs, local roster search, online/live-position labels, stable marker-color swatches, external waiting state, individual removal, and Clear external players. For this plan, All players renders an explicit unavailable/pending seam rather than making a network request.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
corepack pnpm exec node --test test/map-player-tracking.test.mjs test/map-player-tracking-panel.test.mjs test/map-page-boundary.test.mjs
```

- [ ] **Step 3: Extract the complete panel**

Replace `MapPlayerTrackingControls` and its secondary `Dialog` with `MapPlayerTrackingPanel`. Persist external identity metadata under `map.external-players` but keep coordinates out of storage. Continue storing settlement selection under `map.players`. Derive the toolbar count from the deduplicated union.

- [ ] **Step 4: Supply the Players descriptor to `NativeMap`**

Remove the permanent player row. Pass the panel, count, and primary local-search selector to `NativeMap`. Keep `currentPlayerIds` unchanged for the monitored-member request until the global-player plan adds a separate external request field.

- [ ] **Step 5: Run focused tests and build**

```powershell
corepack pnpm exec node --test test/map-player-tracking.test.mjs test/map-player-tracking-panel.test.mjs test/map-page-boundary.test.mjs test/native-map-request.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

- [ ] **Step 6: Commit**

```powershell
git add apps/bitcraft-local/src/pages/map/MapPlayerTrackingPanel.tsx apps/bitcraft-local/src/pages/map/playerTracking.ts apps/bitcraft-local/src/pages/MapPage.tsx apps/bitcraft-local/test/map-player-tracking.test.mjs apps/bitcraft-local/test/map-player-tracking-panel.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs
git commit -m "feat(map): integrate player tracking panel"
```

---

### Task 5: Full-Width and Responsive Map Layout

**Files:**
- Modify: `apps/bitcraft-local/src/styles/map.css`
- Modify: `apps/bitcraft-local/src/pages/MapPage.tsx`
- Modify: `apps/bitcraft-local/src/pages/map/NativeMap.tsx`
- Modify: `apps/bitcraft-local/test/map-page-boundary.test.mjs`

- [ ] **Step 1: Write failing layout boundary tests**

Assert that `.map-workspace` is single-column/full-width, the old resource sidebar/collapsed selectors are absent, desktop tool panels are absolutely positioned and viewport-bounded, the mobile media query uses a fixed/absolute bottom sheet with internal scrolling, and reduced-motion rules still suppress player pulse animation.

- [ ] **Step 2: Run the boundary test and verify RED**

```powershell
corepack pnpm exec node --test test/map-page-boundary.test.mjs
```

- [ ] **Step 3: Implement the approved layout**

Make the map host the only workspace child. Recalculate its viewport height from the topbar plus optional focus banner only. Style the toolbar as a compact horizontal control group. Give Resources approximately 380px desktop width, Players a bounded wider panel, and Layers/Biomes content-sized panels. At the existing narrow breakpoint, anchor a bottom sheet to the map frame, cap it near two-thirds height, and keep all overflow inside the sheet.

- [ ] **Step 4: Run build and focused tests**

```powershell
corepack pnpm exec node --test test/map-tool-dock.test.mjs test/map-resource-finder-panel.test.mjs test/map-player-tracking.test.mjs test/map-player-tracking-panel.test.mjs test/map-biome-key.test.mjs test/map-page-boundary.test.mjs test/native-map-request.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

- [ ] **Step 5: Browser-smoke desktop and mobile**

```powershell
node scripts/start-bitcraft-local-smoke.mjs --restart
curl.exe -s http://127.0.0.1:18449/api/local/health
```

At `http://127.0.0.1:18449/?page=map`, verify exclusive opening, outside click, Escape/focus restoration, Leaflet pan/zoom outside overlays, resource selection and persistence, biome hover/pin, player presets, desktop full-width sizing, mobile bottom sheet, and no console/network errors.

- [ ] **Step 6: Run the full application suite**

```powershell
corepack pnpm --filter @workspace/bitcraft-local test
```

- [ ] **Step 7: Commit**

```powershell
git add apps/bitcraft-local/src/styles/map.css apps/bitcraft-local/src/pages/MapPage.tsx apps/bitcraft-local/src/pages/map/NativeMap.tsx apps/bitcraft-local/test/map-page-boundary.test.mjs
git commit -m "feat(map): expand native map workspace"
```
