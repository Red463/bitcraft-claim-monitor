# Map Resource Colours, Icons, and Debug Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give tierless map resources stable distinguishable colours, include resource-description icons in the self-hosted asset set, and hide map diagnostics behind an off-by-default Debug information option in Layers.

**Architecture:** Compute final selected-resource colours once in `MapPage` from the complete normalized resource catalog, then pass a resource-ID-to-colour map through `NativeMap` to the packed canvas renderer. Extract icon catalog collection into a pure script helper so the existing vendor job can include normalized resource descriptions without adding runtime third-party requests. Extend the existing defensive map-layer preference with a non-rendering Debug information entry and gate both diagnostic panels and their accessibility-list construction in `NativeMap`.

**Tech Stack:** React 19, TypeScript, JavaScript ES modules, Leaflet canvas rendering, Node.js 24 test runner, plain CSS, self-hosted WebP game assets.

## Global Constraints

- Work only in `apps/bitcraft-local` and the approved design/plan documents.
- Preserve tiered resource colours and their deterministic within-tier variations.
- Preserve resource IDs as canonical decimal strings; never coerce them to JavaScript `Number` for identity or sorting.
- Tierless colour allocation must use the complete catalog and must not depend on resource selection order.
- Browsers must not contact Relay, BitJita, Prism, or another third-party asset host.
- Debug information defaults to off, persists locally, and controls presentation only.
- Do not run the local full suite, full build, icon-vendoring download, world generation, or dense benchmark on this PC.
- Run only named focused tests with `node --max-old-space-size=256`.
- Actual resource-icon acquisition must run in memory-bounded remote CI before deployment.

---

## File Structure

### Resource colour presentation

- Modify `apps/bitcraft-local/src/pages/map/resourceNodeColours.mjs` and `.d.mts`: retain tier colours and add deterministic catalog-wide tierless allocation.
- Modify `apps/bitcraft-local/src/pages/MapPage.tsx`: derive final colours from the complete resource catalog.
- Modify `apps/bitcraft-local/src/pages/map/NativeMap.tsx`: accept and forward final resource colours.
- Modify `apps/bitcraft-local/src/pages/map/PackedResourceCanvasLayer.ts`: consume final colours without knowing catalog tiers.
- Modify `apps/bitcraft-local/test/map-resource-node-colours.test.mjs` and `map-page-boundary.test.mjs`: lock colour behavior and wiring.

### Resource icon acquisition

- Create `apps/bitcraft-local/scripts/game-icon-catalog.mjs`: collect and deduplicate icon identities from catalog entities and resource descriptions.
- Modify `apps/bitcraft-local/scripts/vendor-relay-game-icons.mjs`: consume the pure collector.
- Create `apps/bitcraft-local/test/game-icon-catalog.test.mjs`: verify resource descriptions participate and shared paths deduplicate.
- Modify `apps/bitcraft-local/test/map-resource-finder-panel.test.mjs`: retain the `iconAssetName`/`ItemIcon` boundary.

### Debug display

- Modify `apps/bitcraft-local/src/pages/map/mapLayerPreferences.mjs` and `.d.mts`: add the persisted, default-off Debug information preference.
- Modify `apps/bitcraft-local/src/pages/map/NativeMap.tsx`: gate diagnostics and accessible canvas-point construction.
- Modify `apps/bitcraft-local/test/map-layer-preferences.test.mjs` and `map-page-boundary.test.mjs`: lock persistence, Layers placement, and render gating.

---

### Task 1: Deterministic Tierless Resource Colours

**Files:**
- Modify: `apps/bitcraft-local/src/pages/map/resourceNodeColours.mjs`
- Modify: `apps/bitcraft-local/src/pages/map/resourceNodeColours.d.mts`
- Modify: `apps/bitcraft-local/src/pages/MapPage.tsx`
- Modify: `apps/bitcraft-local/src/pages/map/NativeMap.tsx`
- Modify: `apps/bitcraft-local/src/pages/map/PackedResourceCanvasLayer.ts`
- Modify: `apps/bitcraft-local/test/map-resource-node-colours.test.mjs`
- Modify: `apps/bitcraft-local/test/map-page-boundary.test.mjs`

