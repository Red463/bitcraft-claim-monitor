# Relay-Native Terrain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate and serve an accurate land/water/biome basemap from verified Relay `terrain_chunk_state` data without any third-party runtime request.

**Architecture:** A read-only verifier establishes the live terrain layout before activation. A worker-owned regional session normalizes complete terrain generations, a deterministic Sharp encoder builds versioned WebP pyramids in staging, and an atomic manifest install preserves last-good tiles. The web process serves only installed same-origin tiles/status, while Leaflet retains the coordinate grid beneath the terrain layer.

**Tech Stack:** Node.js 24+, TypeScript, typed SpacetimeDB 2.7.0 bindings, Sharp 0.35.3, React, Leaflet 1.9.4, Node test runner, SQLite-backed existing settings/current-state seams.

## Global Constraints

- Browser and server runtime code must not contact BitCraftMap, Prism, BitJita, or third-party tile hosts.
- Only overworld dimension decimal string `"1"` is accepted.
- World points use `{x,z}`, GeoJSON uses `[x,z]`, Leaflet uses `[z,x]`, and bounds are `0..38400`.
- No cell side length, array order, chunk span, or `SurfaceType` ordinal is enabled until a recorded live fixture proves it.
- IDs remain lossless decimal strings; terrain arrays stay server-side and are not retained as history after a successful tile build.
- Limits: 4 regions, 20,000 chunks, 128 MiB normalized arrays, 100,000 tiles, 512 MiB bundle, 10-minute build, and 2 MiB per tile response.
- Only complete versioned bundles become current. Every failure retains the previous current manifest/bundle.
- Production collection runs in the background-worker role and does not require an open browser.
- Renderer default remains `external` until the complete native-map acceptance plan passes.

---

## File map

- `src/server/game-data/terrainProjection.ts`: provider-neutral terrain types, row validation, byte budgets, and fixture-gated cell/world conversion.
- `src/server/game-data/terrainRegionSession.ts`: one typed regional SpacetimeDB subscription and complete-generation lifecycle.
- `src/server/game-data/terrainRuntime.ts`: active-region reconciliation, reconnects, generation sequencing, and tile-build dispatch.
- `src/server/terrainPalette.mjs`: deterministic semantic land/water colours and bounded elevation shading.
- `src/server/terrainTileRenderer.mjs`: RGBA raster construction and Sharp WebP encoding.
- `src/server/terrainTileStore.mjs`: staging, manifest validation, atomic current-pointer install, read leases, and pruning.
- `src/server/mapTiles.mjs`: installed-bundle tile/status responses; no Relay knowledge.
- `src/pages/map/NativeMap.tsx`: status-driven terrain layer, cache-busting, fallback, and visibility lifecycle.
- `scripts/verify-relay-terrain-live.mjs`: read-only evidence capture and budget report.
- `test/fixtures/terrain-live-layout.json`: checked-in public, non-player evidence contract produced from an accepted live run.

### Task 1: Terrain contract and normalization

**Files:**
- Create: `apps/bitcraft-local/src/server/game-data/terrainProjection.ts`
- Create: `apps/bitcraft-local/test/terrain-projection.test.mjs`
- Modify: `apps/bitcraft-local/src/server/game-data/index.ts`

**Interfaces:**
- Produces `normalizeTerrainGeneration(input): NormalizedTerrainGeneration`.
- Produces `terrainCellPoint(chunk, index, evidence): { x: number; z: number }` that throws unless `evidence.verified === true`.
- Produces `TerrainLayoutEvidence`, `NormalizedTerrainChunk`, and `NormalizedTerrainGeneration` types for Tasks 2–4.

- [ ] **Step 1: Write failing normalization tests**

