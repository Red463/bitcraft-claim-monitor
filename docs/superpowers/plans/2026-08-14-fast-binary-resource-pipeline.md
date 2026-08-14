# Fast Binary Resource Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace paged JSON map-resource delivery with precise, near-live, same-origin binary partitions that load at least 400,000 coordinates without truncation or unrelated partition refreshes.

**Architecture:** Keep filtered Relay subscriptions on the Node server. Build one entity-aware live index per region, encode each accepted region/resource generation once as a compact sorted coordinate buffer, retain it in a byte-accounted LRU cache, and publish only affected partition readiness/deltas. The browser owns typed partition buffers and gives them directly to a canvas layer without creating dense `MapFeature` objects.

**Tech Stack:** Node.js 24, TypeScript 5.9, native Node HTTP, SpacetimeDB 2.7 typed subscriptions, React, Leaflet 1.9, plain JavaScript binary codecs, Node test runner, GitHub Actions.

## Global Constraints

- Browsers must never connect directly to Relay, BitJita, Prism, or another upstream provider.
- Resource entity IDs must not appear in the new binary payload, resource events, browser state, logs, or public health.
- Coordinates are overworld map X/Z integers in `0...38,400`; binary entries are lossless `uint16 x` plus `uint16 z`.
- Exact region and generation identities remain lossless decimal strings at API and TypeScript boundaries.
- Only complete schema-compatible joins may become committed binary generations; provisional cold points remain explicitly non-authoritative.
- Near-live additions and removals target one to two seconds.
- No per-partition node-count rejection remains in the binary path.
- Default encoded-cache admission is 512 MiB with idle LRU eviction and active-entry protection.
- Existing Map-page access control, Relay-ready region validation, resource catalogue validation, rate limiting, freshness, and redacted telemetry remain enforced server-side.
- Do not add a browser-direct fallback, third-party request, SQLite resource history, framework, state library, or binary dependency.
- Local verification must use `node --max-old-space-size=256` and focused tests only.
- Never run the local full suite, full build, world generation, or dense live benchmark on this PC; GitHub Actions owns those checks because previous Node processes exceeded 21 GiB and crashed the machine.

---

## Planned file structure

### Shared codec

- Create `apps/bitcraft-local/src/map/resourcePartitionCodec.mjs`: universal binary header, coordinate packing, strict decode, and sorted delta merge.
- Create `apps/bitcraft-local/src/map/resourcePartitionCodec.d.mts`: exact codec types for server and browser imports.
- Create `apps/bitcraft-local/test/map-resource-partition-codec.test.mjs`: format, validation, identity, bounds, and 400,000-point coverage.

### Relay live indexing and runtime cache

- Create `apps/bitcraft-local/src/server/game-data/mapResourceLiveIndex.ts`: entity/resource/location pairing, coordinate reference counts, provisional and committed per-resource deltas.
- Modify `apps/bitcraft-local/src/server/game-data/mapResourceRegionSession.ts`: precise listeners, provisional events, affected-only committed snapshots, live subscription lifetime, and removal of the node ceiling.
- Create `apps/bitcraft-local/src/server/mapResourceBinaryCache.mjs`: latest/previous immutable generations, byte accounting, LRU eviction, and active-entry protection.
- Modify `apps/bitcraft-local/src/server/game-data/mapResourceRuntime.ts`: event-driven active leases, encoded generation ownership, cache admission, warm last-good, and provider-neutral partition events.
- Modify `apps/bitcraft-local/src/server/game-data/gameDataRoute.ts`: binary lease/event types and removal of JSON-generation coupling from the native client path.

### Same-origin API

- Create `apps/bitcraft-local/src/server/mapResourceBinaryRoute.mjs`: strict partition request parsing, response metadata, ETags, cache headers, and current-generation recovery.
- Modify `apps/bitcraft-local/src/server/httpResponses.mjs`: exact binary `content-length` support without regressing bodyless responses.
- Modify `apps/bitcraft-local/server.mjs`: binary route, concurrent event leases, targeted event delivery, environment-backed cache budget, and legacy JSON rollback seam.
- Modify `apps/bitcraft-local/src/server/mapPerformance.mjs`: aggregate binary readiness, bytes, cache, delta, fallback, eviction, and rejection metrics.
- Modify `apps/bitcraft-local/src/server/serverHealth.mjs`: scrubbed aggregate public health projection.

### Browser state and renderer

- Create `apps/bitcraft-local/src/pages/map/mapResourceBinaryState.mjs`: immutable partition/provisional state transitions and generation-safe delta application.
- Create `apps/bitcraft-local/src/pages/map/mapResourceBinaryState.d.mts`: browser partition and status types.
- Create `apps/bitcraft-local/src/pages/map/mapResourceBinaryLoader.mjs`: scoped SSE handling, binary fetches, recovery, abort, visibility pause/resume, and independent progress.
- Create `apps/bitcraft-local/src/pages/map/mapResourceBinaryLoader.d.mts`: loader interfaces.
- Create `apps/bitcraft-local/src/pages/map/PackedResourceCanvasLayer.ts`: typed-buffer viewport culling, deterministic LOD, colour/stroke drawing, counts, bounds, and accessible samples.
- Modify `apps/bitcraft-local/src/pages/map/nativeMapRequest.mjs`: binary generation/event request ownership; remove JSON page URLs from the native client request.
- Modify `apps/bitcraft-local/src/pages/map/NativeMap.tsx`: replace JSON partition React state and `MapFeature` expansion with the binary loader/store and packed canvas layer.
- Retain `mapResourcePartitionLoader.mjs`, `mapResourcePartitionState.mjs`, `mapResourceSnapshotState.mjs`, and `mapResourcePages.mjs` for one beta only as the unused rollback implementation.

