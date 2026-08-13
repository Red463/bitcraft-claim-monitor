# Native Map Global Player Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let authorized map users find and explicitly track any BitCraft player while preserving the existing settlement-first workflow and never exposing offline, stale, unbounded, or browser-direct Relay coordinates.

**Architecture:** Add a bounded same-origin global username directory and a separate exact-ID global live-position service behind the provider seam. The current regional monitored-member path remains unchanged. Public requests distinguish settlement `playerIds` from `externalPlayerIds`; snapshots merge the two normalized sources only after live identity, coordinate, dimension, bounds, region, deletion, and logout behavior are verified.

**Tech Stack:** Node HTTP server, TypeScript, typed SpacetimeDB bindings, Relay topology discovery, React, Node test runner, Vite.

## Global Constraints

- This plan depends on `2026-08-13-native-map-tool-panels.md` through the `MapPlayerTrackingPanel` and `MapTrackedExternalPlayer` seams.
- Hard gate: do not enable public external coordinates until live fixtures verify every item in Task 1. Failed verification must leave the layer explicitly unavailable.
- Search requires at least 3 normalized characters and returns at most 20 entries. Never expose an unfiltered player directory.
- Cap the deduplicated union of settlement and external player IDs at 250.
- Preserve all 64-bit IDs as canonical decimal strings. Never coerce them to JavaScript numbers.
- External sessions subscribe only to explicitly selected IDs. Do not scan regions or subscribe to all mobile/player rows.
- Offline, deselected, deleted, disconnected, excluded, or schema-incompatible external positions disappear immediately. Do not retain a last-good player coordinate.
- Persist only `{ playerId, username }` in browser storage. Never persist coordinates in SQLite, browser storage, diagnostics, analytics, or history.
- Enforce `page:map` on search, snapshot, and events. Do not log search bodies, coordinates, complete player selections, or resolved identity lists.
- Use complete normalized generations, bounded leases, canonical shared scopes, backoff, and schema fingerprints consistent with existing Relay runtimes.
- Use focused RED/GREEN tests and commit after each task.

---

### Task 1: Capture and Verify Global Player Coordinate Evidence

**Files:**
- Create: `docs/research/native-map-global-player-coordinate-verification.md`
- Create: `apps/bitcraft-local/test/fixtures/map-global-player-live-fixture.json`
- Create: `apps/bitcraft-local/test/map-global-player-verification-fixture.test.mjs`
- Modify only if verified: `apps/bitcraft-local/src/server/game-data/schemaManifest.ts`

- [ ] **Step 1: Add a fixture schema test before capturing live rows**

Add a focused fixture-contract test, initially skipped with a precise verification-gate reason, requiring username, lowercase username, signed-in state, mobile row, world-region bounds, deletion/logout observations, database names, and schema fingerprints.

- [ ] **Step 2: Inspect exact selected identities through server-owned Relay tooling**

Capture at least one known online player and one logout/deletion transition from the global source. Verify:

1. username entity ID equals mobile entity ID;
2. signed-in state is current and logout removes/invalidates the marker;
3. `locationX / 1000` and `locationZ / 1000` align with the existing native map;
4. only dimension `1` is overworld;
5. normalized points lie inside `MAP_WORLD_BOUNDS`;
6. a deterministic world-region row contains the point; and
7. subscription deletion/deselection/disconnect semantics remove the row.

Record row counts and subscription payload sizes for 1, 20, and a practical larger selected-ID fixture. Redact private selections from logs and the document.

- [ ] **Step 3: Decide the gate from evidence**

If all checks pass, record `GLOBAL_MAP_PLAYER_IDENTITY_VERIFIED = true` and the exact binding/source contract to implement. If any check fails, keep it false, document the failed item, and stop this plan before public position work. Do not infer a transform or region.

- [ ] **Step 4: Verify documentation/fixture diff and commit**

```powershell
git diff --check
git add docs/research/native-map-global-player-coordinate-verification.md apps/bitcraft-local/test/fixtures/map-global-player-live-fixture.json apps/bitcraft-local/test/map-global-player-verification-fixture.test.mjs apps/bitcraft-local/src/server/game-data/schemaManifest.ts
git commit -m "docs(map): verify global player coordinates"
```

---

### Task 2: Global Player Directory Projection and Search Contract

