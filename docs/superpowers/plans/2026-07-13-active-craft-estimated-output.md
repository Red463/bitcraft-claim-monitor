# Active Craft Estimated Output Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Count conservatively rounded expected outputs from real selected crafts while continuing to exclude all gathering-route forecasts from Craft Planner coverage.

**Architecture:** Extend the existing active-craft aggregation in `craftPlanning.mjs` with separate expected, guaranteed, and counted totals. Keep `inProgress` as the shared counted total for backward-compatible consumers, add explicit guaranteed/estimated breakdown fields, and propagate those fields through the Needs Board, fishing projections, compact responses, item details, and Discord reports.

**Tech Stack:** Node.js 24+, JavaScript modules, React, TypeScript, plain CSS, Node test runner, pnpm, Vite.

## Global Constraints

- Stored inventory from selected settlement, player, and deployable sources counts fully.
- Expected output may count only when it originates from a real selected active or ready-to-collect craft.
- Combine expected output for the same item across all selected crafts before rounding down.
- `countedCraftOutput = max(totalGuaranteedOutput, floor(totalExpectedOutput))`.
- Planned recipes, planned gathering actions, expected gathering yields, and gathering byproducts without an active craft never reduce shortages.
- Estimated active-craft output must remain visibly distinct from stored or guaranteed output.
- Legacy `plannedOutput` remains ignored and must not be restored as a coverage input.
- Preserve source selection, craft-player selection, route selection, safety buffers, active-craft discovery, and informational “How to get this” guidance.
- Do not add an item allow-list, dependency, API route, schema migration, or configuration toggle.

---

## File Structure

- `apps/bitcraft-local/src/server/craftPlanning.mjs`: owns expected/guaranteed active-craft aggregation and the authoritative material coverage fields.
- `apps/bitcraft-local/src/pages/craftPlanningNeedsBoard.ts`: maps material coverage and its breakdown into Needs Board cells.
- `apps/bitcraft-local/src/pages/craftPlanningFishingView.ts`: preserves the same coverage breakdown in personal fishing projections.
- `apps/bitcraft-local/src/pages/craftPlanningNeedDetails.ts`: combines active-craft source rows without losing expected/guaranteed metadata.
- `apps/bitcraft-local/src/pages/CraftPlanningPage.tsx`: labels estimated and guaranteed active output in cells, targets, and details.
- `apps/bitcraft-local/src/server/craftPlanDiscordReports.mjs`: reports completion from counted active output and discloses the estimated portion.
- Existing focused tests under `apps/bitcraft-local/test/`: verify solver, presentation mapping, compact response, and Discord behavior.

### Task 1: Calculate Counted Active-Craft Output

**Files:**
- Modify: `apps/bitcraft-local/src/server/craftPlanning.mjs:936-983, 1035-1105, 1148-1255`
- Modify: `apps/bitcraft-local/test/craft-planning.test.mjs:437-493`
- Modify: `apps/bitcraft-local/test/craft-plan-sources.test.mjs:6-87`

**Interfaces:**
- Consumes: active craft rows shaped as `{ itemId, kind, quantity, guaranteedQuantity, playerId, craftId, completed }` from `trackedCraftPlanOutputs()`.
- Produces: each material and non-building target exposes `inProgress`, `guaranteedInProgress`, and `estimatedInProgress`; `inProgress` is the counted total used by downstream consumers.
- Produces: personal fishing routes expose `trackedQuantity`, `guaranteedTrackedQuantity`, and `estimatedTrackedQuantity`.

- [ ] **Step 1: Write failing solver tests for combined rounding and breakdowns**

Add focused cases to `craft-planning.test.mjs` using two selected active-craft rows for the same material:

```js
test("computeCraftPlan combines expected active-craft output before rounding down", () => {
  const plan = computeCraftPlan({
    config: normalizeCraftPlanConfig({
      enabled: true,
      targets: [{ id: "straw", kind: "items", name: "Rough Straw", quantity: 10, itemType: 0 }],
      sourceRules: { craftPlayerIds: ["farmer"] },
    }),
    detailsByKey: new Map([[recipeKey("items", "straw"), { item: { id: "straw", name: "Rough Straw", itemType: 0, tag: "Straw", tier: 1 } }]]),
    activeCrafts: [
      { id: "craft-a", playerId: "farmer", itemId: "straw", kind: "items", quantity: 0.6, guaranteedQuantity: 0, name: "Rough Straw" },
      { id: "craft-b", playerId: "farmer", itemId: "straw", kind: "items", quantity: 0.6, guaranteedQuantity: 0, name: "Rough Straw" },
    ],
  });
  const straw = plan.materials.find((material) => material.id === "straw");
  assert.equal(straw.inProgress, 1);
  assert.equal(straw.guaranteedInProgress, 0);
  assert.equal(straw.estimatedInProgress, 1);
  assert.equal(straw.missing, 9);
});

test("computeCraftPlan never counts less than guaranteed active output", () => {
  const plan = computeCraftPlan({
    config: normalizeCraftPlanConfig({
      enabled: true,
      targets: [{ id: "grain", kind: "items", name: "Basic Embergrain", quantity: 50, itemType: 0 }],
      sourceRules: { craftPlayerIds: ["farmer"] },
    }),
    detailsByKey: new Map([[recipeKey("items", "grain"), { item: { id: "grain", name: "Basic Embergrain", itemType: 0, tag: "Grain Plant", tier: 1 } }]]),
    activeCrafts: [{ id: "craft", playerId: "farmer", itemId: "grain", kind: "items", quantity: 29.8, guaranteedQuantity: 30, name: "Basic Embergrain" }],
  });
  const grain = plan.materials.find((material) => material.id === "grain");
  assert.equal(grain.inProgress, 30);
  assert.equal(grain.guaranteedInProgress, 30);
  assert.equal(grain.estimatedInProgress, 0);
});
```

Update the existing expected tracked Fish Oil case to assert that a real active craft with `quantity: 5` and `guaranteedQuantity: 0` counts five estimated items. Preserve the separate tests proving unstarted secondary outputs and gathering byproducts count zero.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run:

```sh
node --experimental-strip-types --test apps/bitcraft-local/test/craft-planning.test.mjs apps/bitcraft-local/test/craft-plan-sources.test.mjs
```

Expected: failures because `inProgress` is still guarantee-only and the breakdown fields do not exist.

- [ ] **Step 3: Add expected and counted active totals**

In `craftPlanning.mjs`, keep `addSourceTotals()` as the raw aggregator but preserve both quantities on source metadata:

```js
current.sources.push({
  // existing source identity fields
  quantity,
  expectedQuantity: item.quantity,
  guaranteedQuantity: item.guaranteedQuantity,
  // existing player, station, status, and completion fields
});
```

Add a focused helper next to `addSourceTotals()`:

```js
function countedActiveCraftTotals(expectedTotals, guaranteedTotals) {
  const totals = new Map();
  const keys = new Set([...expectedTotals.keys(), ...guaranteedTotals.keys()]);
  for (const key of keys) {
    const expected = Math.max(0, toNumber(expectedTotals.get(key)?.total));
    const guaranteed = Math.max(0, toNumber(guaranteedTotals.get(key)?.total));
    const total = Math.max(guaranteed, Math.floor(expected + 1e-9));
    totals.set(key, {
      total,
      guaranteedTotal: guaranteed,
      estimatedTotal: Math.max(0, total - guaranteed),
      sources: expectedTotals.get(key)?.sources ?? guaranteedTotals.get(key)?.sources ?? [],
    });
  }
  return totals;
}
```

Build both maps from the same selected `activeCraftSources`:

```js
const expectedActiveTotals = new Map();
const guaranteedActiveTotals = new Map();
addSourceTotals(expectedActiveTotals, activeCraftSources, "Active craft", unavailableSources, "quantity");
addSourceTotals(guaranteedActiveTotals, activeCraftSources, "Active craft", unavailableSources, "guaranteedQuantity");
const countedActiveTotals = countedActiveCraftTotals(expectedActiveTotals, guaranteedActiveTotals);
```

Use `countedActiveTotals` in `effectiveStockTotals`, material `inProgress`, `missing`, active source metadata, totals, and fishing calculations. Expose the breakdown without changing the meaning of `available`:

```js
const active = countedActiveTotals.get(item.key);
const inProgress = active?.total ?? 0;
const guaranteedInProgress = active?.guaranteedTotal ?? 0;
const estimatedInProgress = active?.estimatedTotal ?? 0;
```

Propagate the three values to non-building targets. Building targets retain zero for all three fields.

- [ ] **Step 4: Propagate counted totals through personal fishing data**

