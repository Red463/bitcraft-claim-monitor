# Native Map Fast Resource Subscriptions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to execute this plan task by task.

**Goal:** Make selected native-map resources appear with BitCraftMap-like responsiveness by sharing one server-owned Relay connection per active region and independently caching each `(regionId, resourceId)` subscription.

**Architecture:** Add a focused resource projection, a dynamic per-region Relay session, and a lease-based resource runtime. Keep player/enemy collection in the existing exact-scope manager, compose resource generations into the existing provider-neutral snapshot, and continue using same-origin SSE only as a generation notification channel.

**Tech Stack:** Node.js 24, TypeScript, SpacetimeDB 2.7 typed bindings, Node HTTP/SSE, React, Leaflet, Node test runner, pnpm.

## Global Constraints

- Work in `apps/bitcraft-local`; do not recreate legacy/Replit code.
- Browsers must never connect directly to Relay, BitJita, Prism, BitCraftMap, or a third-party tile host.
- Preserve resource and entity IDs as decimal strings; never coerce entity IDs to JavaScript numbers.
- Subscribe only selected resource types in configured active regions, overworld dimension `1`.
- Preserve the public caps: 4 regions, 16 resource types, 50,000 returned features, and 8 MiB uncompressed JSON.
- Do not persist volatile resource positions or add a polling loop.
- A schema mismatch or incomplete generation must retain the prior usable generation and report degraded health.
- An applied subscription with zero joined rows is a valid, available result.
- Keep the four existing uncommitted loading/framing edits in `NativeMap.tsx`, `resourceViewport.mjs`, `resourceViewport.d.mts`, and `map-resource-viewport.test.mjs`; refine them in Task 5 instead of discarding them.
- Run commands from `apps/bitcraft-local` when a task shows a local `node --test` command; run workspace build/test commands from the repository root.

---

## Task 1: Extract the bounded resource projection

**Files:**

- Create: `apps/bitcraft-local/src/server/game-data/mapResourceProjection.ts`
- Modify: `apps/bitcraft-local/src/server/game-data/mapSpatialProjection.ts`
- Modify: `apps/bitcraft-local/src/server/game-data/mapSpatialSession.ts`
- Modify: `apps/bitcraft-local/src/server/game-data/index.ts`
- Create: `apps/bitcraft-local/test/map-resource-projection.test.mjs`
- Modify: `apps/bitcraft-local/test/map-spatial-projection.test.mjs`
- Modify: `apps/bitcraft-local/test/map-spatial-session.test.mjs`

### Step 1: Write the failing projection tests

Add tests that lock these rules:

```js
test("resource queries are independently bounded by one type and overworld dimension", () => {
  assert.deepEqual(mapResourceQueries("28"), [
    "SELECT resource_state.* FROM resource_state JOIN location_state ON resource_state.entity_id = location_state.entity_id WHERE resource_state.resource_id = 28 AND location_state.dimension = 1",
    "SELECT location_state.* FROM resource_state JOIN location_state ON resource_state.entity_id = location_state.entity_id WHERE resource_state.resource_id = 28 AND location_state.dimension = 1",
  ]);
});

test("resource normalization joins lossless entity ids and reports completeness", () => {
  const result = normalizeMapResourceGeneration({
    regionId: "19",
    resourceId: "28",
    resourceRows: [{ entityId: 9007199254740993123n, resourceId: 28 }],
    locationRows: [{ entityId: 9007199254740993123n, x: 27361, z: 23715, dimension: 1 }],
    observedAt: "2026-08-12T12:00:00.000Z",
  });
  assert.equal(result.complete, true);
  assert.equal(result.resources[0].entityId, "9007199254740993123");
});
```

Also cover invalid resource IDs, wrong resource rows, dimension filtering, negative/out-of-bounds coordinates, a missing joined location (`complete: false`), and a fully applied empty pair (`complete: true`, zero resources).

### Step 2: Run the test to verify it fails

Run:

```powershell
node --experimental-strip-types --test test/map-resource-projection.test.mjs
```

Expected: FAIL because `mapResourceProjection.ts` does not exist.

### Step 3: Implement the resource projection

Export this provider-neutral seam:

```ts
export type MapResourcePoint = {
  entityId: string;
  resourceId: string;
  regionId: string;
  locationX: number;
  locationZ: number;
  dimension: "1";
  observedAt: string;
};

export type MapResourceGenerationData = {
  complete: boolean;
  resources: MapResourcePoint[];
  warnings: string[];
};

export function mapResourceKey(regionId: string, resourceId: string): string;
export function mapResourceQueries(resourceId: string): string[];
export function normalizeMapResourceGeneration(input: {
  regionId: string;
  resourceId: string;
  resourceRows: unknown[];
  locationRows: unknown[];
  observedAt: string;
}): MapResourceGenerationData;
```

Use the existing decimal and bounded-coordinate semantics from `mapSpatialProjection.ts`. Filter both input tables to the selected type's joined entity set. Sort output deterministically by decimal-string entity ID. Set `complete: false` when a selected `resource_state` row lacks its subscribed overworld `location_state` partner; do not invent a point.

Remove resource query construction and resource normalization from `mapSpatialProjection.ts`. Keep its returned `data.resources` property as an empty array for compatibility until Task 4 moves snapshot composition to the new resource input. In `mapSpatialSession.ts`, stop reading `resourceState`, counting resource rows, attaching resource-table listeners, and publishing resource points; this session remains responsible only for players, enemies, and the already-scoped operational rows. Export the new module from `game-data/index.ts`.

### Step 4: Run focused projection tests

Run:

```powershell
node --experimental-strip-types --test test/map-resource-projection.test.mjs test/map-spatial-projection.test.mjs test/map-spatial-session.test.mjs
```

Expected: PASS.

### Step 5: Commit

```powershell
git add apps/bitcraft-local/src/server/game-data/mapResourceProjection.ts apps/bitcraft-local/src/server/game-data/mapSpatialProjection.ts apps/bitcraft-local/src/server/game-data/mapSpatialSession.ts apps/bitcraft-local/src/server/game-data/index.ts apps/bitcraft-local/test/map-resource-projection.test.mjs apps/bitcraft-local/test/map-spatial-projection.test.mjs apps/bitcraft-local/test/map-spatial-session.test.mjs
git commit -m "refactor(map): isolate resource projection"
```

---

## Task 2: Build one dynamic resource session per region

**Files:**

- Create: `apps/bitcraft-local/src/server/game-data/mapResourceRegionSession.ts`
- Modify: `apps/bitcraft-local/src/server/game-data/index.ts`
- Create: `apps/bitcraft-local/test/map-resource-region-session.test.mjs`

### Step 1: Write the failing session tests

Build a fake typed connection like the existing `map-spatial-session` fixture. Test:

- `start()` validates the regional schema fingerprint before loading bindings.
- `subscribe("28")` and `subscribe("54")` create four filtered queries on one connection.
- Adding `54` never unsubscribes or resubscribes `28`.
- each subscription publishes only after its own `onApplied` callback.
- an applied empty subscription publishes a complete empty generation.
- insert/update/delete bursts produce one rebuild after the 300 ms coalescing window.
- a transient incomplete join retains the previous generation and records a warning.
- `unsubscribe("28")` removes only its two-query handle.
- disconnect calls `onFailure`, and `stop()` removes listeners, unsubscribes all handles, and disconnects exactly once.

Use injected timers; tests must not sleep in real time.

### Step 2: Run the test to verify it fails

Run:

```powershell
node --experimental-strip-types --test test/map-resource-region-session.test.mjs
```

Expected: FAIL because the session module does not exist.

### Step 3: Implement the regional session

Expose:

```ts
export type MapResourceSnapshot = {
  data: { regionId: string; resourceId: string; resources: MapResourcePoint[] };
  warnings: string[];
  database: string;
  regionId: string;
  resourceId: string;
  schemaFingerprint: string;
  generation: number;
  receivedAt: string;
};

export class RelayMapResourceRegionSession {
  constructor(dependencies: {
    loadBindings?: () => Promise<RegionalBindingModule>;
    onSnapshot(snapshot: MapResourceSnapshot): void | Promise<void>;
    onFailure(error: string): void;
    now?: () => Date;
    setTimer?: (callback: () => void, delayMs: number) => unknown;
    clearTimer?: (timer: unknown) => void;
    rebuildDelayMs?: number;
  });
  start(config: RegionSessionConfig): Promise<void>;
  subscribe(resourceId: string, generation: number): Promise<void>;
  unsubscribe(resourceId: string): void;
  health(): ResourceRegionHealth;
  stop(): Promise<void>;
}
```