### Verification and release

- Create `apps/bitcraft-local/scripts/benchmark-map-resource-binary.mjs`: deterministic 400,000-point codec/state performance and heap gate.
- Modify `.github/workflows/verify.yml`: run the binary resource benchmark after tests.
- Modify `CHANGELOG.md` and `apps/bitcraft-local/package.json`: next same-line beta release.

---

### Task 1: Versioned binary codec and packed coordinate operations

**Files:**
- Create: `apps/bitcraft-local/src/map/resourcePartitionCodec.mjs`
- Create: `apps/bitcraft-local/src/map/resourcePartitionCodec.d.mts`
- Create: `apps/bitcraft-local/test/map-resource-partition-codec.test.mjs`

**Interfaces:**
- Consumes: decimal region/generation strings, positive numeric resource IDs, dimension `1`, and sorted/unsorted coordinate inputs.
- Produces:

```ts
export type ResourcePartitionIdentity = {
  regionId: string;
  resourceId: string;
  dimension: "1";
  generation: string;
};

export type DecodedResourcePartition = ResourcePartitionIdentity & {
  coordinates: Uint32Array;
  pointCount: number;
};

export function packResourceCoordinate(x: number, z: number): number;
export function unpackResourceCoordinate(value: number): { x: number; z: number };
export function normalizePackedCoordinates(values: Iterable<number>): Uint32Array;
export function mergePackedCoordinateDelta(current: Uint32Array, additions: Uint32Array, removals: Uint32Array): Uint32Array;
export function encodeResourcePartition(input: ResourcePartitionIdentity & { coordinates: Uint32Array }): Uint8Array;
export function decodeResourcePartition(bytes: ArrayBuffer | ArrayBufferView, expected?: Partial<ResourcePartitionIdentity>): DecodedResourcePartition;
```

- [ ] **Step 1: Write failing codec and delta tests**

Add tests that assert exact V1 header bytes, maximum bounds, unsigned packing, sorted uniqueness, 64-bit region/generation round trips, delta add/remove behavior, and strict malformed-input rejection. Include a 400,000-coordinate round trip generated without entity IDs:

```js
const coordinates = Uint32Array.from(
  { length: 400_000 },
  (_, index) => packResourceCoordinate(index % 38_401, Math.floor(index / 38_401)),
);
const encoded = encodeResourcePartition({
  regionId: "18446744073709551615",
  resourceId: "125",
  dimension: "1",
  generation: "18446744073709551614",
  coordinates,
});
const decoded = decodeResourcePartition(encoded, {
  regionId: "18446744073709551615",
  resourceId: "125",
  generation: "18446744073709551614",
});
assert.equal(decoded.pointCount, 400_000);
assert.equal(encoded.byteLength, 44 + (400_000 * 4));
assert.deepEqual(decoded.coordinates, normalizePackedCoordinates(coordinates));
assert.equal(new TextDecoder().decode(encoded).includes("184467"), false);
```

- [ ] **Step 2: Run the codec test and verify RED**

Run:

```powershell
node --max-old-space-size=256 --test apps/bitcraft-local/test/map-resource-partition-codec.test.mjs
```

Expected: FAIL because `resourcePartitionCodec.mjs` does not exist.

- [ ] **Step 3: Implement the V1 codec**

Use a 44-byte little-endian header with magic `BCRP`, version `1`, zero flags/reserved fields, `BigUint64` region/generation values, `uint32` resource/dimension/count, and `uint16` X/Z entries. Reject coordinates outside `0...38,400`, unsafe resource IDs, wrong dimensions, incorrect body length, nonzero flags, unsorted duplicates, and expected-identity mismatches.

The delta merge must be a linear three-way merge over sorted unique unsigned values; it must not convert 400,000 values to a JavaScript `Set`.

- [ ] **Step 4: Run the codec test and verify GREEN**

Run the Step 2 command. Expected: all codec tests PASS within the 256 MiB cap.

- [ ] **Step 5: Commit Task 1**

```powershell
git add apps/bitcraft-local/src/map/resourcePartitionCodec.mjs apps/bitcraft-local/src/map/resourcePartitionCodec.d.mts apps/bitcraft-local/test/map-resource-partition-codec.test.mjs
git commit -m "feat(map): add binary resource partition codec"
```

---

### Task 2: Entity-aware live resource index and affected-only session events

**Files:**
- Create: `apps/bitcraft-local/src/server/game-data/mapResourceLiveIndex.ts`
- Modify: `apps/bitcraft-local/src/server/game-data/mapResourceRegionSession.ts`
- Modify: `apps/bitcraft-local/test/map-resource-region-session.test.mjs`
- Create: `apps/bitcraft-local/test/map-resource-live-index.test.mjs`

**Interfaces:**
- Consumes: typed or normalized `resource_state` and `location_state` rows from one regional binding connection.
- Produces:

```ts
export type PackedResourceDelta = {
  resourceId: string;
  additions: Uint32Array;
  removals: Uint32Array;
};

export class MapResourceLiveIndex {
  constructor(regionId: string);
  select(resourceId: string): void;
  unselect(resourceId: string): void;
  upsertResource(row: unknown): void;
  deleteResource(row: unknown): void;
  upsertLocation(row: unknown): void;
  deleteLocation(row: unknown): void;
  seed(resourceIds: string[], resourceRows: Iterable<unknown>, locationRows: Iterable<unknown>): Map<string, { complete: boolean; coordinates: Uint32Array; warnings: string[] }>;
  drain(resourceId: string): PackedResourceDelta;
  coordinates(resourceId: string): Uint32Array;
}

export type MapResourceProvisionalNotice = {
  regionId: string;
  resourceId: string;
  additions: Uint32Array;
  receivedAt: string;
};

export type MapResourceDeltaNotice = MapResourceProvisionalNotice & {
  additions: Uint32Array;
  removals: Uint32Array;
};
```

