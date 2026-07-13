# Authoritative Craft Planner Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Craft Planner shortages and completion count only stored inventory and guaranteed outputs from crafts that are already active.

**Architecture:** Remove planned recipe and gathering outputs from the requirement solver instead of masking them in the UI. Reuse the existing `guaranteedQuantity` active-craft totals as the sole in-progress source, then remove `plannedOutput` from downstream board and report calculations so every consumer applies the same authoritative rule.

**Tech Stack:** Node.js 24, React, TypeScript, plain CSS, Node test runner, built-in SQLite.

## Global Constraints

- Inventory from selected settlement, player, and deployable sources counts as available stock.
- Only `guaranteedQuantity` from selected active crafts counts as in-progress coverage.
- Planned recipes, planned gathering actions, expected yields, and probabilistic byproducts never reduce shortages.
- “How to get this” retains expected-yield guidance as informational route data.
- No new dependency, API route, schema migration, or configuration toggle.
- Preserve current source selection, route selection, safety buffers, and active-craft discovery.

---

## File Map

- `apps/bitcraft-local/src/server/craftPlanning.mjs`: requirement expansion and authoritative material quantities.
- `apps/bitcraft-local/src/pages/craftPlanningNeedsBoard.ts`: board aggregation and completion.
- `apps/bitcraft-local/src/pages/CraftPlanningPage.tsx`: cell copy and displayed coverage.
- `apps/bitcraft-local/src/pages/craftPlanningFishingView.ts`: personal fishing cells aligned with the shared board shape.
- `apps/bitcraft-local/src/server/craftPlanDiscordReports.mjs`: Discord progress coverage.
- `apps/bitcraft-local/test/craft-planning.test.mjs`: solver and active-craft regression coverage.
- `apps/bitcraft-local/test/craft-planning-needs-board.test.mjs`: board aggregation regression coverage.
- `apps/bitcraft-local/test/craft-planning-fishing-view.test.mjs`: fishing view compatibility.
- `apps/bitcraft-local/test/craft-planning-boundary.test.mjs`: frontend boundary copy and removed-field checks.
- `apps/bitcraft-local/test/server-craft-plan-discord-reports.test.mjs`: Discord progress regression coverage.

---

### Task 1: Make the Requirement Solver Authoritative

**Files:**
- Modify: `apps/bitcraft-local/test/craft-planning.test.mjs`
- Modify: `apps/bitcraft-local/src/server/craftPlanning.mjs`

**Interfaces:**
- Consumes: active craft items containing `quantity` and `guaranteedQuantity`.
- Produces: materials where `available` is stored stock, `inProgress` is guaranteed active output, and `missing = max(0, required - available - inProgress)`.

- [ ] **Step 1: Replace planned-output expectations with failing authoritative-coverage tests**

Change the secondary-output tests so a recipe that has not started cannot satisfy Binding:

```js
const binding = plan.materials.find((item) => item.name === "Binding");
assert.equal("plannedOutput" in binding, false);
assert.equal(binding?.missing, 5);
assert.equal(plan.materials.find((item) => item.name === "Binding Fibre")?.missing, 50);
```

Change the existing non-guaranteed active-output test and add a guaranteed counterpart:

```js
assert.equal(plan.materials.find((material) => material.id === "1900")?.inProgress, 0);

const guaranteedPlan = computeCraftPlan({
  config: normalizeCraftPlanConfig({
    enabled: true,
    targets: [{ id: "1900", kind: "items", name: "Basic Fish Oil", quantity: 10, itemType: 0 }],
    sourceRules: { craftPlayerIds: ["player"] },
  }),
  detailsByKey: fishingPreferenceDetails(),
  activeCrafts: [{ id: "craft", playerId: "player", itemId: "1900", kind: "items", quantity: 5, guaranteedQuantity: 2, name: "Basic Fish Oil" }],
});
assert.equal(guaranteedPlan.materials.find((material) => material.id === "1900")?.inProgress, 2);
assert.equal(guaranteedPlan.materials.find((material) => material.id === "1900")?.missing, 8);
```

- [ ] **Step 2: Run the focused solver tests and verify RED**

Run:

```sh
node --experimental-strip-types --test apps/bitcraft-local/test/craft-planning.test.mjs
```

Expected: FAIL because planned secondary outputs currently set `plannedOutput`, suppress Binding Fibre, and expected active outputs populate `inProgress`.

- [ ] **Step 3: Remove planned-output feedback and use guaranteed active totals**

In `buildRequirementMapPass`, remove `assumedPlannedOutputs`, `plannedOutputs`, `creditPlannedOutput`, and the loop that credits non-primary crafted stacks. Return only authoritative requirement data:

```js
function buildRequirementMapPass(targets, detailsByKey, routeOverrides, multipliers = {}, effectiveStockTotals = new Map()) {
  const required = new Map();
  const steps = [];
  const warnings = [];
  const usages = new Map();
  const remainingSupply = new Map([...effectiveStockTotals.entries()].map(([key, value]) => [key, Math.max(0, toNumber(value?.total))]));
  // Keep the existing resolve() requirement traversal and recipe-step construction.
  // Delete only the creditPlannedOutput() helper, craftedStacks secondary-output loop,
  // assumedPlannedOutputs supply injection, and iterative planned-output passes.
  return { required, steps, usages, warnings: [...new Set(warnings)] };
}

function buildRequirementMap(targets, detailsByKey, routeOverrides, multipliers = {}, effectiveStockTotals = new Map()) {
  return buildRequirementMapPass(targets, detailsByKey, routeOverrides, multipliers, effectiveStockTotals);
}
```

Build effective stock and material rows from `guaranteedActiveTotals`:

```js
const effectiveStockTotals = new Map(availableTotals);
for (const [key, active] of guaranteedActiveTotals.entries()) {
  const current = effectiveStockTotals.get(key) ?? { total: 0, sources: [] };
  effectiveStockTotals.set(key, { ...current, total: current.total + active.total, sources: current.sources });
}

const inProgress = guaranteedActiveTotals.get(item.key)?.total ?? 0;
// omit plannedOutput
missing: Math.max(0, bufferedRequired - available - inProgress),
activeCraftSources: guaranteedActiveTotals.get(item.key)?.sources ?? [],
```

- [ ] **Step 4: Run the solver tests and verify GREEN**

Run the Task 1 command again.

Expected: all `craft-planning.test.mjs` tests pass with planned outputs no longer credited and guaranteed active output still counted.

- [ ] **Step 5: Commit Task 1**

```sh
git add apps/bitcraft-local/src/server/craftPlanning.mjs apps/bitcraft-local/test/craft-planning.test.mjs
git commit -m "fix: count only authoritative planner coverage"
```

---

### Task 2: Remove Forecast Coverage from Planner Presentation

**Files:**
- Modify: `apps/bitcraft-local/test/craft-planning-needs-board.test.mjs`
- Modify: `apps/bitcraft-local/test/craft-planning-fishing-view.test.mjs`
- Modify: `apps/bitcraft-local/test/craft-planning-boundary.test.mjs`
- Modify: `apps/bitcraft-local/src/pages/craftPlanningNeedsBoard.ts`
- Modify: `apps/bitcraft-local/src/pages/CraftPlanningPage.tsx`
- Modify: `apps/bitcraft-local/src/pages/craftPlanningFishingView.ts`

**Interfaces:**
- Consumes: authoritative material `required`, `missing`, `available`, and `inProgress` values from Task 1.
- Produces: `NeedCell` without `plannedOutput`; board completion based on stock plus guaranteed active output.

- [ ] **Step 1: Add failing Needs Board and boundary tests**

Add a board regression fixture that deliberately contains a legacy forecast value:

```js
const board = buildNeedsBoard([{
  key: "items:gypsite",
  name: "Sturdy Gypsite",
  tag: "Gypsite",
  tier: 3,
  section: "Foraging",
  required: 78,
  available: 0,
  inProgress: 0,
  plannedOutput: 25.52,
  missing: 78,
  recipeUsages: [{}],
}], []);
const cell = board[0].rows[0].cells.get("T3");
assert.equal(cell?.available, 0);
assert.equal(cell?.inProgress, 0);
assert.equal("plannedOutput" in cell, false);
assert.deepEqual(needsBoardCompletion(board), { required: 78, covered: 0, completion: 0 });
```

Update the boundary test to require authoritative copy and prohibit `plannedOutput` in the page:

```js
assert.doesNotMatch(page, /planned secondary outputs|plannedOutput/);
assert.match(page, /in stock/);
assert.match(page, /active guaranteed output/);
```

- [ ] **Step 2: Run focused page tests and verify RED**

Run:

```sh
node --experimental-strip-types --test apps/bitcraft-local/test/craft-planning-needs-board.test.mjs apps/bitcraft-local/test/craft-planning-fishing-view.test.mjs apps/bitcraft-local/test/craft-planning-boundary.test.mjs
```

Expected: FAIL because `NeedCell`, completion, fishing cells, and cell copy still retain `plannedOutput`.

- [ ] **Step 3: Remove `plannedOutput` from board and UI calculations**

Make the shared cell shape authoritative:

```ts
export type NeedCell = {
  item: AnyRecord;
  items: AnyRecord[];
  name: string;
  missing: number;
  required: number;
  available: number;
  inProgress: number;
};
```

Aggregate and calculate completion with only stock and guaranteed active output:

```ts
const covered = cells.reduce(
  (sum, cell) => sum + Math.min(cell.required, cell.available + cell.inProgress),
  0,
);
```

Update the cell renderer:

```tsx
const supplied = cell.available + cell.inProgress;
title={`${cell.name}: ${quantity(cell.missing)} needed, ${quantity(cell.available)} in stock, ${quantity(cell.inProgress)} active guaranteed output, ${quantity(cell.required)} required`}
```

Remove the always-zero `plannedOutput` field from fishing-view cell construction and update its completion calculation to `available + inProgress`.

- [ ] **Step 4: Run focused page tests and verify GREEN**

Run the Task 2 command again.

