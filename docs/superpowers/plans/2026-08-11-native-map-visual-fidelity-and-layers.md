# Native Map Visual Fidelity and Layers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add isolated tier-specific claim badges, richer first-party terrain and water tiles, and persisted visibility controls for every native-map layer, with roads and claim areas represented but disabled until their coordinates are verified.

**Architecture:** Keep raw terrain and Relay records server-owned. Extend the atomic tile bundle to aligned `terrain` and `water` channels, add a versioned presentation/preferences seam in the browser, and drive existing Leaflet groups from those preferences without recreating the map. Claim tier assets remain same-origin and road/claim-area layers fail closed through explicit snapshot availability metadata.

**Tech Stack:** React 19, TypeScript, Leaflet 1.9, Node HTTP, Sharp WebP rendering, Node test runner, plain CSS, pnpm/Corepack.

## Global Constraints

- Browser code must not contact Relay, BitJita, Prism, BitCraftMap, or third-party tile/image hosts.
- Preserve decimal-string entity IDs and the existing `{x,z}` / Leaflet `[z,x]` coordinate contract.
- Do not add bank tracking.
- Copy the ten user-supplied claim PNG files without altering their source pixels; isolate the badge at presentation time.
- Roads and claim areas must return no geometry and remain disabled until the coordinate reference records verified decoding, filtering, deletion behavior, fixtures, and budgets.
- Resource/enemy visibility toggles must not clear their selected types.
- Tile installation remains atomic and retains the previous complete generation on any failure.
- Keep the stable smoke server in `BITCRAFT_SMOKE_PROCESS_ROLE=web` except for a bounded palette-v3 generation run.
- Use test-first development for every production behavior change.

---

### Task 1: Claim Tier Asset and Presentation Contract

**Files:**
- Copy: `C:/Users/Tom/Pictures/Bitcraft Calim Monitor/map icons/claim/claim_t1.png` through `claim_t10.png`
- Create: `apps/bitcraft-local/public/map-icons/claims/claim_t1.png` through `claim_t10.png`
- Modify: `apps/bitcraft-local/src/pages/map/mapMarkerPresentation.mjs`
- Modify: `apps/bitcraft-local/src/pages/map/mapMarkerPresentation.d.mts`
- Modify: `apps/bitcraft-local/src/pages/map/NativeMap.tsx`
- Modify: `apps/bitcraft-local/src/styles/map.css`
- Test: `apps/bitcraft-local/test/map-marker-presentation.test.mjs`
- Test: `apps/bitcraft-local/test/map-page-boundary.test.mjs`

**Interfaces:**
- Consumes: normalized claim feature metadata `{ kind: "claim", tier: number | null }`.
- Produces: `claimMarkerPresentation(tier): MapMarkerPresentation`, returning a same-origin T1–T10 image or the neutral claim fallback.

- [ ] **Step 1: Write the failing tier-selection test**

Add assertions equivalent to:

```js
assert.deepEqual(claimMarkerPresentation(1), {
  mode: "image",
  iconUrl: "/map-icons/claims/claim_t1.png",
  glyph: "I",
  badgeCrop: true,
});
assert.equal(claimMarkerPresentation(10).iconUrl, "/map-icons/claims/claim_t10.png");
assert.equal(claimMarkerPresentation(0).mode, "canvas");
assert.equal(claimMarkerPresentation(11).mode, "canvas");
assert.equal(claimMarkerPresentation("6").mode, "canvas");
assert.doesNotMatch(JSON.stringify(claimMarkerPresentation(6)), /https?:\/\//);
```

Add a boundary assertion that `NativeMap.tsx` passes `feature.tier` for claim presentation and creates keyboard-enabled DOM markers for valid tier badges.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --test test/map-marker-presentation.test.mjs test/map-page-boundary.test.mjs
```

Expected: FAIL because `claimMarkerPresentation` and `badgeCrop` do not exist and claims still use the canvas presentation.

- [ ] **Step 3: Add the minimal presentation implementation**

Implement the public seam:

```js
const NEUTRAL_CLAIM = Object.freeze({ mode: "canvas", glyph: "C" });

