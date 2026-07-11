# Personal Fishing Route View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each browser switch the Craft Planning Fishing board between Ocean Fish and Lake Fish quantities while both calculations deduct all interchangeable fish-oil stock and tracked outputs.

**Architecture:** Add a pure server-side projection that derives both route views from the authoritative plan, local catalog recipes, stock totals, and tracked crafts without changing the saved plan. Add a pure frontend board transformer that applies the browser-local preference, then expose it through a compact segmented control in the Needs Board.

**Tech Stack:** Node.js 24, React, TypeScript, plain CSS, Node test runner, SQLite-backed normalized game catalog.

## Global Constraints

- The preference is browser-local under `claim-monitor.planning.fishingRoute` and defaults to `ocean`.
- The preference must not mutate admin route overrides, craft-plan settings, or another user's view.
- Existing Fish Oil, Ocean Fish, Lake Fish, and tracked Fish Oil outputs must reduce one shared oil-equivalent deficit.
- Route conversion must use a positive guaranteed catalog yield; it must not infer from names or average probabilistic ranges.
- No user-entered quantities, gathering assignments, or shared reservations are included.
- Missing verified route data preserves the authoritative board and reports the selected view as unavailable.

---

## File Structure

- Modify `apps/bitcraft-local/src/server/craftPlanning.mjs`: derive route-neutral Fishing projections from planner inputs.
- Modify `apps/bitcraft-local/test/craft-planning.test.mjs`: verify stock, craft, yield, and failure behavior at the planner boundary.
- Create `apps/bitcraft-local/src/pages/craftPlanningFishingView.ts`: pure validation and Needs Board transformation for the personal preference.
- Create `apps/bitcraft-local/test/craft-planning-fishing-view.test.mjs`: focused frontend helper tests.
- Modify `apps/bitcraft-local/src/pages/CraftPlanningPage.tsx`: persist the preference, apply the transformer, and render the selector.
- Modify `apps/bitcraft-local/src/styles/craft-planning.css`: style the compact segmented control using existing planner controls.
- Modify `apps/bitcraft-local/test/craft-planning-boundary.test.mjs`: assert UI wiring and local persistence.

### Task 1: Produce Authoritative Fishing Route Projections

**Files:**
- Modify: `apps/bitcraft-local/src/server/craftPlanning.mjs`
- Test: `apps/bitcraft-local/test/craft-planning.test.mjs`

**Interfaces:**
- Consumes: `detailsByKey`, `availableTotals`, `activeTotals`, and the completed `materials` array inside `computeCraftPlan()`.
- Produces: `plan.personalViews.fishing` with this shape:

```js
{
  tiers: [{
    tier: 1,
    outputKey: "items:fish-oil-id",
    output: { key, id, kind, name, tag, tier },
    requiredOil: 766,
    availableOil: 10,
    trackedOil: 6,
    remainingOil: 750,
    routes: {
      ocean: {
        available: true,
        input: { key, id, kind, name, tag, tier },
        guaranteedYield: 3,
        stockQuantity: 30,
        trackedQuantity: 0,
        needed: 220
      },
      lake: {
        available: true,
        input: { key, id, kind, name, tag, tier },
        guaranteedYield: 1,
        stockQuantity: 60,
        trackedQuantity: 0,
        needed: 600
      }
    }
  }]
}
```

- The common deficit deducts oil-equivalent contributions from both fish routes before either `needed` value is calculated.

- [ ] **Step 1: Write failing planner tests for route-neutral stock accounting**

Add a fixture with one Fish Oil output and verified Ocean/Lake alternatives. Assert that Fish Oil stock, tracked Fish Oil, Ocean Fish stock, and Lake Fish stock all reduce the same deficit:

```js
test("computeCraftPlan exposes ocean and lake personal views from one oil-equivalent deficit", () => {
  const plan = computeCraftPlan({
    config: normalizeCraftPlanConfig({
      enabled: true,
      targets: [{ id: "oil", kind: "items", name: "Basic Fish Oil", quantity: 100, itemType: 0 }],
      sourceRules: { storageContainerIds: ["store"], craftPlayerIds: ["player"] },
    }),
    detailsByKey: fishingPreferenceDetails(),
    storageSources: [{ sourceId: "store", label: "Fishing", items: [
      { id: "oil", kind: "items", name: "Basic Fish Oil", quantity: 10 },
      { id: "ocean", kind: "items", name: "Briny Linus", quantity: 10 },
      { id: "lake", kind: "items", name: "Briny Argus", quantity: 10 },
    ] }],
    activeCrafts: [{ id: "craft", playerId: "player", itemId: "oil", kind: "items", name: "Basic Fish Oil", quantity: 5 }],
  });

  const tier = plan.personalViews.fishing.tiers[0];
  assert.equal(tier.remainingOil, 45); // 100 - 10 oil - 5 craft - 30 ocean equivalent - 10 lake equivalent
  assert.equal(tier.routes.ocean.needed, 15);
  assert.equal(tier.routes.lake.needed, 45);
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```sh
corepack pnpm --filter @workspace/bitcraft-local exec node --test test/craft-planning.test.mjs
```

Expected: FAIL because `personalViews.fishing` is not returned.

- [ ] **Step 3: Add guaranteed route-yield and route-family helpers**

Add focused helpers near the existing recipe helpers:

```js
function fishingRouteFamily(item) {
  const tag = String(item?.tag ?? "").toLowerCase();
  if (tag.includes("ocean fish")) return "ocean";
  if (tag.includes("lake fish")) return "lake";
  return null;
}

function guaranteedTargetYield(recipe, target) {
  const output = recipeOutputs(recipe).find((entry) => stackMatches(entry, target));
  const minimum = toNumber(output?.quantityMin ?? output?.minQuantity ?? output?.quantity);
  return Number.isFinite(minimum) && minimum > 0 ? minimum : 0;
}
```

Use catalog tags only to identify Ocean/Lake route families. Do not inspect concrete fish names.

- [ ] **Step 4: Implement `buildPersonalFishingView`**

Add these private helpers before the exported projection:

```js
function pickPlannerItem(item) {
  return Object.fromEntries(["key", "id", "kind", "itemType", "name", "tag", "tier", "iconAssetName"]
    .filter((key) => item?.[key] != null)
    .map((key) => [key, item[key]]));
}

function routeStock(route, totals) {
  const key = recipeKey(route.input.kind, route.input.id);
  return totals.get(key)?.total ?? 0;
}
```

Implement `normalizeFishingAlternatives(recipes, oil, detailsByKey, availableTotals, activeTotals)` to return exactly one verified `ocean` and one verified `lake` entry. Each entry contains `input`, `guaranteedYield`, `stockQuantity`, and `trackedQuantity`. Select the primary fish input from `recipeInputs(recipe)`, enrich it through `detailsByKey`, classify it through `fishingRouteFamily`, and discard routes whose verified yield is not positive.

Then add the pure projection helper with an explicit signature:

```js
export function buildPersonalFishingView({ materials, detailsByKey, availableTotals, activeTotals }) {
  return { tiers: fishOilMaterials.flatMap((oil) => {
    const alternatives = recipesForTarget(detailsByKey.get(oil.key), oil, detailsByKey);
    const routes = normalizeFishingAlternatives(alternatives, oil, availableTotals, activeTotals);
    if (!routes.ocean || !routes.lake) return [];
    const availableOilEquivalent = oil.available + oil.inProgress
      + routes.ocean.stockQuantity * routes.ocean.guaranteedYield
      + routes.ocean.trackedQuantity * routes.ocean.guaranteedYield
      + routes.lake.stockQuantity * routes.lake.guaranteedYield
      + routes.lake.trackedQuantity * routes.lake.guaranteedYield;
    const remainingOil = Math.max(0, oil.bufferedRequired - availableOilEquivalent);
    return [{
      tier: oil.tier,
      outputKey: oil.key,
      output: pickPlannerItem(oil),
      requiredOil: oil.bufferedRequired,
      availableOil: oil.available,
      trackedOil: oil.inProgress,
      remainingOil,
      routes: Object.fromEntries(Object.entries(routes).map(([family, route]) => [family, {
        ...route,
        needed: Math.ceil(remainingOil / route.guaranteedYield),
      }])),
    }];
  }) };
}
```

Avoid double-counting: `oil.available` and `oil.inProgress` represent Fish Oil only; fish contributions come from their own `availableTotals` and `activeTotals` keys.

- [ ] **Step 5: Return the projection from `computeCraftPlan()`**

Before returning the plan, derive:

```js
const personalViews = {
  fishing: buildPersonalFishingView({ materials, detailsByKey, availableTotals, activeTotals }),
};
```

Add `personalViews` to the returned object without changing `config`, `materials`, `steps`, or persisted route overrides.

- [ ] **Step 6: Add edge-case tests**

Cover:

```js
test("personal fishing view rounds preferred fish upward", ...);
test("personal fishing view clamps covered demand to zero", ...);
test("personal fishing view excludes a route with no positive guaranteed yield", ...);
test("personal fishing view uses completed uncollected fish-oil crafts", ...);
test("personal fishing view does not change saved route overrides", ...);
```

For invalid route data, assert the tier remains present with `routes.<family>.available === false` and a stable reason such as `"Verified route unavailable"`; do not synthesize a yield.

- [ ] **Step 7: Run planner tests**

Run:

```sh
corepack pnpm --filter @workspace/bitcraft-local exec node --test test/craft-planning.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit the backend projection**

