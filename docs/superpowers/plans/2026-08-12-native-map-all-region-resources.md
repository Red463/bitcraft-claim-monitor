# Native Map All-Region Resources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track multiple selected resources across every Relay-ready region without a global 50,000-node ceiling or monolithic resource payload.

**Architecture:** Keep the existing server-owned, exact Relay joins, but expose topology-ready regions through a provider-neutral catalogue and load resource data as generation-bound `{regionId, resourceId}` partitions. Each partition is paged, cached, refreshed by a scoped generation event, and merged incrementally into the existing canvas renderer.

**Tech Stack:** Node.js 24, TypeScript, React, Leaflet 1.9.4, typed SpacetimeDB subscriptions, provider-neutral same-origin HTTP/SSE, Node test runner.

## Global Constraints

- Browsers must use same-origin endpoints only and must never connect directly to Relay, BitJita, Prism, or third-party map hosts.
- `page:map` access control applies to region catalogue, partition snapshot, and resource event routes.
- Region, resource, and entity IDs remain canonical decimal strings; never coerce entity IDs to JavaScript numbers.
- `All regions` means every currently topology-ready regional source with a usable schema fingerprint.
- Total tracked resource nodes may exceed 50,000; limits protect individual subscriptions, pages, bytes, and cold-start concurrency rather than the total logical selection.
- Existing last-good, schema-mismatch, deletion, idle-retention, and generation fencing semantics remain intact.
- Coordinates, complete selections, response bodies, and cursor contents must not be logged.
- No database migration, spatial history, direct browser Relay subscription, or terrain/road cadence change is included.

---

## File Structure

- Create `apps/bitcraft-local/src/server/mapResourceRegions.mjs`: project topology health plus region metadata into the public map-region catalogue.
- Create `apps/bitcraft-local/src/server/mapResourcePages.mjs`: validate one partition scope, create/verify opaque generation-bound cursors, and page compact resource rows.
- Create `apps/bitcraft-local/src/pages/map/mapResourcePartitionState.mjs`: canonical partition planning and immutable client cache transitions.
- Create `apps/bitcraft-local/src/pages/map/mapResourcePartitionLoader.mjs`: bounded-concurrency, abortable, multi-page partition loading.
- Modify `apps/bitcraft-local/src/server/game-data/mapResourceRegionSession.ts`: budget normalized unique nodes instead of double-counted join rows.
- Modify `apps/bitcraft-local/src/server/game-data/mapResourceRuntime.ts`: permit every configured topology-ready region while retaining per-region resource and cold-start controls.
- Modify `apps/bitcraft-local/src/server/game-data/gameDataRoute.ts`: expose resource scope keys in relevant generation events and keep lease composition partition-safe.
- Modify `apps/bitcraft-local/src/server/mapSnapshot.mjs`: separate operational map scope parsing from resource partition/selection parsing.
- Modify `apps/bitcraft-local/server.mjs`: add catalogue/partition/event routes and reconcile the runtime against all ready regions.
- Modify `apps/bitcraft-local/src/pages/map/nativeMapRequest.mjs`: produce operational snapshot URLs, partition requests, and a dedicated resource event URL.
- Modify `apps/bitcraft-local/src/pages/MapPage.tsx`: populate the picker from the map-region catalogue and preserve explicit `All regions` semantics.
- Modify `apps/bitcraft-local/src/pages/map/NativeMap.tsx`: install the partition loader and merge partition features into the existing dense canvas layer.
- Modify declarations adjacent to changed `.mjs` modules and focused tests under `apps/bitcraft-local/test/`.

### Task 1: Project every Relay-ready map region

**Files:**
- Create: `apps/bitcraft-local/src/server/mapResourceRegions.mjs`
- Test: `apps/bitcraft-local/test/map-resource-regions.test.mjs`
- Modify: `apps/bitcraft-local/server.mjs`
- Modify: `apps/bitcraft-local/test/map-page-boundary.test.mjs`

**Interfaces:**
- Produces: `mapResourceRegionCatalog({ providerHealth, regionSnapshot, fallbackRegionIds, generatedAt? })` returning `{ provider: "relay", generatedAt, freshness, warnings, regions, regionIds }`.
- Each public region is `{ regionId: string, regionName: string, relayReady: true, freshness: "live" | "stale" }`.
- Produces route: `GET /api/local/map/regions`.