export function claimMarkerPresentation(tier) {
  if (!Number.isInteger(tier) || tier < 1 || tier > 10) return NEUTRAL_CLAIM;
  return Object.freeze({
    mode: "image",
    iconUrl: `/map-icons/claims/claim_t${tier}.png`,
    glyph: String(tier),
    badgeCrop: true,
  });
}
```

Extend `MapFeature` with `tier?: number | null`; select this helper for `kind === "claim"`. Add `native-map-marker--claim-badge` and `native-map-marker-badge-crop` classes. Crop the source art using a hexagonal `clip-path`, an overflow-hidden 30-pixel container, and a scaled/translated image that removes the source margins. Keep `keyboard: true`, and include `Tier ${feature.tier}` in the claim tooltip.

Copy all ten PNG files into the declared public directory and verify their names exactly match the helper output.

- [ ] **Step 4: Run the focused tests and build**

Run the Step 2 command, then:

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: all focused tests pass and the production build succeeds.

- [ ] **Step 5: Commit the asset/presentation slice**

```powershell
git add apps/bitcraft-local/public/map-icons/claims apps/bitcraft-local/src/pages/map/mapMarkerPresentation.mjs apps/bitcraft-local/src/pages/map/mapMarkerPresentation.d.mts apps/bitcraft-local/src/pages/map/NativeMap.tsx apps/bitcraft-local/src/styles/map.css apps/bitcraft-local/test/map-marker-presentation.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs
git commit -m "feat(map): add claim tier badges"
```

### Task 2: Versioned Layer Definitions and Preferences

**Files:**
- Create: `apps/bitcraft-local/src/pages/map/mapLayerPreferences.mjs`
- Create: `apps/bitcraft-local/src/pages/map/mapLayerPreferences.d.mts`
- Create: `apps/bitcraft-local/test/map-layer-preferences.test.mjs`

**Interfaces:**
- Produces: `MAP_LAYER_PREFERENCE_KEY`, `MAP_LAYER_DEFINITIONS`, `defaultMapLayerVisibility()`, `parseMapLayerVisibility(raw)`, and `serializeMapLayerVisibility(value)`.
- Consumers: `NativeMap.tsx` and the Layers control in Task 4.

- [ ] **Step 1: Write failing preference-contract tests**

Cover all declared keys and defensive persistence:

```js
assert.deepEqual(MAP_LAYER_DEFINITIONS.map(({ key }) => key), [
  "terrain", "water", "claims", "markets", "waystones",
  "empire-settlements", "watchtowers", "players", "resources",
  "enemies", "roads", "claim-areas",
]);
assert.equal(defaultMapLayerVisibility().terrain, true);
assert.equal(defaultMapLayerVisibility().roads, false);
assert.deepEqual(parseMapLayerVisibility("not json"), defaultMapLayerVisibility());
assert.equal(parseMapLayerVisibility('{"claims":false,"unknown":true}').claims, false);
assert.equal(Object.hasOwn(parseMapLayerVisibility('{"unknown":true}'), "unknown"), false);
assert.equal(MAP_LAYER_PREFERENCE_KEY, "bitcraft-map-layers:v1");
```

- [ ] **Step 2: Run the test and verify RED**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --test test/map-layer-preferences.test.mjs
```

Expected: FAIL because the module is absent.

- [ ] **Step 3: Implement the allowlisted preference seam**

Use immutable definitions with label, default visibility, and data layer:

```js
{ key: "roads", label: "Roads", defaultVisible: false, dataLayer: "roads" }
{ key: "claim-areas", label: "Claim areas", defaultVisible: false, dataLayer: "claim-areas" }
```

`parseMapLayerVisibility` must catch JSON errors, accept only boolean values for known keys, and apply defaults for missing keys. `serializeMapLayerVisibility` must output only known keys in definition order.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit the preference seam**

```powershell
git add apps/bitcraft-local/src/pages/map/mapLayerPreferences.mjs apps/bitcraft-local/src/pages/map/mapLayerPreferences.d.mts apps/bitcraft-local/test/map-layer-preferences.test.mjs
git commit -m "feat(map): define native layer preferences"
```