```js
test("terrain normalization derives a square side and preserves decimal chunk ids", () => {
  const result = normalizeTerrainGeneration({
    regionId: "19", dimension: "1", worldRegionRows: [{ id: 19, minX: 250, minZ: 230, width: 80, height: 80 }],
    biomeRows: [{ biomeType: 7, name: "Grasslands", description: "", hazardLevel: "", iconAddress: "", disallowPlayerBuild: false }],
    terrainRows: [terrainRow({ chunkIndex: 9007199254740999n, chunkX: 273, chunkZ: 237, side: 4 })],
    observedAt: "2026-08-11T12:00:00.000Z",
  });
  assert.equal(result.chunks[0].chunkIndex, "9007199254740999");
  assert.equal(result.chunks[0].side, 4);
  assert.equal(result.dimension, "1");
});

test("terrain normalization rejects unequal arrays, non-square cells, wrong dimensions, bounds leaks, and 128 MiB overflow", () => {
  assert.throws(() => normalizeTerrainGeneration(invalidLengths), /equal cell counts/);
  assert.throws(() => normalizeTerrainGeneration(nonSquare), /perfect square/);
  assert.throws(() => normalizeTerrainGeneration(dimensionZero), /overworld dimension 1/);
  assert.throws(() => normalizeTerrainGeneration(outsideRegion), /region bounds/);
  assert.throws(() => normalizeTerrainGeneration(oversize), /134217728 byte budget/);
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `node --test test/terrain-projection.test.mjs` from `apps/bitcraft-local`.
Expected: FAIL because `terrainProjection.ts` does not exist.

- [ ] **Step 3: Implement the provider-neutral contract**

Use typed arrays in the normalized result and validate every accepted array against `side * side`:

```ts
export type TerrainLayoutEvidence = {
  verified: boolean;
  side: number;
  cellSize: number;
  indexOrder: "z-major" | "x-major";
  zDirection: 1 | -1;
  chunkOriginX: number;
  chunkOriginZ: number;
  surfaceTypes: Readonly<Record<number, "ground" | "lake" | "river" | "ocean" | "ocean-biome" | "swamp">>;
  evidenceHash: string;
};

