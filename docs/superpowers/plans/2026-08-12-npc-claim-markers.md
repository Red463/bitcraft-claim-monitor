# NPC and Tier-Zero Claim Markers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retain typed Relay NPC starter towns, render them with the supplied NPC badge, display player claim tier zero as Tier 1, and reduce claim badges to 36px.

**Architecture:** Extend the existing regional-claim normalizer and provider-neutral map feature with an explicit `npc` boolean derived from the verified Relay `claim_local_state.building_description_id` for starter towns (`292245080`). Keep tier conversion in a pure presentation helper, then reuse the existing claim marker path and Claims layer with a locally hosted NPC image.

**Tech Stack:** TypeScript, JavaScript ESM helpers, React, Leaflet, plain CSS, Node test runner, typed SpacetimeDB Relay sessions.

## Global Constraints

- Classify a claim as NPC only when `claim_local_state.building_description_id` is `292245080`; retain existing filtering for all other neutral or owner-zero POIs.
- Preserve the underlying Relay tier; convert `0` to display tier `1` only in map presentation.
- NPC presentation takes precedence over tier presentation and uses `/map-icons/claims/claim_npc.png`.
- NPC claims remain in the existing Claims layer; do not add another toggle or subscription.
- Ordinary claim badges become 36px and retain no padding, border, background, or shadow.
- Preserve region, dimension, generation, schema, row-budget, and last-good behavior.

---

### Task 1: Retain and project Relay NPC claims

**Files:**
- Modify: `apps/bitcraft-local/test/relay-game-data-normalizers.test.mjs`
- Modify: `apps/bitcraft-local/src/server/game-data/normalizers.ts`
- Modify: `apps/bitcraft-local/test/map-snapshot.test.mjs`
- Modify: `apps/bitcraft-local/src/server/mapSnapshot.mjs`

**Interfaces:**
- Consumes: `claim_state.neutral`, `claim_state.owner_player_entity_id`, `claim_local_state.building_description_id`, and existing claim locations.
- Produces: normalized and map-feature field `npc: boolean`.

- [ ] **Step 1: Write failing normalizer expectations**

Extend the regional-claims fixture with a typed starter town (`Fernwick`, building description `292245080`) and a neutral cave (`Amberfall`, building description `790011334`). Expect only the starter town to be added:

```js
{
  entityId: "1369094286777412592",
  ownerPlayerEntityId: "0",
  ownerBuildingEntityId: "1369094286778488969",
  ownerPlayerUsername: null,
  name: "Fernwick",
  neutral: false,
  npc: true,
  supplies: 0,
  treasury: "0",
  numTiles: 0,
  tier: null,
  locationX: 120,
  locationZ: 240,
  locationDimension: "1",
}
```

Use these literal local fixtures:

```js
{
  entityId: 1369094286777412592n,
  supplies: 0,
  numTiles: 0,
  treasury: 0,
  buildingDescriptionId: 292245080,
  location: { x: 120, z: 240, dimension: 1n },
}, {
  entityId: 1369094286777412593n,
  supplies: 1,
  numTiles: 1,
  treasury: 2,
  buildingDescriptionId: 790011334,
  location: { x: 121, z: 241, dimension: 1n },
}
```

Add `npc: false` to ordinary claim expectations. Do not add an `Amberfall` expectation. Keep `coverage.missingOwnerUsernameCount` at `1`, proving NPC claims do not count as missing owner enrichment and neutral caves are not exposed as claims.

- [ ] **Step 2: Run the normalizer test and verify RED**