- [ ] **Step 1: Write failing catalogue tests**

```js
test("map resource regions include every ready topology source in decimal order", () => {
  const result = mapResourceRegionCatalog({
    providerHealth: { sources: {
      "region:24": { ready: true, schemaFingerprint: "fp-24" },
      "region:3": { ready: false, schemaFingerprint: "fp-3" },
      "region:19": { ready: true, schemaFingerprint: "fp-19" },
      "region:7": { ready: true, schemaFingerprint: null },
    } },
    regionSnapshot: { data: { regions: [
      { regionId: "19", regionName: "Zephra" },
      { regionId: "24", regionName: "Aria" },
    ] }, provenance: { receivedAt: "2026-08-12T20:00:00.000Z" } },
  });
  assert.deepEqual(result.regionIds, ["19", "24"]);
  assert.deepEqual(result.regions.map(({ regionName }) => regionName), ["Zephra", "Aria"]);
});

test("catalogue uses a configured fallback only while topology is unavailable", () => {
  const result = mapResourceRegionCatalog({ providerHealth: {}, regionSnapshot: null, fallbackRegionIds: ["19"] });
  assert.deepEqual(result.regionIds, ["19"]);
  assert.equal(result.freshness, "stale");
});
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `node --experimental-strip-types --test apps/bitcraft-local/test/map-resource-regions.test.mjs`

Expected: FAIL because `mapResourceRegionCatalog` does not exist.

- [ ] **Step 3: Implement the pure catalogue projection**

Implement decimal canonicalization, numeric ordering, `region:<id>` extraction, `ready === true && schemaFingerprint` filtering, region-name lookup from `regionSnapshot.data.regions`, and the fallback rule in `mapResourceRegions.mjs`. Do not expose database names, ports, fingerprints, or Relay URLs.

- [ ] **Step 4: Add the authorized catalogue route**

Import the projection in `server.mjs`. Add `/api/local/map/regions` beside `/api/local/map/catalog`, apply `RATE_LIMITS.expensiveLocal`, call `mapRequestAccess`, and build the response from `gameDataProviderHealth()`, the current `region` snapshot, and configured fallback IDs.

- [ ] **Step 5: Run focused tests and boundary tests**

Run: `node --experimental-strip-types --test apps/bitcraft-local/test/map-resource-regions.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```powershell
git add apps/bitcraft-local/src/server/mapResourceRegions.mjs apps/bitcraft-local/server.mjs apps/bitcraft-local/test/map-resource-regions.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs
git commit -m "feat(map): expose Relay-ready resource regions"
```

### Task 2: Budget normalized resource nodes

**Files:**
- Modify: `apps/bitcraft-local/src/server/game-data/mapResourceRegionSession.ts`
- Test: `apps/bitcraft-local/test/map-resource-region-session.test.mjs`
- Test: `apps/bitcraft-local/test/map-resource-route-integration.test.mjs`

**Interfaces:**
- Changes `RegionSessionConfig.maxRows?: number` to `maxNodes?: number`.
- Health continues to report raw `resourceState` and `locationState` evidence counts for diagnostics.
- Acceptance is based on `normalized.resources.length`, after the complete-generation check.

- [ ] **Step 1: Replace the existing row-budget test with RED node-budget cases**

```js
test("does not double count reciprocal join evidence against the node budget", async () => {
  // Three resource rows plus three matching locations produce three nodes, not six.
  await session.start(config({ maxNodes: 3 }));
  await session.subscribe("28", 1);
  relay.apply();
  assert.equal(snapshots.at(-1).data.resources.length, 3);
  assert.equal(session.health().rowCount, 6);
});

test("rejects a genuinely oversized normalized partition", async () => {
  await session.start(config({ maxNodes: 2 }));
  await session.subscribe("28", 1);
  relay.apply();
  assert.match(session.health().lastError, /node budget 2 exceeded by 3 nodes/);
});
```

- [ ] **Step 2: Run the focused session test and confirm RED**