export function terrainCellPoint(chunk: NormalizedTerrainChunk, index: number, evidence: TerrainLayoutEvidence) {
  if (!evidence.verified) throw new TypeError("Terrain layout evidence is not verified");
  const localX = evidence.indexOrder === "z-major" ? index % evidence.side : Math.floor(index / evidence.side);
  const localZ = evidence.indexOrder === "z-major" ? Math.floor(index / evidence.side) : index % evidence.side;
  return {
    x: evidence.chunkOriginX + chunk.chunkX * evidence.side * evidence.cellSize + localX * evidence.cellSize,
    z: evidence.chunkOriginZ + chunk.chunkZ * evidence.side * evidence.cellSize + evidence.zDirection * localZ * evidence.cellSize,
  };
}
```

Do not supply production evidence constants in this task.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `node --test test/terrain-projection.test.mjs`
Expected: PASS.

Run: `corepack pnpm run build:provider`
Expected: exit 0.

- [ ] **Step 5: Commit**

```powershell
git add apps/bitcraft-local/src/server/game-data/terrainProjection.ts apps/bitcraft-local/src/server/game-data/index.ts apps/bitcraft-local/test/terrain-projection.test.mjs
git commit -m "feat(map): normalize bounded Relay terrain"
```

### Task 2: Typed regional terrain session

**Files:**
- Create: `apps/bitcraft-local/src/server/game-data/terrainRegionSession.ts`
- Create: `apps/bitcraft-local/test/terrain-region-session.test.mjs`
- Modify: `apps/bitcraft-local/src/server/game-data/index.ts`

**Interfaces:**
- Consumes `normalizeTerrainGeneration` from Task 1.
- Produces `RelayTerrainRegionSession.start({ uri, database, schemaFingerprint, manifest, generation, regionId, maxChunks, maxBytes })`, `.health()`, and `.stop()`.
- Calls `onSnapshot(snapshot: { data: NormalizedTerrainGeneration; warnings: string[]; database: string; regionId: string; schemaFingerprint: string; generation: number; receivedAt: string })` only after a complete apply.

- [ ] **Step 1: Write failing session tests**

Assert the exact queries and lifecycle:

```js
assert.deepEqual(connection.queries, [
  "SELECT * FROM world_region_state WHERE id = 19",
  "SELECT * FROM biome_desc",
  "SELECT * FROM terrain_chunk_state WHERE dimension = 1",
]);
assert.equal(snapshots.length, 1);
assert.equal(snapshots[0].data.chunks.length, 2);
terrainChunkState.emitDelete(chunkTwo);
await flushMicrotasks();
assert.equal(snapshots.at(-1).data.chunks.length, 1);
```

Also test schema mismatch before connection creation, duplicate starts, disconnect health, malformed-generation failure without `onSnapshot`, listener removal, and the 20,000-chunk cap.

- [ ] **Step 2: Run the test and confirm RED**

Run: `node --test test/terrain-region-session.test.mjs`
Expected: FAIL because `terrainRegionSession.ts` does not exist.

- [ ] **Step 3: Implement the session using the existing regional-session shape**

Use `assertSchemaFingerprint`, bundled regional bindings, one subscription, table listeners on insert/update/delete, microtask-coalesced complete applies, and generation increments. Never publish per-row partial state.

- [ ] **Step 4: Run focused tests and provider build**

Run: `node --test test/terrain-region-session.test.mjs test/terrain-projection.test.mjs`
Expected: PASS.

Run: `corepack pnpm run build:provider`
Expected: exit 0.

- [ ] **Step 5: Commit**

```powershell
git add apps/bitcraft-local/src/server/game-data/terrainRegionSession.ts apps/bitcraft-local/src/server/game-data/index.ts apps/bitcraft-local/test/terrain-region-session.test.mjs
git commit -m "feat(map): collect complete regional terrain generations"
```

### Task 3: Live evidence verifier and accepted layout fixture

**Files:**
- Create: `apps/bitcraft-local/scripts/verify-relay-terrain-live.mjs`
- Create after a successful accepted run: `apps/bitcraft-local/test/fixtures/terrain-live-layout.json`
- Modify: `docs/research/native-map-live-coordinate-reference.md`
- Test: `apps/bitcraft-local/test/terrain-live-fixture.test.mjs`

**Interfaces:**
- Consumes `RelayTerrainRegionSession` from Task 2.
- Produces a fixture matching `TerrainLayoutEvidence` plus `regionId`, `schemaFingerprint`, `observedAt`, aggregate counts/hashes, and three public evidence points.
- The production fixture must contain exactly these named categories: `inland`, `coastline`, and `open-water`; it must contain no player identity or player coordinates.

- [ ] **Step 1: Write the failing fixture-contract test**

```js
const fixture = JSON.parse(await readFile(new URL("fixtures/terrain-live-layout.json", import.meta.url)));
assert.equal(fixture.verified, true);
assert.equal(fixture.dimension, "1");
assert.deepEqual(fixture.points.map((point) => point.category).sort(), ["coastline", "inland", "open-water"]);
assert.ok(fixture.points.every((point) => Number.isInteger(point.x) && Number.isInteger(point.z)));
assert.ok(!JSON.stringify(fixture).match(/playerId|username|mobile/i));
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `node --test test/terrain-live-fixture.test.mjs`
Expected: FAIL because the accepted fixture does not exist.

- [ ] **Step 3: Implement the read-only verifier**

The script must:

- Discover region `19` topology and validate the regional fingerprint.
- Start `RelayTerrainRegionSession` with a 120-second timeout and no writes.
- Print chunk/cell counts, per-array lengths, observed side candidates, coordinate bounds, `SurfaceType` frequencies, normalized bytes, elapsed time, and SHA-256 hashes.
- Accept evidence points through repeated arguments shaped as `--point=name:x:z:expected`, where expected is `ground`, `water`, or `mixed-neighbourhood`.
- Exit nonzero if the three required categories are absent, a point is outside bounds, or observed cells contradict expectations.
- Write the candidate fixture only when `--write-fixture=test/fixtures/terrain-live-layout.json` is supplied.

- [ ] **Step 4: Run live evidence capture and stop on uncertainty**

Run from `apps/bitcraft-local` after `corepack pnpm run build:server`:

```powershell
node scripts/verify-relay-terrain-live.mjs --region=19 --point=inland:27361:23715:ground --point=open-water:28672:23200:water --point=coastline:27456:23316:mixed-neighbourhood --write-fixture=test/fixtures/terrain-live-layout.json
```

