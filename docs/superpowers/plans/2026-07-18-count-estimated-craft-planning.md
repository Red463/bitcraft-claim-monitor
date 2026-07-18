# Count Estimated Craft Output for Material Planning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Count estimated active-craft output when calculating material shortages and prerequisite expansion while keeping completion progress confirmed-only.

**Architecture:** The planner will maintain two projections from the same inventory and craft inputs: a planning projection that consumes all tracked active output, and a confirmed projection that consumes only guaranteed output. The public Needs Board uses the planning projection for shortages and recipe expansion, while effort/Discord completion reads the confirmed projection; estimated quantities remain visually identified by the grey Factory icon.

**Tech Stack:** Node.js 24, JavaScript backend modules, React + TypeScript, Node test runner, pnpm.

## Global Constraints

- Estimated active output must stop prerequisite expansion and reduce material shortages.
- Estimated active output must remain grey and explicitly labelled as estimated.
- Overall effort completion and Discord progress must remain based on available plus guaranteed output only.
- The behaviour must apply to all recipes, including Fish Oil and Lake Fish, without a Fish Oil special case.
- No new runtime dependencies.

---

### Task 1: Dual planner projections

**Files:**
- Modify: `apps/bitcraft-local/test/craft-planning.test.mjs`
- Modify: `apps/bitcraft-local/src/server/craftPlanning.mjs`
- Modify: `apps/bitcraft-local/test/craft-plan-effort-progress.test.mjs`
- Modify: `apps/bitcraft-local/src/server/craftPlanEffortProgress.mjs`

**Interfaces:**
- Consumes: tracked craft totals containing `total`, `guaranteedTotal`, and `estimatedTotal`.
- Produces: public planning `materials` plus an internal confirmed effort projection consumed by `calculateCraftPlanEffortProgress`.

- [ ] **Step 1: Replace the old estimated-output assertion with a failing planning regression test**

```js
test("estimated active output satisfies material planning and stops prerequisite expansion", () => {
  const plan = computeCraftPlan({
    config: {
      enabled: true,
      targets: [{ id: "1900", kind: "items", quantity: 10 }],
      sourceRules: { craftPlayerIds: ["player"] },
    },
    detailsByKey: fishingPreferenceDetails(),
    activeCrafts: [{ id: "craft", playerId: "player", itemId: "1900", kind: "items", quantity: 10, guaranteedQuantity: 0, name: "Fish Oil" }],
  });

  const oil = plan.materials.find((item) => item.key === "items:1900");
  assert.equal(oil.estimatedInProgress, 10);
  assert.equal(oil.missing, 0);
  assert.equal(plan.materials.some((item) => item.key === "items:1901"), false);
});
```

- [ ] **Step 2: Run the focused test and verify it fails because estimated output is excluded**

Run: `corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test --test-name-pattern="estimated active output satisfies material planning" test/craft-planning.test.mjs`

Expected: FAIL because Fish Oil remains missing and a fish prerequisite is expanded.

- [ ] **Step 3: Implement planning and confirmed projections**

```js
const planningStockTotals = stockTotalsWithActiveOutput(availableTotals, countedActiveTotals, "total");
const confirmedStockTotals = stockTotalsWithActiveOutput(availableTotals, countedActiveTotals, "guaranteedTotal");
const planningRequirements = buildRequirementMap(calculationTargets, detailsByKey, normalized.routeOverrides, gatheredItemKeys, normalized.multipliers, planningStockTotals);
const confirmedRequirements = buildRequirementMap(calculationTargets, detailsByKey, normalized.routeOverrides, gatheredItemKeys, normalized.multipliers, confirmedStockTotals);
```

Build public `materials` from `planningRequirements`, subtracting `inProgress` from `missing`. Build a compact internal confirmed projection from `confirmedRequirements`, subtracting `guaranteedInProgress`, and make `calculateCraftPlanEffortProgress` prefer that projection when present. Ensure the confirmed projection is omitted by `compactCraftPlanResponse`.

- [ ] **Step 4: Add a failing effort-progress regression test**

```js
test("confirmed effort projection ignores planning-only estimated coverage", () => {
  const result = calculateCraftPlanEffortProgress({
    baselinePlan: { materials: [{ key: "items:lake", section: "Fishing", required: 30, missing: 30 }] },
    currentPlan: {
      materials: [],
      confirmedEffortPlan: { materials: [{ key: "items:lake", section: "Fishing", required: 30, missing: 30 }] },
    },
    weights: new Map([["items:lake", 1]]),
  });
  assert.equal(result.overall.completion, 0);
});
```

- [ ] **Step 5: Run focused backend tests and verify they pass**

Run: `corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/craft-planning.test.mjs test/craft-plan-effort-progress.test.mjs`

Expected: PASS.

### Task 2: Needs Board communication

**Files:**
- Modify: `apps/bitcraft-local/test/craft-planning-needs-board.test.mjs`
- Modify: `apps/bitcraft-local/test/craft-planning-boundary.test.mjs`
- Modify: `apps/bitcraft-local/src/pages/CraftPlanningPage.tsx`
- Modify: `apps/bitcraft-local/src/pages/craftPlanningFishingView.ts`

**Interfaces:**
- Consumes: `NeedCell.available`, `guaranteedInProgress`, `estimatedInProgress`, and planning `missing`.
- Produces: planning coverage in each cell while section/headline completion remains confirmed-only.

- [ ] **Step 1: Add failing UI boundary assertions**

```js
assert.match(source, /Estimated craft output; counted for material planning/);
assert.match(source, /cell\.available \+ cell\.guaranteedInProgress \+ cell\.estimatedInProgress/);
```

- [ ] **Step 2: Run the boundary test and verify it fails on the old legend and coverage expression**

Run: `corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/craft-planning-boundary.test.mjs`

Expected: FAIL because the UI still says estimated output is not counted.

- [ ] **Step 3: Update cell coverage, tooltip, accessible label, and legend**

```tsx
const planningSupplied = cell.available + cell.guaranteedInProgress + cell.estimatedInProgress;
```

Use `planningSupplied` for the cell shortage value and blocked-recipe state. Keep section completion calculated from `available + guaranteedInProgress`. Change the grey Factory copy to `Estimated craft output; counted for material planning` and retain its estimated styling.

- [ ] **Step 4: Count estimated quantities in personal fishing material projection**

```ts
required: needed + stockQuantity + guaranteedInProgress + estimatedInProgress,
```

Keep `recalculateFishingGroup` confirmed-only so the overall section percentage is not inflated.

- [ ] **Step 5: Run focused frontend tests**

Run: `corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/craft-planning-needs-board.test.mjs test/craft-planning-fishing-view.test.mjs test/craft-planning-boundary.test.mjs`

Expected: PASS.

### Task 3: Full verification

**Files:**
- Verify only; no additional files.

**Interfaces:**
- Consumes: completed Tasks 1 and 2.
- Produces: a buildable, tested release candidate on the feature branch.

- [ ] **Step 1: Run the production build**

Run: `corepack pnpm --filter @workspace/bitcraft-local run build`

Expected: PASS.

- [ ] **Step 2: Run the complete test suite**

Run: `corepack pnpm --filter @workspace/bitcraft-local test`

Expected: PASS with zero failures.

- [ ] **Step 3: Inspect the final diff**

Run: `git diff --check` and `git status --short`

Expected: no whitespace errors and only the approved planner files plus this plan.