**Interfaces:**
- Consumes: a normalized catalog `Map` keyed by `resource:<decimal-id>`.
- Produces: `selectedResourceColourMap(resourceIds, catalogByToken): Record<string, string>`.
- Produces: `PackedResourceCanvasLayer.setResources(partitions, regions, colours)` where `colours` is `Readonly<Record<string, string>>`.

- [ ] **Step 1: Replace tier-map tests with final-colour tests**

Update `map-resource-node-colours.test.mjs` to import `selectedResourceColourMap` and add:

```js
const catalog = new Map([
  ["resource:700", { name: "Lost Shipment", tier: 0 }],
  ["resource:701", { name: "Lost Wreckage", tier: null }],
  ["resource:702", { name: "Lost Treasure", tier: "unknown" }],
  ["resource:28", { name: "Fallen Tree", tier: 3 }],
]);

const forward = selectedResourceColourMap(["700", "701", "702", "28"], catalog);
const reverse = selectedResourceColourMap(["28", "702", "701", "700"], catalog);

assert.deepEqual(forward, reverse);
assert.equal(new Set([forward["700"], forward["701"], forward["702"]]).size, 3);
assert.equal(forward["28"], resourceNodeColour("28", 3));
assert.equal(selectedResourceColourMap(["999"], catalog)["999"], RESOURCE_NODE_FALLBACK_COLOUR);
```

Keep existing exact tier-colour assertions. Change `resourceFeatureColour` tests to pass a final colour map. In `map-page-boundary.test.mjs`, replace `selectedResourceTierMap`, `resourceTiers`, and `setResources(...resourceTiers)` assertions with their `selectedResourceColourMap`/`resourceColours` equivalents.

- [ ] **Step 2: Run focused tests and confirm RED**

```powershell
node --max-old-space-size=256 --test apps/bitcraft-local/test/map-resource-node-colours.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs
```

Expected: FAIL because `selectedResourceColourMap` and final-colour wiring do not exist.

- [ ] **Step 3: Implement the pure allocator**

In `resourceNodeColours.mjs`, retain `resourceNodeColour(resourceId, tier)` for tiers 1–10. Add a decimal-string comparator (length, then lexical) and a tierless categorical sequence:

```js
const TIERLESS_BASE_HUE = 24;
const GOLDEN_ANGLE = 137.508;

function tierlessResourceColour(index) {
  const hue = (TIERLESS_BASE_HUE + index * GOLDEN_ANGLE) % 360;
  return `hsla(${hue.toFixed(1)}, 78%, 62%, 0.92)`;
}
```

Export:

```js
function compareCanonicalDecimal(left, right) {
  return left.length - right.length || left.localeCompare(right);
}

export function selectedResourceColourMap(resourceIds, catalogByToken) {
  const tierlessIds = new Set();
  const catalogEntries = typeof catalogByToken?.entries === "function"
    ? catalogByToken.entries()
    : [];
  for (const [token, row] of catalogEntries) {
    if (!String(token).startsWith("resource:")) continue;
    const resourceId = canonicalDecimal(String(token).slice("resource:".length));
    const tier = Number(row?.tier);
    if (resourceId && !(Number.isInteger(tier) && tier >= 1 && tier <= 10)) {
      tierlessIds.add(resourceId);
    }
  }
  const tierlessColours = new Map(
    [...tierlessIds]
      .sort(compareCanonicalDecimal)
      .map((resourceId, index) => [resourceId, tierlessResourceColour(index)]),
  );
  const selectedIds = [...new Set((resourceIds ?? [])
    .map(canonicalDecimal)
    .filter(Boolean))]
    .sort(compareCanonicalDecimal);
  const colours = {};
  for (const resourceId of selectedIds) {
    const row = catalogByToken?.get?.(`resource:${resourceId}`);
    const tier = Number(row?.tier);
    colours[resourceId] = Number.isInteger(tier) && tier >= 1 && tier <= 10
      ? resourceNodeColour(resourceId, tier)
      : tierlessColours.get(resourceId) ?? RESOURCE_NODE_FALLBACK_COLOUR;
  }
  return colours;
}

export function resourceFeatureColour(feature, resourceColours) {
  const identity = typeof feature?.identity === "string" ? feature.identity : "";
  if (!identity.startsWith("resource:")) return RESOURCE_NODE_FALLBACK_COLOUR;
  const resourceId = canonicalDecimal(identity.slice("resource:".length));
  return resourceId
    ? resourceColours?.[resourceId] ?? RESOURCE_NODE_FALLBACK_COLOUR
    : RESOURCE_NODE_FALLBACK_COLOUR;
}
```