Run:

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/relay-game-data-normalizers.test.mjs
```

Expected: FAIL because the current ownership-based classifier exposes the neutral cave as an NPC town.

- [ ] **Step 3: Implement NPC classification in `normalizeRegionalClaims`**

Classify by the verified local building description before applying the existing neutral/owner-zero filter:

```ts
const npc = (local?.buildingDescriptionId ?? local?.building_description_id) === 292245080;
if ((ownerPlayerEntityId === "0" || row.neutral === true) && !npc) continue;
```

Only increment `missingOwnerUsernameCount` when `!npc && !ownerPlayerUsername`. Include `npc` on every normalized claim. Keep location, tier, ownership, sorting, and warnings unchanged.

- [ ] **Step 4: Run the normalizer test and verify GREEN**

Run the command from Step 2. Expected: all normalizer tests pass.

- [ ] **Step 5: Write a failing snapshot projection test**

Add `npc: true` to a region-claim fixture and assert:

```js
assert.equal(snapshot.layers.claims[0].npc, true);
```

- [ ] **Step 6: Run the snapshot test and verify RED**

Run:

```powershell
node --test apps/bitcraft-local/test/map-snapshot.test.mjs
```

Expected: FAIL because the feature projection does not copy `npc`.

- [ ] **Step 7: Project the provider-neutral field**

Extend the claim feature metadata in `buildMapSnapshot`:

```js
{
  regionId: String(row.regionId),
  name: row.name ?? "Claim",
  tier: row.tier ?? null,
  npc: row.npc === true,
}
```

- [ ] **Step 8: Run focused backend tests**

Run:

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/relay-game-data-normalizers.test.mjs apps/bitcraft-local/test/map-snapshot.test.mjs apps/bitcraft-local/test/region-claims-session.test.mjs
```

Expected: all focused backend tests pass.

- [ ] **Step 9: Commit the data projection**

```powershell
git add -- apps/bitcraft-local/src/server/game-data/normalizers.ts apps/bitcraft-local/src/server/mapSnapshot.mjs apps/bitcraft-local/test/relay-game-data-normalizers.test.mjs apps/bitcraft-local/test/map-snapshot.test.mjs
git commit -m "feat(map): retain npc claims"
```

### Task 2: Render NPC and tier-zero claim badges

**Files:**
- Add: `apps/bitcraft-local/public/map-icons/claims/claim_npc.png`
- Modify: `apps/bitcraft-local/test/map-marker-presentation.test.mjs`
- Modify: `apps/bitcraft-local/src/pages/map/mapMarkerPresentation.mjs`
- Modify: `apps/bitcraft-local/src/pages/map/mapMarkerPresentation.d.mts`
- Modify: `apps/bitcraft-local/src/pages/map/NativeMap.tsx`
- Modify: `apps/bitcraft-local/src/styles/map.css`
- Modify: `apps/bitcraft-local/test/map-page-boundary.test.mjs`

**Interfaces:**
- Consumes: `MapFeature.npc` and raw `MapFeature.tier` from Task 1.
- Produces: `claimDisplayTier(tier): number | null` and `claimMarkerPresentation(tier, npc): MapMarkerPresentation`.

- [ ] **Step 1: Write failing presentation tests**

Update the marker test imports and assertions:

```js
import { claimDisplayTier, claimMarkerPresentation } from "../src/pages/map/mapMarkerPresentation.mjs";

assert.equal(claimDisplayTier(0), 1);
assert.equal(claimDisplayTier(1), 1);
assert.equal(claimDisplayTier(10), 10);
assert.equal(claimDisplayTier(11), null);
assert.deepEqual(claimMarkerPresentation(0, false), {
  mode: "image",
  iconUrl: "/map-icons/claims/claim_t1.png",
  glyph: "I",
  badgeCrop: true,
});
assert.deepEqual(claimMarkerPresentation(null, true), {
  mode: "image",
  iconUrl: "/map-icons/claims/claim_npc.png",
  glyph: "NPC",
  badgeCrop: true,
});
```

- [ ] **Step 2: Run the marker test and verify RED**

Run:

```powershell
node --test apps/bitcraft-local/test/map-marker-presentation.test.mjs
```

Expected: FAIL because T0 and NPC presentations are absent.

- [ ] **Step 3: Implement display-tier and NPC presentation**

```js
export function claimDisplayTier(tier) {
  if (!Number.isInteger(tier) || tier < 0 || tier > 10) return null;
  return tier === 0 ? 1 : tier;
}

export function claimMarkerPresentation(tier, npc = false) {
  if (npc === true) return Object.freeze({
    mode: "image",
    iconUrl: "/map-icons/claims/claim_npc.png",
    glyph: "NPC",
    badgeCrop: true,
  });
  const displayTier = claimDisplayTier(tier);
  if (displayTier == null) return presentations.claim;
  return Object.freeze({
    mode: "image",
    iconUrl: `/map-icons/claims/claim_t${displayTier}.png`,
    glyph: CLAIM_TIER_GLYPHS[displayTier],
    badgeCrop: true,
  });
}
```