Rename guarantee-only parameters in `buildPersonalFishingView()` and `normalizeFishingAlternatives()` to `activeCraftTotals`. Use the counted map for `trackedOil`, route `trackedQuantity`, and active source rows. Add route breakdown fields from each map entry:

```js
trackedQuantity: active?.total ?? 0,
guaranteedTrackedQuantity: active?.guaranteedTotal ?? 0,
estimatedTrackedQuantity: active?.estimatedTotal ?? 0,
```

Do not change `guaranteedYield`; it describes recipe conversion, not confidence in tracked inventory.

- [ ] **Step 5: Run focused tests and confirm GREEN**

Run the Task 1 command again.

Expected: all tests pass, including combined fractional rounding, expected Fish Oil from a real craft, guaranteed-floor protection, unstarted co-product exclusion, and gathering-route exclusion.

- [ ] **Step 6: Commit Task 1**

```sh
git add apps/bitcraft-local/src/server/craftPlanning.mjs apps/bitcraft-local/test/craft-planning.test.mjs apps/bitcraft-local/test/craft-plan-sources.test.mjs
git commit -m "feat: count estimated active craft output"
```

### Task 2: Present Guaranteed and Estimated Craft Coverage

**Files:**
- Modify: `apps/bitcraft-local/src/pages/craftPlanningNeedsBoard.ts:8-16, 112-148`
- Modify: `apps/bitcraft-local/src/pages/craftPlanningFishingView.ts:5-65`
- Modify: `apps/bitcraft-local/src/pages/craftPlanningNeedDetails.ts:59-68`
- Modify: `apps/bitcraft-local/src/pages/CraftPlanningPage.tsx:38-49, 218-257, 505-512`
- Modify: `apps/bitcraft-local/test/craft-planning-needs-board.test.mjs`
- Modify: `apps/bitcraft-local/test/craft-planning-fishing-view.test.mjs`
- Modify: `apps/bitcraft-local/test/craft-planning-need-details.test.mjs`
- Modify: `apps/bitcraft-local/test/craft-planning-boundary.test.mjs:30-60`

**Interfaces:**
- Consumes: material/target fields from Task 1: `inProgress`, `guaranteedInProgress`, `estimatedInProgress`.
- Consumes: fishing route fields from Task 1: `trackedQuantity`, `guaranteedTrackedQuantity`, `estimatedTrackedQuantity`.
- Produces: `NeedCell` contains the same three active-output fields and detail craft rows retain expected/guaranteed quantities.

- [ ] **Step 1: Write failing Needs Board, fishing, and detail tests**

Extend the existing Needs Board completion case with `guaranteedInProgress: 2` and `estimatedInProgress: 3`, then assert those values survive cell construction and merging. Add a compatibility assertion that a legacy material with only `inProgress: 5` treats all five as guaranteed rather than silently labelling them estimated.

In `craft-planning-fishing-view.test.mjs`, set:

```js
route.trackedQuantity = 3;
route.guaranteedTrackedQuantity = 1;
route.estimatedTrackedQuantity = 2;
```

Assert the projected cell exposes `inProgress: 3`, `guaranteedInProgress: 1`, and `estimatedInProgress: 2`.

In `craft-planning-need-details.test.mjs`, add two active-source entries for one craft and assert `groupNeedCellActiveCrafts()` sums `quantity`, `expectedQuantity`, and `guaranteedQuantity` independently.

Update the boundary test to require “active craft output,” “guaranteed,” and “estimated.” The combined value must not be described as wholly guaranteed.

- [ ] **Step 2: Run presentation tests and confirm RED**

Run:

```sh
node --experimental-strip-types --test apps/bitcraft-local/test/craft-planning-needs-board.test.mjs apps/bitcraft-local/test/craft-planning-fishing-view.test.mjs apps/bitcraft-local/test/craft-planning-need-details.test.mjs apps/bitcraft-local/test/craft-planning-boundary.test.mjs
```

Expected: failures because breakdown fields are dropped and the page still labels every active quantity as guaranteed.

- [ ] **Step 3: Extend `NeedCell` and its builders**

Add fields:

```ts
guaranteedInProgress: number;
estimatedInProgress: number;
```

When building a cell, normalize `inProgress` first. For backward compatibility, use `inProgress` as the guaranteed fallback only when both new fields are absent:

```ts
const hasBreakdown = material.guaranteedInProgress != null || material.estimatedInProgress != null;
const guaranteedInProgress = hasBreakdown ? Number(material.guaranteedInProgress) || 0 : inProgress;
const estimatedInProgress = hasBreakdown ? Number(material.estimatedInProgress) || 0 : 0;
```

Sum both fields when materials share one Needs Board cell. In `projectedCell()`, map the fishing route breakdown with the same legacy fallback.

- [ ] **Step 4: Preserve breakdowns in grouped craft detail rows**

Update `groupNeedCellActiveCrafts()` so an existing craft row adds all three values:

```ts
{
  ...current,
  quantity: toQuantity(current.quantity) + toQuantity(source.quantity),
  expectedQuantity: toQuantity(current.expectedQuantity) + toQuantity(source.expectedQuantity),
  guaranteedQuantity: toQuantity(current.guaranteedQuantity) + toQuantity(source.guaranteedQuantity),
}
```

New rows continue to retain the complete source object.

- [ ] **Step 5: Update Planner labels**

In `needCellNode()`, describe the combined value accurately:

```tsx
`${quantity(cell.inProgress)} active craft output (${quantity(cell.guaranteedInProgress)} guaranteed, ${quantity(cell.estimatedInProgress)} estimated)`
```

In the detail header, list available, guaranteed active output, and estimated active output separately. In each tracked-craft row, label `expectedQuantity` as expected and `guaranteedQuantity` as guaranteed instead of displaying an unlabeled number. Update target progress copy to use “active output,” adding an “estimated” suffix when `estimatedInProgress > 0`.

Keep the dense existing layout and avoid new card nesting or animation.

- [ ] **Step 6: Run presentation tests and confirm GREEN**

Run the Task 2 command again.

Expected: all focused UI/data-mapping tests pass.

- [ ] **Step 7: Build the frontend**

Run:

```sh
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: TypeScript and Vite build complete successfully; the existing chunk-size advisory is acceptable.

- [ ] **Step 8: Commit Task 2**

```sh
git add apps/bitcraft-local/src/pages/craftPlanningNeedsBoard.ts apps/bitcraft-local/src/pages/craftPlanningFishingView.ts apps/bitcraft-local/src/pages/craftPlanningNeedDetails.ts apps/bitcraft-local/src/pages/CraftPlanningPage.tsx apps/bitcraft-local/test/craft-planning-needs-board.test.mjs apps/bitcraft-local/test/craft-planning-fishing-view.test.mjs apps/bitcraft-local/test/craft-planning-need-details.test.mjs apps/bitcraft-local/test/craft-planning-boundary.test.mjs
git commit -m "feat: label estimated craft coverage"
```

### Task 3: Align Compact Responses and Discord Reports

**Files:**
- Modify: `apps/bitcraft-local/src/server/craftPlanning.mjs:1257-1285`
- Modify: `apps/bitcraft-local/src/server/craftPlanDiscordReports.mjs:34-85, 205-226`
- Modify: `apps/bitcraft-local/test/craft-planning.test.mjs`
- Modify: `apps/bitcraft-local/test/server-craft-plan-discord-reports.test.mjs:55-90`

**Interfaces:**
- Consumes: Task 1 material fields `inProgress`, `guaranteedInProgress`, and `estimatedInProgress`.
- Produces: compact materials and Gather Next items retain those scalar fields while nested source arrays remain lazy-loaded.
- Produces: Discord report `overall` includes `estimatedCraftOutput`; the embed discloses when completion includes estimates.

- [ ] **Step 1: Write failing compact and Discord tests**

Extend `compactCraftPlanResponse` coverage with a material containing:

```js
{
  inProgress: 7,
  guaranteedInProgress: 4,
  estimatedInProgress: 3,
  activeCraftSources: [{ craftId: "craft" }],
}
```

Assert the three scalar fields remain while `activeCraftSources` is stripped.

Add a Discord report test with required `10`, available `2`, in-progress `3`, guaranteed `1`, and estimated `2`. Assert completion is `50%` and `report.overall.estimatedCraftOutput === 2`. Add a legacy Gypsite row with non-zero `plannedOutput` and zero active output to retain the zero-coverage defense.

Add an embed assertion matching `Includes 2 estimated items from active crafts`.

- [ ] **Step 2: Run compact and Discord tests and confirm RED**

Run:

```sh
node --experimental-strip-types --test apps/bitcraft-local/test/craft-planning.test.mjs apps/bitcraft-local/test/server-craft-plan-discord-reports.test.mjs
```

Expected: failures because Discord summaries do not expose or label estimated craft coverage.

- [ ] **Step 3: Retain scalar breakdowns in compact responses**

Keep `compactCraftPlanItem()` stripping `sources`, `activeCraftSources`, `sourceRoutes`, `recipeUsages`, and legacy `plannedOutput`. Do not destructure the three new scalar fields, so they remain in both `materials` and `gatherNext.items`.

- [ ] **Step 4: Disclose estimated coverage in Discord reports**

Extend `summarize()` to calculate the estimated portion actually eligible for coverage without exceeding the material requirement:

```js
const estimatedCraftOutput = materials.reduce((sum, item) => {
  const required = Math.max(0, number(item.bufferedRequired ?? item.required));
  const confirmed = Math.max(0, number(item.available) + number(item.guaranteedInProgress));
  return sum + Math.min(Math.max(0, required - confirmed), Math.max(0, number(item.estimatedInProgress)));
}, 0);
```

Return it with `required`, `covered`, and `completion`. In `buildCraftPlanDiscordEmbed()`, append this line only when the value is positive:

```js
const estimateNote = report.overall.estimatedCraftOutput > 0
  ? `Includes **${Math.floor(report.overall.estimatedCraftOutput).toLocaleString()}** estimated items from active crafts.`
  : "";