Update `resourceNodeColours.d.mts` with these declarations:

```ts
type ResourceCatalogRow = { tier?: unknown };
type ResourceCatalogLookup = {
  entries(): IterableIterator<[string, ResourceCatalogRow]>;
  get(token: string): ResourceCatalogRow | undefined;
};

export function resourceFeatureColour(
  feature: { identity?: unknown } | null | undefined,
  resourceColours: Readonly<Record<string, string | undefined>> | null | undefined,
): string;
export function selectedResourceColourMap(
  resourceIds: readonly unknown[],
  catalogByToken: ResourceCatalogLookup | null | undefined,
): Record<string, string>;
```

- [ ] **Step 4: Wire final colours through the renderer**

In `MapPage.tsx`:

```tsx
const selectedResourceColours = React.useMemo(
  () => selectedResourceColourMap(selectedResourceIds, resourceByToken),
  [selectedResourceIds.join(","), resourceByToken],
);
```

Pass `resourceColours={selectedResourceColours}` to `NativeMap`. Rename the `NativeMap` prop and forward it to `resourcesRef.current?.setResources(...)`.

In `PackedResourceCanvasLayer.ts`, replace `#tiers` with `#colours`, update `setResources`, and resolve:

```ts
context.fillStyle = this.#colours[partition.resourceId] ?? RESOURCE_NODE_FALLBACK_COLOUR;
```

- [ ] **Step 5: Run focused tests and confirm GREEN**

```powershell
node --max-old-space-size=256 --test apps/bitcraft-local/test/map-resource-node-colours.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs
```

Expected: PASS, with exact tier colours unchanged and the three Lost resources distinct.

- [ ] **Step 6: Commit Task 1**

```powershell
git add -- apps/bitcraft-local/src/pages/map/resourceNodeColours.mjs apps/bitcraft-local/src/pages/map/resourceNodeColours.d.mts apps/bitcraft-local/src/pages/MapPage.tsx apps/bitcraft-local/src/pages/map/NativeMap.tsx apps/bitcraft-local/src/pages/map/PackedResourceCanvasLayer.ts apps/bitcraft-local/test/map-resource-node-colours.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs
git commit -m "fix(map): distinguish tierless resources"
```

---

### Task 2: Include Resource Descriptions in Self-Hosted Game Icons

**Files:**
- Create: `apps/bitcraft-local/scripts/game-icon-catalog.mjs`
- Modify: `apps/bitcraft-local/scripts/vendor-relay-game-icons.mjs`
- Create: `apps/bitcraft-local/test/game-icon-catalog.test.mjs`
- Modify: `apps/bitcraft-local/test/map-resource-finder-panel.test.mjs`

**Interfaces:**
- Consumes: snapshot data containing `entities: unknown[]` and `descriptions.resource: unknown[]`.
- Produces: `collectGameIconEntries(snapshot): Array<[browserPath: string, catalogKeys: string[]]>`, sorted and deduplicated.
- Browser behavior stays on `ItemIcon` and same-origin `/game-icons/`; no new API is introduced.

- [ ] **Step 1: Write the pure collector test**

Create `game-icon-catalog.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { collectGameIconEntries } from "../scripts/game-icon-catalog.mjs";

test("collector includes resource descriptions and deduplicates shared paths", () => {
  const entries = collectGameIconEntries({
    entities: [{ kind: "item", id: "42", iconAssetName: "Items/Shared" }],
    descriptions: { resource: [
      { kind: "resource", id: "700", iconAssetName: "GeneratedIcons/Other/LostShipment" },
      { kind: "resource", id: "701", iconAssetName: "Items/Shared" },
    ] },
  });
  assert.deepEqual(entries, [
    ["/game-icons/GeneratedIcons/Items/Shared.webp", ["item:42", "resource:701"]],
    ["/game-icons/GeneratedIcons/Other/LostShipment.webp", ["resource:700"]],
  ]);
});

test("collector rejects invalid identities and icon paths", () => {
  assert.deepEqual(collectGameIconEntries({
    entities: [{ kind: "item", id: "", iconAssetName: "Items/NoId" }],
    descriptions: { resource: [{ kind: "resource", id: "1", iconAssetName: "https://example.invalid/icon" }] },
  }), []);
});
```