Update the declaration file with the new function and optional `npc` argument.

- [ ] **Step 4: Run the marker test and verify GREEN**

Run the command from Step 2. Expected: all marker tests pass.

- [ ] **Step 5: Copy and verify the supplied NPC asset**

Run:

```powershell
Copy-Item -LiteralPath 'C:\Users\Tom\Pictures\Bitcraft Calim Monitor\map icons\claim\claim_npc.png' -Destination 'apps\bitcraft-local\public\map-icons\claims\claim_npc.png'
Get-Item -LiteralPath 'apps\bitcraft-local\public\map-icons\claims\claim_npc.png' | Select-Object Name,Length
```

Expected: `claim_npc.png` exists and is non-empty. Do not alter the supplied bitmap.

- [ ] **Step 6: Wire NPC and display-tier labels into `NativeMap`**

Add `npc?: boolean` to `MapFeature`. Call `claimMarkerPresentation(feature.tier, feature.npc)` everywhere claims choose a presentation. Build the accessible suffix as:

```tsx
const claimLabel = feature.kind !== "claim"
  ? ""
  : feature.npc
    ? " · NPC town"
    : claimDisplayTier(feature.tier) != null
      ? ` · Tier ${claimDisplayTier(feature.tier)}`
      : "";
```

Use `claimLabel` in the tooltip/ARIA label so T0 says `Tier 1` and NPC says `NPC town`.

- [ ] **Step 7: Reduce and recrop claim badges**

Change `markerIcon` badge size from `40` to `36`. Update CSS:

```css
.native-map-marker--claim { width: 36px; height: 36px; }
.native-map-marker--claim .native-map-marker-content--badge-crop {
  width: 36px;
  height: 36px;
}
.native-map-marker--claim .native-map-marker-content--badge-crop img {
  inset: -6px;
  width: 48px;
  height: 48px;
}
```

Retain the existing zero padding/border/background/shadow and hexagonal clip path.

- [ ] **Step 8: Update marker boundary coverage**

Adjust the existing map boundary assertions to require:

```js
assert.match(nativeMap, /claimMarkerPresentation\(feature\.tier, feature\.npc\)/);
assert.match(nativeMap, /claimDisplayTier\(feature\.tier\)/);
assert.match(nativeMap, /feature\.npc\s*\?\s*" · NPC town"/);
assert.match(nativeMap, /badgeCrop\s*\?\s*36/);
assert.match(css, /native-map-marker--claim\s*\{[^}]*width:\s*36px;[^}]*height:\s*36px;/s);
assert.match(css, /native-map-marker-content--badge-crop\s*img\s*\{[^}]*width:\s*48px;[^}]*height:\s*48px;/s);
```

This is a focused static CSS/React boundary check; behavioral presentation logic remains covered by the real helper tests.

- [ ] **Step 9: Run focused frontend tests**

Run:

```powershell
node --test apps/bitcraft-local/test/map-marker-presentation.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs
```

Expected: all focused frontend tests pass.

- [ ] **Step 10: Run full verification**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
corepack pnpm --filter @workspace/bitcraft-local test
```

Expected: production build and full package tests pass with only the existing environment skips.

- [ ] **Step 11: Restart smoke and visually verify**

Run:

```powershell
node scripts/start-bitcraft-local-smoke.mjs --force-restart
curl.exe -s http://127.0.0.1:18449/api/local/health
```

Reload `http://127.0.0.1:18449/?page=map`. Verify claim badges are centred and slightly smaller. Confirm any collected NPC claims use the leaf badge and T0 claims use the T1 badge/label. If the active region has no fixture of a class, report that visual limitation and rely on its behavioral tests.

- [ ] **Step 12: Commit the renderer**

```powershell
git add -- apps/bitcraft-local/public/map-icons/claims/claim_npc.png apps/bitcraft-local/src/pages/map/mapMarkerPresentation.mjs apps/bitcraft-local/src/pages/map/mapMarkerPresentation.d.mts apps/bitcraft-local/src/pages/map/NativeMap.tsx apps/bitcraft-local/src/styles/map.css apps/bitcraft-local/test/map-marker-presentation.test.mjs apps/bitcraft-local/test/map-page-boundary.test.mjs
git commit -m "feat(map): render npc claim badges"
```