`start()` opens the typed regional connection without subscribing every resource. `subscribe()` installs `mapResourceQueries(resourceId)` and stores one handle per decimal-string resource ID. Attach one listener set to `resourceState` and `locationState`; a change schedules a single 300 ms rebuild of all applied selected IDs. The public request cap limits this scan to at most 16 IDs per region.

On rebuild, call `normalizeMapResourceGeneration`. Publish and increment only when `complete` is true and the row budget is within the configured limit. If it is incomplete, keep the prior snapshot, set `lastError`, and wait for the paired cache change. Track connection state, applied resource IDs, rows per type, first-generation latency, last applied time, and the latest error; health must contain no coordinates.

### Step 4: Run the focused session tests

Run:

```powershell
node --experimental-strip-types --test test/map-resource-region-session.test.mjs
```

Expected: PASS.

### Step 5: Commit

```powershell
git add apps/bitcraft-local/src/server/game-data/mapResourceRegionSession.ts apps/bitcraft-local/src/server/game-data/index.ts apps/bitcraft-local/test/map-resource-region-session.test.mjs
git commit -m "feat(map): add regional resource sessions"
```

---

## Task 3: Add the lease-based warm resource runtime

**Files:**

- Create: `apps/bitcraft-local/src/server/game-data/mapResourceRuntime.ts`
- Modify: `apps/bitcraft-local/src/server/game-data/index.ts`
- Create: `apps/bitcraft-local/test/map-resource-runtime.test.mjs`

### Step 1: Write the failing runtime tests

Use fake topology and fake region sessions. Lock these behaviors:

1. `reconcile()` opens and pins exactly the primary region connection without creating resource subscriptions.
2. two leases for `(19,28)` share one subscription and one cached snapshot.
3. acquiring `(19,54)` reuses region 19's connection and subscribes only 54.
4. resource ID order in browser selections cannot create duplicate keys.
5. release to zero retains the subscription for 60 seconds; reacquire within the window is immediately warm.
6. expiry unsubscribes that resource only; an unpinned empty region closes after its region idle timeout.
7. first-generation waiters resolve for populated and valid-empty snapshots.
8. a failed region connection restarts with bounded backoff, restores currently leased/idle resource subscriptions, and begins generation at prior generation + 1.
9. schema mismatch yields an unavailable key while preserving any prior usable snapshot as stale.
10. configured-region, per-region subscription, and total warm-region capacity limits reject cold creation without evicting leased entries.
11. more than 64 genuinely cold resource starts in 60 seconds are rejected, while warm cache acquisition bypasses the cold-start limiter.

### Step 2: Run the test to verify it fails

Run:

```powershell
node --experimental-strip-types --test test/map-resource-runtime.test.mjs
```

Expected: FAIL because the runtime module does not exist.

### Step 3: Implement canonical keys and lease contracts

Expose:

```ts
export type MapResourceLeaseState = "loading" | "live" | "stale" | "unavailable";

export type MapResourceLease = {
  key: string;
  state(): {
    status: MapResourceLeaseState;
    snapshot: MapResourceSnapshot | null;
    warning: string | null;
  };
  waitForSnapshot(timeoutMs: number): Promise<MapResourceSnapshot | null>;
  release(): Promise<void>;
};

export function mapResourceScopeKey(regionId: string, resourceId: string): string {
  return `${decimal(regionId)}|resource:${decimal(resourceId)}`;
}

export class RelayMapResourceRuntime {
  reconcile(config: {
    relayBaseUrl: string;
    primaryRegionId: string;
    activeRegionIds: string[];
  }): Promise<void>;
  acquire(input: { regionId: string; resourceId: string }): Promise<MapResourceLease>;
  health(): MapResourceRuntimeHealth;
  stop(): Promise<void>;
}
```

The runtime owns a `Map<regionId, RegionEntry>`. Each region entry owns one `RelayMapResourceRegionSession` and a `Map<resourceId, ResourceEntry>`. Resource entries own lease count, last usable snapshot, readiness waiters, generation counter, idle timer, and failure state.

Defaults:

```ts
resourceIdleMs = 60_000;
regionIdleMs = 60_000;
maxRegions = 4;
maxResourceTypesPerRegion = 16;
coldStartWindowMs = 60_000;
maxColdStartsPerWindow = 64;
reconnectDelayMs = attempt => Math.min(30_000, 1_000 * 2 ** Math.max(0, attempt - 1));
```

