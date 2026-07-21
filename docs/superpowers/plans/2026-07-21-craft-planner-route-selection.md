# Craft Planner Acquisition Route Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the independent gathered toggle and ambiguous recipe dropdown with globally reusable acquisition-route cards and player-friendly work estimates for every planner item and cargo route.

**Architecture:** Keep recipe IDs and the existing `routeOverrides` persistence contract, but stop all planner calculations from consulting the legacy `gatheredItemKeys` field. Enrich each route alternative with the metadata needed for comparison, centralise route labels and work metrics in a small pure presentation module, and render an accessible card chooser that refreshes the open detail modal after selection.

**Tech Stack:** React 19, TypeScript 5.9, plain CSS, Node.js 24 built-in test runner, Node HTTP server, SQLite-backed catalogue, ExcelJS.

## Global Constraints

- Apply the behaviour to all item and cargo routes; Gypsite is only a representative fixture.
- The selected recipe route is the sole authority for gathering, crafting, processing, byproduct, prospecting, and logistics behaviour.
- Do not add a manual-supply route.
- Preserve recipe identifiers, `routeOverrides`, and item-versus-cargo identity.
- Keep `gatheredItemKeys` readable for legacy configuration compatibility, but do not let it affect catalogue traversal, calculation, or presentation.
- Lead finite gathering routes with whole full-node counts calculated from the remaining shortage; retain exact expected values in `Show calculation`.
- Never present a small non-zero probabilistic yield as zero.
- Prospecting must not show full-node estimates.
- Unavailable probability data must not be presented as zero.
- Use `full node` and `node equivalents` in player-facing copy while retaining internal `expectedPerResource` compatibility fields.
- Keep route cards dense, wrapped, keyboard accessible, and free of horizontal scrolling.
- Do not add dependencies or alter unrelated Craft Planning behaviour.

---

## File Structure

- Create `apps/bitcraft-local/src/pages/craftPlanningRoutePresentation.mjs`: pure route classification, labels, and raw player-facing metrics shared by React and tests.
- Create `apps/bitcraft-local/src/pages/craftPlanningRoutePresentation.d.mts`: TypeScript declarations for the presentation module.
- Create `apps/bitcraft-local/src/pages/CraftPlanningRouteChooser.tsx`: accessible acquisition-route cards with read-only and pending states.
- Create `apps/bitcraft-local/test/craft-planning-route-presentation.test.mjs`: direct unit coverage for route labels and work metrics.
- Delete `apps/bitcraft-local/src/pages/craftPlanningGatheredOverrides.ts`: the removed toggle's UI-only state helper is no longer used.
- Delete `apps/bitcraft-local/test/craft-planning-gathered-overrides.test.mjs`: obsolete tests for the removed UI control.
- Modify `apps/bitcraft-local/src/server/craftPlanning.mjs`: ignore legacy gathered overrides during catalogue traversal/calculation and expose complete alternative-route metadata.
- Modify `apps/bitcraft-local/server.mjs`: stop passing gathered overrides into catalogue detail traversal.
- Modify `apps/bitcraft-local/src/pages/CraftPlanningPage.tsx`: remove the gathered control, use the route chooser, keep the modal open after saving, and render friendly summaries plus technical disclosure.
- Modify `apps/bitcraft-local/src/styles/craft-planning.css`: card chooser, primary metrics, disclosure, wrapping, and responsive states.
- Modify `apps/bitcraft-local/src/server/probabilityWorkbook.mjs`: rename public full-resource wording to full-node wording.
- Modify `apps/bitcraft-local/test/craft-planning.test.mjs`: backend route authority, alternative metadata, and legacy compatibility tests.
- Modify `apps/bitcraft-local/test/craft-planning-boundary.test.mjs`: UI structure/copy and workbook terminology boundaries.
- Modify `apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs`: no-horizontal-scroll and route-card state boundaries.
- Modify `apps/bitcraft-local/test/probability-workbook.test.mjs`: workbook full-node headings and definitions.

### Task 1: Make the selected recipe route authoritative

**Files:**
- Modify: `apps/bitcraft-local/src/server/craftPlanning.mjs:734-916,1134-1255,1520-1690`
- Modify: `apps/bitcraft-local/server.mjs:2379-2388`
- Test: `apps/bitcraft-local/test/craft-planning.test.mjs:450-590,1525-1640,2940-2970`
- Test: `apps/bitcraft-local/test/craft-planning-boundary.test.mjs:230-350`