### Task 3: Fail-Closed Roads and Claim-Area API Vocabulary

**Files:**
- Modify: `apps/bitcraft-local/src/server/mapSnapshot.mjs`
- Modify: `apps/bitcraft-local/src/pages/map/nativeMapRequest.mjs`
- Test: `apps/bitcraft-local/test/map-snapshot.test.mjs`
- Test: `apps/bitcraft-local/test/native-map-request.test.mjs`

**Interfaces:**
- Produces: snapshot `layerAvailability: Record<string, { available: boolean; reason: string | null }>`.
- Adds provider-neutral request keys `roads` and `claim-areas`.
- Does not add Relay subscriptions or geometry.

- [ ] **Step 1: Write failing scope and snapshot tests**

Add assertions equivalent to:

```js
const scope = parseMapScope(new URLSearchParams({
  regions: "19",
  layers: "roads,claim-areas",
}), { allowedRegionIds: ["19"] });
const snapshot = buildMapSnapshot({ scope });
assert.deepEqual(snapshot.layers.roads, []);
assert.deepEqual(snapshot.layers["claim-areas"], []);
assert.deepEqual(snapshot.layerAvailability.roads, {
  available: false,
  reason: "Unavailable — awaiting verified Relay coordinates",
});
assert.equal(snapshot.layerAvailability["claim-areas"].available, false);
```

Update the canonical request expectation so the two keys appear exactly once and are sorted with the other operational layers.

- [ ] **Step 2: Run the focused tests and verify RED**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --test test/map-snapshot.test.mjs test/native-map-request.test.mjs
```

Expected: FAIL with unknown layer/request and missing `layerAvailability` assertions.

- [ ] **Step 3: Implement the fail-closed contract**

Add both keys to `MAP_LAYER_KEYS` and `OPERATIONAL_LAYERS`. Build an availability record for every requested layer; existing layers default to `{ available: true, reason: null }`, while roads and claim areas receive the exact unavailable value above. Add one warning per unavailable evidence-gated layer. Keep both feature arrays empty and include no new collector/session code.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run the Step 2 command. Expected: PASS, including request canonicalization and response-budget checks.

- [ ] **Step 5: Commit the API vocabulary slice**

```powershell
git add apps/bitcraft-local/src/server/mapSnapshot.mjs apps/bitcraft-local/src/pages/map/nativeMapRequest.mjs apps/bitcraft-local/test/map-snapshot.test.mjs apps/bitcraft-local/test/native-map-request.test.mjs
git commit -m "feat(map): gate roads and claim areas"
```

### Task 4: Layers Control and Leaflet Visibility Lifecycle

**Files:**
- Create: `apps/bitcraft-local/src/pages/map/MapLayersControl.tsx`
- Modify: `apps/bitcraft-local/src/pages/map/NativeMap.tsx`
- Modify: `apps/bitcraft-local/src/styles/map.css`
- Test: `apps/bitcraft-local/test/map-page-boundary.test.mjs`
- Test: `apps/bitcraft-local/test/css-ownership.test.mjs`

**Interfaces:**
- Consumes: Task 2 definitions/preferences and Task 3 `snapshot.layerAvailability`.
- Produces: `MapLayersControl({ visibility, availability, counts, onToggle })`.
- Controls stable Leaflet groups for `claims`, `markets`, `waystones`, `empire-settlements`, `watchtowers`, `players`, `resources`, and `enemies`, plus the Task 5 tile channels.

- [ ] **Step 1: Write failing renderer-boundary tests**

Assert the component imports the preference seam, initializes state from local storage, persists with `serializeMapLayerVisibility`, renders a button named `Layers`, and supplies disabled reasons. Assert `DensePointLayer` exposes `setVisible(visible)` and clears/skips drawing while false. Assert toggling `resources`/`enemies` does not call a selection setter or modify the native request.

Add CSS assertions for a viewport-contained absolute popover, 44-pixel touch targets under `max-width: 620px`, and no horizontal overflow rules.

- [ ] **Step 2: Run the focused tests and verify RED**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --test test/map-page-boundary.test.mjs test/css-ownership.test.mjs
```