Expected: all focused page tests pass and no Planner presentation code counts forecast quantities.

- [ ] **Step 5: Commit Task 2**

```sh
git add apps/bitcraft-local/src/pages/craftPlanningNeedsBoard.ts apps/bitcraft-local/src/pages/CraftPlanningPage.tsx apps/bitcraft-local/src/pages/craftPlanningFishingView.ts apps/bitcraft-local/test/craft-planning-needs-board.test.mjs apps/bitcraft-local/test/craft-planning-fishing-view.test.mjs apps/bitcraft-local/test/craft-planning-boundary.test.mjs
git commit -m "fix: show authoritative Needs Board coverage"
```

---

### Task 3: Align Compact Responses and Discord Reports

**Files:**
- Modify: `apps/bitcraft-local/test/craft-planning.test.mjs`
- Modify: `apps/bitcraft-local/test/server-craft-plan-discord-reports.test.mjs`
- Modify: `apps/bitcraft-local/src/server/craftPlanning.mjs`
- Modify: `apps/bitcraft-local/src/server/craftPlanDiscordReports.mjs`

**Interfaces:**
- Consumes: authoritative plan materials from Task 1.
- Produces: compact API and Discord completion values that ignore any legacy `plannedOutput` property.

- [ ] **Step 1: Add failing compact-response and Discord regressions**

Change the compact response expectation so forecast data is stripped even from a legacy input:

```js
const material = { key: "items:1", name: "Cloth", required: 100, available: 30, inProgress: 20, plannedOutput: 10, missing: 50 };
const compact = compactCraftPlanResponse({ enabled: true, materials: [material], steps: [], gatherNext: [] });
assert.equal("plannedOutput" in compact.materials[0], false);
```

Add a Discord regression:

```js
const report = buildCraftPlanDiscordReport({
  enabled: true,
  targets: [{}],
  materials: [{ name: "Sturdy Gypsite", tag: "Gypsite", tier: 3, required: 78, available: 0, inProgress: 0, plannedOutput: 25.52, missing: 78, recipeUsages: [{}] }],
});
assert.deepEqual(report.overall, { required: 78, covered: 0, completion: 0 });
```

- [ ] **Step 2: Run focused response tests and verify RED**

Run:

```sh
node --experimental-strip-types --test apps/bitcraft-local/test/craft-planning.test.mjs apps/bitcraft-local/test/server-craft-plan-discord-reports.test.mjs
```

Expected: FAIL because compact responses preserve `plannedOutput` and Discord progress adds it to covered quantity.

- [ ] **Step 3: Strip the legacy field and ignore it in report summaries**

Update compact item creation:

```js
function compactCraftPlanItem(item = {}) {
  const { sources, activeCraftSources, sourceRoutes, recipeUsages, plannedOutput, ...summary } = item;
  return {
    ...summary,
    hasSourceRoutes: Boolean(item.hasSourceRoutes || sourceRoutes?.length),
    hasRecipeUsages: Boolean(item.hasRecipeUsages || recipeUsages?.length),
  };
}
```

Update Discord coverage:

```js
return sum + Math.min(
  itemRequired,
  Math.max(0, number(item.available) + number(item.inProgress)),
);
```

- [ ] **Step 4: Run focused response tests and verify GREEN**

Run the Task 3 command again.

Expected: both test files pass, including the legacy-input defenses.

- [ ] **Step 5: Commit Task 3**

```sh
git add apps/bitcraft-local/src/server/craftPlanning.mjs apps/bitcraft-local/src/server/craftPlanDiscordReports.mjs apps/bitcraft-local/test/craft-planning.test.mjs apps/bitcraft-local/test/server-craft-plan-discord-reports.test.mjs
git commit -m "fix: remove forecast coverage from planner reports"
```

---

### Task 4: Verify the Full Planner Flow

**Files:**
- Verify only; fix only regressions directly caused by Tasks 1–3.

**Interfaces:**
- Consumes: all Task 1–3 changes.
- Produces: verified authoritative Planner behavior across server, page, and Discord consumers.

- [ ] **Step 1: Search for remaining forecast coverage**

Run:

```sh
rg -n "plannedOutput|planned secondary outputs" apps/bitcraft-local/src apps/bitcraft-local/test
```

Expected: no production coverage calculation remains; any test fixture occurrence must explicitly verify that legacy forecast input is ignored.

- [ ] **Step 2: Run the full test suite**

```sh
corepack pnpm --filter @workspace/bitcraft-local test
```

Expected: all tests pass with zero failures.

- [ ] **Step 3: Run the production build**

```sh
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: TypeScript and Vite complete successfully; the existing large-chunk advisory may remain.

- [ ] **Step 4: Browser-check the Planner**

Use the smoke server and inspect desktop plus narrow widths:

```powershell
node scripts/start-bitcraft-local-smoke.mjs --force-restart
curl.exe -s http://127.0.0.1:18449/api/local/health
```

Confirm a fixture or live item with route byproducts shows zero coverage until stock exists or a guaranteed active craft is present. Confirm route expected-yield guidance remains visible but does not change completion.
