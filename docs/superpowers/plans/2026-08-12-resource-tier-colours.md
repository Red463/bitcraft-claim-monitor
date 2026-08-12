# Resource Tier Colours Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Colour native-map resource nodes by their catalog tier with stable, selection-order-independent variations per resource type.

**Architecture:** Add a pure presentation helper that maps `(resourceId, tier)` to a deterministic colour from the existing tier palette. `MapPage` passes selected resource tier metadata to `NativeMap`, whose existing single canvas resolves a colour per resource point without changing subscription or marker architecture.

**Tech Stack:** React, TypeScript, Leaflet canvas layers, Node test runner, plain JavaScript presentation helpers.

## Global Constraints

- Use the existing tier badge colour families for tiers 1 through 10.
- Colour assignment must depend only on canonical resource ID and tier, never selection order.
- Same-tier resources should usually differ, but exact uniqueness is not required.
- Missing, invalid, and unsupported tiers use `rgba(87, 225, 151, 0.9)`.
- Enemy rendering, resource subscriptions, point size, stacking, culling, and level-of-detail behaviour remain unchanged.
- Do not add dependencies or per-point DOM markers.

---

### Task 1: Deterministic resource tier colour helper

**Files:**
- Create: `apps/bitcraft-local/src/pages/map/resourceNodeColours.mjs`
- Create: `apps/bitcraft-local/src/pages/map/resourceNodeColours.d.mts`
- Create: `apps/bitcraft-local/test/map-resource-node-colours.test.mjs`

**Interfaces:**
- Consumes: canonical decimal resource IDs and catalog tier values.
- Produces: `resourceNodeColour(resourceId: unknown, tier: unknown): string` and `RESOURCE_NODE_FALLBACK_COLOUR`.

- [ ] **Step 1: Write failing helper tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { RESOURCE_NODE_FALLBACK_COLOUR, resourceNodeColour } from "../src/pages/map/resourceNodeColours.mjs";

test("resource colours use stable tier families independent of selection order", () => {
  assert.equal(resourceNodeColour("28", 3), resourceNodeColour("28", 3));
  assert.notEqual(resourceNodeColour("28", 3), resourceNodeColour("54", 3));
  assert.notEqual(resourceNodeColour("28", 3), resourceNodeColour("28", 4));
});

test("resource colours fall back for missing or unsupported tiers", () => {
  assert.equal(resourceNodeColour("28", null), RESOURCE_NODE_FALLBACK_COLOUR);
  assert.equal(resourceNodeColour("28", 11), RESOURCE_NODE_FALLBACK_COLOUR);
  assert.equal(resourceNodeColour("not-an-id", 3), RESOURCE_NODE_FALLBACK_COLOUR);
});
```

- [ ] **Step 2: Run the helper tests and verify RED**

Run:

```powershell
node --test apps/bitcraft-local/test/map-resource-node-colours.test.mjs
```

Expected: FAIL because `resourceNodeColours.mjs` does not exist.

- [ ] **Step 3: Implement the fixed tier ranges and deterministic variation**

```js
export const RESOURCE_NODE_FALLBACK_COLOUR = "rgba(87, 225, 151, 0.9)";

const TIER_BASE_COLOURS = {
  1: [201, 209, 221], 2: [237, 149, 97], 3: [86, 255, 118],
  4: [122, 161, 255], 5: [217, 140, 227], 6: [252, 113, 128],
  7: [237, 196, 88], 8: [139, 243, 243], 9: [199, 199, 199],
  10: [222, 255, 255],
};
const VARIATIONS = [-24, -12, 0, 12, 24];

function canonicalDecimal(value) {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") return null;
  const text = String(value);
  if (!/^\d+$/.test(text)) return null;
  return BigInt(text).toString();
}

function clamp(channel) {
  return Math.max(0, Math.min(255, channel));
}