`RelayMapResourceRegionSession` gains optional `onProvisional` and `onDelta` callbacks. Its accepted snapshot gains `packedCoordinates: Uint32Array`. The old `data.resources` compatibility shape may be constructed only for the legacy JSON route while it remains registered; the runtime cache must not retain it after encoding.

- [ ] **Step 1: Write failing live-index tests**

Cover resource-first and location-first arrival, overworld filtering, update moving an entity, resource-type change, deletion in either order, duplicate coordinates with reference counts, selection removal, and exact affected-resource deltas:

```js
index.select("2");
index.select("125");
index.upsertResource({ entityId: 10n, resourceId: 2 });
index.upsertLocation({ entityId: 10n, x: 100, z: 200, dimension: 1 });
assert.deepEqual([...index.drain("2").additions], [packResourceCoordinate(100, 200)]);
assert.deepEqual([...index.drain("125").additions], []);
```

- [ ] **Step 2: Run live-index tests and verify RED**

```powershell
node --max-old-space-size=256 --experimental-strip-types --test apps/bitcraft-local/test/map-resource-live-index.test.mjs
```

Expected: FAIL because `MapResourceLiveIndex` does not exist.

- [ ] **Step 3: Implement `MapResourceLiveIndex` minimally**

Preserve entity IDs as decimal strings only inside the server index. Maintain entity-to-resource, entity-to-coordinate, coordinate reference counts by selected type, pending rows for either arrival order, and sorted delta accumulators. Emit visual additions only on reference `0 -> 1` and removals only on `1 -> 0`.

- [ ] **Step 4: Add failing session tests for precise publication**

Extend the binding table fixture so `emit(kind, row, oldRow)` forwards actual rows. Assert:

- listeners attach before a subscription's initial row burst;
- a cold row pair produces provisional additions before `onApplied`;
- `onApplied` seals only its subscription resource ID;
- a Ferns location insert does not call Bush `onSnapshot` or `onDelta`;
- disconnect before application discards provisional state;
- a 400,000-coordinate complete fixture is accepted;
- the string `Relay map resource node budget` cannot be produced.

- [ ] **Step 5: Run session tests and verify RED**

```powershell
node --max-old-space-size=256 --experimental-strip-types --test apps/bitcraft-local/test/map-resource-region-session.test.mjs
```

Expected: the new affected-only, provisional, and 400,000-coordinate assertions FAIL.

- [ ] **Step 6: Integrate the index into the session**

Replace the shared `#changed` callback that rebuilds every applied subscription with row-aware callbacks. Queue a `Set<string>` of dirty resource IDs. Provisional timers drain only unapplied subscriptions. Applied live timers drain only committed subscriptions. On `onApplied`, scan the SDK cache once for that resource ID, validate completeness, publish its packed snapshot, and never republish other resource IDs.

Remove `DEFAULT_MAX_NODES`, `maxNodes`, and the node-budget failure branch. Keep schema fingerprint, bounds, dimension, connection fencing, late callback fencing, and last-good status behavior.

- [ ] **Step 7: Run Task 2 focused tests**

Run both Step 2 and Step 5 commands together. Expected: PASS within 256 MiB.

- [ ] **Step 8: Commit Task 2**

```powershell
git add apps/bitcraft-local/src/server/game-data/mapResourceLiveIndex.ts apps/bitcraft-local/src/server/game-data/mapResourceRegionSession.ts apps/bitcraft-local/test/map-resource-live-index.test.mjs apps/bitcraft-local/test/map-resource-region-session.test.mjs
git commit -m "fix(map): isolate live resource partition changes"
```

---

### Task 3: Byte-accounted immutable cache and event-driven runtime

**Files:**
- Create: `apps/bitcraft-local/src/server/mapResourceBinaryCache.mjs`
- Modify: `apps/bitcraft-local/src/server/game-data/mapResourceRuntime.ts`
- Modify: `apps/bitcraft-local/src/server/game-data/gameDataRoute.ts`
- Create: `apps/bitcraft-local/test/map-resource-binary-cache.test.mjs`
- Modify: `apps/bitcraft-local/test/map-resource-runtime.test.mjs`
- Modify: `apps/bitcraft-local/test/map-resource-route-integration.test.mjs`

**Interfaces:**
- Consumes: Task 1 `encodeResourcePartition` and Task 2 packed snapshots/provisional/delta notices.
- Produces:

```ts
export type CachedBinaryPartition = {
  key: string;
  regionId: string;
  resourceId: string;
  generation: string;
  coordinates: Uint32Array;
  encoded: Uint8Array;
  encodedBytes: number;
  pointCount: number;
  receivedAt: string;
  freshness: "live" | "stale";
  warning: string | null;
};

export class MapResourceBinaryCache {
  constructor({ maxBytes, previousGenerationGraceMs, now });
  put(partition: CachedBinaryPartition): void;
  get(key: string, generation?: string): CachedBinaryPartition | null;
  latest(key: string): CachedBinaryPartition | null;
  retain(key: string): () => void;
  remove(key: string): void;
  health(): { bytes: number; entries: number; activeEntries: number; evictions: number; rejections: number };
}

export type MapResourcePartitionEvent =
  | { type: "partition-loading"; key: string }
  | { type: "partition-provisional"; key: string; additions: Uint32Array }
  | { type: "partition-ready"; key: string; generation: string; pointCount: number; encodedBytes: number; receivedAt: string; freshness: string }
  | { type: "partition-delta"; key: string; baseGeneration: string; generation: string; additions: Uint32Array; removals: Uint32Array }
  | { type: "partition-stale"; key: string; generation: string; warning: string }
  | { type: "partition-unavailable"; key: string; warning: string; retryAfterSeconds?: number };
```