**Files:**
- Create: `apps/bitcraft-local/src/server/game-data/mapPlayerDirectoryProjection.ts`
- Create: `apps/bitcraft-local/src/server/mapPlayerSearch.mjs`
- Create: `apps/bitcraft-local/test/map-player-directory-projection.test.mjs`
- Create: `apps/bitcraft-local/test/map-player-search.test.mjs`

**Interfaces:**

```ts
export type MapPlayerSearchResult = {
  playerId: string;
  username: string;
  online: boolean;
  monitoredMember: boolean;
};

export function normalizeMapPlayerQuery(value: unknown): string;
export function mapPlayerPrefixBounds(query: string): { lower: string; upper: string };
export function projectMapPlayerSearchResults(input: unknown, options: {
  query: string;
  monitoredPlayerIds: string[];
  limit?: number;
}): MapPlayerSearchResult[];
```

- [ ] **Step 1: Write failing contract tests**

Cover Unicode-safe trimming/case normalization, minimum length, prefix bounds, exact-before-prefix ordering, result cap 20, canonical 64-bit IDs, current username, online/member flags, duplicate identities, malformed wire rows, and no coordinate fields.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
corepack pnpm exec node --test test/map-player-directory-projection.test.mjs test/map-player-search.test.mjs
```

- [ ] **Step 3: Implement pure normalization and projection**

Keep Relay wire-shape handling inside `game-data`. `mapPlayerSearch.mjs` should expose only provider-neutral validation and response helpers. Do not add route or connection behavior yet.

- [ ] **Step 4: Run focused tests and commit**

```powershell
corepack pnpm exec node --test test/map-player-directory-projection.test.mjs test/map-player-search.test.mjs
git add apps/bitcraft-local/src/server/game-data/mapPlayerDirectoryProjection.ts apps/bitcraft-local/src/server/mapPlayerSearch.mjs apps/bitcraft-local/test/map-player-directory-projection.test.mjs apps/bitcraft-local/test/map-player-search.test.mjs
git commit -m "feat(map): define global player search contract"
```

---

### Task 3: Bounded Global Player Directory Session

**Files:**
- Create: `apps/bitcraft-local/src/server/game-data/mapPlayerDirectorySession.ts`
- Create: `apps/bitcraft-local/src/server/game-data/mapPlayerDirectoryRuntime.ts`
- Create: `apps/bitcraft-local/test/map-player-directory-session.test.mjs`
- Create: `apps/bitcraft-local/test/map-player-directory-runtime.test.mjs`

**Interfaces:**

```ts
export type MapPlayerDirectorySnapshot = {
  query: string;
  results: MapPlayerSearchResult[];
  generation: number;
  receivedAt: string;
  database: string;
  schemaFingerprint: string;
};

class RelayMapPlayerDirectoryRuntime {
  search(input: { relayBaseUrl: string; query: string; monitoredPlayerIds: string[] }): Promise<MapPlayerDirectorySnapshot>;
  health(): unknown;
  stop(): Promise<void>;
}
```

- [ ] **Step 1: Write failing SQL/session tests**

Require indexed prefix filtering against `player_lowercase_username_state`, joined/current usernames, bounded signed-in identity rows, schema fingerprint validation, exact/prefix ordering, subscription apply/error/timeout cleanup, and no full-table query. If Relay subscription SQL cannot enforce a bounded prefix query, stop this task and report the contract blocker; do not silently reduce search behavior or over-subscribe.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
corepack pnpm exec node --test test/map-player-directory-session.test.mjs test/map-player-directory-runtime.test.mjs
```

- [ ] **Step 3: Implement short-lived canonical query leases**

Use global topology discovery and bundled global bindings. Canonicalize normalized queries, share simultaneous identical searches, cap live sessions, apply a short idle cache to results, and rate-limit cold subscription creation. Stop and discard an affected result on schema mismatch; names/online flags may be cached briefly, but coordinates are never involved.

- [ ] **Step 4: Run focused tests and build**