`reconcile()` canonicalizes configured active regions, pins the primary region, rejects acquisition outside that set, and closes removed regions once they have no leases. `acquire()` must return the cached snapshot immediately when present, even while reconnecting; its state reports `stale` during that failure. A key with no snapshot is `loading` while a verified subscription is pending and `unavailable` after a schema/capacity/source failure. Enforce cold-start rate limiting with an injected clock and a sliding array of creation timestamps; do not count cache hits, duplicate leases, or reconnect restoration as new cold starts.

### Step 4: Run focused runtime tests

Run:

```powershell
node --experimental-strip-types --test test/map-resource-runtime.test.mjs
```

Expected: PASS.

### Step 5: Commit

```powershell
git add apps/bitcraft-local/src/server/game-data/mapResourceRuntime.ts apps/bitcraft-local/src/server/game-data/index.ts apps/bitcraft-local/test/map-resource-runtime.test.mjs
git commit -m "feat(map): cache resource subscriptions by region and type"
```

---

## Task 4: Integrate resource leases into snapshot and SSE routes

**Files:**

- Modify: `apps/bitcraft-local/server.mjs`
- Modify: `apps/bitcraft-local/src/server/mapSnapshot.mjs`
- Modify: `apps/bitcraft-local/src/server/game-data/contracts.ts`
- Modify: `apps/bitcraft-local/src/server/game-data/gameDataRoute.ts`
- Modify: `apps/bitcraft-local/test/map-snapshot.test.mjs`
- Modify: `apps/bitcraft-local/test/map-page-boundary.test.mjs`
- Modify: `apps/bitcraft-local/test/game-data-repository-route.test.mjs`
- Create: `apps/bitcraft-local/test/map-resource-route-integration.test.mjs`

### Step 1: Write failing API and integration tests

Add focused tests for:

- snapshot requests acquire Cartesian `(regionId, resourceId)` leases while player/enemy leases receive `resourceIds: []`;
- two requests with different player selections share the same resource lease key;
- a mixed warm/cold request preserves warm points and reports the cold key as loading;
- a cold resource-only request returns `200`, not `503`, with `layerAvailability.resources.status === "loading"`;
- a valid empty generation returns `available: true`, `status: "live"`, and zero features;
- partial/stale resource warnings affect overall freshness without clearing usable resource points;
- SSE listeners receive `map-resources` changes only for selected `(region,type)` keys;
- release happens on response completion, request close, and event-stream close;
- existing 4-region, 16-resource, 50,000-feature, and 8-MiB limits still apply;
- health output reports counts and latency but contains neither points nor selected ID lists.

### Step 2: Run the tests to verify they fail

Run:

```powershell
node --experimental-strip-types --test test/map-snapshot.test.mjs test/map-page-boundary.test.mjs test/game-data-repository-route.test.mjs test/map-resource-route-integration.test.mjs
```

Expected: FAIL because the server does not own a resource runtime and the snapshot has no resource readiness metadata.

### Step 3: Add explicit resource collection input to the snapshot builder

Extend `buildMapSnapshot` with:

```js
resourceCollection = {
  data: { resources: [] },
  generation: 0,
  provenance: { receivedAt: null },
  warnings: [],
  requestedKeys: [],
  readyKeys: [],
  loadingKeys: [],
  unavailableKeys: [],
}
```

Do not expose internal keys in the public response. Map them to:

```ts
type MapLayerAvailability = {
  available: boolean;
  status: "live" | "partial" | "stale" | "loading" | "unavailable";
  reason: string | null;
};
```

Rules:

- all requested keys ready: available/live (or stale if their usable generations are stale);
- some ready and some loading/unavailable: available/partial, retaining all ready points;
- none ready but at least one loading: unavailable-to-render/loading, HTTP 200;
- none ready and none loading: unavailable/unavailable;
- ready empty keys count as ready.

Include `resourceCollection` in generation, age, warning, freshness, feature-count, and byte-budget calculations. Stop reading resources from `spatial.data.resources`.

### Step 4: Wire the runtime into server lifecycle and routes

Instantiate `RelayMapResourceRuntime` beside `RelayMapSpatialScopeManager`. Its generation callback publishes:

```js
{
  claimId: currentClaimId(),
  generation: snapshot.generation,
  generatedAt: snapshot.receivedAt,
  changedDomains: ["map-resources"],
  mapResourceScopeKey: mapResourceScopeKey(snapshot.regionId, snapshot.resourceId),
}
```

Add `map-resources` to `DOMAIN_KEYS` and the map event domain set. Extend listener filtering with `mapResourceScopeKeys` so a resource event never leaks into an unrelated selection's stream.

During `reconcilePrimaryRegion`, call:

```js
await relayMapResourceRuntime.reconcile({
  relayBaseUrl,
  primaryRegionId: regionId,
  activeRegionIds: parseRegionIds(`${regionId},${settings.defaultRegion},${settings.additionalActiveRegions}`).slice(0, 4),
});
```

Add the runtime to `relayClaimScopeFence` shutdown. Include sanitized resource health in `gameDataProviderHealth()`.

In the map routes:

1. acquire existing spatial leases only for permitted players/enemies and always pass `resourceIds: []`;
2. acquire one resource lease for each selected region/type pair;
3. wait up to `MAP_SPATIAL_INITIAL_WAIT_MS` only on missing first resource generations;
4. compose lease states with a pure `combineMapResourceLeases()` helper;
5. pass `spatial` and `resourceCollection` separately to `buildMapSnapshot`;
6. keep resource leases for the SSE lifetime, and release snapshot leases in `finally`.

Do not log scope keys, coordinates, full selections, or response bodies.

### Step 5: Run focused API tests

Run:

```powershell
node --experimental-strip-types --test test/map-snapshot.test.mjs test/map-page-boundary.test.mjs test/game-data-repository-route.test.mjs test/map-resource-route-integration.test.mjs
```

Expected: PASS.

### Step 6: Commit

```powershell
git add apps/bitcraft-local/server.mjs apps/bitcraft-local/src/server/mapSnapshot.mjs apps/bitcraft-local/src/server/game-data/contracts.ts apps/bitcraft-local/src/server/game-data/gameDataRoute.ts apps/bitcraft-local/test/map-snapshot.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs apps/bitcraft-local/test/game-data-repository-route.test.mjs apps/bitcraft-local/test/map-resource-route-integration.test.mjs
git commit -m "feat(map): serve shared resource generations"
```

---

## Task 5: Make browser loading and framing selection-safe

**Files:**

- Modify: `apps/bitcraft-local/src/pages/map/NativeMap.tsx`
- Modify: `apps/bitcraft-local/src/pages/map/resourceViewport.mjs`
- Modify: `apps/bitcraft-local/src/pages/map/resourceViewport.d.mts`
- Modify: `apps/bitcraft-local/src/pages/map/mapSnapshotLoader.mjs`
- Modify: `apps/bitcraft-local/test/map-resource-viewport.test.mjs`
- Modify: `apps/bitcraft-local/test/map-snapshot-loader.test.mjs`
- Modify: `apps/bitcraft-local/test/map-page-boundary.test.mjs`

### Step 1: Extend the current WIP tests before changing implementation

Keep the existing tests for `resourceViewportDecision` and add the transition that previously violated stale-data handling:

```js
test("A to B cannot let A consume B's one-time framing", () => {
  const oldPoints = [point(10, 20)];
  assert.equal(resourceViewportDecision({
    selectionKey: "54",
    snapshotSelectionKey: "28",
    consumedSelectionKey: "28",
    points: oldPoints,
    isVisible: () => false,
  }), "wait");
});
```

Add tests proving:

- explicit API `status: "loading"` wins over the old reason-string heuristic;
- warm points remain visible while another selected key loads;
- removed types disappear when the matching new snapshot arrives;
- the loader ignores or tags a response whose request selection key is no longer current;
- SSE remains event-driven/single-flight and no polling timer is introduced.

### Step 2: Run the tests and confirm the new assertions fail

Run:

```powershell
node --experimental-strip-types --test test/map-resource-viewport.test.mjs test/map-snapshot-loader.test.mjs test/map-page-boundary.test.mjs
```

Expected: at least the explicit status/request-key assertions FAIL.

### Step 3: Associate every response with its request key

Change the loader value from a bare snapshot to:

```ts
type RequestedMapSnapshot = {
  requestKey: string;
  value: MapSnapshot;
};
```

Capture `request.snapshotUrl` or an equivalent canonical selection key inside each `load()` invocation. In `onValue`, commit the payload only when its key still equals the current request key. Abort the old request on effect cleanup. This makes stale/partial Relay data handling explicit and prevents an A response from consuming B's framing decision.