`RelayMapResourceRuntime` gains `onEvent`, `cacheMaxBytes`, `cachePreviousGenerationGraceMs`, and `memoryHeadroom` dependencies. A lease gains `current()` returning cached binary metadata and `subscribe(listener)` returning an unsubscribe callback.

- [ ] **Step 1: Write failing cache tests**

Test latest and previous lookup, exact byte totals, LRU order, idle eviction, active retain protection, oversized cold rejection before mutation, previous-generation expiry, and health privacy. Use small byte fixtures and a manual clock.

- [ ] **Step 2: Run cache tests and verify RED**

```powershell
node --max-old-space-size=256 --test apps/bitcraft-local/test/map-resource-binary-cache.test.mjs
```

Expected: FAIL because the cache module does not exist.

- [ ] **Step 3: Implement the cache**

Use insertion-ordered `Map` entries for LRU. Account `encoded.byteLength` exactly. Keep latest plus at most one previous generation until its grace deadline. Evict unretained least-recently-used entries until the new payload fits. Throw `MapResourceAdmissionError` before insertion when only retained entries remain.

- [ ] **Step 4: Add failing runtime lifecycle tests**

Assert:

- accepted snapshots encode once and become warm cache entries;
- active leases keep a regional session subscribed and receive deltas;
- the last lease release schedules upstream unsubscribe but preserves binary cache;
- warm reacquire publishes ready immediately while live rehydration starts;
- a delta updates only its partition and emits matching base/new generations;
- a schema failure marks cached data stale;
- cold admission uses encoded/cache bytes rather than node counts;
- cache health omits keys, region/resource IDs, coordinates, generations, and raw errors;
- runtime stop releases sessions, timers, listeners, and retained entries once.

- [ ] **Step 5: Run runtime tests and verify RED**

```powershell
node --max-old-space-size=256 --experimental-strip-types --test apps/bitcraft-local/test/map-resource-runtime.test.mjs apps/bitcraft-local/test/map-resource-route-integration.test.mjs
```

Expected: new cache/event-driven assertions FAIL.

- [ ] **Step 6: Implement runtime cache/event ownership**

Encode a Task 2 accepted snapshot once, discard retained object rows after legacy compatibility delivery, put the immutable bytes in the cache, and emit `partition-ready`. Keep active subscriptions live while leases exist. Apply packed deltas with Task 1's linear merge, create the next immutable bytes, preserve the previous generation for the grace window, and emit only the changed partition's delta.

Replace the five-minute active refresh timer with event-driven live subscriptions. Warm cached reacquisition emits ready before background subscription completion. Continue current cold-start, regional connection, topology, schema, reconnect, and stop fencing.

- [ ] **Step 7: Run Task 3 focused tests**

Run Step 2 and Step 5 commands. Expected: PASS within 256 MiB.

- [ ] **Step 8: Commit Task 3**

```powershell
git add apps/bitcraft-local/src/server/mapResourceBinaryCache.mjs apps/bitcraft-local/src/server/game-data/mapResourceRuntime.ts apps/bitcraft-local/src/server/game-data/gameDataRoute.ts apps/bitcraft-local/test/map-resource-binary-cache.test.mjs apps/bitcraft-local/test/map-resource-runtime.test.mjs apps/bitcraft-local/test/map-resource-route-integration.test.mjs
git commit -m "feat(map): cache live binary resource generations"
```

---

### Task 4: Binary HTTP route, targeted event stream, security, and health

**Files:**
- Create: `apps/bitcraft-local/src/server/mapResourceBinaryRoute.mjs`
- Modify: `apps/bitcraft-local/src/server/httpResponses.mjs`
- Modify: `apps/bitcraft-local/src/server/mapPerformance.mjs`
- Modify: `apps/bitcraft-local/src/server/serverHealth.mjs`
- Modify: `apps/bitcraft-local/server.mjs`
- Create: `apps/bitcraft-local/test/map-resource-binary-route.test.mjs`
- Modify: `apps/bitcraft-local/test/http-responses.test.mjs`
- Modify: `apps/bitcraft-local/test/map-performance.test.mjs`
- Modify: `apps/bitcraft-local/test/map-resource-route-integration.test.mjs`

**Interfaces:**
- Consumes: Task 3 cache entries, leases, and `MapResourcePartitionEvent`.
- Produces:

```js
export function parseMapResourceBinaryScope(searchParams, { allowedRegionIds, allowedResourceIds }) {
  return { regionId, resourceId, generation };
}

export function binaryPartitionResponse({ scope, partition }) {
  return {
    statusCode: 200,
    body: partition.encoded,
    headers: {
      "content-type": "application/vnd.timbersteel.map-resource-partition+octet-stream; version=1",
      "content-length": String(partition.encoded.byteLength),
      "cache-control": "private, max-age=31536000, immutable",
      etag: `"${partition.regionId}-${partition.resourceId}-${partition.generation}-v1"`,
    },
  };
}
```

- [ ] **Step 1: Write failing route and response tests**