**Interfaces:**
- Consumes: existing `routeOverrides: Record<string, string>` and legacy `gatheredItemKeys: string[]` from `normalizeCraftPlanConfig`.
- Produces: planner output where `routeOverrides` alone selects known routes; `gatheredItemKeys` is retained in normalized configuration but ignored by catalogue traversal and `computeCraftPlan`.
- Produces: each `alternatives[]` entry with `routeType`, `gatheringMode`, `gatheringSource`, `producer`, `producerRecipe`, `expectedPerCraft`, `expectedPerProgress`, `expectedPerResource`, `resourceHealth`, `actionsRequired`, `probabilityStatus`, `isTransportRoute`, `buildingName`, and `inputs`.

- [ ] **Step 1: Replace gathered-override behaviour tests with route-authority tests**

Add a test that deliberately supplies a stale gathered key and a valid route override:

```js
test("computeCraftPlan ignores legacy gathered overrides and follows the selected route", () => {
  const key = recipeKey("items", "600");
  const detailsByKey = new Map([[key, {
    item: { id: "600", itemType: 0, name: "Rough Stone Carvings" },
    craftingRecipes: [{
      id: "carve-stone",
      name: "Carve Rough Stone Carvings",
      buildingName: "Scholar Station",
      actionsRequired: 4,
      craftedItemStacks: [{ item_id: "600", item_type: "item", quantity: 2 }],
      consumedItemStacks: [{ item_id: "601", item_type: "item", quantity: 3 }],
      consumedItems: [{ id: "601", itemType: 0, name: "Rough Stone" }],
    }],
  }]]);
  const plan = computeCraftPlan({
    config: normalizeCraftPlanConfig({
      enabled: true,
      targets: [{ id: "600", kind: "items", itemType: 0, name: "Rough Stone Carvings", quantity: 5 }],
      gatheredItemKeys: [key],
      routeOverrides: { [key]: "carve-stone" },
    }),
    detailsByKey,
  });

  assert.equal(plan.steps[0].selectedRecipeId, "carve-stone");
  assert.equal(plan.materials.find((item) => item.key === key)?.isGatheredOverride, false);
  assert.equal(plan.materials.find((item) => item.key === key)?.sourceRoutes.length, 1);
});
```

Keep the audit and normalization tests because legacy plans and audit rows must remain readable. Replace the route-suppression tests with these assertions:

```js
test("legacy gathered overrides do not change retained route resolution", () => {
  const key = recipeKey("items", "600");
  const shared = {
    enabled: true,
    targets: [{ id: "600", kind: "items", itemType: 0, name: "Rough Stone Carvings", quantity: 5 }],
    routeOverrides: { [key]: "unpack-carvings" },
  };
  const withLegacyKey = computeCraftPlan({ config: normalizeCraftPlanConfig({ ...shared, gatheredItemKeys: [key] }), detailsByKey });
  const withoutLegacyKey = computeCraftPlan({ config: normalizeCraftPlanConfig({ ...shared, gatheredItemKeys: [] }), detailsByKey });

  assert.equal(withLegacyKey.steps[0].selectedRecipeId, "unpack-carvings");
  assert.equal(withoutLegacyKey.steps[0].selectedRecipeId, "unpack-carvings");
  assert.equal(withLegacyKey.materials.some((item) => item.key === recipeKey("cargo", "601")), true);
});

test("legacy gathered overrides do not suppress personal fishing routes", () => {
  const key = recipeKey("items", "1900");
  const plan = computeCraftPlan({
    config: normalizeCraftPlanConfig({
      enabled: true,
      targets: [{ id: "1900", kind: "items", itemType: 0, name: "Basic Fish Oil", quantity: 10 }],
      gatheredItemKeys: [key],
    }),
    detailsByKey: fishingPreferenceDetails(),
  });
  assert.equal(Object.values(plan.personalViews.fishing.tiers[0].routes).some((route) => route.available), true);
});
```