Update the frontend `MapSnapshot.layerAvailability` type with the new `status` union. Replace the exact English reason match in `resourceLayerStatus` with `status === "loading"`; retain a compatibility fallback only for snapshots produced before this server change.

When a matching snapshot is partial, render all returned ready points and show `loading` until every selected key is ready. Apply one-time framing only when `selectionKey === snapshotSelectionKey`, the resource layer is no longer loading, and at least one point exists.

### Step 4: Run focused frontend tests

Run:

```powershell
node --experimental-strip-types --test test/map-resource-viewport.test.mjs test/map-snapshot-loader.test.mjs test/map-page-boundary.test.mjs
```

Expected: PASS.

### Step 5: Build the application

From the repository root, run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: PASS.

### Step 6: Commit

```powershell
git add apps/bitcraft-local/src/pages/map/NativeMap.tsx apps/bitcraft-local/src/pages/map/resourceViewport.mjs apps/bitcraft-local/src/pages/map/resourceViewport.d.mts apps/bitcraft-local/src/pages/map/mapSnapshotLoader.mjs apps/bitcraft-local/test/map-resource-viewport.test.mjs apps/bitcraft-local/test/map-snapshot-loader.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs
git commit -m "fix(map): preserve resources through cold selections"
```

---

## Task 6: Full verification and live smoke acceptance

**Files:**

- Modify only if a regression is found in files already named above.
- Do not update `CHANGELOG.md` or the package version unless the user asks to push/release.

### Step 1: Run all application tests

From the repository root, run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local test
```

Expected: PASS.

### Step 2: Run the production build again

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: PASS.

### Step 3: Restart the stable smoke server

Backend code changed, so run:

```powershell
node scripts/start-bitcraft-local-smoke.mjs --force-restart
curl.exe -s http://127.0.0.1:18449/api/local/health
```

Expected: launcher returns within 15 seconds and health returns JSON.

### Step 4: Browser-smoke the resource lifecycle

Open:

```text
http://127.0.0.1:18449/?page=map&label=Zephra&x=27361&z=23715&regionId=19
```

Verify with the browser network/console and visible map:

1. select Large Fallen Tree (`resourceId=28`) from a cold state;
2. confirm the legend shows loading, then points appear without manual refresh;
3. add Large Fallen Tree Stump (`resourceId=1000028`);
4. confirm existing 28 points remain while only 1000028 loads;
5. deselect 28 and confirm it disappears after the matching snapshot;
6. reselect 28 within 60 seconds and confirm it returns from the warm cache;
7. hide/show the tab and confirm one current snapshot is fetched on resume;
8. confirm no `429`, repeated failed fetch, reconnect churn, Relay browser request, or third-party map-data request;
9. confirm resource dots remain above ordinary overlays and canvas accessibility details update.

Capture server-boundary timings for the warm snapshot. Acceptance target: under 500 ms and within the existing feature/byte limits.

### Step 5: Inspect health and logs without exposing coordinates

Confirm resource health shows regional connection count, active/idle subscription counts, first-generation latency, rows-per-type counts, restart attempts, and capacity rejections. Confirm logs contain neither coordinates nor full selection lists.

### Step 6: Review the final diff

Run:

```powershell
git diff --check
git status --short
git log --oneline -6
```

Expected: no whitespace errors, no generated logs/databases staged, and only intentional native-map changes remain.

### Step 7: Route any smoke failure back to its owning task

If smoke finds a regression, return to the task that owns the failing module, add a focused failing test there, make the smallest fix, rerun that task's verification, and amend that task's commit. Do not create a verification-only empty commit.

---

## Definition of Done

- One Relay connection is shared by all selected resources in a region.
- Adding resource B does not restart, resubscribe, hide, or clear resource A.
- Cold resources transition from loading to a complete populated or valid-empty generation through SSE.
- Warm reselection within the idle window is immediate.
- Player/enemy privacy scopes and verification gates are unchanged.
- No browser makes an upstream or third-party map-data request.
- Snapshot/SSE access controls, limits, freshness, stale-data, schema failure, and last-good semantics pass focused tests.
- Full application test and build commands pass.
- Live smoke verifies Fallen Tree and Fallen Tree Stump behavior without fetch/429 churn.