Test decimal canonicalization, catalogue and region rejection, generation mismatch recovery metadata, exact content type/length/ETag/cache policy, conditional `304`, unauthorized `403`, missing `503`, expired-generation recovery, and absence of IDs/coordinates in errors and logs. Extend `sendBinary` tests to prove `204`/`304` never carry a body or content length.

- [ ] **Step 2: Run route tests and verify RED**

```powershell
node --max-old-space-size=256 --test apps/bitcraft-local/test/map-resource-binary-route.test.mjs apps/bitcraft-local/test/http-responses.test.mjs
```

Expected: binary route assertions FAIL.

- [ ] **Step 3: Implement the binary route helper and safe responder**

Return the cached immutable bytes without re-encoding or copying them. Validate request identity before lookup. Honor exact ETag matches. When the requested previous generation is gone but a latest generation exists, return `409` JSON containing only `currentGeneration` and the canonical latest URL; do not include coordinates.

- [ ] **Step 4: Write failing event-stream integration tests**

Assert that event route headers flush before cold hydration, partition acquisitions run through a bounded concurrency helper, each partition emits loading/ready independently, provisional and delta events serialize packed unsigned integers, reconnect generation maps suppress already-applied deltas, one partition error does not close the stream, and disconnect releases every lease/listener once.

Assert that no event contains `entityId`, Relay database/host/schema values, binary bodies, or unrelated selected keys.

- [ ] **Step 5: Run integration tests and verify RED**

```powershell
node --max-old-space-size=256 --experimental-strip-types --test apps/bitcraft-local/test/map-resource-route-integration.test.mjs apps/bitcraft-local/test/map-performance.test.mjs
```

Expected: targeted event and binary telemetry assertions FAIL.

- [ ] **Step 6: Wire server routes and aggregate observability**

Configure runtime cache bytes from `MAP_RESOURCE_CACHE_MAX_BYTES`, defaulting to `536870912`. Register the binary route before the legacy JSON route. Convert runtime typed coordinate arrays to ordinary unsigned number arrays only for small provisional/delta SSE batches. If a coalesced delta exceeds a bounded event byte threshold, emit `partition-ready` instead of a huge SSE event.

Replace resource generation notifications with exact runtime partition events. Open SSE headers immediately, acquire scopes concurrently with a bounded semaphore, stream independent states, accept an optional canonical client-generation map, and preserve heartbeats/redacted request logging.

Expose only aggregate encoded bytes, latest/previous entry counts, active entries, evictions, cold latency samples, delta count, full-fallback count, and capacity rejections in public health.

- [ ] **Step 7: Run Task 4 focused tests**

Run Step 2 and Step 5 commands. Expected: PASS within 256 MiB.

- [ ] **Step 8: Commit Task 4**

```powershell
git add apps/bitcraft-local/src/server/mapResourceBinaryRoute.mjs apps/bitcraft-local/src/server/httpResponses.mjs apps/bitcraft-local/src/server/mapPerformance.mjs apps/bitcraft-local/src/server/serverHealth.mjs apps/bitcraft-local/server.mjs apps/bitcraft-local/test/map-resource-binary-route.test.mjs apps/bitcraft-local/test/http-responses.test.mjs apps/bitcraft-local/test/map-performance.test.mjs apps/bitcraft-local/test/map-resource-route-integration.test.mjs
git commit -m "feat(map): serve live binary resource partitions"
```

---

### Task 5: Browser binary state and generation-safe loader

**Files:**
- Create: `apps/bitcraft-local/src/pages/map/mapResourceBinaryState.mjs`
- Create: `apps/bitcraft-local/src/pages/map/mapResourceBinaryState.d.mts`
- Create: `apps/bitcraft-local/src/pages/map/mapResourceBinaryLoader.mjs`
- Create: `apps/bitcraft-local/src/pages/map/mapResourceBinaryLoader.d.mts`
- Modify: `apps/bitcraft-local/src/pages/map/nativeMapRequest.mjs`
- Create: `apps/bitcraft-local/test/map-resource-binary-state.test.mjs`
- Create: `apps/bitcraft-local/test/map-resource-binary-loader.test.mjs`
- Modify: `apps/bitcraft-local/test/map-page-boundary.test.mjs`

**Interfaces:**
- Consumes: Task 1 decoder/merge, Task 4 provider-neutral events and immutable URLs.
- Produces:

```ts
export type BrowserResourcePartition = {
  key: string;
  regionId: string;
  resourceId: string;
  generation: string | null;
  committed: Uint32Array;
  provisional: Uint32Array;
  pointCount: number;
  freshness: string;
  status: "loading" | "live" | "stale" | "unavailable";
  warning: string | null;
};

export function createMapResourceBinaryLoader(options: {
  fetchBinary: (url: string, signal: AbortSignal) => Promise<ArrayBuffer>;
  connectEvents: (url: string, onEvent: (value: unknown) => void, onError: (error: unknown) => void) => { close(): void };
  onChange: (partitions: ReadonlyMap<string, BrowserResourcePartition>) => void;
  onError: (message: string) => void;
}): {
  setScope(partitions: Array<{ key: string; regionId: string; resourceId: string }>, eventUrl: string | null): void;
  pause(): void;
  resume(): void;
  stop(): void;
};
```

- [ ] **Step 1: Write failing pure-state tests**

Cover provisional accumulation, validated ready replacement, exact delta base, missed-base full-fetch requirement, stale retention, unavailable-without-last-good, deselection removal, unchanged map identity for unrelated events, visible counts, and entity-ID absence.

- [ ] **Step 2: Run state tests and verify RED**

```powershell
node --max-old-space-size=256 --test apps/bitcraft-local/test/map-resource-binary-state.test.mjs
```

Expected: FAIL because binary state does not exist.