```sh
git add apps/bitcraft-local/src/server/craftPlanning.mjs apps/bitcraft-local/test/craft-planning.test.mjs
git commit -m "Add personal fishing route projections"
```

### Task 2: Transform The Needs Board For A Personal Route

**Files:**
- Create: `apps/bitcraft-local/src/pages/craftPlanningFishingView.ts`
- Test: `apps/bitcraft-local/test/craft-planning-fishing-view.test.mjs`

**Interfaces:**
- Consumes: `NeedGroup[]`, preference `"ocean" | "lake"`, and `plan.personalViews.fishing`.
- Produces:

```ts
export type FishingRoutePreference = "ocean" | "lake";
export function normalizeFishingRoutePreference(value: unknown): FishingRoutePreference;
export function applyPersonalFishingView(
  board: NeedGroup[],
  view: PersonalFishingView | null | undefined,
  preference: FishingRoutePreference,
): { board: NeedGroup[]; available: boolean; reason: string | null };
```

- [ ] **Step 1: Write failing pure-helper tests**

Test that Ocean preference removes the Lake Fish row, inserts/updates Ocean Fish cells with projected quantities, and leaves Fish Oil, Baitfish, and Crushed Shells unchanged. Repeat for Lake preference.

```js
const result = applyPersonalFishingView(board, personalView, "lake");
const fishing = result.board.find((group) => group.section === "Fishing");
assert.equal(fishing.rows.some((row) => row.name === "Ocean Fish"), false);
assert.equal(fishing.rows.find((row) => row.name === "Lake Fish").cells.get("T1").missing, 45);
assert.ok(fishing.rows.find((row) => row.name === "Fish Oil"));
```

Also assert the input `board` is not mutated.

- [ ] **Step 2: Run the helper test and verify failure**

Run:

```sh
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/craft-planning-fishing-view.test.mjs
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement preference normalization**

```ts
export function normalizeFishingRoutePreference(value: unknown): FishingRoutePreference {
  return value === "lake" ? "lake" : "ocean";
}
```

- [ ] **Step 4: Implement immutable board transformation**

Clone only the Fishing group and affected rows. For each projected tier:

```ts
const projectedCell: NeedCell = {
  item: route.input,
  items: [route.input],
  name: route.input.name,
  missing: route.needed,
  required: route.needed + route.stockQuantity + route.trackedQuantity,
  available: route.stockQuantity,
  inProgress: route.trackedQuantity,
  plannedOutput: 0,
};
```

Use the canonical row name `Ocean Fish` or `Lake Fish`, retain `T1` through `T10`, remove the unselected interchangeable row, and recalculate Fishing group `required`, `covered`, and `completion` from its transformed cells.

- [ ] **Step 5: Implement safe unavailable behavior**

If the selected route is absent or `guaranteedYield <= 0`, return the original board reference with:

```ts
{ board, available: false, reason: "Verified Lake Fish route unavailable" }
```

Do not partially replace tiers or infer missing data.

- [ ] **Step 6: Run the helper tests**

Run:

```sh
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/craft-planning-fishing-view.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit the frontend calculation helper**

```sh
git add apps/bitcraft-local/src/pages/craftPlanningFishingView.ts apps/bitcraft-local/test/craft-planning-fishing-view.test.mjs
git commit -m "Add personal fishing board calculation"
```

### Task 3: Add The Ocean/Lake Selector To Craft Planning

**Files:**
- Modify: `apps/bitcraft-local/src/pages/CraftPlanningPage.tsx`
- Modify: `apps/bitcraft-local/src/styles/craft-planning.css`
- Modify: `apps/bitcraft-local/test/craft-planning-boundary.test.mjs`

**Interfaces:**
- Consumes: `applyPersonalFishingView`, `normalizeFishingRoutePreference`, `usePersistedState`.
- Produces: a browser-local segmented selector and transformed Needs Board.