- [ ] **Step 2: Run the focused backend test and confirm the red state**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test --test-name-pattern="ignores legacy gathered overrides" test/craft-planning.test.mjs
```

Expected: FAIL because `computeCraftPlan` currently returns no steps for a gathered key.

- [ ] **Step 3: Stop catalogue traversal and calculation from consulting gathered keys**

Keep `normalizeCraftPlanConfig` accepting the legacy field, but make it inert:

```js
export function collectLocalCatalogCraftPlanDetails(
  repository,
  targets,
  routeOverrides = {},
  maxDepth = 64,
  _legacyGatheredItemKeys = [],
  { requireValidatedProbabilities = false } = {},
) {
  const detailsByKey = new Map();
  const warnings = new Set();
  const byproductsByProducerKey = new Map();
  const visiting = new Set();
  const completed = new Set();
```

Delete the `if (gatheredKeys.has(key))` early return in `visit`. In `computeCraftPlan`, use an empty set for all downstream calls and expose `isGatheredOverride: false` on materials:

```js
const gatheredItemKeys = new Set();
```

In `apps/bitcraft-local/server.mjs`, stop passing plan configuration into the obsolete parameter:

```js
const { detailsByKey, warnings: catalogWarnings } = collectLocalCatalogCraftPlanDetails(
  gameCatalogRepository,
  catalogTargets,
  config.routeOverrides,
  64,
  [],
  { requireValidatedProbabilities: true },
);
```

- [ ] **Step 4: Add complete metadata to every route alternative**

Extend `routeMetadata` with actions required:

```js
const actionsRequired = Math.max(1, toNumber(recipe?.actionsRequired ?? recipe?.actions_required) || 1);
```

Return `actionsRequired` with the existing metadata. Ensure both alternative builders spread `routeMetadata(recipe, normalizedTarget)` before adding their inputs and building name. Extend each `gatheringSources` entry with route-specific values:

```js
{
  id: recipeId(recipe),
  label: recipe.gatheringSource?.label ?? recipe.producer?.tag ?? recipe.producer?.name ?? "Gathering",
  tag: recipe.gatheringSource?.tag ?? recipe.producer?.tag ?? null,
  expectedYield: toNumber(recipe.expectedYield),
  expectedPerProgress: routeMetadata(recipe, normalizedTarget).expectedPerProgress,
  expectedPerResource: routeMetadata(recipe, normalizedTarget).expectedPerResource,
  resourceHealth: routeMetadata(recipe, normalizedTarget).resourceHealth,
  probabilityStatus: routeMetadata(recipe, normalizedTarget).probabilityStatus,
}
```

- [ ] **Step 5: Add assertions for global alternative metadata**

Extend the existing Sand/Clay Output fixture to assert distinct alternatives:

```js
assert.deepEqual(
  route.alternatives.map((alternative) => [
    alternative.id,
    alternative.gatheringSource.label,
    alternative.routeType,
    alternative.expectedPerProgress,
    alternative.expectedPerResource,
    alternative.resourceHealth,
  ]),
  [
    ["gathering-output:items:5002", "Sand", "gathering-byproduct", 0.02, null, null],
    ["gathering-output:items:5001", "Clay", "gathering-byproduct", 0.02, null, null],
  ],
);
```

- [ ] **Step 6: Run the backend and boundary tests**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/craft-planning.test.mjs test/craft-planning-boundary.test.mjs
```

Expected: PASS with no gathered override suppressing a known route.

- [ ] **Step 7: Commit the authoritative-route backend change**

```powershell
git add apps/bitcraft-local/src/server/craftPlanning.mjs apps/bitcraft-local/server.mjs apps/bitcraft-local/test/craft-planning.test.mjs apps/bitcraft-local/test/craft-planning-boundary.test.mjs
git commit -m "fix: make planner routes authoritative"
```

### Task 2: Centralise route labels and work metrics

**Files:**
- Create: `apps/bitcraft-local/src/pages/craftPlanningRoutePresentation.mjs`
- Create: `apps/bitcraft-local/src/pages/craftPlanningRoutePresentation.d.mts`
- Create: `apps/bitcraft-local/test/craft-planning-route-presentation.test.mjs`

**Interfaces:**
- Produces: `acquisitionRouteKind(route): "Gathering" | "Gathering byproduct" | "Prospecting" | "Crafting" | "Craft byproduct" | "Logistics"`.
- Produces: `acquisitionRouteLabel(route, output): string`.
- Produces: `acquisitionRouteMetrics(route, options): AcquisitionRouteMetrics` where `options` contains `missingQuantity` and `multiplier`.
- Consumed later by: `CraftPlanningRouteChooser.tsx` and `CraftPlanningPage.tsx`.

- [ ] **Step 1: Write failing presentation tests for all route kinds**

Create `apps/bitcraft-local/test/craft-planning-route-presentation.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import {
  acquisitionRouteKind,
  acquisitionRouteLabel,
  acquisitionRouteMetrics,
} from "../src/pages/craftPlanningRoutePresentation.mjs";

const gypsite = { id: "3001", name: "Rough Gypsite", kind: "items" };

test("gathering labels use the source node instead of a generic recipe label", () => {
  const route = {
    id: "mud-route",
    label: "Recipe -> Rough Gypsite",
    routeType: "gathering-byproduct",
    gatheringSource: { label: "Mud Mound" },
    producer: { name: "Rough Clay Output" },
  };
  assert.equal(acquisitionRouteKind(route), "Gathering byproduct");
  assert.equal(acquisitionRouteLabel(route, gypsite), "Gather byproduct from Mud Mound while collecting Rough Clay Output");
});

test("craft and logistics labels expose inputs, station, and transport intent", () => {
  assert.equal(acquisitionRouteLabel({
    routeType: "craft",
    label: "Recipe -> Rough Gypsite",
    buildingName: "Masonry Station",
    inputs: [{ name: "Rough Brick" }, { name: "Water" }],
  }, gypsite), "Rough Brick + Water -> Rough Gypsite at Masonry Station");
  assert.equal(acquisitionRouteKind({ routeType: "craft", isTransportRoute: true }), "Logistics");
  assert.equal(acquisitionRouteLabel({
    routeType: "craft",
    isTransportRoute: true,
    label: "Unpack Rough Gypsite Package",
  }, gypsite), "Unpack Rough Gypsite Package");
});

test("finite gathering metrics lead with whole nodes and preserve exact work", () => {
  assert.deepEqual(acquisitionRouteMetrics({
    routeType: "gathering-byproduct",
    probabilityStatus: "expected",
    expectedPerProgress: 0.0024,
    expectedPerResource: 2.4,
    resourceHealth: 1000,
  }, { missingQuantity: 73, multiplier: 1 }), {
    status: "available",
    basis: "node",
    expectedPerUnit: 2.4,
    exactUnits: 30.416666666666668,
    plannedUnits: 31,
    totalProgress: 30417,
    progressPerExpectedItem: 416.6666666666667,
    totalActions: null,
  });
});

test("zero shortage, prospecting, crafting, and unavailable rates remain honest", () => {
  assert.equal(acquisitionRouteMetrics({ routeType: "gathering", expectedPerResource: 2, expectedPerProgress: 0.002, resourceHealth: 1000 }, { missingQuantity: 0 }).plannedUnits, 0);
  assert.equal(acquisitionRouteMetrics({ routeType: "gathering", gatheringMode: "prospecting", expectedPerProgress: 0.04 }, { missingQuantity: 8 }).basis, "progress");
  assert.deepEqual(acquisitionRouteMetrics({ routeType: "craft", expectedPerCraft: 3.02, actionsRequired: 5, probabilityStatus: "expected" }, { missingQuantity: 10, multiplier: 1.1 }), {
    status: "available",
    basis: "craft",
    expectedPerUnit: 3.02,
    exactUnits: 3.6423841059602653,
    plannedUnits: 4,
    totalProgress: null,
    progressPerExpectedItem: null,
    totalActions: 20,
  });
  assert.equal(acquisitionRouteMetrics({ routeType: "craft", probabilityStatus: "unavailable" }, { missingQuantity: 10 }).status, "unavailable");
});
```

- [ ] **Step 2: Run the new unit test and confirm the missing-module failure**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/craft-planning-route-presentation.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the pure presentation module**

Create helpers that normalize numbers and names, then export the three public functions. The metric implementation must use these formulas:

```js
const needed = Math.max(0, Number(options.missingQuantity) || 0);
const multiplier = Math.max(1, Number(options.multiplier) || 1);
const bufferedNeed = route.probabilityStatus === "expected" || route.isProbabilistic === true
  ? needed * multiplier
  : needed;

const exactUnits = bufferedNeed / expectedPerUnit;
const plannedUnits = Math.ceil(exactUnits);
```

For finite gathering, set `expectedPerUnit = expectedPerResource`, `totalProgress = Math.ceil(exactUnits * resourceHealth)`, and `progressPerExpectedItem = 1 / expectedPerProgress`. For prospecting, use progress as the basis and never return node counts. For crafting, use `expectedPerCraft` and set `totalActions = plannedUnits * actionsRequired`. Return `{ status: "unavailable" }` without work fields when probability status is unavailable.

The label implementation must reject generic labels matching `/^Recipe(?:\s*->|$)/i`, prefer gathering-source metadata for gathering, prefer concrete non-generic recipe names for crafting, and append `at {station}` once.

- [ ] **Step 4: Add TypeScript declarations**

Create `craftPlanningRoutePresentation.d.mts` with the exact public shape:

```ts
export type AcquisitionRouteMetrics = {
  status: "available" | "unavailable";
  basis?: "node" | "progress" | "craft";
  expectedPerUnit?: number;
  exactUnits?: number;
  plannedUnits?: number;
  totalProgress?: number | null;
  progressPerExpectedItem?: number | null;
  totalActions?: number | null;
};

export function acquisitionRouteKind(route: Record<string, unknown>): "Gathering" | "Gathering byproduct" | "Prospecting" | "Crafting" | "Craft byproduct" | "Logistics";
export function acquisitionRouteLabel(route: Record<string, unknown>, output?: Record<string, unknown>): string;
export function acquisitionRouteMetrics(route: Record<string, unknown>, options?: { missingQuantity?: number; multiplier?: number }): AcquisitionRouteMetrics;
```

- [ ] **Step 5: Run the presentation test and app build**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/craft-planning-route-presentation.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: both PASS.

- [ ] **Step 6: Commit the shared presentation model**

```powershell
git add apps/bitcraft-local/src/pages/craftPlanningRoutePresentation.mjs apps/bitcraft-local/src/pages/craftPlanningRoutePresentation.d.mts apps/bitcraft-local/test/craft-planning-route-presentation.test.mjs
git commit -m "feat: add planner route presentation model"
```

### Task 3: Replace the gathered toggle and dropdown with route cards

**Files:**
- Create: `apps/bitcraft-local/src/pages/CraftPlanningRouteChooser.tsx`
- Delete: `apps/bitcraft-local/src/pages/craftPlanningGatheredOverrides.ts`
- Delete: `apps/bitcraft-local/test/craft-planning-gathered-overrides.test.mjs`
- Modify: `apps/bitcraft-local/src/pages/CraftPlanningPage.tsx:1-75,90-110,185-375,470-535`
- Test: `apps/bitcraft-local/test/craft-planning-boundary.test.mjs:90-125,230-250`

**Interfaces:**
- Consumes: `acquisitionRouteKind`, `acquisitionRouteLabel`, and `acquisitionRouteMetrics` from Task 2.
- Produces: `CraftPlanningRouteChooser` with props `{ routes, selectedRecipeId, output, missingQuantity, multiplier, canManage, pendingRecipeId, onSelect }`.
- Produces: route saves that keep `selectedNeed` open and refresh both the plan and detail data.

- [ ] **Step 1: Make boundary tests require the chooser and forbid the old control**

Update the Craft Planning boundary test:

```js
assert.match(page, /<CraftPlanningRouteChooser/);
assert.match(page, /Choose acquisition route/);
assert.match(page, /routeSavePendingId/);
assert.match(page, /await openNeedDetail\(openCell\)/);
assert.doesNotMatch(page, /Treat this cell as gathered/);
assert.doesNotMatch(page, /craft-plan-gathered-control/);
assert.doesNotMatch(page, /saveGatheredOverride/);
assert.doesNotMatch(page, /setCellGathered/);
```

Retain the boundary assertion that `CraftPlanManagerDialog` accepts `gatheredItemKeys` in its configuration type for backwards-compatible reads. It has no gathered-setting control to remove.

- [ ] **Step 2: Run the boundary test and confirm it fails**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/craft-planning-boundary.test.mjs
```

Expected: FAIL because the page still renders the toggle and native route dropdown.

- [ ] **Step 3: Create the accessible route chooser**

Create `CraftPlanningRouteChooser.tsx` as a fieldset containing one radio-labelled card per route. The component must:

```tsx
type Props = {
  routes: AnyRecord[];
  selectedRecipeId: string;
  output: AnyRecord;
  missingQuantity: number;
  multiplier: number;
  canManage: boolean;
  pendingRecipeId: string | null;
  onSelect: (recipeId: string) => void;
};
```

For each route, compute its kind, label, and metrics. Render `No additional nodes needed` when node-basis `plannedUnits` is zero; otherwise render `Plan for {N} full nodes`. Craft routes render `Plan for {N} recipe completions`; prospecting renders expected progress; unavailable routes render `Yield calculation unavailable`. Use a real radio input, `aria-describedby`, a visible selected marker, and `aria-busy` while saving. Return `null` when fewer than two routes exist.

- [ ] **Step 4: Remove gathered UI state and wire the chooser into the detail modal**

In `CraftPlanningPage.tsx`:

- remove `MapPin`, `cellItemKeys`, `gatheredCellState`, `setCellGathered`, `selectedGatheredState`, `selectedNeedGathered`, `gatheredSavePending`, and `saveGatheredOverride`;
- add `const [routeSavePendingId, setRouteSavePendingId] = React.useState<string | null>(null);`;
- render `CraftPlanningRouteChooser` before the selected route detail whenever `alternatives.length > 1`;
- remove the native `Recipe route` selector from the selected source route;
- continue using the shared label formatter for the recipe-usage selector under `Used for`.

Delete `craftPlanningGatheredOverrides.ts` and its dedicated unit test after the page no longer imports the helper.

Call the chooser with the current shortage, not total required:

```tsx
<CraftPlanningRouteChooser
  routes={alternatives}
  selectedRecipeId={String(route.selectedRecipeId ?? "")}
  output={route.output ?? selectedNeed.item}
  missingQuantity={Number(selectedNeed.missing) || 0}
  multiplier={Number(route.multiplier) || selectedMultiplier}
  canManage={canManage}
  pendingRecipeId={routeSavePendingId}
  onSelect={(recipeId) => void saveRouteOverride(String(route.key ?? itemKey(route.output ?? {})), recipeId)}
/>
```

- [ ] **Step 5: Keep the modal open and preserve the old selection on save failure**

Change `saveRouteOverride` to capture the open cell and refresh it after a successful save:

```tsx
const openCell = selectedNeed;
setRouteSavePendingId(recipeId);
try {
  const nextConfig = {
    ...config,
    routeOverrides: { ...(config.routeOverrides ?? {}), [outputKey]: recipeId },
  };
  const response = await fetch(LOCAL_API + "/admin/craft-plan", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "x-csrf-token": String(adminAuth.csrfToken),
    },
    body: JSON.stringify(nextConfig),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "HTTP " + response.status);
  if (body.plan) setPlan(body.plan);
  setRouteStatus("Acquisition route updated.");
  setManagerRefreshToken((value) => value + 1);
  if (openCell) await openNeedDetail(openCell);
} catch (err) {
  setRouteError(err instanceof Error ? err.message : String(err));
} finally {
  setRouteSavePendingId(null);
}
```

Because the radio group is controlled by the server-confirmed `selectedRecipeId`, a failed request automatically returns to the previous selection.

- [ ] **Step 6: Run boundary tests and build**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/craft-planning-boundary.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: PASS with no hook-order or TypeScript errors.

- [ ] **Step 7: Commit the route-card interaction**

```powershell
git add apps/bitcraft-local/src/pages/CraftPlanningRouteChooser.tsx apps/bitcraft-local/src/pages/CraftPlanningPage.tsx apps/bitcraft-local/src/pages/craftPlanningGatheredOverrides.ts apps/bitcraft-local/test/craft-planning-gathered-overrides.test.mjs apps/bitcraft-local/test/craft-planning-boundary.test.mjs
git commit -m "feat: add planner acquisition route cards"
```

### Task 4: Add friendly summaries and technical calculations

**Files:**
- Modify: `apps/bitcraft-local/src/pages/CraftPlanningPage.tsx:300-365`
- Modify: `apps/bitcraft-local/src/styles/craft-planning.css:471-570,620-635`
- Test: `apps/bitcraft-local/test/craft-planning-boundary.test.mjs:35-55,100-135`
- Test: `apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs:1-80`

**Interfaces:**
- Consumes: `acquisitionRouteMetrics(route, { missingQuantity, multiplier })` from Task 2.
- Produces: selected-route summary with primary actionable work, long-run yield, and collapsed exact calculation.

- [ ] **Step 1: Write boundary assertions for friendly and technical layers**

Require the new copy and disclosure:

```js
assert.match(page, /Plan for/);
assert.match(page, /full nodes/);
assert.match(page, /No additional nodes needed/);
assert.match(page, /per full node/);
assert.match(page, /node equivalents/);
assert.match(page, /<summary>Show calculation<\/summary>/);
assert.match(page, /about 1 .* per .* node progress/i);
assert.match(page, /Full-node estimates are unavailable for prospecting/);
assert.doesNotMatch(page, /Expected per full resource/);
assert.doesNotMatch(page, /full-resource equivalents/);
```

Add CSS boundaries requiring `min-width: 0`, wrapped text, no horizontal overflow, `:focus-visible`, and selected/pending selectors for `.craft-plan-route-option`.

- [ ] **Step 2: Run boundary tests and confirm the red state**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/craft-planning-boundary.test.mjs test/craft-planning-css-boundary.test.mjs
```