Extend `map-resource-finder-panel.test.mjs` to assert `resourceIcon` preserves `iconAssetName` and still renders `<ItemIcon item={resourceIcon} />`.

- [ ] **Step 2: Run focused tests and confirm RED**

```powershell
node --max-old-space-size=256 --test apps/bitcraft-local/test/game-icon-catalog.test.mjs apps/bitcraft-local/test/map-resource-finder-panel.test.mjs apps/bitcraft-local/test/game-icon-resolver.test.mjs
```

Expected: FAIL because `scripts/game-icon-catalog.mjs` does not exist.

- [ ] **Step 3: Implement the collector**

Create `scripts/game-icon-catalog.mjs`:

```js
import { gameIconUrl } from "../src/utils/gameAssets.mjs";

function catalogKey(row) {
  const kind = String(row?.kind ?? "").trim();
  const id = String(row?.id ?? "").trim();
  return kind && /^\d+$/.test(id) ? `${kind}:${BigInt(id).toString()}` : null;
}

export function collectGameIconEntries(snapshot) {
  const rows = [
    ...(Array.isArray(snapshot?.entities) ? snapshot.entities : []),
    ...(Array.isArray(snapshot?.descriptions?.resource) ? snapshot.descriptions.resource : []),
  ];
  const identitiesByIconUrl = new Map();
  for (const row of rows) {
    const browserPath = gameIconUrl(row);
    const key = catalogKey(row);
    if (!browserPath || !key) continue;
    const keys = identitiesByIconUrl.get(browserPath) ?? new Set();
    keys.add(key);
    identitiesByIconUrl.set(browserPath, keys);
  }
  return [...identitiesByIconUrl.entries()]
    .map(([browserPath, keys]) => [browserPath, [...keys].sort()])
    .sort(([left], [right]) => left.localeCompare(right));
}
```

- [ ] **Step 4: Switch the vendor job to the collector**

Import `collectGameIconEntries` in `vendor-relay-game-icons.mjs` and replace its inline `snapshot.entities` loop with:

```js
const iconEntries = collectGameIconEntries(snapshot);
```

Keep concurrency, path validation, hashing, unavailable recording, and manifest output unchanged.

- [ ] **Step 5: Run focused tests and confirm GREEN**

```powershell
node --max-old-space-size=256 --test apps/bitcraft-local/test/game-icon-catalog.test.mjs apps/bitcraft-local/test/map-resource-finder-panel.test.mjs apps/bitcraft-local/test/game-icon-resolver.test.mjs
```

Expected: PASS. Do not run the vendor job locally.

- [ ] **Step 6: Commit Task 2**

```powershell
git add -- apps/bitcraft-local/scripts/game-icon-catalog.mjs apps/bitcraft-local/scripts/vendor-relay-game-icons.mjs apps/bitcraft-local/test/game-icon-catalog.test.mjs apps/bitcraft-local/test/map-resource-finder-panel.test.mjs
git commit -m "fix(map): vendor resource finder icons"
```

- [ ] **Step 7: Enforce the remote asset-acquisition gate before deployment**

Run in remote CI, not on this PC:

```powershell
node --max-old-space-size=512 apps/bitcraft-local/scripts/vendor-relay-game-icons.mjs --source-origin=https://bitjita.com
```

Verify every normalized resource description with a valid `iconAssetName` appears in either `assets` or `unavailable` in `apps/bitcraft-local/assets/game-icons-manifest.json`. Commit the generated WebP files and manifest before deployment.

---

### Task 3: Put Map Diagnostics Behind the Layers Debug Toggle

**Files:**
- Modify: `apps/bitcraft-local/src/pages/map/mapLayerPreferences.mjs`
- Modify: `apps/bitcraft-local/src/pages/map/mapLayerPreferences.d.mts`
- Modify: `apps/bitcraft-local/src/pages/map/NativeMap.tsx`
- Modify: `apps/bitcraft-local/test/map-layer-preferences.test.mjs`
- Modify: `apps/bitcraft-local/test/map-page-boundary.test.mjs`