Expected: FAIL because the control and visibility lifecycle are absent.

- [ ] **Step 3: Implement stable layer groups and the control**

In `NativeMap`, replace the single marker group with keyed `L.LayerGroup` instances. Route each feature layer to its matching group, clearing and repopulating groups without recreating the Leaflet map. Keep the focus marker in an always-visible focus group.

Initialize preferences exactly once:

```ts
const [layerVisibility, setLayerVisibility] = React.useState(() =>
  parseMapLayerVisibility(window.localStorage.getItem(MAP_LAYER_PREFERENCE_KEY)),
);
```

Persist in an effect using `serializeMapLayerVisibility`. Add/remove stable groups according to visibility. Call `resourcesRef.current?.setVisible(layerVisibility.resources)` and the enemy equivalent; do not change `resourceIds` or `enemyTypes`.

Render the control over the map. Disabled rows use `disabled`, `aria-describedby`, and visible reason text. The legend renders `hidden` for usable hidden layers and `unavailable` for gated layers.

- [ ] **Step 4: Run focused tests and build**

Run the Step 2 command, then the production build. Expected: PASS.

- [ ] **Step 5: Commit the layer-control slice**

```powershell
git add apps/bitcraft-local/src/pages/map/MapLayersControl.tsx apps/bitcraft-local/src/pages/map/NativeMap.tsx apps/bitcraft-local/src/styles/map.css apps/bitcraft-local/test/map-page-boundary.test.mjs apps/bitcraft-local/test/css-ownership.test.mjs
git commit -m "feat(map): add native layer controls"
```

### Task 5: Atomic Ground and Water Tile Channels

**Files:**
- Modify: `apps/bitcraft-local/src/server/terrainTileRenderer.mjs`
- Modify: `apps/bitcraft-local/src/server/terrainTileStore.mjs`
- Modify: `apps/bitcraft-local/src/server/mapTiles.mjs`
- Modify: `apps/bitcraft-local/src/pages/map/terrainTileStatus.mjs`
- Modify: `apps/bitcraft-local/src/pages/map/NativeMap.tsx`
- Modify: `apps/bitcraft-local/server.mjs`
- Test: `apps/bitcraft-local/test/terrain-tile-renderer.test.mjs`
- Test: `apps/bitcraft-local/test/terrain-tile-store.test.mjs`
- Test: `apps/bitcraft-local/test/map-tiles.test.mjs`
- Test: `apps/bitcraft-local/test/terrain-tile-status.test.mjs`
- Test: `apps/bitcraft-local/test/deployment-runtime.test.mjs`

**Interfaces:**
- Changes `renderTerrainTile({ ..., style })`, where `style` is `"terrain" | "water"`.
- Changes the store encoder input to include `style`.
- Produces `mapTileUrl(style, generation)` for aligned same-origin tile layers.

- [ ] **Step 1: Write failing channel-alignment tests**

Decode fixture tiles with Sharp and assert:

```js
const ground = await renderTerrainTile({ ...fixtureRequest(), style: "terrain" });
const water = await renderTerrainTile({ ...fixtureRequest(), style: "water" });
assert.equal(groundPixelInGroundCell[3], 255);
assert.equal(waterPixelInGroundCell[3], 0);
assert.equal(groundPixelInOceanCell[3], 0);
assert.equal(waterPixelInOceanCell[3], 255);
```

Update store tests to require both `terrain` and `water` tiles under one manifest generation, and to prove an encoder failure in either channel retains the previous complete bundle. Update route/status tests for `/api/local/map/tiles/water/...` and `mapTileUrl("water", "42")`.