- [ ] **Step 3: Implement immutable browser transitions**

Use `Map` copies only at the partition level. Keep dense coordinates in typed arrays. Apply provisional events to `provisional`, ready fetches to `committed`, and matching deltas with Task 1's linear merge. Never clone an unchanged partition buffer.

- [ ] **Step 4: Write failing loader tests**

Use fake fetches and event connections to assert:

- independent ready events fetch concurrently;
- unchanged partitions are never fetched again;
- response scope/generation mismatch is rejected;
- one failed partition does not clear another;
- stale generation `409` recovers once to the canonical latest URL;
- visibility pause aborts fetches and closes events;
- resume sends current generation metadata and fetches only missing/current-invalid partitions;
- scope removal aborts and deletes immediately;
- stop performs one cleanup.

- [ ] **Step 5: Run loader tests and verify RED**

```powershell
node --max-old-space-size=256 --test apps/bitcraft-local/test/map-resource-binary-loader.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs
```

Expected: new loader/request boundary assertions FAIL.

- [ ] **Step 6: Implement the loader and request contract**

Make `nativeMapRequest` return only partition identities plus the resource event URL; ready events own generation-specific binary URLs. Use `fetch(..., { credentials: "same-origin" })`, `response.arrayBuffer()`, and Task 1 strict decode. Coalesce duplicate ready events by key/generation. Preserve old committed buffers during refresh and display provisional data only when no committed generation exists.

- [ ] **Step 7: Run Task 5 focused tests**

Run Step 2 and Step 5 commands. Expected: PASS within 256 MiB.

- [ ] **Step 8: Commit Task 5**

```powershell
git add apps/bitcraft-local/src/pages/map/mapResourceBinaryState.mjs apps/bitcraft-local/src/pages/map/mapResourceBinaryState.d.mts apps/bitcraft-local/src/pages/map/mapResourceBinaryLoader.mjs apps/bitcraft-local/src/pages/map/mapResourceBinaryLoader.d.mts apps/bitcraft-local/src/pages/map/nativeMapRequest.mjs apps/bitcraft-local/test/map-resource-binary-state.test.mjs apps/bitcraft-local/test/map-resource-binary-loader.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs
git commit -m "feat(map): load independent binary resource buffers"
```

---

### Task 6: Packed canvas renderer and Native Map integration

**Files:**
- Create: `apps/bitcraft-local/src/pages/map/PackedResourceCanvasLayer.ts`
- Modify: `apps/bitcraft-local/src/pages/map/NativeMap.tsx`
- Modify: `apps/bitcraft-local/src/pages/map/resourceViewport.mjs`
- Modify: `apps/bitcraft-local/src/pages/map/resourceViewport.d.mts`
- Create: `apps/bitcraft-local/test/map-packed-resource-layer.test.mjs`
- Modify: `apps/bitcraft-local/test/map-page-boundary.test.mjs`
- Modify: `apps/bitcraft-local/test/map-resource-framing.test.mjs`

**Interfaces:**
- Consumes: Task 5 `BrowserResourcePartition` maps and existing `resourceTiers`/colour allocation.
- Produces:

```ts
export type PackedRenderPartition = {
  key: string;
  regionId: string;
  resourceId: string;
  coordinates: Uint32Array;
  provisional: boolean;
  colour: string;
};

export class PackedResourceCanvasLayer extends L.Layer {
  constructor(pane: string, presentation: { strokeColour: string; strokeWidth: number });
  setPartitions(partitions: readonly PackedRenderPartition[]): void;
  setVisibleRegionIds(regionIds: readonly string[]): void;
  setVisible(visible: boolean): void;
  getPointCount(): number;
  getBounds(): L.LatLngBounds | null;
  accessibleSamples(limit: number): Array<{ key: string; resourceId: string; x: number; z: number }>;
}
```

- [ ] **Step 1: Write failing renderer-planning tests**

Keep the Leaflet DOM shell out of the pure assertions. Export a `planPackedResourceDraw` helper and test unsigned decode, visible-region filtering, viewport culling, deterministic LOD at zoomed-out levels, full detail at near zoom, stable tier colours, resource stroke presentation, point counts, bounds, and 250 accessible samples from a 400,000-point fixture.

- [ ] **Step 2: Run renderer tests and verify RED**

```powershell
node --max-old-space-size=256 --experimental-strip-types --test apps/bitcraft-local/test/map-packed-resource-layer.test.mjs apps/bitcraft-local/test/map-resource-framing.test.mjs
```

Expected: packed renderer assertions FAIL.

- [ ] **Step 3: Extract and implement the packed resource layer**

Leave enemy `DensePointLayer` behavior unchanged. Move only resource rendering to `PackedResourceCanvasLayer`. Iterate packed coordinates directly, decode X/Z per candidate, cull before Leaflet projection, reuse the existing canvas, sprite/colour/stroke rules, animation-frame batching, and deterministic LOD. Do not allocate a `MapFeature`, nested coordinate array, or DOM marker per point.

- [ ] **Step 4: Add failing Native Map boundary tests**

Assert `NativeMap.tsx` imports the binary loader and packed layer, contains no resource call to `mapResourceFeatures`, `resourceRowsFromPartitions`, `applyResourcePartitionPage`, or `createMapResourcePartitionLoader`, preserves enemy rendering, keeps the resources pane below operational markers, uses packed counts/status, frames from packed bounds, and exposes at most 250 accessible resource samples.

- [ ] **Step 5: Run boundary tests and verify RED**

```powershell
node --max-old-space-size=256 --test apps/bitcraft-local/test/map-page-boundary.test.mjs apps/bitcraft-local/test/map-resource-framing.test.mjs
```