Run: `node --experimental-strip-types --test apps/bitcraft-local/test/map-resource-region-session.test.mjs`

Expected: FAIL because the session still compares the sum of both table counts.

- [ ] **Step 3: Implement normalized-node accounting**

Rename the configuration field and default to `DEFAULT_MAX_NODES = 250_000`. Preserve raw health totals, but compare `normalized.resources.length` to `config.maxNodes`. Run the budget check only after an otherwise complete normalized generation so incomplete joins keep their existing partial semantics.

- [ ] **Step 4: Run session and integration tests**

Run: `node --experimental-strip-types --test apps/bitcraft-local/test/map-resource-region-session.test.mjs apps/bitcraft-local/test/map-resource-route-integration.test.mjs`

Expected: PASS, including the regression where combined evidence exceeds 50,000 while unique nodes do not.

- [ ] **Step 5: Commit Task 2**

```powershell
git add apps/bitcraft-local/src/server/game-data/mapResourceRegionSession.ts apps/bitcraft-local/test/map-resource-region-session.test.mjs apps/bitcraft-local/test/map-resource-route-integration.test.mjs
git commit -m "fix(map): budget unique resource nodes"
```

### Task 3: Add generation-bound resource pages

**Files:**
- Create: `apps/bitcraft-local/src/server/mapResourcePages.mjs`
- Test: `apps/bitcraft-local/test/map-resource-pages.test.mjs`
- Modify: `apps/bitcraft-local/src/server/mapSnapshot.mjs`
- Modify: `apps/bitcraft-local/test/map-snapshot.test.mjs`

**Interfaces:**
- Produces: `createMapResourceCursorCodec(secret)` with `encode({ regionId, resourceId, generation, offset })` and `decode(token, expectedScope)`.
- Produces: `parseMapResourcePartitionScope(searchParams, { allowedRegionIds })` returning exactly one `{ regionId, resourceId, cursor }`.
- Produces: `buildMapResourcePartitionPayload({ scope, resourceCollection, cursorCodec, pageFeatureLimit, pageByteLimit })`.
- Payload contains `partition`, `generation`, `resources`, `nextCursor`, `complete`, `freshness`, `warnings`, and `layerAvailability`.

- [ ] **Step 1: Write RED cursor and paging tests**

```js
test("pages one resource partition without loss or duplication", () => {
  const first = buildMapResourcePartitionPayload({ scope, resourceCollection, cursorCodec, pageFeatureLimit: 2, pageByteLimit: 4096 });
  const second = buildMapResourcePartitionPayload({ scope: { ...scope, cursor: first.nextCursor }, resourceCollection, cursorCodec, pageFeatureLimit: 2, pageByteLimit: 4096 });
  assert.deepEqual([...first.resources, ...second.resources].map((row) => row[0]), ["1", "2", "3"]);
  assert.equal(second.complete, true);
});

test("rejects a cursor from another partition or generation", () => {
  assert.throws(() => cursorCodec.decode(token, { regionId: "24", resourceId: "28", generation: "9" }), /cursor/i);
});

test("a page stays under its serialized byte budget", () => {
  const payload = buildMapResourcePartitionPayload({ scope, resourceCollection, cursorCodec, pageFeatureLimit: 20_000, pageByteLimit: 1024 });
  assert.ok(Buffer.byteLength(JSON.stringify(payload.resources)) <= 1024);
  assert.ok(payload.nextCursor);
});
```

- [ ] **Step 2: Run the new test and confirm RED**

Run: `node --experimental-strip-types --test apps/bitcraft-local/test/map-resource-pages.test.mjs`

Expected: FAIL because the paging module does not exist.

- [ ] **Step 3: Implement signed opaque cursors**

Use `createHmac("sha256", secret)` and `timingSafeEqual`. Encode a base64url payload containing version, canonical scope, generation, and offset followed by its signature. Decode verifies signature, version, expected region/resource/generation, and a safe non-negative offset. Never accept scope from the cursor without matching the already-authorized query scope.

- [ ] **Step 4: Implement deterministic page construction**