Expected: FAIL because the old raw expected-progress summary is still primary.

- [ ] **Step 3: Render the selected route's friendly summary**

Use route metrics based on `selectedNeed.missing`. For finite gathering:

```tsx
<div className="craft-plan-primary-work">
  <strong>{metrics.plannedUnits === 0 ? "No additional nodes needed" : `Plan for ${quantity(metrics.plannedUnits)} full nodes`}</strong>
  <span>About {formatNumber(metrics.expectedPerUnit, Number(metrics.expectedPerUnit) < 1 ? 3 : 1)} {itemName(route.output)} per full node</span>
  <small>{formatNumber(metrics.exactUnits, 2)} expected node equivalents</small>
</div>
```

Craft routes lead with recipe completions and total actions. Prospecting leads with extraction progress and says `Full-node estimates are unavailable for prospecting because node exhaustion is unknown.` Unavailable routes show only the existing validated-rate warning.

- [ ] **Step 4: Move exact calculations into a disclosure**

Add:

```tsx
<details className="craft-plan-calculation">
  <summary>Show calculation</summary>
  <div className="craft-plan-calculation-body">
    <span><small>Exact expected work</small><strong>{quantity(metrics.totalProgress)} node progress</strong></span>
    <span><small>Expected rate</small><strong>{formatNumber(Number(route.expectedPerProgress), 6)} per node progress</strong></span>
    {metrics.progressPerExpectedItem ? <span><small>Player-friendly equivalent</small><strong>About 1 {itemName(route.output)} per {formatNumber(metrics.progressPerExpectedItem, 0)} node progress</strong></span> : null}
    {route.dropChance != null ? <span><small>Item-list probability</small><strong>{formatNumber(Number(route.dropChance) * 100, 2)}%</strong></span> : null}
    {route.resourceHealth ? <span><small>Full-node progress</small><strong>{quantity(route.resourceHealth)}</strong></span> : null}
  </div>
</details>
```