Expected: one complete generation, one cell-size candidate, one decisive edge-continuity orientation, all budgets reported, and `verified: true`. If the coastline or water reference disagrees, do not alter expected classifications to make the test pass; inspect the public map/in-game coordinates, choose a genuinely known replacement point, rerun, and record the evidence source in the reference document.

- [ ] **Step 5: Run fixture and projection tests**

Run: `node --test test/terrain-live-fixture.test.mjs test/terrain-projection.test.mjs`
Expected: PASS.

- [ ] **Step 6: Update the live coordinate reference and commit**

Record exact observed side, order, cell size, origin, surface mapping, counts, bytes, elapsed time, points, and hashes.

```powershell
git add apps/bitcraft-local/scripts/verify-relay-terrain-live.mjs apps/bitcraft-local/test/fixtures/terrain-live-layout.json apps/bitcraft-local/test/terrain-live-fixture.test.mjs docs/research/native-map-live-coordinate-reference.md
git commit -m "test(map): verify live Relay terrain layout"
```

### Task 4: Semantic palette and deterministic WebP tile renderer

**Files:**
- Modify: `apps/bitcraft-local/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/bitcraft-local/src/server/terrainPalette.mjs`
- Create: `apps/bitcraft-local/src/server/terrainTileRenderer.mjs`
- Create: `apps/bitcraft-local/test/terrain-tile-renderer.test.mjs`

**Interfaces:**
- Consumes `NormalizedTerrainGeneration` and accepted `TerrainLayoutEvidence`.
- Produces `renderTerrainTile({ generation, evidence, zoom, x, y, tileSize?: 256 }): Promise<Buffer>`.
- Produces `terrainCellRgba({ surface, biomeName, elevation }): [number, number, number, number]`.

- [ ] **Step 1: Add Sharp 0.35.3 deliberately**

Run: `corepack pnpm --filter @workspace/bitcraft-local add sharp@0.35.3`

Sharp is the only new runtime dependency. It is justified because the accepted contract requires deterministic WebP encoding, it supports Node.js `>=20.9.0`, supplies its own types, and ships prebuilt binaries for the production platforms. Do not add `@types/sharp`, a canvas framework, or a browser image dependency.

- [ ] **Step 2: Write failing palette/renderer tests**

```js
assert.deepEqual(terrainCellRgba({ surface: "ocean", biomeName: "Uncharted Ocean", elevation: -20 }), [24, 59, 86, 255]);
assert.deepEqual(terrainCellRgba({ surface: "river", biomeName: "Grasslands", elevation: 0 }), [58, 125, 145, 255]);
assert.notDeepEqual(
  terrainCellRgba({ surface: "ground", biomeName: "Grasslands", elevation: -10 }),
  terrainCellRgba({ surface: "ground", biomeName: "Grasslands", elevation: 10 }),
);
const first = await renderTerrainTile(fixtureRequest);
const second = await renderTerrainTile(fixtureRequest);
assert.deepEqual(createHash("sha256").update(first).digest("hex"), createHash("sha256").update(second).digest("hex"));
assert.ok(first.byteLength <= 2_097_152);
```

Also assert water classification overrides biome/elevation, unknown biomes use neutral RGBA plus a warning, world-edge clipping is transparent, and negative tile Y selects the correct cells.

- [ ] **Step 3: Run tests and confirm RED**

Run: `node --test test/terrain-tile-renderer.test.mjs`
Expected: FAIL because palette/renderer modules do not exist.

- [ ] **Step 4: Implement nearest-cell RGBA rendering and WebP encoding**

Construct a `256 * 256 * 4` buffer, project each pixel centre through the accepted layout, choose the owning cell, and encode with:

```js
return sharp(rgba, { raw: { width: tileSize, height: tileSize, channels: 4 } })
  .webp({ quality: 82, alphaQuality: 100, smartSubsample: false, effort: 4 })
  .toBuffer();
```

Use fixed palette/version constants and integer lightness math so hashes are stable.

- [ ] **Step 5: Run focused tests and build**