Expected: Native Map still owns the JSON pipeline, so assertions FAIL.

- [ ] **Step 6: Integrate binary state into `NativeMap`**

Replace JSON partition/status React state with one map of Task 5 partitions. Build lightweight render-partition descriptors from selected resource metadata and typed buffers. Keep existing resource selection persistence, all-region behavior, layer toggle, tier colour variations, resource framing, loading/stale/unavailable legend, visibility pause/resume, claims/watchtower/player pane order, and waypoint focus.

Counts must use committed coordinates plus provisional coordinates only when no committed partition exists. Unrelated resource states retain object and buffer identity across another partition's events.

- [ ] **Step 7: Run Task 6 focused tests**

Run Step 2 and Step 5 commands. Expected: PASS within 256 MiB.

- [ ] **Step 8: Commit Task 6**

```powershell
git add apps/bitcraft-local/src/pages/map/PackedResourceCanvasLayer.ts apps/bitcraft-local/src/pages/map/NativeMap.tsx apps/bitcraft-local/src/pages/map/resourceViewport.mjs apps/bitcraft-local/src/pages/map/resourceViewport.d.mts apps/bitcraft-local/test/map-packed-resource-layer.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs apps/bitcraft-local/test/map-resource-framing.test.mjs
git commit -m "feat(map): render resource partitions from typed buffers"
```

---

### Task 7: Performance gate, regression matrix, and CI ownership

**Files:**
- Create: `apps/bitcraft-local/scripts/benchmark-map-resource-binary.mjs`
- Modify: `.github/workflows/verify.yml`
- Modify: `apps/bitcraft-local/test/map-performance.test.mjs`
- Modify: `apps/bitcraft-local/test/provider-neutral-browser-data.test.mjs`
- Modify: `apps/bitcraft-local/test/map-resource-route-integration.test.mjs`
- Modify: `apps/bitcraft-local/test/map-page-boundary.test.mjs`

**Interfaces:**
- Consumes: completed Tasks 1–6.
- Produces: deterministic non-live benchmark JSON and CI failure gates.

- [ ] **Step 1: Write the benchmark's failing contract test**

Add a test that imports `runBinaryResourceBenchmark` and expects:

```js
const result = await runBinaryResourceBenchmark({ pointCount: 400_000, iterations: 3 });
assert.equal(result.pointCount, 400_000);
assert.equal(result.encodedBytes, 44 + (400_000 * 4));
assert.equal(result.identityLeak, false);
assert.ok(result.maxHeapMiB <= 256);
assert.ok(result.p95CodecMs <= 5_000);
assert.ok(result.p95DeltaMs <= 2_000);
```

- [ ] **Step 2: Run benchmark tests and verify RED**

```powershell
node --max-old-space-size=256 --test apps/bitcraft-local/test/map-performance.test.mjs
```

Expected: benchmark export or assertions FAIL.

- [ ] **Step 3: Implement the deterministic benchmark**

Generate 400,000 bounded unique packed coordinates, encode/decode them, apply deterministic 5,000-add/5,000-remove deltas, verify output, measure `performance.now()` and `process.memoryUsage().heapUsed`, print one JSON object, and exit nonzero on any threshold breach. Do not start the server, browser, Relay, terrain generation, roads, or world generation.

- [ ] **Step 4: Add the full regression matrix**

Add focused assertions that:

- provider-neutral browser boundaries contain no Relay SDK/topology/imports;
- entity IDs never appear in binary/events/client state;
- old JSON partition helpers are not imported by production browser code;
- one affected key produces one event and one fetch;
- 400,000 points pass codec, cache, runtime, route, loader, and renderer seams;
- access failures, stale data, schema mismatch, missed deltas, and capacity admission preserve unrelated last-good buffers;
- logs and public health remain coordinate/selection/identity-free.

- [ ] **Step 5: Run all resource-focused tests locally**

```powershell
node --max-old-space-size=256 --experimental-strip-types --test apps/bitcraft-local/test/map-resource-partition-codec.test.mjs apps/bitcraft-local/test/map-resource-live-index.test.mjs apps/bitcraft-local/test/map-resource-region-session.test.mjs apps/bitcraft-local/test/map-resource-binary-cache.test.mjs apps/bitcraft-local/test/map-resource-runtime.test.mjs apps/bitcraft-local/test/map-resource-binary-route.test.mjs apps/bitcraft-local/test/map-resource-route-integration.test.mjs apps/bitcraft-local/test/map-resource-binary-state.test.mjs apps/bitcraft-local/test/map-resource-binary-loader.test.mjs apps/bitcraft-local/test/map-packed-resource-layer.test.mjs apps/bitcraft-local/test/map-resource-framing.test.mjs apps/bitcraft-local/test/map-performance.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs apps/bitcraft-local/test/provider-neutral-browser-data.test.mjs apps/bitcraft-local/test/http-responses.test.mjs
```

Expected: PASS within 256 MiB. If Node exits for memory, stop and move that check to CI; do not raise the local cap.

- [ ] **Step 6: Run the capped benchmark locally once**

```powershell
node --max-old-space-size=256 apps/bitcraft-local/scripts/benchmark-map-resource-binary.mjs
```

Expected: one passing JSON result. Do not repeat a passing benchmark.

- [ ] **Step 7: Add CI benchmark ownership**

Add this step to `.github/workflows/verify.yml` after app tests:

```yaml
      - name: Benchmark binary map resources
        run: node --max-old-space-size=512 apps/bitcraft-local/scripts/benchmark-map-resource-binary.mjs
```