Keep the safety-buffer control inside the disclosure after the calculation rows, and retain the explanatory text that it changes planned work rather than the API rate or target quantity.

- [ ] **Step 5: Add dense, responsive route-card and disclosure CSS**

Implement grid/flex styles with these required safeguards:

```css
.craft-plan-route-options { display: grid; gap: 8px; min-width: 0; border: 0; padding: 0; margin: 0 0 12px; }
.craft-plan-route-option { position: relative; display: grid; gap: 5px; min-width: 0; padding: 10px 12px; border: 1px solid rgba(139, 159, 184, 0.24); border-radius: 8px; overflow: hidden; cursor: pointer; }
.craft-plan-route-option input { position: absolute; inset: 10px 10px auto auto; }
.craft-plan-route-option.is-selected { border-color: var(--accent); background: rgba(240, 198, 79, 0.08); }
.craft-plan-route-option.is-pending { opacity: 0.72; }
.craft-plan-route-option:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
.craft-plan-route-option strong, .craft-plan-route-option span, .craft-plan-route-option small { min-width: 0; white-space: normal; overflow-wrap: anywhere; }
.craft-plan-calculation-body { display: grid; gap: 7px; min-width: 0; }
.craft-plan-calculation-body > span { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
```

Remove obsolete `.craft-plan-gathered-control` and `.craft-plan-gathered-state` rules.