Run: `node --test test/terrain-tile-renderer.test.mjs test/terrain-projection.test.mjs`
Expected: PASS.

Run: `corepack pnpm --filter @workspace/bitcraft-local run build`
Expected: exit 0.

- [ ] **Step 6: Commit**

```powershell
git add apps/bitcraft-local/package.json pnpm-lock.yaml apps/bitcraft-local/src/server/terrainPalette.mjs apps/bitcraft-local/src/server/terrainTileRenderer.mjs apps/bitcraft-local/test/terrain-tile-renderer.test.mjs
git commit -m "feat(map): render semantic Relay terrain tiles"
```

### Task 5: Atomic terrain bundle store

**Files:**
- Create: `apps/bitcraft-local/src/server/terrainTileStore.mjs`
- Create: `apps/bitcraft-local/test/terrain-tile-store.test.mjs`
- Modify: `apps/bitcraft-local/src/server/mapTiles.mjs`
- Modify: `apps/bitcraft-local/test/map-tiles.test.mjs`

**Interfaces:**
- Produces `createTerrainTileStore({ dataDir, encoder, now, limits })` with `.buildAndInstall(generation)`, `.readManifest()`, `.readTile({ style, z, x, y })`, and `.close()`.
- `readTile` returns `{ bytes, contentType: "image/webp", generation } | null` while holding a read lease for the selected version.
- `readManifest` returns public fields only.

- [ ] **Step 1: Write failing atomicity tests**

Test a successful bundle, encoder failure halfway through, malformed manifest, deadline/byte/tile caps, exact current-pointer replacement, concurrent read during replacement, stale staging cleanup, and pruning only after read release.

