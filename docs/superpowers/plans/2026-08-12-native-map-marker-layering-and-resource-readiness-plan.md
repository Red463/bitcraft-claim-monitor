# Native Map Marker Layering and Resource Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render live players as topmost pulsing dots, keep selected resources above ordinary map features, make cold resource snapshots wait briefly for their first complete generation, and clean up claim badge presentation.

**Architecture:** Add a bounded readiness promise to each shared map-spatial scope and await it only for snapshot responses. Use explicit Leaflet panes to establish stable stacking without creating DOM markers for dense resources. Keep all presentation changes within the existing native map and CSS modules.

**Tech Stack:** Node.js 24, React, TypeScript, Leaflet 1.9.x, Relay map-spatial sessions, Node test runner, plain CSS.

## Global Constraints

- Player positions remain selected, online, monitored, non-excluded, live-only features.
- Resources remain bounded canvas-rendered features; do not create one DOM marker per resource.
- Browsers use only same-origin APIs and assets.
- Equivalent spatial scopes share a single session.
- Cold-start waiting is bounded and retains the existing partial/unavailable response on timeout.
- Layer order is players, resources, ordinary features, roads, terrain/water from highest to lowest.
- Claim badges use the supplied images with zero padding, no shadow, and no square background.
- No new dependency, database migration, resource clustering, trails, offline positions, or refresh cadence change.

---

### Task 1: Add bounded spatial-generation readiness

**Files:**
- Modify: `apps/bitcraft-local/src/server/game-data/mapSpatialScopeManager.ts`
- Modify: `apps/bitcraft-local/server.mjs`
- Test: `apps/bitcraft-local/test/map-spatial-scope-manager.test.mjs`
- Test: `apps/bitcraft-local/test/map-page-boundary.test.mjs`

**Interfaces:**
- Produces: `lease.waitForSnapshot(timeoutMs: number): Promise<MapSpatialSnapshot | null>`.
- Consumes: the existing shared entry snapshot and the first `onSnapshot` callback.

- [ ] **Step 1: Write failing readiness tests**

Add tests proving immediate snapshots resolve immediately, delayed first generations resolve all waiters on the shared scope, and a timeout returns `null` without stopping or duplicating the session. Add a server boundary assertion that the snapshot route calls `waitForSnapshot` with a finite constant before `combineMapSpatialLeases`.

- [ ] **Step 2: Run tests to verify RED**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --test test/map-spatial-scope-manager.test.mjs test/map-page-boundary.test.mjs
```

Expected: FAIL because leases expose only `snapshot()` and the server does not wait.

- [ ] **Step 3: Implement the bounded wait**

Each scope entry owns a set of first-generation waiters. `waitForSnapshot(timeoutMs)` returns the current snapshot immediately, otherwise registers a waiter and a timer. The first complete `onSnapshot` resolves and clears every waiter. Timeout removes only that waiter and returns `null`. Closing/stopping a scope resolves remaining waiters with `null`.

Add `MAP_SPATIAL_INITIAL_WAIT_MS = 2_000`. For `/api/local/map/snapshot` only, after leases are acquired and before combining them, await every lease's `waitForSnapshot(MAP_SPATIAL_INITIAL_WAIT_MS)`. The event route does not wait.

- [ ] **Step 4: Run tests to verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/bitcraft-local/src/server/game-data/mapSpatialScopeManager.ts apps/bitcraft-local/server.mjs apps/bitcraft-local/test/map-spatial-scope-manager.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs
git commit -m "fix(map): wait for cold spatial snapshots"
```

---

### Task 2: Establish explicit player and resource panes

**Files:**
- Modify: `apps/bitcraft-local/src/pages/map/NativeMap.tsx`
- Test: `apps/bitcraft-local/test/map-page-boundary.test.mjs`

**Interfaces:**
- Produces Leaflet panes `native-map-resources` at z-index `650` and `native-map-players` at z-index `700`.
- Updates `DensePointLayer` to accept a pane name and attach its canvas to that pane.

- [ ] **Step 1: Write failing pane tests**

Assert the renderer creates both panes, assigns z-indexes in increasing order, constructs the resource dense layer with `native-map-resources`, and creates the player layer group with `pane: "native-map-players"`.

- [ ] **Step 2: Run the boundary test to verify RED**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --test test/map-page-boundary.test.mjs
```

Expected: FAIL because all canvases use `overlayPane` and player markers use the default marker pane.

- [ ] **Step 3: Implement explicit panes**

Create panes after the Leaflet map is constructed and set their z-indexes. Add a `#pane` constructor field to `DensePointLayer`, append its canvas through `map.getPane(this.#pane)`, construct resources with the resource pane, and leave enemies in the ordinary overlay pane. Create the players layer group with `{ pane: "native-map-players" }`; other marker groups retain current behavior.