**Interfaces:**
- Adds `MapLayerKey` value `"debug"` with label `"Debug information"`, default false, no data layer, and control `"diagnostic:map"`.

- [ ] **Step 1: Write failing preference and boundary tests**

Update `map-layer-preferences.test.mjs`:

```js
assert.equal(preferences.defaultMapLayerVisibility().debug, false);
assert.equal(preferences.parseMapLayerVisibility('{"claims":false}').debug, false);
assert.equal(preferences.parseMapLayerVisibility('{"debug":true}').debug, true);
assert.equal(JSON.parse(preferences.serializeMapLayerVisibility({ debug: true })).debug, true);
```

Update the expected key list to end with `"debug"`. In `map-page-boundary.test.mjs`, assert:

```js
assert.match(layers, /Debug information/);
assert.match(nativeMap, /const debugInformationVisible = layerVisibility\.debug === true/);
assert.match(nativeMap, /debugInformationVisible \? <div className="native-map-status"/);
assert.match(nativeMap, /debugInformationVisible && accessibleFeatures\.length/);
assert.match(nativeMap, /const accessibleFeatures = debugInformationVisible/);
```

- [ ] **Step 2: Run focused tests and confirm RED**

```powershell
node --max-old-space-size=256 --test apps/bitcraft-local/test/map-layer-preferences.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs
```

Expected: FAIL because `debug` is absent and diagnostics are unconditional.

- [ ] **Step 3: Add the preference definition**

Append to `MAP_LAYER_DEFINITIONS`:

```js
{ key: "debug", label: "Debug information", defaultVisible: false, dataLayer: null, control: "diagnostic:map", available: true, unavailableReason: null, selectionRequired: false },
```

Add `"debug"` to `MapLayerKey` in `mapLayerPreferences.d.mts`. Keep storage key `bitcraft-map-layers:v2`; the defensive parser adds false for existing saved objects without discarding other choices.

- [ ] **Step 4: Gate diagnostics and derived canvas-point data**

In `NativeMap.tsx`:

```tsx
const debugInformationVisible = layerVisibility.debug === true;
```

Run the existing `accessibleFeatures` calculation only when this is true; otherwise use an empty array. Wrap the complete `.native-map-status` panel in `debugInformationVisible ? ... : null`. Render `.native-map-accessible-points` only when both `debugInformationVisible` and `accessibleFeatures.length` are truthy. Do not alter fetching, subscriptions, warnings, or map rendering.

- [ ] **Step 5: Run focused tests and confirm GREEN**

```powershell
node --max-old-space-size=256 --test apps/bitcraft-local/test/map-layer-preferences.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs
```

Expected: PASS with Debug information in Layers, default off, persisted, and gating both panels.

- [ ] **Step 6: Commit Task 3**

```powershell
git add -- apps/bitcraft-local/src/pages/map/mapLayerPreferences.mjs apps/bitcraft-local/src/pages/map/mapLayerPreferences.d.mts apps/bitcraft-local/src/pages/map/NativeMap.tsx apps/bitcraft-local/test/map-layer-preferences.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs
git commit -m "feat(map): gate diagnostics behind debug layer"
```

---

## Final Focused Verification

- [ ] Run the complete focused set under the 256 MiB heap cap:

```powershell
node --max-old-space-size=256 --test apps/bitcraft-local/test/map-resource-node-colours.test.mjs apps/bitcraft-local/test/game-icon-catalog.test.mjs apps/bitcraft-local/test/game-icon-resolver.test.mjs apps/bitcraft-local/test/map-resource-finder-panel.test.mjs apps/bitcraft-local/test/map-layer-preferences.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs
```

Expected: all selected tests pass without an out-of-memory termination.

- [ ] Inspect repository integrity:

```powershell
git diff --check
git status --short
git log -4 --oneline
```

- [ ] Record skipped local checks and the release gates:

```text
Skipped locally because this PC previously crashed above 21 GiB Node memory:
- full application test suite
- full production build
- icon-vendoring download
- terrain/world generation
- dense resource benchmark

Required before deployment:
- remote CI build and full suite
- remote memory-bounded resource icon vendoring and manifest coverage check
- browser smoke of tierless colours, resource thumbnails, and Debug toggle
```