- [ ] **Step 2: Run focused backend tests and verify RED**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --test test/terrain-tile-renderer.test.mjs test/terrain-tile-store.test.mjs test/map-tiles.test.mjs test/terrain-tile-status.test.mjs test/deployment-runtime.test.mjs
```

Expected: FAIL because only `terrain` style is encoded/read/routed.

- [ ] **Step 3: Implement channel-aware rendering and storage**

Enumerate both styles for every coordinate:

```js
for (const style of ["terrain", "water"]) {
  tiles.push({ style, zoom, x, y });
}
```

Pass `style` through the encoder. In `renderTerrainTile`, return transparent pixels for water cells in the terrain channel and ground cells in the water channel. Permit only the two styles in `readTile` and the HTTP route. Record per-style counts/bytes in the manifest while retaining aggregate `tileCount` and `totalBytes`.

Replace `terrainTileUrl` with `mapTileUrl(style, generation)` plus a compatibility wrapper if existing callers/tests still require it. Create stable Leaflet `terrainTilesRef` and `waterTilesRef` layers, using Task 4 visibility without rebuilding them unnecessarily.

- [ ] **Step 4: Run focused tests and build**

Run the Step 2 command, then:

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: all channel, routing, atomicity, boundary, and build checks pass.

- [ ] **Step 5: Commit the channel slice**

```powershell
git add apps/bitcraft-local/src/server/terrainTileRenderer.mjs apps/bitcraft-local/src/server/terrainTileStore.mjs apps/bitcraft-local/src/server/mapTiles.mjs apps/bitcraft-local/src/pages/map/terrainTileStatus.mjs apps/bitcraft-local/src/pages/map/NativeMap.tsx apps/bitcraft-local/server.mjs apps/bitcraft-local/test/terrain-tile-renderer.test.mjs apps/bitcraft-local/test/terrain-tile-store.test.mjs apps/bitcraft-local/test/map-tiles.test.mjs apps/bitcraft-local/test/terrain-tile-status.test.mjs apps/bitcraft-local/test/deployment-runtime.test.mjs
git commit -m "feat(map): split terrain and water tiles"
```

### Task 6: Palette Version 3 Rich Detail

**Files:**
- Modify: `apps/bitcraft-local/src/server/terrainPalette.mjs`
- Modify: `apps/bitcraft-local/src/server/terrainTileRenderer.mjs`
- Modify: `apps/bitcraft-local/src/server/game-data/terrainRuntime.ts`
- Test: `apps/bitcraft-local/test/terrain-tile-renderer.test.mjs`
- Test: `apps/bitcraft-local/test/terrain-runtime.test.mjs`

**Interfaces:**
- Changes `TERRAIN_PALETTE_VERSION` from `2` to `3`.
- Extends `terrainCellRgba` with `mapX` and `mapZ` integer cell coordinates for deterministic texture.

- [ ] **Step 1: Write failing palette-v3 tests**

Assert version `3`; exact stable representative colours; darker deep water than shoreline water; stronger raised-vs-flat relief; and deterministic coordinate texture:

```js
const sample = { surface: "ground", biomeName: "Grasslands", elevation: 4,
  originalElevation: 4, biomeDensity: 70, relief: 6, mapX: 120, mapZ: 240 };
assert.deepEqual(terrainCellRgba(sample), terrainCellRgba(sample));
assert.notDeepEqual(terrainCellRgba(sample), terrainCellRgba({ ...sample, mapX: 123 }));
```

Add a runtime assertion that changing palette version changes the render hash even when Relay arrays are identical.

- [ ] **Step 2: Run palette/runtime tests and verify RED**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --test test/terrain-tile-renderer.test.mjs test/terrain-runtime.test.mjs
```

Expected: FAIL on palette version, texture variation, and version-aware render hash.

- [ ] **Step 3: Implement the palette and stable texture**

Use darker olive biome bases and navy water bases derived from the reference's visual hierarchy. Implement a small integer coordinate hash:

```js
function textureShade(mapX, mapZ, density) {
  let value = (Math.imul(mapX | 0, 73856093) ^ Math.imul(mapZ | 0, 19349663)) >>> 0;
  value = (value ^ (value >>> 13)) >>> 0;
  return Math.trunc(((value % 7) - 3) * clamp(density, 0, 100) / 100);
}
```