GitHub Actions continues to own `pnpm ... test` and `pnpm ... build`.

- [ ] **Step 8: Commit Task 7**

```powershell
git add apps/bitcraft-local/scripts/benchmark-map-resource-binary.mjs .github/workflows/verify.yml apps/bitcraft-local/test/map-performance.test.mjs apps/bitcraft-local/test/provider-neutral-browser-data.test.mjs apps/bitcraft-local/test/map-resource-route-integration.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs
git commit -m "test(map): gate dense binary resource performance"
```

---

### Task 8: Release, protected deployment, and live acceptance

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `apps/bitcraft-local/package.json`

**Interfaces:**
- Consumes: Tasks 1–7 and protected GitHub workflows.
- Produces: next same-line beta release deployed to `https://app.timbersteeltrade.com`.

- [ ] **Step 1: Review the complete branch diff**

```powershell
git diff --check
git status --short
git log --oneline --decorate -10
```

Confirm only approved resource pipeline, tests, CI, research, design, plan, changelog, and version files are present. Remove debug tags and temporary artifacts. Do not include `.codex-dev`, logs, database files, generated terrain, or benchmark output.

- [ ] **Step 2: Prepare the beta release metadata**

Increment `0.55.0-beta.40` to `0.55.0-beta.41` unless another release has advanced the line; if it has, increment only the current `0.55.0-beta.N` counter. Add user-facing changelog entries:

```markdown
### Added

- Added near-live binary resource loading for dense selections across multiple regions.

### Changed

- Improved resource loading speed by caching compact coordinate partitions and updating only resources that changed.

### Fixed

- Removed the resource node-count failure that prevented very dense resources from loading.
- Fixed new resource selections reloading or hiding resources that were already complete.
```

- [ ] **Step 3: Run final local focused verification once**

Run Task 7 Step 5, Task 7 Step 6, `git diff --check`, and no other broad local command. Expected: focused tests and benchmark PASS. Explicitly record that local build/full suite were skipped for machine safety.

- [ ] **Step 4: Commit release metadata**

```powershell
git add CHANGELOG.md apps/bitcraft-local/package.json
git commit -m "chore(release): prepare 0.55.0-beta.41"
```

Use the actual next beta version in the commit if the release line advanced.

- [ ] **Step 5: Push and open a ready pull request**

```powershell
git push -u origin codex/fast-binary-resource-pipeline
gh pr create --repo Red463/bitcraft-claim-monitor-relay --base main --head codex/fast-binary-resource-pipeline --title "Improve native map resource performance" --body-file <prepared-pr-body.md>
```

The PR body must state the live reproduction, root cause, binary design, security boundary, local memory constraint, focused results, and remote acceptance commands.

- [ ] **Step 6: Require remote CI success**

Wait for `.github/workflows/verify.yml`. Require clean install, full test suite, production build, binary benchmark, and deployment-contract checks to pass. On failure, inspect exact logs, apply the smallest test-first correction, rerun only relevant capped local checks, push, and wait again.

- [ ] **Step 7: Merge and deploy through the protected workflow**

Merge only after all required checks pass. Dispatch `deploy-relay-preview.yml` from `main`, record the merge SHA and run URL, and wait for both verify and deploy jobs to complete successfully. Do not SSH-deploy around the workflow.

- [ ] **Step 8: Verify live server health and contracts**

```powershell
curl.exe -sS --max-time 20 https://app.timbersteeltrade.com/api/local/health
curl.exe -sS --max-time 20 https://app.timbersteeltrade.com/api/local/map/tiles/status
```

Require the new beta version/build SHA, health `ok:true`, available terrain tiles, and available roads.

- [ ] **Step 9: Perform authenticated live map acceptance**

Using the in-app browser:

1. Load `https://app.timbersteeltrade.com/?page=map` and confirm no legacy iframe or third-party resource-position request.
2. Select Ghost Succulent in region 19 and record time to first points and complete state.
3. Select Bush and confirm warm/current points remain visible while it loads.
4. Select Ferns and confirm Bush/Ghost generations and buffers do not regress or refetch.
5. Confirm a partition above 250,000 nodes loads without a node-budget warning.
6. Switch to All regions with multiple selected types and confirm independent progress.
7. Deselect/reselect one dense type and confirm visible points within 500 ms from the warm cache.
8. Observe one live/provisional update or validate the event/status counters show deltas within the two-second target.
9. Pan and zoom the 400,000-point result; confirm responsive canvas rendering, no DOM marker growth, correct colours/borders, and operational icons/tooltips above resources.
10. Inspect console and requests for errors, 429s, repeated unchanged partition fetches, coordinates in logs, or upstream browser calls.

- [ ] **Step 10: Report release evidence**

Report version, PR, merge SHA, CI run, deploy run, production health, resource timings/counts, all-region outcome, cache/delta metrics, visual result, skipped local broad checks, and whether the legacy JSON route remains available for the one-beta rollback window.

---

## Plan self-review checklist

- Every approved design requirement maps to Tasks 1–8.
- The codec, server index, runtime cache, HTTP/event contract, browser store, renderer, CI gate, and release each have a focused test-first task.
- Function names and types consumed by later tasks match the interfaces that earlier tasks produce.
- No task requires browser-direct Relay, entity IDs in the binary client path, a new dependency, SQLite resource history, or a node-count limit.
- Cold provisional points and complete accepted generations remain semantically distinct.
- Unchanged partitions keep their generation and buffer identity.
- Heavy build, full-suite, and dense live work is assigned to GitHub Actions, not this PC.
- No `TBD`, `TODO`, unspecified error handling, or deferred implementation placeholder remains.