```

Keep mentions suppressed and existing embed bounds intact.

- [ ] **Step 5: Run compact and Discord tests and confirm GREEN**

Run the Task 3 command again.

Expected: focused tests pass, including the legacy gathering forecast exclusion.

- [ ] **Step 6: Commit Task 3**

```sh
git add apps/bitcraft-local/src/server/craftPlanning.mjs apps/bitcraft-local/src/server/craftPlanDiscordReports.mjs apps/bitcraft-local/test/craft-planning.test.mjs apps/bitcraft-local/test/server-craft-plan-discord-reports.test.mjs
git commit -m "feat: report estimated active craft coverage"
```

### Task 4: Verify the Full Planner Flow

**Files:**
- Verify only unless a focused regression fixture requires correction.

**Interfaces:**
- Consumes: completed Tasks 1-3.
- Produces: verification evidence for solver, UI, compact payload, and Discord behavior.

- [ ] **Step 1: Search for conflicting coverage language and legacy inputs**

Run:

```sh
rg -n "plannedOutput|active guaranteed output|estimated active output|guaranteedInProgress|estimatedInProgress" apps/bitcraft-local/src apps/bitcraft-local/test
```

Expected: `plannedOutput` appears only in legacy-input defenses and compact stripping; combined active output is not described as wholly guaranteed.

- [ ] **Step 2: Run all focused Planner tests**

Run:

```sh
node --experimental-strip-types --test apps/bitcraft-local/test/craft-plan-sources.test.mjs apps/bitcraft-local/test/craft-planning.test.mjs apps/bitcraft-local/test/craft-planning-needs-board.test.mjs apps/bitcraft-local/test/craft-planning-fishing-view.test.mjs apps/bitcraft-local/test/craft-planning-need-details.test.mjs apps/bitcraft-local/test/craft-planning-boundary.test.mjs apps/bitcraft-local/test/server-craft-plan-discord-reports.test.mjs
```

Expected: all focused tests pass with zero failures.

- [ ] **Step 3: Run the full application suite**

Run:

```sh
corepack pnpm --filter @workspace/bitcraft-local test
```

Expected: zero failures.

- [ ] **Step 4: Run the production build**

Run:

```sh
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: successful TypeScript and Vite build; the existing chunk-size advisory is acceptable.

- [ ] **Step 5: Browser-smoke the Planner when local data permits**

Run:

```powershell
node scripts/start-bitcraft-local-smoke.mjs --force-restart
curl.exe -s http://127.0.0.1:18449/api/local/health
```

Open `http://127.0.0.1:18449/?page=planning`. At desktop and a 390px-wide viewport, verify:

- active craft estimates are labelled estimated;
- guaranteed and estimated totals are distinguishable in item details;
- gathering-route expected yields remain informational;
- no console errors occur.

If the smoke database has no suitable configured target, record that limitation and rely on the deterministic non-zero fixtures rather than mutating user data.

- [ ] **Step 6: Validate the final diff**

Run:

```sh
git diff --check
git status --short
```

Expected: no whitespace errors and only intentional files or untracked orchestration artifacts.