Sort compact rows by decimal-string entity ID. Accumulate rows until either 20,000 features or 4 MiB of serialized row data would be exceeded. Always return at least one row when data exists; return `413` only when one row itself cannot fit. Generate `nextCursor` from the next offset and current generation.

- [ ] **Step 5: Separate resource partition parsing from operational map limits**

Keep `MAP_SCOPE_LIMITS.regions = 4` and `features = 50_000` for operational snapshots. Add partition parsing that accepts exactly one authorized region and one resource ID. Add selection parsing for resource events whose region maximum equals the supplied ready-region allowlist length and whose resource maximum remains 16.

- [ ] **Step 6: Run paging and snapshot tests**

Run: `node --experimental-strip-types --test apps/bitcraft-local/test/map-resource-pages.test.mjs apps/bitcraft-local/test/map-snapshot.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```powershell
git add apps/bitcraft-local/src/server/mapResourcePages.mjs apps/bitcraft-local/src/server/mapSnapshot.mjs apps/bitcraft-local/test/map-resource-pages.test.mjs apps/bitcraft-local/test/map-snapshot.test.mjs
git commit -m "feat(map): page resource partitions"
```

### Task 4: Wire all-region runtime leases and scoped events

**Files:**
- Modify: `apps/bitcraft-local/src/server/game-data/mapResourceRuntime.ts`
- Modify: `apps/bitcraft-local/src/server/game-data/gameDataRoute.ts`
- Modify: `apps/bitcraft-local/src/server/game-data/contracts.ts`
- Modify: `apps/bitcraft-local/server.mjs`
- Test: `apps/bitcraft-local/test/map-resource-runtime.test.mjs`
- Test: `apps/bitcraft-local/test/map-resource-route-integration.test.mjs`
- Test: `apps/bitcraft-local/test/server.test.mjs`

**Interfaces:**
- Runtime `reconcile` still receives `{ relayBaseUrl, primaryRegionId, activeRegionIds }`, but `activeRegionIds` is the complete ready-region catalogue.
- Runtime region capacity is bounded by the configured ready set, not a default of four.
- Resource event payload adds `mapResourceScopeKey` only for authorized `map-resources` changes.
- Produces routes:
  - `GET /api/local/map/resources?region=<id>&resourceId=<id>&cursor=<optional>`
  - `GET /api/local/map/resource-events?regions=<ids>&resourceIds=<ids>`

- [ ] **Step 1: Write RED runtime capacity and event tests**

```js
test("all configured ready regions can be leased", async () => {
  await runtime.reconcile({ relayBaseUrl: "https://relay.example", primaryRegionId: "1", activeRegionIds: ["1", "2", "3", "4", "5"] });
  const leases = await Promise.all(["1", "2", "3", "4", "5"].map((regionId) => runtime.acquire({ regionId, resourceId: "28" })));
  assert.equal(leases.length, 5);
});

test("public resource events identify only the changed authorized partition", () => {
  assert.deepEqual(publicGenerationEvent({ changedDomains: ["map-resources"], mapResourceScopeKey: "19|resource:28" }, ["map-resources"]), {
    changedDomains: ["map-resources"], mapResourceScopeKey: "19|resource:28",
  });
});
```

- [ ] **Step 2: Run runtime and route tests and confirm RED**

Run: `node --experimental-strip-types --test apps/bitcraft-local/test/map-resource-runtime.test.mjs apps/bitcraft-local/test/map-resource-route-integration.test.mjs apps/bitcraft-local/test/server.test.mjs`

Expected: FAIL at the fifth region and missing partition event field/routes.

- [ ] **Step 3: Replace the fixed four-region runtime capacity**

Remove the default `maxRegions = 4` behavior. `#openRegion` may open only IDs in `config.activeRegionIds`; that ready set is the capacity boundary. Preserve the injected `maxRegions` test override when explicitly supplied, so capacity-rejection diagnostics remain testable.

- [ ] **Step 4: Reconcile from the ready-region catalogue**

In `reconcilePrimaryRegion`, derive `readyRegionIds` with `mapResourceRegionCatalog`. Pass the full set plus the primary fallback to `relayMapResourceRuntime.reconcile`; do not `.slice(0, 4)`. Continue warming only the primary region—other regions open lazily when leased.