- [ ] **Step 6: Run boundaries and build**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/craft-planning-boundary.test.mjs test/craft-planning-css-boundary.test.mjs test/craft-planning-route-presentation.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: PASS.

- [ ] **Step 7: Commit the friendly route presentation**

```powershell
git add apps/bitcraft-local/src/pages/CraftPlanningPage.tsx apps/bitcraft-local/src/styles/craft-planning.css apps/bitcraft-local/test/craft-planning-boundary.test.mjs apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs
git commit -m "feat: clarify planner route estimates"
```

### Task 5: Use full-node terminology in the public workbook

**Files:**
- Modify: `apps/bitcraft-local/src/server/probabilityWorkbook.mjs:90-165`
- Modify: `apps/bitcraft-local/test/probability-workbook.test.mjs`
- Modify: `apps/bitcraft-local/test/craft-planning-boundary.test.mjs:35-50`

**Interfaces:**
- Consumes: existing workbook data fields including `expectedPerResource`.
- Produces: unchanged workbook schema/data except for player-facing headings and definitions using `full node`.

- [ ] **Step 1: Add failing workbook terminology assertions**

After generating the workbook, assert:

```js
const howToRead = workbook.getWorksheet("How to Read");
const allItems = workbook.getWorksheet("All Items");
const gathering = workbook.getWorksheet("Gathering Routes");

assert.equal(howToRead.getCell("A5").value, "Full node");
assert.ok(String(howToRead.getCell("B5").value).includes("full node"));
assert.ok(allItems.getRow(3).values.includes("Best expected / full node"));
assert.ok(gathering.getRow(3).values.includes("Expected / full node"));
```