```powershell
corepack pnpm exec node --test test/map-player-directory-projection.test.mjs test/map-player-directory-session.test.mjs test/map-player-directory-runtime.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

- [ ] **Step 5: Commit**

```powershell
git add apps/bitcraft-local/src/server/game-data/mapPlayerDirectorySession.ts apps/bitcraft-local/src/server/game-data/mapPlayerDirectoryRuntime.ts apps/bitcraft-local/test/map-player-directory-session.test.mjs apps/bitcraft-local/test/map-player-directory-runtime.test.mjs
git commit -m "feat(map): collect bounded player searches"
```

---

### Task 4: Exact-ID Global Live-Position Session

**Files:**
- Create: `apps/bitcraft-local/src/server/game-data/mapGlobalPlayerProjection.ts`
- Create: `apps/bitcraft-local/src/server/game-data/mapGlobalPlayerSession.ts`
- Create: `apps/bitcraft-local/src/server/game-data/mapGlobalPlayerScopeManager.ts`
- Create: `apps/bitcraft-local/test/map-global-player-projection.test.mjs`
- Create: `apps/bitcraft-local/test/map-global-player-session.test.mjs`
- Create: `apps/bitcraft-local/test/map-global-player-scope-manager.test.mjs`

**Interfaces:**

```ts
export type MapGlobalPlayerScope = { playerIds: string[] };
export type MapGlobalPlayerRow = {
  playerEntityId: string;
  username: string;
  signedIn: true;
  regionId: string;
  locationX: number;
  locationZ: number;
  locationDimension: "1";
  observedAt: string;
};

export function mapGlobalPlayerScopeKey(scope: MapGlobalPlayerScope): string;
```

- [ ] **Step 1: Write failing projection tests from the verified fixture**

Cover exact username/mobile identity, `/1000` via the existing coordinate conversion, dimension `1`, world bounds, deterministic region containment, current username, canonical IDs, duplicate/missing rows, and removal when signed-out.

- [ ] **Step 2: Write failing session and manager lifecycle tests**

Require exact-ID equality subscriptions only, maximum 250 selected IDs, complete generations, insert/update/delete, logout, deselection, late callback fencing, schema mismatch, disconnect, reconnect/backoff, canonical scope sharing, idle close, capacity rejection, and withholding all last-known external coordinates whenever the live generation is unhealthy.

- [ ] **Step 3: Run focused tests and verify RED**

```powershell
corepack pnpm exec node --test test/map-global-player-projection.test.mjs test/map-global-player-session.test.mjs test/map-global-player-scope-manager.test.mjs
```

- [ ] **Step 4: Implement the verified global service**

Model connection lifecycle on `RelayMapSpatialSession`/`RelayMapSpatialScopeManager`, but use global topology and only the verified identity, signed-in, mobile, and region-bound sources. Emit provider-neutral rows only after a complete applied generation. On disconnect or failure, the lease `snapshot()` must return no player rows rather than last-good coordinates.

- [ ] **Step 5: Run focused tests and build**

```powershell
corepack pnpm exec node --test test/map-global-player-projection.test.mjs test/map-global-player-session.test.mjs test/map-global-player-scope-manager.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

- [ ] **Step 6: Commit**

```powershell
git add apps/bitcraft-local/src/server/game-data/mapGlobalPlayerProjection.ts apps/bitcraft-local/src/server/game-data/mapGlobalPlayerSession.ts apps/bitcraft-local/src/server/game-data/mapGlobalPlayerScopeManager.ts apps/bitcraft-local/test/map-global-player-projection.test.mjs apps/bitcraft-local/test/map-global-player-session.test.mjs apps/bitcraft-local/test/map-global-player-scope-manager.test.mjs
git commit -m "feat(map): collect selected global players"
```

---

### Task 5: Public Search, Snapshot, and Event Integration

**Files:**
- Modify: `apps/bitcraft-local/src/server/httpRateLimit.mjs`
- Modify: `apps/bitcraft-local/src/server/mapSnapshot.mjs`
- Modify: `apps/bitcraft-local/server.mjs`
- Modify: `apps/bitcraft-local/test/server-http-rate-limit.test.mjs`
- Modify: `apps/bitcraft-local/test/map-snapshot.test.mjs`
- Create: `apps/bitcraft-local/test/map-player-route-integration.test.mjs`
- Modify: `apps/bitcraft-local/test/map-page-boundary.test.mjs`

**Public contracts:**

```text
GET /api/local/map/players/search?q=<query>
GET /api/local/map/snapshot?...&playerIds=<settlement>&externalPlayerIds=<external>
GET /api/local/map/events?...&playerIds=<settlement>&externalPlayerIds=<external>
```