- [ ] **Step 5: Add the one-partition snapshot route**

Parse and authorize one region/resource pair, acquire one lease, wait up to the existing initial wait, build one page with the process-local cursor codec, release on finish/close, and return `200` for live/partial/stale, `503` only without usable or pending data, `422` for scope errors, and `413` for a single unpageable row.

- [ ] **Step 6: Add the dedicated selection event route**

Parse the ready-region selection and up to 16 resource IDs, acquire the Cartesian leases, and register their scope keys on one SSE listener. Emit initial scope/generation state and subsequent `mapResourceScopeKey` notifications. Release every lease exactly once on disconnect. Apply the existing map access decision and event rate limit.

- [ ] **Step 7: Lock privacy and logging behavior**

Extend route tests to assert request logs contain only `/api/local/map/resources` or `/api/local/map/resource-events`, never query strings, coordinates, cursor contents, or full selections.

- [ ] **Step 8: Run focused backend tests**

Run: `node --experimental-strip-types --test apps/bitcraft-local/test/map-resource-runtime.test.mjs apps/bitcraft-local/test/map-resource-route-integration.test.mjs apps/bitcraft-local/test/map-resource-pages.test.mjs apps/bitcraft-local/test/server.test.mjs`

Expected: PASS.

- [ ] **Step 9: Commit Task 4**

```powershell
git add apps/bitcraft-local/src/server/game-data/mapResourceRuntime.ts apps/bitcraft-local/src/server/game-data/gameDataRoute.ts apps/bitcraft-local/src/server/game-data/contracts.ts apps/bitcraft-local/server.mjs apps/bitcraft-local/test/map-resource-runtime.test.mjs apps/bitcraft-local/test/map-resource-route-integration.test.mjs apps/bitcraft-local/test/server.test.mjs
git commit -m "feat(map): lease resources across ready regions"
```

### Task 5: Build the browser partition cache and loader

**Files:**
- Create: `apps/bitcraft-local/src/pages/map/mapResourcePartitionState.mjs`
- Create: `apps/bitcraft-local/src/pages/map/mapResourcePartitionState.d.mts`
- Create: `apps/bitcraft-local/src/pages/map/mapResourcePartitionLoader.mjs`
- Create: `apps/bitcraft-local/src/pages/map/mapResourcePartitionLoader.d.mts`
- Test: `apps/bitcraft-local/test/map-resource-partition-state.test.mjs`
- Test: `apps/bitcraft-local/test/map-resource-partition-loader.test.mjs`

**Interfaces:**
- `resourcePartitionKey(regionId, resourceId)` returns `<region>|resource:<resource>`.
- `resourcePartitionPlan(regionIds, resourceIds)` returns canonical Cartesian `{ key, regionId, resourceId }[]`.
- `replaceResourcePartition(state, completedPartition)` atomically replaces one generation.
- `retainResourcePartitions(state, wantedKeys)` immediately removes deselected partitions.
- `resourceRowsFromPartitions(state)` returns the stable flattened compact rows.
- `createMapResourcePartitionLoader({ fetchPage, concurrency, onPartition, onStatus })` returns `{ setScope, refresh, pause, resume, stop }`.

- [ ] **Step 1: Write RED pure-state tests**

```js
test("partition plans are decimal-canonical and Cartesian", () => {
  assert.deepEqual(resourcePartitionPlan(["24", "19"], ["1000028", "28"]).map((entry) => entry.key), [
    "19|resource:28", "19|resource:1000028", "24|resource:28", "24|resource:1000028",
  ]);
});

test("replacing one partition preserves every other partition", () => {
  const next = replaceResourcePartition(existing, { key: "24|resource:28", generation: "3", rows: [["9", "24", "28", 10, 20]] });
  assert.equal(next.get("19|resource:28"), existing.get("19|resource:28"));
  assert.equal(next.get("24|resource:28").generation, "3");
});
```

- [ ] **Step 2: Write RED loader tests**

Cover two-page assembly, maximum four concurrent requests, cancellation, pause/resume, stale-generation restart, specific-key refresh, partial failure, and retaining old data until a complete replacement arrives.