```js
await store.buildAndInstall(generationOne);
encoder.failAfter = 2;
await assert.rejects(store.buildAndInstall(generationTwo), /forced encoder failure/);
assert.equal(store.readManifest().generation, "1");
assert.deepEqual((await store.readTile({ style: "terrain", z: -5, x: 0, y: -2 })).bytes, generationOneTile);
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `node --test test/terrain-tile-store.test.mjs test/map-tiles.test.mjs`
Expected: FAIL because `terrainTileStore.mjs` does not exist and the route still reads the legacy flat path.

- [ ] **Step 3: Implement staging, manifest, pointer, leases, and limits**

Use resolved paths only beneath `<dataDir>/map-tiles`. Install immutable versions under `versions/<generation>`, write `current.json` through a sibling temporary file, flush/close it, rename atomically, and keep the previous version on every pre-pointer failure. Validate all counts/bytes before pointer replacement.

- [ ] **Step 4: Update `serveLocalMapTile`**

Inject the store instead of joining request values directly onto `dataDir`. Preserve strict style/zoom/index validation, negative Y, `404`, `image/webp`, immutable caching, and the 2 MiB read cap.

- [ ] **Step 5: Run focused tests**

Run: `node --test test/terrain-tile-store.test.mjs test/map-tiles.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/bitcraft-local/src/server/terrainTileStore.mjs apps/bitcraft-local/src/server/mapTiles.mjs apps/bitcraft-local/test/terrain-tile-store.test.mjs apps/bitcraft-local/test/map-tiles.test.mjs
git commit -m "feat(map): install terrain bundles atomically"
```

### Task 6: Worker-owned terrain runtime

**Files:**
- Create: `apps/bitcraft-local/src/server/game-data/terrainRuntime.ts`
- Create: `apps/bitcraft-local/test/terrain-runtime.test.mjs`
- Modify: `apps/bitcraft-local/src/server/game-data/index.ts`
- Modify: `apps/bitcraft-local/server.mjs`
- Modify: `apps/bitcraft-local/test/server-collector-settings.test.mjs`

**Interfaces:**
- Consumes `RelayTerrainRegionSession` and `terrainTileStore.buildAndInstall`.
- Produces `RelayTerrainRuntime.start({ relayBaseUrl, activeRegionIds })`, `.reconcile({ activeRegionIds })`, `.health()`, and `.stop()`.
- Runtime health includes source key, region IDs, connected/applied flags, generation, build stage/progress, counts/bytes/duration, last-good generation/time, and redacted last error.

- [ ] **Step 1: Write failing runtime tests**

Cover active-region canonicalization/cap, primary warm session, additional lease reuse/removal, topology/fingerprint change, reconnect/backoff, serialized builds, newer-generation coalescing, last-good retention, and stop cleanup. Assert no runtime starts when `processRoleConfig.runBackgroundJobs` is false.

- [ ] **Step 2: Run tests and confirm RED**

Run: `node --test test/terrain-runtime.test.mjs test/server-collector-settings.test.mjs`
Expected: FAIL because the runtime and server wiring do not exist.

- [ ] **Step 3: Implement runtime orchestration**

Use the existing topology/reconnect conventions. Keep at most one build in flight; if generation `N+1` arrives during `N`, discard intermediate pending generations and build the newest complete one next. Never delete the installed bundle on session failure.

- [ ] **Step 4: Wire background startup and shutdown**

Construct the store for both roles so the web route can read it. Start/reconcile `RelayTerrainRuntime` only inside the existing background refresh when `processRoleConfig.runBackgroundJobs` is true. Add it to the claim-scope shutdown fence and process shutdown path. Use configured primary/default/additional active region IDs, capped at four.

- [ ] **Step 5: Run backend tests and provider build**

Run: `node --test test/terrain-runtime.test.mjs test/server-collector-settings.test.mjs test/map-tiles.test.mjs`
Expected: PASS.

Run: `corepack pnpm run build:provider`
Expected: exit 0.

- [ ] **Step 6: Commit**

```powershell
git add apps/bitcraft-local/src/server/game-data/terrainRuntime.ts apps/bitcraft-local/src/server/game-data/index.ts apps/bitcraft-local/server.mjs apps/bitcraft-local/test/terrain-runtime.test.mjs apps/bitcraft-local/test/server-collector-settings.test.mjs
git commit -m "feat(map): build terrain in the Relay worker"
```

### Task 7: Tile status API and Leaflet lifecycle

**Files:**
- Modify: `apps/bitcraft-local/src/server/mapTiles.mjs`
- Modify: `apps/bitcraft-local/server.mjs`
- Modify: `apps/bitcraft-local/test/map-tiles.test.mjs`
- Create: `apps/bitcraft-local/src/pages/map/terrainTileStatus.mjs`
- Create: `apps/bitcraft-local/src/pages/map/terrainTileStatus.d.mts`
- Create: `apps/bitcraft-local/test/terrain-tile-status.test.mjs`
- Modify: `apps/bitcraft-local/src/pages/map/NativeMap.tsx`
- Modify: `apps/bitcraft-local/test/map-page-boundary.test.mjs`

**Interfaces:**
- Adds `GET /api/local/map/tiles/status` returning `{ provider:"relay", available, generation, generatedAt, observedAt, freshness, ageMs, regionIds, dimension:"1", bounds, zoomRange, paletteVersion, tileCount, totalBytes, warnings }`.
- Produces `loadTerrainTileStatus(signal): Promise<TerrainTileStatus>` and `terrainTileUrl(generation): string`.

- [ ] **Step 1: Write failing API/client lifecycle tests**

Assert unavailable `200` status without paths, usable manifest projection, stale age, cache-busted URL `/api/local/map/tiles/terrain/{z}/{x}/{y}.webp?generation=42`, no third-party hostname, visibility pause/resume, layer replacement only on generation change, and coordinate-grid persistence beneath terrain.

- [ ] **Step 2: Run tests and confirm RED**

Run: `node --test test/map-tiles.test.mjs test/terrain-tile-status.test.mjs test/map-page-boundary.test.mjs`
Expected: FAIL because status/client modules do not exist.

- [ ] **Step 3: Implement status projection and client helper**

Return `200` for unavailable/last-good status so the renderer can explain the fallback. Never include `dataDir`, version-directory names, schema wire rows, or stack traces.

- [ ] **Step 4: Update `NativeMap`**

Create the grid once. Load status on mount/visibility resume and every generation event or 60 seconds while visible. Add terrain only when `available`; replace it only when generation changes. Display terrain freshness independently of marker freshness. On tile errors retain the grid and show the manifest warning.

- [ ] **Step 5: Run focused tests, typecheck, and build**

Run: `node --test test/map-tiles.test.mjs test/terrain-tile-status.test.mjs test/map-page-boundary.test.mjs`
Expected: PASS.

Run: `corepack pnpm run typecheck`
Expected: exit 0.

Run: `corepack pnpm run build`
Expected: exit 0.

- [ ] **Step 6: Commit**

```powershell
git add apps/bitcraft-local/src/server/mapTiles.mjs apps/bitcraft-local/server.mjs apps/bitcraft-local/test/map-tiles.test.mjs apps/bitcraft-local/src/pages/map/terrainTileStatus.mjs apps/bitcraft-local/src/pages/map/terrainTileStatus.d.mts apps/bitcraft-local/test/terrain-tile-status.test.mjs apps/bitcraft-local/src/pages/map/NativeMap.tsx apps/bitcraft-local/test/map-page-boundary.test.mjs
git commit -m "feat(map): load installed Relay terrain in Leaflet"
```

### Task 8: Acceptance, smoke visibility, and operating reference

**Files:**
- Modify: `docs/research/native-map-live-coordinate-reference.md`
- Modify: `apps/bitcraft-local/test/provider-neutral-browser-data.test.mjs`
- Modify: `apps/bitcraft-local/test/deployment-runtime.test.mjs`

**Interfaces:**
- Produces the release evidence required to decide whether terrain can participate in `native-beta`; it does not change the production renderer default.

- [ ] **Step 1: Add failing no-third-party and deployment boundary assertions**

Assert browser sources contain no Prism/BitCraftMap tile URL, worker role starts terrain collection, web role only reads installed bundles, and production bundle/runtime dependencies include Sharp without remote image calls.

- [ ] **Step 2: Run boundary tests and confirm RED**

Run: `node --test test/provider-neutral-browser-data.test.mjs test/deployment-runtime.test.mjs`
Expected: FAIL until the new terrain boundaries are explicitly covered.

- [ ] **Step 3: Complete boundary coverage and reference documentation**

Record the accepted live fixture, palette version, build duration, bundle size, tile counts, smoke URL, rollback behaviour, data-directory ownership, and exact worker/web operating behaviour. Do not add a changelog or version bump until push/release is requested.

- [ ] **Step 4: Run the complete verification gate**

Run from repository root:

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
corepack pnpm --filter @workspace/bitcraft-local test
node scripts/start-bitcraft-local-smoke.mjs --force-restart
curl.exe -s http://127.0.0.1:18449/api/local/health
curl.exe -s http://127.0.0.1:18449/api/local/map/tiles/status
```