- [ ] **Step 1: Write failing API, authorization, and privacy tests**

Cover public/Discord/verified/specific-user Map decisions; 3-character validation; result cap; search rate limit; no coordinate fields; canonical external IDs; union cap 250; monitored IDs remaining on the regional path; external IDs on the global path; merged unique player features; current usernames; offline/logout/disconnect absence; `403`, `422`, `413`, and `503` behavior; SSE generation notifications; route logging stripped to pathname; and no IDs/coordinates in health or logs.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
corepack pnpm exec node --test test/server-http-rate-limit.test.mjs test/map-player-route-integration.test.mjs test/map-snapshot.test.mjs test/map-page-boundary.test.mjs
```

- [ ] **Step 3: Extend the scope contract without weakening member authorization**

Add `externalPlayerIds` to `parseMapScope`, canonicalize both lists, reject a union over 250, and keep `authorizedMapPlayerIds` unchanged for settlement IDs. Add a separate projection for verified external rows. Deduplicate by player ID, preferring the monitored-member feature if the same identity occurs in both inputs.

- [ ] **Step 4: Wire runtimes and route lifecycle**

Instantiate directory/global-position runtimes beside the existing map runtimes, add them to shutdown handling, acquire/release exact scopes around snapshot/event requests, and notify SSE clients only with changed-generation metadata. Search uses its own conservative policy in `RATE_LIMITS` and the existing access-control subject/decision.

- [ ] **Step 5: Run focused tests, full suite, and build**

```powershell
corepack pnpm exec node --test test/server-http-rate-limit.test.mjs test/map-player-directory-projection.test.mjs test/map-player-directory-session.test.mjs test/map-player-directory-runtime.test.mjs test/map-global-player-projection.test.mjs test/map-global-player-session.test.mjs test/map-global-player-scope-manager.test.mjs test/map-player-route-integration.test.mjs test/map-snapshot.test.mjs test/map-page-boundary.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
corepack pnpm --filter @workspace/bitcraft-local test
```

- [ ] **Step 6: Commit**

```powershell
git add apps/bitcraft-local/src/server/httpRateLimit.mjs apps/bitcraft-local/src/server/mapSnapshot.mjs apps/bitcraft-local/server.mjs apps/bitcraft-local/test/server-http-rate-limit.test.mjs apps/bitcraft-local/test/map-snapshot.test.mjs apps/bitcraft-local/test/map-player-route-integration.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs
git commit -m "feat(map): expose selected global players"
```

---

### Task 6: Browser Search Client and External Selection State

**Files:**
- Create: `apps/bitcraft-local/src/pages/map/mapPlayerSearch.mjs`
- Create: `apps/bitcraft-local/src/pages/map/mapPlayerSearch.d.mts`
- Modify: `apps/bitcraft-local/src/pages/map/nativeMapRequest.mjs`
- Modify: `apps/bitcraft-local/src/pages/map/nativeMapRequest.d.mts`
- Modify: `apps/bitcraft-local/src/pages/map/playerTracking.ts`
- Modify: `apps/bitcraft-local/src/pages/map/MapPlayerTrackingPanel.tsx`
- Modify: `apps/bitcraft-local/src/pages/MapPage.tsx`
- Create: `apps/bitcraft-local/test/map-player-search-client.test.mjs`
- Modify: `apps/bitcraft-local/test/native-map-request.test.mjs`
- Modify: `apps/bitcraft-local/test/map-player-tracking.test.mjs`
- Modify: `apps/bitcraft-local/test/map-player-tracking-panel.test.mjs`

**Interfaces:**

```ts
export function createMapPlayerSearchLoader(options?: {
  fetchImpl?: typeof fetch;
  debounceMs?: number;
}): {
  search(query: string): Promise<{ query: string; results: MapPlayerSearchResult[] }>;
  cancel(): void;
};

// Native request input
externalPlayerIds?: string[];
```

- [ ] **Step 1: Write failing client and selection tests**

Cover 3-character gating, debounce, abort/stale-response fencing, validation of provider-neutral results, 403/429/unavailable presentation, selection by decimal ID, rename refresh of stored label, deduplication against settlement members, settlement-only presets, external persistence without coordinates, total cap, and separate `externalPlayerIds` URL serialization.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
corepack pnpm exec node --test test/map-player-search-client.test.mjs test/native-map-request.test.mjs test/map-player-tracking.test.mjs test/map-player-tracking-panel.test.mjs
```