- [ ] **Step 1: Add failing boundary assertions**

Add assertions that `CraftPlanningPage.tsx`:

```js
assert.match(page, /usePersistedState<.*FishingRoutePreference.*>\("planning\.fishingRoute", "ocean"\)/);
assert.match(page, /applyPersonalFishingView/);
assert.match(page, /Ocean/);
assert.match(page, /Lake/);
assert.match(page, /aria-label="Preferred fishing route"/);
```

Also assert the preference setter is not passed to any plan save or admin route mutation.

- [ ] **Step 2: Run the boundary test and verify failure**

Run:

```sh
corepack pnpm --filter @workspace/bitcraft-local exec node --test test/craft-planning-boundary.test.mjs
```

Expected: FAIL on missing selector wiring.

- [ ] **Step 3: Persist and apply the personal preference**

Import the existing hook and new helper:

```ts
const [fishingRoute, setFishingRoute] = usePersistedState<FishingRoutePreference>(
  "planning.fishingRoute",
  "ocean",
);
const normalizedFishingRoute = normalizeFishingRoutePreference(fishingRoute);
const personalBoard = React.useMemo(
  () => applyPersonalFishingView(needsBoard, plan?.personalViews?.fishing, normalizedFishingRoute),
  [needsBoard, plan?.personalViews?.fishing, normalizedFishingRoute],
);
```

Use `personalBoard.board` for section counts, filtering, and table rendering. Keep the original `needsBoard` as the authoritative fallback.

- [ ] **Step 4: Render the segmented control**

Place it in the Needs Board toolbar, visible whenever the Fishing group exists:

```tsx
<div className="craft-plan-fishing-route" role="group" aria-label="Preferred fishing route">
  <span>Fishing route</span>
  <button type="button" className={normalizedFishingRoute === "ocean" ? "active" : ""} onClick={() => setFishingRoute("ocean")}>Ocean</button>
  <button type="button" className={normalizedFishingRoute === "lake" ? "active" : ""} onClick={() => setFishingRoute("lake")}>Lake</button>
</div>
```

When `personalBoard.available` is false, keep both buttons usable and render `personalBoard.reason` as muted text beside the control; the table remains authoritative and unchanged.

- [ ] **Step 5: Add compact operational-dashboard CSS**

Use a stable segmented layout that does not resize the table:

```css
.craft-plan-fishing-route {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}

.craft-plan-fishing-route > span {
  color: var(--text-muted);
  font-size: 0.75rem;
}

.craft-plan-fishing-route button {
  min-width: 64px;
  min-height: 30px;
}
```

Reuse existing filter-button border, active, focus-visible, and disabled colors rather than introducing a new palette. At narrow widths, allow the control to wrap below the activity chips without horizontal overflow.

- [ ] **Step 6: Run focused frontend tests**

Run:

```sh
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/craft-planning-fishing-view.test.mjs test/craft-planning-needs-board.test.mjs test/craft-planning-boundary.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Run production build and full tests**

Run:

```sh
corepack pnpm --filter @workspace/bitcraft-local run build
corepack pnpm --filter @workspace/bitcraft-local test
```

Expected: build succeeds and the complete test suite passes.

- [ ] **Step 8: Browser-check both preferences**

Run:

```powershell
node scripts/start-bitcraft-local-smoke.mjs --restart
```

Open `http://127.0.0.1:18449/?page=planning` and verify:

- Ocean is selected by default.
- Switching to Lake replaces only the interchangeable raw-fish row.
- Fish Oil and unrelated Fishing rows remain.
- Refresh preserves the selection.
- The selector wraps cleanly at narrow viewport widths.
- Changing the selector does not trigger a plan PUT request.

- [ ] **Step 9: Commit the UI integration**

```sh
git add apps/bitcraft-local/src/pages/CraftPlanningPage.tsx apps/bitcraft-local/src/styles/craft-planning.css apps/bitcraft-local/test/craft-planning-boundary.test.mjs
git commit -m "Add personal fishing route selector"
```

## Final Verification

- [ ] Confirm `git diff --check` reports no whitespace errors.
- [ ] Confirm no changelog or package version change was made because this is not yet a push/release request.
- [ ] Confirm the implementation does not add a server mutation endpoint or database migration.
- [ ] Confirm untracked `.codex-temp/`, `.codex/`, and `.superpowers/` directories remain untouched.