- [ ] **Step 4: Run the boundary test to verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/bitcraft-local/src/pages/map/NativeMap.tsx apps/bitcraft-local/test/map-page-boundary.test.mjs
git commit -m "feat(map): layer players and resources above claims"
```

---

### Task 3: Render players as small pulsing dots

**Files:**
- Modify: `apps/bitcraft-local/src/pages/map/NativeMap.tsx`
- Modify: `apps/bitcraft-local/src/styles/map.css`
- Modify: `apps/bitcraft-local/test/map-page-boundary.test.mjs`

**Interfaces:**
- `markerIcon(kind, presentation, color)` produces nested `.native-map-player-pulse` and `.native-map-player-dot` elements for players.
- Other marker presentations remain unchanged.

- [ ] **Step 1: Write failing player-dot tests**

Assert player icon construction includes the pulse and dot classes, uses the assigned CSS variable, has a 24-pixel icon footprint, and CSS defines an 8-pixel dot plus a pulse animation. Assert reduced-motion disables the animation and accessible title/label assertions remain.

- [ ] **Step 2: Run focused renderer tests to verify RED**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --test test/map-page-boundary.test.mjs test/map-player-marker-colours.test.mjs
```

Expected: FAIL because players still use the 30-pixel `P` badge.

- [ ] **Step 3: Implement the pulsing dot**

For `kind === "player"`, build a 24-pixel transparent wrapper containing an 8-pixel coloured dot and a pulse ring using `--player-marker-color`; do not append the `P` glyph. Add a two-second restrained pulse animation and a `prefers-reduced-motion: reduce` override that removes it. Preserve Leaflet keyboard, title, tooltip, and `aria-label` behavior.

- [ ] **Step 4: Run focused renderer tests to verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/bitcraft-local/src/pages/map/NativeMap.tsx apps/bitcraft-local/src/styles/map.css apps/bitcraft-local/test/map-page-boundary.test.mjs
git commit -m "feat(map): render live players as pulsing dots"
```

---

### Task 4: Remove claim badge padding and shadow

**Files:**
- Modify: `apps/bitcraft-local/src/styles/map.css`
- Modify: `apps/bitcraft-local/test/map-page-boundary.test.mjs`

**Interfaces:**
- Keeps the existing 40-pixel claim marker and `--native-map-claim-scale` zoom behavior.
- Changes only the tier-image crop presentation.

- [ ] **Step 1: Write failing claim presentation tests**

Assert `.native-map-marker--claim .native-map-marker-content--badge-crop` has `padding: 0`, `box-shadow: none`, transparent background, and a hexagonal `clip-path`. Assert its image is `40px` square.

- [ ] **Step 2: Run the boundary test to verify RED**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --test test/map-page-boundary.test.mjs
```

Expected: FAIL because the crop currently has 3-pixel padding, a shadow, and a 34-pixel image.

- [ ] **Step 3: Implement the clean claim crop**

Set the wrapper padding to zero and shadow to none. Apply `clip-path: polygon(50% 0%, 93.3% 25%, 93.3% 75%, 50% 100%, 6.7% 75%, 6.7% 25%)`; size the image to 40 by 40 pixels and preserve transparent wrapper/background and zoom transform.

- [ ] **Step 4: Run the boundary test to verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/bitcraft-local/src/styles/map.css apps/bitcraft-local/test/map-page-boundary.test.mjs
git commit -m "fix(map): clean up claim tier badges"
```

---

### Task 5: Verify live resource and marker acceptance

**Files:**
- Modify only if evidence changes: `docs/research/native-map-live-coordinate-reference.md`

**Interfaces:**
- Produces a built app and running smoke server at `http://127.0.0.1:18449/?page=map`.

- [ ] **Step 1: Run focused tests**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --test test/map-spatial-scope-manager.test.mjs test/map-snapshot.test.mjs test/map-player-marker-colours.test.mjs test/map-page-boundary.test.mjs
```

Expected: zero failures.

- [ ] **Step 2: Run the full application suite**

```powershell
corepack pnpm --filter @workspace/bitcraft-local test
```

Expected: zero failures and existing intentional skips only.

- [ ] **Step 3: Build the production app**

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: server, bindings, asset verification, TypeScript, client, and runtime-boundary checks pass.

- [ ] **Step 4: Restart and health-check smoke**

```powershell
node scripts/start-bitcraft-local-smoke.mjs --force-restart
curl.exe -s http://127.0.0.1:18449/api/local/health
```

Expected: `ok:true` and the current build SHA.

- [ ] **Step 5: Browser-smoke desktop and phone**

Select two currently online players and verified resource type `54`. Confirm two distinct pulsing dots are above claims/resources, 900+ resource points appear after one cold selection without a manual retry, resources are above claims/roads, claim badges have no padding/shadow/square background, names remain accessible, no iframe or remote map asset exists, and console errors/failed snapshot requests/429s are absent. Repeat layout checks at `390 x 844` and reset the viewport afterward.

- [ ] **Step 6: Review the branch**

```powershell
git diff --check
git status --short
git log --oneline -8
```

Expected: clean worktree and logical commits. Do not push, bump the version, or edit the changelog unless separately requested.