- [ ] **Step 2: Run the workbook test and confirm it fails**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/probability-workbook.test.mjs
```

Expected: FAIL because the workbook currently says `Full resource`.

- [ ] **Step 3: Replace public workbook terminology**

Use these exact strings:

```js
["Full node", "Expected per full node = expected per progress x resource maximum health + completion yield."],
```

Rename `Best expected / full resource` to `Best expected / full node` and `Expected / full resource` to `Expected / full node`. Leave object property names and formulas unchanged.

- [ ] **Step 4: Run workbook tests**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/probability-workbook.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit workbook terminology**

```powershell
git add apps/bitcraft-local/src/server/probabilityWorkbook.mjs apps/bitcraft-local/test/probability-workbook.test.mjs apps/bitcraft-local/test/craft-planning-boundary.test.mjs
git commit -m "docs: use full node probability wording"
```

### Task 6: Verify all routes and the live modal

**Files:**
- Modify only if verification finds a defect in files already listed above.

**Interfaces:**
- Validates: global item/cargo behaviour, route persistence, probability honesty, layout, accessibility, workbook wording, and existing planner coverage.

- [ ] **Step 1: Run all focused route and planner tests**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/craft-planning-route-presentation.test.mjs test/craft-planning.test.mjs test/craft-planning-boundary.test.mjs test/craft-planning-css-boundary.test.mjs test/probability-workbook.test.mjs
```