Expected: build exit 0; tests have zero failures; smoke health `ok:true`; terrain status `available:true`, `provider:"relay"`, `dimension:"1"`; no third-party requests in native mode.

- [ ] **Step 5: Browser-smoke desktop and mobile**

Open `http://127.0.0.1:18449/?page=map&label=Jaruudsalem&x=12358&z=19761&regionId=12`. Confirm recognizable land/water, focus-marker alignment, pan/zoom, stale/unavailable fallback, keyboard operation, mobile layout, and no console/network request to an external tile host. Capture screenshots in `.codex-dev` only.

- [ ] **Step 6: Commit**

```powershell
git add docs/research/native-map-live-coordinate-reference.md apps/bitcraft-local/test/provider-neutral-browser-data.test.mjs apps/bitcraft-local/test/deployment-runtime.test.mjs
git commit -m "test(map): accept Relay-native terrain basemap"
```

## Stop conditions

Stop implementation and report evidence instead of weakening checks when:

- Relay does not apply a complete terrain generation within 120 seconds.
- Any terrain array has inconsistent/non-square length.
- The three independent evidence points do not establish cell order, origin, and surface mapping.
- The measured source or bundle exceeds a hard budget.
- Sharp cannot install/build for Node 24 on both local Windows and production Linux.
- Atomic-install tests cannot prove the previous bundle remains readable after failure.