- [ ] **Step 3: Run focused tests and confirm RED**

Run: `node --experimental-strip-types --test apps/bitcraft-local/test/map-resource-partition-state.test.mjs apps/bitcraft-local/test/map-resource-partition-loader.test.mjs`

Expected: FAIL because the modules do not exist.

- [ ] **Step 4: Implement immutable partition state**

Canonicalize decimal IDs, reject malformed compact rows, deduplicate entity IDs within a partition, and replace a partition only after every page for one generation is assembled. Keep previous complete rows during loading or recoverable failure.

- [ ] **Step 5: Implement the bounded loader**

Use a four-worker queue and one `AbortController` per active partition. Follow `nextCursor` sequentially. On cursor-generation conflict, discard incomplete pages and restart once from page one. `setScope` cancels removed work and schedules missing keys; `refresh(keys)` schedules only selected keys; `pause` aborts in-flight fetches without clearing complete cache; `resume` restarts pending work.

- [ ] **Step 6: Run focused loader tests**

Run: `node --experimental-strip-types --test apps/bitcraft-local/test/map-resource-partition-state.test.mjs apps/bitcraft-local/test/map-resource-partition-loader.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit Task 5**

```powershell
git add apps/bitcraft-local/src/pages/map/mapResourcePartitionState.mjs apps/bitcraft-local/src/pages/map/mapResourcePartitionState.d.mts apps/bitcraft-local/src/pages/map/mapResourcePartitionLoader.mjs apps/bitcraft-local/src/pages/map/mapResourcePartitionLoader.d.mts apps/bitcraft-local/test/map-resource-partition-state.test.mjs apps/bitcraft-local/test/map-resource-partition-loader.test.mjs
git commit -m "feat(map): load resource partitions incrementally"
```

### Task 6: Connect the all-region picker and native canvas

**Files:**
- Modify: `apps/bitcraft-local/src/pages/map/nativeMapRequest.mjs`
- Modify: `apps/bitcraft-local/src/pages/map/nativeMapRequest.d.mts`
- Modify: `apps/bitcraft-local/src/pages/MapPage.tsx`
- Modify: `apps/bitcraft-local/src/pages/map/NativeMap.tsx`
- Modify: `apps/bitcraft-local/src/pages/map/mapResourceSnapshotState.mjs`
- Test: `apps/bitcraft-local/test/native-map-request.test.mjs`
- Test: `apps/bitcraft-local/test/map-page-boundary.test.mjs`
- Test: `apps/bitcraft-local/test/map-resource-framing.test.mjs`

**Interfaces:**
- `nativeMapRequest` receives separate `operationalRegionIds` and `resourceRegionIds`.
- It returns `{ snapshotUrl, eventsUrl, resourceEventUrl, resourcePartitions, layers }`.
- `NativeMap` receives `resourceRegionIds` independently from its bounded operational `regionIds`.

- [ ] **Step 1: Write RED request-shape tests**

```js
test("all resource regions produce partition requests without widening the operational snapshot", () => {
  const request = nativeMapRequest({ operationalRegionIds: ["19"], resourceRegionIds: ["19", "24"], resourceIds: ["28"] });
  assert.match(request.snapshotUrl, /regions=19/);
  assert.deepEqual(request.resourcePartitions.map((entry) => entry.key), ["19|resource:28", "24|resource:28"]);
  assert.match(request.resourceEventUrl, /regions=19%2C24/);
});
```

- [ ] **Step 2: Run request and boundary tests and confirm RED**

Run: `node --experimental-strip-types --test apps/bitcraft-local/test/native-map-request.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs`

Expected: FAIL because requests still contain one combined resource URL and four-region truncation.

- [ ] **Step 3: Fetch the map-region catalogue in `MapPage`**

Load `/api/local/map/regions` alongside the existing map catalogue with abort handling and last-good UI state. Populate the select from its `regions`. Preserve stored explicit region selections when still available. Represent `All regions` as an empty persisted selection and resolve it to every catalogue `regionId`; never slice that resolved list.

- [ ] **Step 4: Decouple operational and resource scopes**

Keep operational claims/watchtower snapshot regions bounded to currently available settlement map data. Pass the picker-derived complete list only as `resourceRegionIds`. External mode retains its existing provider URL behavior until final cutover, but must not constrain native resource scope.

- [ ] **Step 5: Install the partition loader in `NativeMap`**

Replace the combined `resourceUrl` fetch with `createMapResourcePartitionLoader`. Feed completed compact rows through the existing resource-feature conversion and `DensePointLayer`. Keep resource tier colours, viewport culling, selection framing, and z-index behavior. Show loaded/total partition progress and aggregate only partition-specific warnings.

- [ ] **Step 6: Connect scoped resource events and visibility handling**

Open the existing operational EventSource and one resource EventSource. A resource message refreshes only its `mapResourceScopeKey`; the initial message schedules missing partitions. On document hide, pause the loader and close resource events. On visibility restore, resume and reconnect once.

- [ ] **Step 7: Preserve correct framing across selection transitions**

Frame only after all currently selected partitions have either completed or reached a terminal unavailable state and the cache selection key matches the current region/resource selection. Never consume the framing key using rows from the previous selection.

- [ ] **Step 8: Run focused frontend tests and build**

Run: `node --experimental-strip-types --test apps/bitcraft-local/test/native-map-request.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs apps/bitcraft-local/test/map-resource-partition-state.test.mjs apps/bitcraft-local/test/map-resource-partition-loader.test.mjs apps/bitcraft-local/test/map-resource-framing.test.mjs`

Run: `corepack pnpm --filter @workspace/bitcraft-local run build`

Expected: all focused tests and build PASS.

- [ ] **Step 9: Commit Task 6**

```powershell
git add apps/bitcraft-local/src/pages/map/nativeMapRequest.mjs apps/bitcraft-local/src/pages/map/nativeMapRequest.d.mts apps/bitcraft-local/src/pages/MapPage.tsx apps/bitcraft-local/src/pages/map/NativeMap.tsx apps/bitcraft-local/src/pages/map/mapResourceSnapshotState.mjs apps/bitcraft-local/test/native-map-request.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs apps/bitcraft-local/test/map-resource-framing.test.mjs
git commit -m "feat(map): track resources across all regions"
```

### Task 7: Full resource acceptance and smoke verification

**Files:**
- Modify tests only if an acceptance failure exposes a missing regression.
- Do not update package version or changelog during local iteration.

**Interfaces:**
- Consumes all prior tasks.
- Produces a running smoke server at `http://127.0.0.1:18449/`.