Expected: PASS with no skipped or cancelled tests.

- [ ] **Step 2: Run the full app test suite**

```powershell
corepack pnpm --filter @workspace/bitcraft-local test
```

Expected: PASS.

- [ ] **Step 3: Run the production build**

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: TypeScript and Vite complete successfully.

- [ ] **Step 4: Start the stable smoke server**

```powershell
node scripts/start-bitcraft-local-smoke.mjs --force-restart
curl.exe -s http://127.0.0.1:18449/api/local/health
```

Expected: launcher returns within 15 seconds and health responds successfully. If the launcher fails because the local dependency installation is damaged, inspect `.codex-dev/bitcraft-local-smoke.err.log` once and report the blocker rather than repeatedly restarting.

- [ ] **Step 5: Browser-smoke representative global route states**

Open `http://127.0.0.1:18449/?page=planning` and verify:

- Gypsite shows distinct Mud Mound and Rough Sand Pile route cards.
- A crafting item shows recipe/station/input differentiation.
- A logistics route has a Logistics badge.
- A byproduct route is identified as a byproduct.
- A zero-shortage item says `No additional nodes needed` rather than planning against total required.
- A prospecting item omits full-node estimates.
- An unavailable-probability route shows no fake zero.
- Selecting a route keeps the modal open and updates its detail.
- Read-only users can compare but cannot change routes.
- Narrow viewport text wraps without horizontal scrolling.
- Keyboard focus and selected/pending states remain visible.

- [ ] **Step 6: Inspect the final diff and working tree**

```powershell
git diff --check
git status --short
git diff --stat HEAD~5..HEAD
```

Expected: no whitespace errors and no unrelated files staged. Leave the existing unrelated `.impeccable/` directory and `docs/superpowers/plans/2026-07-21-probability-workbook-route-lookup.md` untouched.

- [ ] **Step 7: Commit any verification-only correction**

Only if Step 5 exposed a defect, stage the smallest affected files and commit:

```powershell
git add apps/bitcraft-local/src/pages/CraftPlanningPage.tsx apps/bitcraft-local/src/pages/CraftPlanningRouteChooser.tsx apps/bitcraft-local/src/pages/craftPlanningRoutePresentation.mjs apps/bitcraft-local/src/pages/craftPlanningRoutePresentation.d.mts apps/bitcraft-local/src/server/craftPlanning.mjs apps/bitcraft-local/src/styles/craft-planning.css apps/bitcraft-local/test/craft-planning-route-presentation.test.mjs apps/bitcraft-local/test/craft-planning.test.mjs apps/bitcraft-local/test/craft-planning-boundary.test.mjs apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs
git commit -m "fix: polish planner route selection"
```

If no correction was required, do not create an empty commit.