export function resourceNodeColour(resourceId, tier) {
  const canonicalId = canonicalDecimal(resourceId);
  const base = Number.isInteger(Number(tier)) ? TIER_BASE_COLOURS[Number(tier)] : null;
  if (!canonicalId || !base) return RESOURCE_NODE_FALLBACK_COLOUR;
  const offset = VARIATIONS[Number(BigInt(canonicalId) % BigInt(VARIATIONS.length))];
  return `rgba(${base.map((channel) => clamp(channel + offset)).join(", ")}, 0.92)`;
}
```

Keep the palette, canonicalizer, variation range, and clamp private except for the public colour function and fallback constant. The `BigInt` modulus makes the assignment stable for arbitrarily large decimal IDs, and leading-zero representations resolve identically.

- [ ] **Step 4: Run the helper tests and verify GREEN**

Run:

```powershell
node --test apps/bitcraft-local/test/map-resource-node-colours.test.mjs
```

Expected: all tests pass with no warnings.

- [ ] **Step 5: Commit the helper**

```powershell
git add -- apps/bitcraft-local/src/pages/map/resourceNodeColours.mjs apps/bitcraft-local/src/pages/map/resourceNodeColours.d.mts apps/bitcraft-local/test/map-resource-node-colours.test.mjs
git commit -m "feat(map): define stable resource tier colours"
```

### Task 2: Apply catalog tier colours to native resource points

**Files:**
- Modify: `apps/bitcraft-local/src/pages/MapPage.tsx`
- Modify: `apps/bitcraft-local/src/pages/map/NativeMap.tsx`
- Modify: `apps/bitcraft-local/test/map-page-boundary.test.mjs`

**Interfaces:**
- Consumes: `resourceNodeColour(resourceId, tier)` from Task 1 and `MapPage`'s existing selected resource catalog rows.
- Produces: `NativeMap` prop `resourceTiers: Record<string, number | null>` and per-point canvas colour resolution.

- [ ] **Step 1: Write failing renderer-boundary tests**

Add assertions proving that:

```js
assert.match(mapPage, /resourceTiers=\{selectedResourceTiers\}/);
assert.match(nativeMap, /resourceNodeColour/);
assert.match(nativeMap, /setPointColour/);
assert.match(nativeMap, /feature\.identity\?\.startsWith\("resource:"\)/);
```

Also assert that the enemy layer retains `rgba(255, 112, 112, 0.92)`.

- [ ] **Step 2: Run the boundary test and verify RED**

Run:

```powershell
node --test apps/bitcraft-local/test/map-page-boundary.test.mjs
```

Expected: FAIL because selected tier metadata and per-point colour resolution are absent.

- [ ] **Step 3: Pass selected tier metadata from `MapPage`**

Derive the map from canonical selected IDs and existing catalog rows:

```tsx
const selectedResourceTiers = React.useMemo(() => Object.fromEntries(selectedResourceIds.map((resourceId) => {
  const resource = resourceByToken.get(`resource:${resourceId}`);
  const tier = Number(resource?.tier);
  return [resourceId, Number.isInteger(tier) ? tier : null];
})), [selectedResourceIds.join(","), resourceByToken]);
```

Pass `resourceTiers={selectedResourceTiers}` to `NativeMap`.

- [ ] **Step 4: Make `DensePointLayer` resolve colours per point**

Add a point-colour resolver while retaining the single canvas:

```tsx
type PointColour = string | ((point: MapFeature) => string);

setPointColour(colour: PointColour) {
  this.#colour = colour;
  this.#scheduleDraw();
}

const colour = typeof this.#colour === "function" ? this.#colour(point) : this.#colour;
context.fillStyle = colour;
```

Before setting resource points, install a resolver that extracts the type ID from `resource:<id>` and calls `resourceNodeColour(resourceId, resourceTiers[resourceId])`. Keep the enemy layer's constant colour unchanged.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```powershell
node --test apps/bitcraft-local/test/map-resource-node-colours.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs
```

Expected: all focused tests pass.

- [ ] **Step 6: Run production verification**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: server/provider/bindings/client builds and runtime boundary checks pass.

- [ ] **Step 7: Restart and visually smoke-check the map**

Run:

```powershell
node scripts/start-bitcraft-local-smoke.mjs --restart
curl.exe -s http://127.0.0.1:18449/api/local/health
```

At `http://127.0.0.1:18449/?page=map`, select two same-tier resources and verify that their nodes remain in the same tier family while normally using distinct shades. Reorder selections and verify the colours do not change.

- [ ] **Step 8: Commit the integration**

```powershell
git add -- apps/bitcraft-local/src/pages/MapPage.tsx apps/bitcraft-local/src/pages/map/NativeMap.tsx apps/bitcraft-local/test/map-page-boundary.test.mjs
git commit -m "feat(map): colour resource nodes by tier"
```