- [ ] **Step 1: Run the full test suite**

Run: `corepack pnpm --filter @workspace/bitcraft-local test`

Expected: PASS, with only documented environment skips.

- [ ] **Step 2: Run the final production build**

Run: `corepack pnpm --filter @workspace/bitcraft-local run build`

Expected: PASS.

- [ ] **Step 3: Restart the backend smoke server**

Run: `node scripts/start-bitcraft-local-smoke.mjs --force-restart`

Expected: command returns within 15 seconds.

- [ ] **Step 4: Confirm health**

Run: `curl.exe -s http://127.0.0.1:18449/api/local/health`

Expected: HTTP 200 JSON with `ok: true`.

- [ ] **Step 5: Browser-smoke resource loading**

At `http://127.0.0.1:18449/?page=map`, verify:

- Ghost Succulent loads without a 50k warning.
- two resources can be visible simultaneously;
- a specific non-19 region loads its partitions;
- `All regions` resolves every catalogue region and accumulates points incrementally;
- totals may exceed 50,000 without clearing prior points;
- changing or removing a selection removes only matching partitions;
- resource nodes retain stable tier colours and remain above ordinary markers;
- no 429, failed fetch, direct Relay request, or console exception appears.

- [ ] **Step 6: Inspect privacy-safe health and logs**

Confirm aggregate resource health may show region/session/node/page counts but no coordinates, selected ID arrays, query strings, cursors, or response bodies.

- [ ] **Step 7: Commit only test corrections, if any**

If smoke verification required a narrowly scoped regression fix, run its focused RED/GREEN cycle and commit only those files with `fix(map): harden all-region resource loading`. Otherwise leave the implementation commits unchanged.