Keep its contribution within `-3…3` colour points. Increase shoreline lift and bounded directional relief without changing surface classification. Include `TERRAIN_PALETTE_VERSION` at the start of `terrainRenderHash` so a deployment palette change forces one new atomic bundle.

- [ ] **Step 4: Run focused tests and build**

Run the Step 2 command and the production build. Expected: PASS.

- [ ] **Step 5: Commit palette v3**

```powershell
git add apps/bitcraft-local/src/server/terrainPalette.mjs apps/bitcraft-local/src/server/terrainTileRenderer.mjs apps/bitcraft-local/src/server/game-data/terrainRuntime.ts apps/bitcraft-local/test/terrain-tile-renderer.test.mjs apps/bitcraft-local/test/terrain-runtime.test.mjs
git commit -m "feat(map): add palette v3 detail"
```

### Task 7: Full Verification, Live Tile Build, and Browser Acceptance

**Files:**
- Modify: `docs/research/native-map-live-coordinate-reference.md`
- Modify only if a discovered regression requires it: files already named in Tasks 1–6 and their focused tests.

**Interfaces:**
- Consumes all prior task outputs.
- Produces recorded acceptance evidence; does not enable unverified geometry.

- [ ] **Step 1: Run formatting/diff checks and the production build**

```powershell
git diff --check
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: no diff errors and a successful build.

- [ ] **Step 2: Run the full application suite**

```powershell
corepack pnpm --filter @workspace/bitcraft-local test
```

Expected: zero failed tests. Record total/pass/skip counts and command duration.

- [ ] **Step 3: Build one palette-v3 bundle with bounded collector time**

Start the smoke launcher in combined role only for the bundle build:

```powershell
$env:BITCRAFT_SMOKE_PROCESS_ROLE='all'
node scripts/start-bitcraft-local-smoke.mjs --force-restart
```

Monitor `/api/local/map/tiles/status` and `.codex-dev/bitcraft-local-smoke.err.log`. Stop after the configured build deadline or once the manifest reports palette version `3` with both tile channels. Never delete the last-good bundle manually.

- [ ] **Step 4: Return the smoke server to lean web role**

```powershell
$env:BITCRAFT_SMOKE_PROCESS_ROLE='web'
node scripts/start-bitcraft-local-smoke.mjs --force-restart
curl.exe -s http://127.0.0.1:18449/api/local/health
```

Expected: healthy preview server at port `18449`. Record working-set and private-memory measurements.

- [ ] **Step 5: Perform desktop browser acceptance**

Open/reload:

```text
http://127.0.0.1:18449/?page=map&label=Zephra&x=27361&z=23715&regionId=19
```

Verify terrain and water are visually distinct and richer; claim badges have no square canvas; available toggles independently add/remove layers; resources/enemies retain selections while hidden; roads/claim areas are disabled with the approved explanation; there are no map iframes, remote map images, console errors, or horizontal overflow.

- [ ] **Step 6: Perform 390 × 844 browser acceptance**

Use the in-app browser viewport override at exactly `390 × 844`. Verify the layer popover remains viewport-contained, toggle targets are touch-sized, the map remains usable, and document width equals client width. Reset the viewport afterward and leave the smoke map open for the user.

- [ ] **Step 7: Record evidence and review the complete change**

Update the coordinate reference with palette version, tile/channel counts, bytes, build duration, memory, browser viewport results, and the continuing road/claim-area evidence gates. Run a two-axis code review against commit `223b95d6`: documented standards and approved specification. Fix actionable findings with a new failing test and rerun the smallest affected checks.

- [ ] **Step 8: Re-run final checks after review fixes**

```powershell
git diff --check
corepack pnpm --filter @workspace/bitcraft-local run build
corepack pnpm --filter @workspace/bitcraft-local test
```

Expected: zero failures on final HEAD.

- [ ] **Step 9: Commit acceptance evidence**

```powershell
git add docs/research/native-map-live-coordinate-reference.md
git commit -m "test(map): verify rich layer acceptance"
```

Do not push. Report any still-gated live layers explicitly.