- [ ] **Step 3: Implement the client and complete All players/Tracked views**

Search after a bounded debounce, cancel on query/view/unmount change, and apply results only when their normalized query matches the current request. Add/remove external identities independently of settlement selections. Refresh stored usernames from successful search/live identity responses. Show Offline - waiting for live position without rendering stale coordinates.

- [ ] **Step 4: Send separate external selections to `NativeMap`**

Extend `nativeMapRequest` and `NativeMap` inputs so `playerIds` remains the settlement list and `externalPlayerIds` contains external identities. Build the toolbar count and Tracked tab from the deduplicated union. Preserve stable marker colors derived from decimal-string identity.

- [ ] **Step 5: Run focused tests and build**

```powershell
corepack pnpm exec node --test test/map-player-search-client.test.mjs test/native-map-request.test.mjs test/map-player-tracking.test.mjs test/map-player-tracking-panel.test.mjs test/map-page-boundary.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

- [ ] **Step 6: Commit**

```powershell
git add apps/bitcraft-local/src/pages/map/mapPlayerSearch.mjs apps/bitcraft-local/src/pages/map/mapPlayerSearch.d.mts apps/bitcraft-local/src/pages/map/nativeMapRequest.mjs apps/bitcraft-local/src/pages/map/nativeMapRequest.d.mts apps/bitcraft-local/src/pages/map/playerTracking.ts apps/bitcraft-local/src/pages/map/MapPlayerTrackingPanel.tsx apps/bitcraft-local/src/pages/MapPage.tsx apps/bitcraft-local/test/map-player-search-client.test.mjs apps/bitcraft-local/test/native-map-request.test.mjs apps/bitcraft-local/test/map-player-tracking.test.mjs apps/bitcraft-local/test/map-player-tracking-panel.test.mjs
git commit -m "feat(map): track external player selections"
```

---

### Task 7: End-to-End Verification and Smoke Acceptance

**Files:**
- Modify as needed for defects found: only files already listed in Tasks 1-6
- Update: `docs/research/native-map-global-player-coordinate-verification.md`

- [ ] **Step 1: Run final focused privacy/lifecycle coverage**

```powershell
corepack pnpm exec node --test test/map-player-directory-projection.test.mjs test/map-player-directory-session.test.mjs test/map-player-directory-runtime.test.mjs test/map-global-player-projection.test.mjs test/map-global-player-session.test.mjs test/map-global-player-scope-manager.test.mjs test/map-player-route-integration.test.mjs test/map-player-search-client.test.mjs test/map-snapshot.test.mjs test/native-map-request.test.mjs test/map-player-tracking.test.mjs test/map-player-tracking-panel.test.mjs test/map-page-boundary.test.mjs
```

- [ ] **Step 2: Run full build and test suite**

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
corepack pnpm --filter @workspace/bitcraft-local test
```

- [ ] **Step 3: Restart backend smoke and verify health**

```powershell
node scripts/start-bitcraft-local-smoke.mjs --force-restart
curl.exe -s http://127.0.0.1:18449/api/local/health
```

- [ ] **Step 4: Browser acceptance**

At desktop and mobile widths verify: a 3+ character search; exact and prefix results; adding online and offline external players; persistence across reload; current-name refresh; member presets leaving external choices intact; an offline player appearing only after coming online; immediate removal on logout/deselection; players anywhere in the world independent of resource-region filters; stable distinct marker colors; accessible labels; exclusive tool panels; no iframe/direct Relay/third-party requests; and no console errors or 429 loops.

- [ ] **Step 5: Inspect logs and storage for privacy**

Confirm request logs contain route paths but no search response bodies, full selected ID lists, or coordinates. Confirm local storage contains external IDs/current labels only. Confirm no SQLite table/history/diagnostic record contains external coordinates.

- [ ] **Step 6: Record final evidence and commit only actual corrections/documentation**

```powershell
git diff --check
git add docs/research/native-map-global-player-coordinate-verification.md
git commit -m "test(map): verify global player tracking"
```

If smoke reveals a defect, add a failing regression test, make the smallest owning-module fix, rerun the relevant focused checks plus build/full suite, and include those exact files in the final commit. Leave the smoke server running for user testing.
