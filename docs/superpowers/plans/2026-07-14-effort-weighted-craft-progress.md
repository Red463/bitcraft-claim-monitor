# Effort-Weighted Craft Planner Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace raw quantity-based Craft Planner percentages with one server-authored, effort-weighted percentage that counts only confirmed stock and guaranteed active-craft output across the page and Discord reports.

**Architecture:** Derive versioned per-item effort weights from the local BitJita catalog, then compare a cached zero-inventory baseline with the existing live plan. A pure server module owns weight derivation, Fishing projections, strict missing-weight behavior, and aggregation; the React page and Discord report builder only select and render its compact result.

**Tech Stack:** Node.js 24 ESM, `node:sqlite`, React 19, TypeScript 5.9, plain CSS, Node test runner, existing BitJita proxy and Craft Planner cache.

## Global Constraints

- Apply the effort model to every Needs Board section, the overall plan, and every Craft Planner Discord report.
- Baselines use the same targets, building progress, route overrides, multipliers, buffers, section/row overrides, taxonomy, and Fishing route as the live calculation.
- Only confirmed stock and guaranteed active-craft output reduce remaining effort.
- Estimated or probabilistic active output stays visible but cannot satisfy a requirement, stop downstream expansion, or increase progress.
- Do not depend on BitCraft Sync, add a weight editor, or add a frontend dependency.
- Do not silently use a weight of `1` or fall back to raw quantity completion.
- A missing required weight makes its section and overall unavailable; other complete sections remain visible.
- Preserve the existing 20-second freshness and share calculations across simultaneous users.
- Return Ocean and Lake aggregates together; Discord uses Ocean and identifies it.
- Keep raw candidates and full weight tables server-side; clamp displayed percentages to `0-100` with one decimal place.
- Keep existing quantities, shortages, filters, taxonomy, route controls, and drilldowns unless guaranteed-only satisfaction changes `missing`.
- Use additive, versioned database changes only.

## File Structure

- Create `apps/bitcraft-local/src/server/craftPlanEffortProgress.mjs`: pure candidate validation, weight selection, Fishing projection, and aggregation.
- Create `apps/bitcraft-local/src/server/craftPlanEffortCache.mjs`: stable keys and bounded resolved/in-flight baseline caching.
- Create `apps/bitcraft-local/src/pages/craftPlanningEffortView.ts`: typed Ocean/Lake result selection for React.
- Create focused tests for each new module under `apps/bitcraft-local/test/`.
- Modify `gameCatalog.mjs`, schema bootstrap/migrations, and `server.mjs` for versioned weight refresh and API integration.
- Modify `craftPlanning.mjs` so only guaranteed active output satisfies requirements.
- Modify the Needs Board/Fishing helpers and `CraftPlanningPage.tsx` to render server effort results while retaining quantity cells.
- Modify `craftPlanDiscordReports.mjs` so slash, scheduled, and test reports use the same effort result.

---

### Task 1: Pure Effort Model

**Files:**
- Create: `apps/bitcraft-local/src/server/craftPlanEffortProgress.mjs`
- Create: `apps/bitcraft-local/test/craft-plan-effort-progress.test.mjs`

**Interfaces:**
- Produces: `CRAFT_PLAN_EFFORT_MODEL_VERSION`, `craftingEffortCandidate(input)`, `gatheringEffortCandidate(input)`, `selectLowestEffortWeights(candidates)`, `projectCraftPlanEffortMaterials(plan, fishingRoute)`, and `calculateCraftPlanEffortProgress(input)`.
- Consumers: Tasks 2, 3, 5, and 7.

- [ ] **Step 1: Write failing candidate and aggregation tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  CRAFT_PLAN_EFFORT_MODEL_VERSION,
  calculateCraftPlanEffortProgress,
  craftingEffortCandidate,
  gatheringEffortCandidate,
  selectLowestEffortWeights,
} from "../src/server/craftPlanEffortProgress.mjs";

test("effort candidates use actions or inverse gathering probability", () => {
  assert.equal(CRAFT_PLAN_EFFORT_MODEL_VERSION, 1);
  assert.equal(craftingEffortCandidate({ catalogKey: "items:oil", sourceKey: "recipe:oil", actionsRequired: 12, outputQuantity: 3, probability: 1 }).effortWeight, 4);
  assert.equal(craftingEffortCandidate({ catalogKey: "items:straw", sourceKey: "recipe:grain", actionsRequired: 8, outputQuantity: 2, probability: 0.5 }).effortWeight, 8);
  assert.equal(gatheringEffortCandidate({ catalogKey: "items:gypsite", sourceKey: "resource:clay", outputQuantity: 1, probability: 0.02 }).effortWeight, 50);
});

test("invalid candidates are rejected and the cheapest verified route wins", () => {
  assert.equal(craftingEffortCandidate({ catalogKey: "items:x", actionsRequired: 0, outputQuantity: 2 }), null);
  assert.equal(gatheringEffortCandidate({ catalogKey: "items:x", outputQuantity: 1, probability: 0 }), null);
  const weights = selectLowestEffortWeights([
    { catalogKey: "items:x", sourceKey: "slow", method: "crafting", effortWeight: 8 },
    { catalogKey: "items:x", sourceKey: "fast", method: "gathering", effortWeight: 3 },
  ]);
  assert.equal(weights.get("items:x").effortWeight, 3);
});

test("progress compares a zero-stock baseline with confirmed live missing effort", () => {
  const baselinePlan = { materials: [
    { key: "items:plank", section: "Carpentry", bufferedRequired: 100, missing: 100 },
    { key: "items:stone", section: "Masonry", bufferedRequired: 10, missing: 10 },
  ], personalViews: { fishing: { tiers: [] } } };
  const currentPlan = { materials: [
    { key: "items:plank", section: "Carpentry", bufferedRequired: 100, missing: 25 },
    { key: "items:stone", section: "Masonry", bufferedRequired: 10, missing: 10 },
  ], personalViews: { fishing: { tiers: [] } } };
  const weights = new Map([["items:plank", { effortWeight: 2 }], ["items:stone", { effortWeight: 10 }]]);
  const result = calculateCraftPlanEffortProgress({ baselinePlan, currentPlan, weights });
  assert.equal(result.sections.Carpentry.completion, 75);
  assert.equal(result.sections.Masonry.completion, 0);
  assert.deepEqual(result.overall, { state: "ready", baselineEffort: 300, remainingEffort: 150, completion: 50 });
});

test("a missing weight disables only its section and overall", () => {
  const baselinePlan = { materials: [
    { key: "items:known", section: "Carpentry", bufferedRequired: 10, missing: 10 },
    { key: "items:unknown", section: "Fishing", bufferedRequired: 5, missing: 5 },
  ], personalViews: { fishing: { tiers: [] } } };
  const currentPlan = { materials: [
    { key: "items:known", section: "Carpentry", bufferedRequired: 10, missing: 0 },
    { key: "items:unknown", section: "Fishing", bufferedRequired: 5, missing: 5 },
  ], personalViews: { fishing: { tiers: [] } } };
  const result = calculateCraftPlanEffortProgress({ baselinePlan, currentPlan, weights: new Map([["items:known", { effortWeight: 2 }]]) });
  assert.equal(result.sections.Carpentry.completion, 100);
  assert.equal(result.sections.Fishing.state, "unavailable");
  assert.equal(result.overall.state, "unavailable");
  assert.deepEqual(result.coverage.missingWeightKeys, ["items:unknown"]);
});
```

- [ ] **Step 2: Verify the test fails for the missing module**

Run:

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/craft-plan-effort-progress.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement candidate validation and aggregation**

Use this public foundation; keep exact sums internally and round only response percentages:

```js
export const CRAFT_PLAN_EFFORT_MODEL_VERSION = 1;
const MAX_MISSING_WEIGHT_KEYS = 25;

function positive(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function candidate(method, { catalogKey, sourceKey, actionsRequired = 1, outputQuantity, probability = 1 }) {
  const actions = positive(actionsRequired);
  const quantity = positive(outputQuantity);
  const chance = positive(probability);
  const key = String(catalogKey ?? "").trim();
  if (!key || !actions || !quantity || !chance || chance > 1) return null;
  const effortWeight = actions / (quantity * chance);
  return Number.isFinite(effortWeight) && effortWeight > 0
    ? { catalogKey: key, sourceKey: String(sourceKey ?? "").trim(), method, effortWeight }
    : null;
}

export const craftingEffortCandidate = (input = {}) => candidate("crafting", input);
export const gatheringEffortCandidate = (input = {}) => candidate("gathering", { ...input, actionsRequired: 1 });
```

`selectLowestEffortWeights` returns a `Map` and rejects invalid rows. `calculateCraftPlanEffortProgress` deduplicates baseline material keys, uses baseline `bufferedRequired ?? required`, current `missing`, and the baseline canonical `section`. Return:

```js
{
  modelVersion: CRAFT_PLAN_EFFORT_MODEL_VERSION,
  state: missingWeightCount > 0 && weightedRequiredMaterials > 0 ? "partial" : overall.state,
  overall,
  sections,
  fishingVariants: {},
  coverage: { weightedRequiredMaterials, totalRequiredMaterials, missingWeightCount, missingWeightKeys: [...missing].sort().slice(0, MAX_MISSING_WEIGHT_KEYS) },
  warnings,
}
```

If any baseline row in a section lacks a positive finite weight, that section aggregate and overall are unavailable while the top-level state is `partial` when at least one other material is weighted. Return `empty` with 100% only when the valid plan has no material requirements. All values are clamped to `0-100`.

- [ ] **Step 4: Run the new test and commit**

Run the Step 2 command; expect PASS. Then:

```powershell
git add apps/bitcraft-local/src/server/craftPlanEffortProgress.mjs apps/bitcraft-local/test/craft-plan-effort-progress.test.mjs
git commit -m "feat: add craft plan effort model"
```

### Task 2: Versioned Catalog Effort Storage

**Files:**
- Modify: `apps/bitcraft-local/src/server/schemaBootstrap.mjs:226-285`
- Modify: `apps/bitcraft-local/src/server/schemaMigrations.mjs:1-45`
- Modify: `apps/bitcraft-local/src/server/gameCatalog.mjs:3-820`
- Modify: `apps/bitcraft-local/test/game-catalog.test.mjs`
- Modify: `apps/bitcraft-local/test/server-schema-migrations.test.mjs`

**Interfaces:**
- Consumes: `selectLowestEffortWeights` from Task 1.
- Produces: repository methods `listCraftingEffortCandidates()`, `replaceEffortWeights(candidates, modelVersion, updatedAt)`, `getEffortWeights(modelVersion)`, and `getEffortWeightRevision(modelVersion)`.
- Consumers: Tasks 3 and 5.

- [ ] **Step 1: Write failing schema, normalization, and repository tests**

Add bootstrap assertions for `action_count` and `game_catalog_effort_weights`, a migration test starting from the old recipe table, and this repository test:

```js
test("catalog stores action counts and atomically replaces versioned effort weights", () => {
  const db = new DatabaseSync(":memory:");
  applySchemaBootstrap(db);
  const repository = createGameCatalogRepository(db);
  repository.upsertDetail(baitAndShellsDetail, { updatedAt: "2026-07-14T12:00:00.000Z" });
  assert.equal(repository.listCraftingEffortCandidates().some((row) => row.actionsRequired > 0), true);
  repository.replaceEffortWeights([{ catalogKey: "items:1110010", effortWeight: 21.31, method: "crafting", sourceKey: "recipe:10" }], 1, "2026-07-14T12:01:00.000Z");
  assert.equal(repository.getEffortWeights(1).get("items:1110010").effortWeight, 21.31);
  repository.replaceEffortWeights([{ catalogKey: "items:1110010", effortWeight: 19, method: "gathering", sourceKey: "resource:20" }], 1, "2026-07-14T12:02:00.000Z");
  assert.deepEqual([...repository.getEffortWeights(1).keys()], ["items:1110010"]);
  assert.equal(repository.getEffortWeightRevision(1), "2026-07-14T12:02:00.000Z");
});
```

- [ ] **Step 2: Verify focused tests fail**

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/game-catalog.test.mjs apps/bitcraft-local/test/server-schema-migrations.test.mjs
```

Expected: FAIL for the missing column, table, and repository methods.

- [ ] **Step 3: Add the additive schema and migration**

Add `action_count REAL NOT NULL DEFAULT 1` to `game_catalog_recipes` and this table:

```sql
CREATE TABLE IF NOT EXISTS game_catalog_effort_weights (
  catalog_key TEXT NOT NULL,
  model_version INTEGER NOT NULL,
  effort_weight REAL NOT NULL CHECK (effort_weight > 0),
  method TEXT NOT NULL CHECK (method IN ('crafting', 'gathering')),
  source_key TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (catalog_key)
);
```

Add `{ table: "game_catalog_recipes", column: "action_count", definition: "REAL NOT NULL DEFAULT 1" }` to additive migrations. Do not rewrite old catalog rows. Update the existing `baitAndShellsDetail.detail.craftingRecipes[0]` fixture with `actionsRequired: 12` and pass `baitAndShellsDetail` to `repository.upsertDetail`; do not introduce a second fixture helper.

- [ ] **Step 4: Preserve action counts and implement repository methods**

Increment `GAME_CATALOG_NORMALIZATION_VERSION` from `3` to `4`. Normalize:

```js
function recipeActionCount(recipe) {
  return Math.max(0, toNumber(recipe?.actionsRequired ?? recipe?.actions_required ?? recipe?.actionCount ?? recipe?.action_count ?? 1, 1));
}
```

Store/map `actionCount`. `listCraftingEffortCandidates()` returns direct recipe outputs and item-list co-products whose producer has a stored non-transport recipe, including `actionsRequired`, expected `outputQuantity`, `probability`, and stable `sourceKey`. Exclude non-positive rows.

Implement replacement as one `BEGIN IMMEDIATE` transaction: delete the current weight set, insert the selected lowest candidate per key with the supplied model version, commit; roll back on error. `getEffortWeights(modelVersion)` returns an empty `Map` for a different stored model; `getEffortWeightRevision(modelVersion)` is `MAX(updated_at)` for the compatible model or `null`.

- [ ] **Step 5: Run focused tests and commit**

Run Step 2; expect PASS. Then:

```powershell
git add apps/bitcraft-local/src/server/schemaBootstrap.mjs apps/bitcraft-local/src/server/schemaMigrations.mjs apps/bitcraft-local/src/server/gameCatalog.mjs apps/bitcraft-local/test/game-catalog.test.mjs apps/bitcraft-local/test/server-schema-migrations.test.mjs
git commit -m "feat: store catalog effort weights"
```

### Task 3: Resource Weight Refresh and Compatibility Gate

**Files:**
- Modify: `apps/bitcraft-local/src/server/craftPlanEffortProgress.mjs`
- Modify: `apps/bitcraft-local/server.mjs:470-900,1081-1095`
- Modify: `apps/bitcraft-local/test/craft-plan-effort-progress.test.mjs`
- Modify: `apps/bitcraft-local/test/server-recipe-catalog.test.mjs`
- Modify: `apps/bitcraft-local/test/craft-planning-boundary.test.mjs`

**Interfaces:**
- Produces: `normalizeGameResourceEffortCandidates(payload)` and a compatible weight set gated by `game_catalog_effort_model_version`.
- Consumers: Task 5.

- [ ] **Step 1: Add failing resource and promotion tests**

```js
test("resource outputs become gathering effort candidates", () => {
  const candidates = normalizeGameResourceEffortCandidates({ resources: [{ id: 44, outputs: [
    { itemId: 700, itemType: 0, quantity: 1, probability: 0.02 },
    { itemId: 700, itemType: 0, quantity: 2, chance: 5 },
    { itemId: 700, itemType: 1, quantity: 1, chance: 0.5 },
  ] }] });
  assert.deepEqual(candidates.map((row) => [row.catalogKey, row.effortWeight]), [["items:700", 50], ["items:700", 10], ["cargo:700", 2]]);
});
```

Add server assertions that refresh fetches `/resources`, replaces weights before writing the compatible model setting, and retains the prior set if resource fetching fails.

- [ ] **Step 2: Verify focused tests fail**

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/craft-plan-effort-progress.test.mjs apps/bitcraft-local/test/server-recipe-catalog.test.mjs apps/bitcraft-local/test/craft-planning-boundary.test.mjs
```

Expected: FAIL for resource normalization and promotion.

- [ ] **Step 3: Normalize gathering outputs**

Support resource arrays at `resources`, `data.resources`, or `results`, and output arrays named `outputs`, `items`, `itemListPossibilities`, or `resourceOutputs`. Resolve:

```js
const id = output.itemId ?? output.item_id ?? output.targetId ?? output.targetItem?.id;
const kind = output.isCargo === true || String(output.itemType ?? output.item_type) === "1" ? "cargo" : "items";
const rawChance = Number(output.probability ?? output.chance ?? output.dropChance);
const probability = rawChance > 1 ? rawChance / 100 : rawChance;
const outputQuantity = Number(output.quantity ?? output.amount ?? 1);
```

Return only valid `gatheringEffortCandidate` rows with `sourceKey: resource:<id>` and full item/cargo keys.

- [ ] **Step 4: Promote weights at successful refresh completion**

Before marking `runRecipeCatalogRefreshJob` complete:

```js
const resourcesPayload = await fetchBitjita("/resources", { cache: false });
const candidates = [
  ...gameCatalogRepository.listCraftingEffortCandidates().map(craftingEffortCandidate).filter(Boolean),
  ...normalizeGameResourceEffortCandidates(resourcesPayload),
];
const effortUpdatedAt = new Date().toISOString();
gameCatalogRepository.replaceEffortWeights(candidates, CRAFT_PLAN_EFFORT_MODEL_VERSION, effortUpdatedAt);
statements.upsertSetting.run("game_catalog_effort_model_version", String(CRAFT_PLAN_EFFORT_MODEL_VERSION), effortUpdatedAt);
```

Let failures abort before the setting update. Extend catalog status with `effortModelVersion`, `effortCompatible`, `effortWeightCount`, and `effortUpdatedAt`.

- [ ] **Step 5: Run focused tests and commit**

Run Step 2; expect PASS. Then:

```powershell
git add apps/bitcraft-local/src/server/craftPlanEffortProgress.mjs apps/bitcraft-local/server.mjs apps/bitcraft-local/test/craft-plan-effort-progress.test.mjs apps/bitcraft-local/test/server-recipe-catalog.test.mjs apps/bitcraft-local/test/craft-planning-boundary.test.mjs
git commit -m "feat: derive effort weights during catalog refresh"
```

### Task 4: Guaranteed-Only Requirement Satisfaction

**Files:**
- Modify: `apps/bitcraft-local/src/server/craftPlanning.mjs:936-1300`
- Modify: `apps/bitcraft-local/test/craft-planning.test.mjs`
- Modify: `apps/bitcraft-local/test/craft-planning-needs-board.test.mjs`

**Interfaces:**
- Produces: `missing` and recursive expansion based on `available + guaranteedInProgress`, with estimated totals retained for display.
- Consumers: Tasks 5-7.

- [ ] **Step 1: Add failing confirmed-only tests**

```js
test("estimated active output stays visible but does not satisfy or stop expansion", () => {
  const plan = computeCraftPlan({
    config: { enabled: true, targets: [{ id: "1900", kind: "items", quantity: 10 }], sourceRules: { craftPlayerIds: ["player"] } },
    detailsByKey: fishingPreferenceDetails(),
    activeCrafts: [{ id: "craft", playerId: "player", itemId: "1900", kind: "items", quantity: 5.9, guaranteedQuantity: 0, name: "Fish Oil" }],
  });
  const oil = plan.materials.find((item) => item.key === "items:1900");
  assert.equal(oil.inProgress, 5);
  assert.equal(oil.guaranteedInProgress, 0);
  assert.equal(oil.estimatedInProgress, 5);
  assert.equal(oil.missing, 10);
  assert.equal(plan.materials.some((item) => item.key === "items:1901" && item.missing > 0), true);
});

test("guaranteed active output satisfies requirements", () => {
  const plan = computeCraftPlan({
    config: { enabled: true, targets: [{ id: "1900", kind: "items", quantity: 10 }], sourceRules: { craftPlayerIds: ["player"] } },
    detailsByKey: fishingPreferenceDetails(),
    activeCrafts: [{ id: "craft", playerId: "player", itemId: "1900", kind: "items", quantity: 5, guaranteedQuantity: 5, name: "Fish Oil" }],
  });
  assert.equal(plan.materials.find((item) => item.key === "items:1900").missing, 5);
});

test("Needs Board covers quantities with guaranteed output only", () => {
  const board = buildNeedsBoard([{ key: "items:1", name: "Plank", tag: "Plank", tier: 1, section: "Carpentry", required: 10, available: 2, inProgress: 7, guaranteedInProgress: 3, estimatedInProgress: 4, missing: 5 }], []);
  assert.equal(board[0].covered, 5);
});
```

- [ ] **Step 2: Verify current behavior fails**

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/craft-planning.test.mjs apps/bitcraft-local/test/craft-planning-needs-board.test.mjs
```

Expected: FAIL because expected output currently enters effective stock and board coverage.

- [ ] **Step 3: Separate visible totals from confirmed totals**

Retain `countedActiveCraftTotals` for display, but build recursive effective stock from `guaranteedTotal` only:

```js
const effectiveStockTotals = new Map(availableTotals);
for (const [key, active] of countedActiveTotals.entries()) {
  if (active.guaranteedTotal <= 0) continue;
  const current = effectiveStockTotals.get(key) ?? { total: 0, sources: [] };
  effectiveStockTotals.set(key, { ...current, total: current.total + active.guaranteedTotal, sources: current.sources });
}
```

Keep `inProgress = active.total`, `guaranteedInProgress`, and `estimatedInProgress`, but calculate `missing` with only `available + guaranteedInProgress`. In `buildPersonalFishingView`, use guaranteed tracked quantities for oil equivalence, remaining oil, route needed quantities, and requirement satisfaction; keep all three tracked fields visible.

- [ ] **Step 4: Make board quantity coverage confirmed-only**

Use `available + guaranteedInProgress` for cell/group covered. For legacy fixtures lacking the guaranteed field, treat `inProgress` as guaranteed only when `estimatedInProgress` is absent or zero.

- [ ] **Step 5: Run focused tests and commit**

Run Step 2; expect PASS. Then:

```powershell
git add apps/bitcraft-local/src/server/craftPlanning.mjs apps/bitcraft-local/test/craft-planning.test.mjs apps/bitcraft-local/test/craft-planning-needs-board.test.mjs
git commit -m "fix: count only guaranteed craft output in planner progress"
```

### Task 5: Baseline Projection, Fishing Variants, Cache, and API Integration

**Files:**
- Create: `apps/bitcraft-local/src/server/craftPlanEffortCache.mjs`
- Create: `apps/bitcraft-local/test/craft-plan-effort-cache.test.mjs`
- Modify: `apps/bitcraft-local/src/server/craftPlanEffortProgress.mjs`
- Modify: `apps/bitcraft-local/src/server/craftPlanning.mjs:1299-1338`
- Modify: `apps/bitcraft-local/server.mjs:94,1770-1795,2205-2292,8960-8980`
- Modify: `apps/bitcraft-local/test/craft-plan-effort-progress.test.mjs`
- Modify: `apps/bitcraft-local/test/craft-planning.test.mjs`
- Modify: `apps/bitcraft-local/test/craft-planning-boundary.test.mjs`

**Interfaces:**
- Consumes: effort weights from Task 3 and confirmed live `missing` from Task 4.
- Produces: `compactCraftPlanEffortInput(plan)`, `effortProgress` on full/compact responses, and baseline cache telemetry.
- Consumers: Tasks 6 and 7.

- [ ] **Step 1: Add failing Fishing projection tests**

Build a fixture containing Fish Oil, Crushed Shells, Ocean Fish, and Lake Fish. It must prove the interchangeable fish input is replaced once rather than double-counted:

```js
function fishingPlan({ current = false } = {}) {
  return {
    materials: [
      { key: "items:oil", tag: "Fish Oil", section: "Fishing", bufferedRequired: 100, missing: current ? 40 : 100 },
      { key: "items:shells", tag: "Crushed Shells", section: "Fishing", bufferedRequired: 100, missing: current ? 45.6 : 100 },
      { key: "items:ocean", tag: "Ocean Fish", section: "Fishing", bufferedRequired: 100, missing: current ? 42.8 : 100 },
      { key: "items:lake", tag: "Lake Fish", section: "Fishing", bufferedRequired: 10, missing: current ? 4.28 : 10 },
    ],
    personalViews: { fishing: { tiers: [{ routes: {
      ocean: { available: true, input: { key: "items:ocean", tag: "Ocean Fish" }, needed: current ? 42.8 : 100, stockQuantity: 0, guaranteedTrackedQuantity: 0 },
      lake: { available: true, input: { key: "items:lake", tag: "Lake Fish" }, needed: current ? 4.28 : 10, stockQuantity: 0, guaranteedTrackedQuantity: 0 },
    } }] } },
  };
}

function fishingWeights() {
  return new Map([
    ["items:oil", { effortWeight: 1 }],
    ["items:shells", { effortWeight: 1 }],
    ["items:ocean", { effortWeight: 1 }],
    ["items:lake", { effortWeight: 2 }],
  ]);
}

test("Fishing variants replace only interchangeable fish inputs", () => {
  const result = calculateCraftPlanEffortProgress({ baselinePlan: fishingPlan(), currentPlan: fishingPlan({ current: true }), weights: fishingWeights() });
  assert.equal(result.fishingVariants.ocean.sections.Fishing.completion, 57.2);
  assert.equal(result.fishingVariants.lake.sections.Fishing.completion, 57.2);
  assert.notEqual(result.fishingVariants.ocean.overall.baselineEffort, result.fishingVariants.lake.overall.baselineEffort);
  assert.equal(result.fishingVariants.ocean.route, "ocean");
  assert.equal(result.fishingVariants.lake.route, "lake");
});
```

- [ ] **Step 2: Add failing stable-key, concurrency, and bound tests**

```js
import { createCraftPlanEffortBaselineCache, craftPlanEffortBaselineKey } from "../src/server/craftPlanEffortCache.mjs";

test("baseline cache shares concurrent work", async () => {
  const cache = createCraftPlanEffortBaselineCache({ maxEntries: 2, maxBytes: 1024 });
  let calls = 0;
  const load = async () => { calls += 1; return { materials: [{ key: "items:1", required: 10 }] }; };
  const [first, second] = await Promise.all([cache.getOrCreate("same", load), cache.getOrCreate("same", load)]);
  assert.strictEqual(first, second);
  assert.equal(calls, 1);
  assert.equal(cache.stats().inflightReuse, 1);
});

test("baseline keys include config, catalog revision, and model version", () => {
  const config = { targets: [{ id: "1", kind: "items", quantity: 1 }], routeOverrides: {} };
  assert.notEqual(craftPlanEffortBaselineKey(config, "catalog-a", 1), craftPlanEffortBaselineKey(config, "catalog-b", 1));
  assert.notEqual(craftPlanEffortBaselineKey(config, "catalog-a", 1), craftPlanEffortBaselineKey({ ...config, routeOverrides: { "items:1": "recipe:2" } }, "catalog-a", 1));
});

test("baseline cache drops rejected and oversized loads and evicts the oldest entry", async () => {
  const cache = createCraftPlanEffortBaselineCache({ maxEntries: 2, maxBytes: 80 });
  await assert.rejects(cache.getOrCreate("bad", async () => { throw new Error("failed"); }), /failed/);
  await cache.getOrCreate("a", async () => ({ value: "a" }));
  await cache.getOrCreate("b", async () => ({ value: "b" }));
  await cache.getOrCreate("c", async () => ({ value: "c" }));
  assert.equal(cache.stats().entries, 2);
  await cache.getOrCreate("oversized", async () => ({ value: "x".repeat(100) }));
  assert.equal(cache.stats().entries, 2);
});
```

- [ ] **Step 3: Verify model/cache tests fail**

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/craft-plan-effort-progress.test.mjs apps/bitcraft-local/test/craft-plan-effort-cache.test.mjs
```

Expected: FAIL for the missing cache and Fishing variants.

- [ ] **Step 4: Implement compact projections and Fishing variants**

`compactCraftPlanEffortInput(plan)` returns only the material fields `{ key, tag, section, required, missing }` plus Fishing tier route fields `{ available, reason, input.key, input.tag, needed, stockQuantity, guaranteedTrackedQuantity }`. It must not retain sources, usages, steps, alternatives, or display payloads. `projectCraftPlanEffortMaterials(plan, fishingRoute = null)` consumes either that compact input or the full live plan and returns only `{ key, section, required, missing }`. Ordinary rows use `bufferedRequired ?? required` and `missing`.

For a Fishing route:

1. Remove only canonical Ocean/Lake Fish input rows in Fishing.
2. Select `routes[fishingRoute]` for every `personalViews.fishing.tiers` entry.
3. Add that input with `required = needed + stockQuantity + guaranteedTrackedQuantity` and `missing = needed`.
4. Leave Fish Oil, Crushed Shells, Baitfish, and other Fishing rows unchanged.
5. If the selected route is unavailable, make only that variant unavailable with its reason.

Calculate non-Fishing sections once and return:

```js
fishingVariants: {
  ocean: { route: "ocean", overall, sections },
  lake: { route: "lake", overall, sections },
}
```

- [ ] **Step 5: Implement the bounded baseline cache**

Create a stable recursively key-sorted JSON value and hash it with SHA-256:

```js
import { createHash } from "node:crypto";

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

export function craftPlanEffortBaselineKey(config, catalogRevision, modelVersion) {
  return createHash("sha256").update(JSON.stringify(stable({ config, catalogRevision, modelVersion }))).digest("hex");
}

export function createCraftPlanEffortBaselineCache({ maxEntries = 16, maxBytes = 2 * 1024 * 1024 } = {}) {
  const values = new Map();
  const inflight = new Map();
  const counters = { hits: 0, misses: 0, inflightReuse: 0 };
  let bytes = 0;
  let generation = 0;
  function evict() {
    while (values.size > maxEntries || bytes > maxBytes) {
      const oldest = values.keys().next().value;
      if (oldest == null) break;
      bytes -= values.get(oldest).bytes;
      values.delete(oldest);
    }
  }
  return {
    async getOrCreate(key, loader) {
      if (values.has(key)) {
        counters.hits += 1;
        const entry = values.get(key);
        values.delete(key);
        values.set(key, entry);
        return entry.value;
      }
      if (inflight.has(key)) {
        counters.inflightReuse += 1;
        return inflight.get(key);
      }
      counters.misses += 1;
      const loadGeneration = generation;
      const promise = Promise.resolve().then(loader).then((value) => {
        const entryBytes = Buffer.byteLength(JSON.stringify(value));
        if (loadGeneration === generation && entryBytes <= maxBytes) {
          values.set(key, { value, bytes: entryBytes });
          bytes += entryBytes;
          evict();
        }
        return value;
      }).finally(() => { if (inflight.get(key) === promise) inflight.delete(key); });
      inflight.set(key, promise);
      return promise;
    },
    clear() { generation += 1; values.clear(); inflight.clear(); bytes = 0; },
    stats() { return { ...counters, entries: values.size, bytes }; },
  };
}
```

The cache exposes `getOrCreate(key, loader)`, `clear()`, and `stats()`. Measure bytes with `Buffer.byteLength(JSON.stringify(value))`; evict oldest resolved entries until both limits are satisfied. Never retain a rejected promise. Track `hits`, `misses`, `inflightReuse`, `entries`, and `bytes`.

- [ ] **Step 6: Attach effort progress inside the existing shared calculation**

In `computedCraftPlanResponseFresh`:

1. Require stored `game_catalog_effort_model_version` to equal `CRAFT_PLAN_EFFORT_MODEL_VERSION`.
2. Read weight revision and weight map once.
3. Compute the live plan exactly once.
4. Get/create the no-source/no-craft baseline using `compactCraftPlanEffortInput(computeCraftPlan({ config, detailsByKey, catalogWarnings }))`; cache only this compact input, never the full baseline plan.
5. Attach `calculateCraftPlanEffortProgress(...)` to the live plan.

When incompatible, attach this state instead of throwing or using raw completion:

```js
{
  modelVersion: CRAFT_PLAN_EFFORT_MODEL_VERSION,
  state: "unavailable",
  overall: { state: "unavailable", baselineEffort: null, remainingEffort: null, completion: null },
  sections: {},
  fishingVariants: {},
  coverage: { weightedRequiredMaterials: 0, totalRequiredMaterials: 0, missingWeightCount: 0, missingWeightKeys: [] },
  warnings: ["Effort progress is unavailable until the planner catalog refresh completes."],
}
```

Keep `CRAFT_PLAN_RESPONSE_CACHE_TTL_MS` at 20 seconds. Clear the baseline cache when settings change and when compatible weights are promoted; increment `craftPlanResponseGeneration` on promotion.

- [ ] **Step 7: Extend telemetry and compact-response tests**

Add `baselineHits`, `baselineMisses`, `baselineInflightReuse`, `baselineEntries`, `baselineBytes`, and `lastBaselineDurationMs` to `plannerTelemetry`. Copy numbers, never payloads. Verify compact JSON includes aggregates but no candidate list, full weights, or per-material `effortWeight`.

- [ ] **Step 8: Run focused integration tests and commit**

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/craft-plan-effort-progress.test.mjs apps/bitcraft-local/test/craft-plan-effort-cache.test.mjs apps/bitcraft-local/test/craft-planning.test.mjs apps/bitcraft-local/test/craft-planning-boundary.test.mjs
git add apps/bitcraft-local/src/server/craftPlanEffortCache.mjs apps/bitcraft-local/src/server/craftPlanEffortProgress.mjs apps/bitcraft-local/src/server/craftPlanning.mjs apps/bitcraft-local/server.mjs apps/bitcraft-local/test/craft-plan-effort-cache.test.mjs apps/bitcraft-local/test/craft-plan-effort-progress.test.mjs apps/bitcraft-local/test/craft-planning.test.mjs apps/bitcraft-local/test/craft-planning-boundary.test.mjs
git commit -m "feat: serve cached craft plan effort progress"
```

Expected: tests PASS and concurrent identical requests perform one baseline load.

### Task 6: Needs Board Effort Presentation

**Files:**
- Create: `apps/bitcraft-local/src/pages/craftPlanningEffortView.ts`
- Create: `apps/bitcraft-local/test/craft-planning-effort-view.test.mjs`
- Modify: `apps/bitcraft-local/src/pages/CraftPlanningPage.tsx:1-180,520-560`
- Modify: `apps/bitcraft-local/src/pages/craftPlanningNeedsBoard.ts:31-42,145-155`
- Modify: `apps/bitcraft-local/src/pages/craftPlanningFishingView.ts:109-120`
- Modify: `apps/bitcraft-local/src/styles/craft-planning.css`
- Modify: `apps/bitcraft-local/test/craft-planning-needs-board.test.mjs`
- Modify: `apps/bitcraft-local/test/craft-planning-fishing-view.test.mjs`
- Modify: `apps/bitcraft-local/test/craft-planning-boundary.test.mjs`
- Modify: `apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs`

**Interfaces:**
- Consumes: compact `effortProgress` and browser-local `FishingRoutePreference`.
- Produces: `selectCraftPlanningEffortView(summary, route)` and effort-based rendering.

- [ ] **Step 1: Write failing selector tests**

```js
test("effort view selects matching Fishing and overall aggregates", () => {
  const selected = selectCraftPlanningEffortView({
    state: "ready",
    overall: { state: "ready", baselineEffort: 100, remainingEffort: 50, completion: 50 },
    sections: { Carpentry: { state: "ready", baselineEffort: 20, remainingEffort: 5, completion: 75 } },
    fishingVariants: { lake: {
      overall: { state: "ready", baselineEffort: 80, remainingEffort: 30.96, completion: 61.3 },
      sections: { Fishing: { state: "ready", baselineEffort: 50, remainingEffort: 21.4, completion: 57.2 } },
    } },
  }, "lake");
  assert.equal(selected.overall.completion, 61.3);
  assert.equal(selected.sections.Fishing.completion, 57.2);
  assert.equal(selected.route, "lake");
});

test("effort view preserves unavailable states", () => {
  const selected = selectCraftPlanningEffortView({ state: "unavailable", warnings: ["Catalog refresh required"] }, "ocean");
  assert.equal(selected.overall.completion, null);
  assert.equal(selected.state, "unavailable");
  assert.deepEqual(selected.warnings, ["Catalog refresh required"]);
});
```

- [ ] **Step 2: Verify selector test fails**

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/craft-planning-effort-view.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement typed selection without manufactured values**

Define `EffortAggregate`, `EffortProgressSummary`, and `CraftPlanningEffortView`. Normalize invalid numbers to `null`. Prefer `summary.fishingVariants[route]` for both Fishing and overall; use base aggregates only if the selected variant is absent and Fishing is not in the plan. Implement the selector with this validation shape:

```ts
type EffortState = "ready" | "partial" | "unavailable" | "empty";
export type EffortAggregate = { state: EffortState; baselineEffort: number | null; remainingEffort: number | null; completion: number | null };
export type EffortProgressSummary = { state: EffortState; overall?: EffortAggregate; sections?: Record<string, EffortAggregate>; fishingVariants?: Partial<Record<FishingRoutePreference, { overall: EffortAggregate; sections: Record<string, EffortAggregate> }>>; warnings?: string[] };
export type CraftPlanningEffortView = { state: EffortState; route: FishingRoutePreference; overall: EffortAggregate; sections: Record<string, EffortAggregate>; warnings: string[] };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function finite(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function aggregate(value: unknown): EffortAggregate {
  const source = record(value);
  const completion = finite(source.completion);
  const state = source.state === "ready" && completion != null ? "ready" : "unavailable";
  return { state, baselineEffort: finite(source.baselineEffort), remainingEffort: finite(source.remainingEffort), completion: state === "ready" ? completion : null };
}

export function selectCraftPlanningEffortView(summary: unknown, route: FishingRoutePreference): CraftPlanningEffortView {
  const root = record(summary);
  const variants = record(root.fishingVariants);
  const variant = record(variants[route]);
  const baseSections = record(root.sections);
  const variantSections = record(variant.sections);
  const sectionEntries = Object.entries({ ...baseSections, ...variantSections }).map(([name, value]) => [name, aggregate(value)]);
  const state = ["ready", "partial", "unavailable", "empty"].includes(String(root.state)) ? root.state as EffortState : "unavailable";
  return {
    state,
    route,
    overall: aggregate(Object.keys(variant).length ? variant.overall : root.overall),
    sections: Object.fromEntries(sectionEntries),
    warnings: Array.isArray(root.warnings) ? root.warnings.map(String).slice(0, 25) : [],
  };
}
```

- [ ] **Step 4: Stop frontend helpers authoring percentages**

Keep `NeedGroup.required` and `covered` for quantity cells, but make `completion` optional/deprecated and stop calling `needsBoardCompletion` from the page. Fishing projection continues recalculating quantities but is not the displayed percentage source.

- [ ] **Step 5: Render effort progress and explicit unavailable copy**

Derive:

```tsx
const effortView = React.useMemo(
  () => selectCraftPlanningEffortView(plan?.effortProgress, normalizedFishingRoute),
  [plan?.effortProgress, normalizedFishingRoute],
);
```

Header copy:

```tsx
<strong>{effortView.overall.completion == null ? "—" : `${effortView.overall.completion}%`}</strong>
<small>{effortView.overall.completion == null ? "Effort progress unavailable" : "Effort complete"}</small>
<em>Confirmed stock and guaranteed active crafts.</em>
```

Sections use `effortView.sections[group.section]` and show `Effort unavailable` when needed. Cell supplied quantities use stock plus guaranteed output. Estimated output remains in tooltips/details as `estimated; not counted toward progress`. For probabilistic source requirements, render the existing estimated indicator with an accessible label such as `4,400 Lake Fish estimated from expected processing yield`; it must not use the covered/active color treatment. Never flash legacy percentages during refresh.

- [ ] **Step 6: Add minimal styles and boundary assertions**

```css
.craft-plan-overall-progress.is-unavailable > div { opacity: .35; }
.craft-plan-needs-section-label .is-unavailable { color: var(--text-muted); font-size: 11px; }
.craft-plan-effort-note { color: var(--text-muted); }
```

Assert the page contains `Effort complete`, `Confirmed stock and guaranteed active crafts`, and `Effort progress unavailable`, calls the selector, and no longer calls `needsBoardCompletion`. Update Fishing tests to verify quantities without treating `group.completion` as authoritative.

- [ ] **Step 7: Run focused frontend tests/build and commit**

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/craft-planning-effort-view.test.mjs apps/bitcraft-local/test/craft-planning-needs-board.test.mjs apps/bitcraft-local/test/craft-planning-fishing-view.test.mjs apps/bitcraft-local/test/craft-planning-boundary.test.mjs apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
git add apps/bitcraft-local/src/pages/craftPlanningEffortView.ts apps/bitcraft-local/src/pages/CraftPlanningPage.tsx apps/bitcraft-local/src/pages/craftPlanningNeedsBoard.ts apps/bitcraft-local/src/pages/craftPlanningFishingView.ts apps/bitcraft-local/src/styles/craft-planning.css apps/bitcraft-local/test/craft-planning-effort-view.test.mjs apps/bitcraft-local/test/craft-planning-needs-board.test.mjs apps/bitcraft-local/test/craft-planning-fishing-view.test.mjs apps/bitcraft-local/test/craft-planning-boundary.test.mjs apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs
git commit -m "feat: show effort progress on the needs board"
```

Expected: focused tests PASS and the production build completes.

### Task 7: Discord Reports Use the Same Effort Summary

**Files:**
- Modify: `apps/bitcraft-local/src/server/craftPlanDiscordReports.mjs:14-110,214-260`
- Modify: `apps/bitcraft-local/test/server-craft-plan-discord-reports.test.mjs`
- Modify: `apps/bitcraft-local/test/server-craft-plan-discord-boundary.test.mjs`

**Interfaces:**
- Consumes: `plan.effortProgress.fishingVariants.ocean`.
- Produces: scheduled, test, and slash-command embeds with page-identical percentages.

- [ ] **Step 1: Write failing Discord tests where raw and effort completion differ**

```js
function makeEffortProgress({ overall, ...sections }) {
  const mapped = Object.fromEntries(Object.entries(sections).map(([name, completion]) => [name, { state: "ready", baselineEffort: 100, remainingEffort: 100 - completion, completion }]));
  const overallAggregate = { state: "ready", baselineEffort: 100, remainingEffort: 100 - overall, completion: overall };
  return {
    state: "ready",
    overall: overallAggregate,
    sections: mapped,
    fishingVariants: { ocean: { route: "ocean", overall: overallAggregate, sections: mapped } },
    warnings: [],
  };
}

test("Discord overview uses server effort progress", () => {
  const report = buildCraftPlanDiscordReport({ enabled: true, targets: [{}], materials, effortProgress: makeEffortProgress({ overall: 72.5, Fishing: 57.2, Forestry: 100 }) });
  assert.equal(report.overall.completion, 72.5);
  assert.equal(report.professions.find((row) => row.name === "Fishing").completion, 57.2);
  assert.equal(report.fishingRoute, "ocean");
});

test("Discord refuses a raw fallback when effort is unavailable", () => {
  const report = buildCraftPlanDiscordReport({ enabled: true, targets: [{}], materials, effortProgress: { state: "unavailable", warnings: ["Catalog refresh required"] } });
  assert.equal(report.state, "unavailable");
  assert.match(report.message, /catalog refresh/i);
  assert.equal(report.overall, undefined);
});

test("Discord labels estimated active output as excluded", () => {
  const estimatedMaterials = materials.map((item, index) => index === 0 ? { ...item, guaranteedInProgress: 0, estimatedInProgress: 10 } : item);
  const report = buildCraftPlanDiscordReport({ enabled: true, targets: [{}], materials: estimatedMaterials, effortProgress: makeEffortProgress({ overall: 72.5, Forestry: 70, Carpentry: 60, Tailoring: 50 }) });
  assert.match(JSON.stringify(buildCraftPlanDiscordEmbed(report)), /shown but not counted toward progress/i);
});
```

- [ ] **Step 2: Verify existing raw summary fails**

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/server-craft-plan-discord-reports.test.mjs apps/bitcraft-local/test/server-craft-plan-discord-boundary.test.mjs
```

Expected: FAIL because `summarize()` still authors quantity percentages.

- [ ] **Step 3: Consume the Ocean server aggregate**

Keep `summarize(materials)` only for required/confirmed covered units, completed/total requirements, and estimated disclosure. Remove its percentage calculation. Select:

```js
function boundedEffortWarning(summary = {}) {
  const warning = Array.isArray(summary?.warnings) ? summary.warnings.find((value) => String(value).trim()) : "";
  return String(warning || "Effort progress is temporarily unavailable while the planner catalog refreshes.").replaceAll("@", "@\u200b").slice(0, 500);
}

const effort = plan.effortProgress?.fishingVariants?.ocean ?? plan.effortProgress;
if (!effort || effort.overall?.completion == null) {
  return { state: "unavailable", title: profession ? `${profession} Progress` : "Crafting Progress", message: boundedEffortWarning(plan.effortProgress) };
}
```

Merge quantity context with `effort.overall.completion`; use `effort.sections[name].completion` for professions. Return an explicit unavailable profession report when its section lacks weights. Add `fishingRoute: "ocean"` whenever Fishing is present.

- [ ] **Step 4: Update embed wording while preserving the grid**

```js
const effortLine = `${progressSummary(report.overall)}\nEffort complete from confirmed stock and guaranteed active crafts`;
const estimateNote = number(report.overall.estimatedCraftOutput) > 0
  ? `*${Math.floor(number(report.overall.estimatedCraftOutput)).toLocaleString()} estimated active-craft items are shown but not counted toward progress.*`
  : "";
```

Keep completed requirement counts, shortages, mention suppression, and size limits. State `Fishing route: Ocean` when applicable.

- [ ] **Step 5: Run focused tests and commit**

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/server-craft-plan-discord-reports.test.mjs apps/bitcraft-local/test/server-craft-plan-discord-boundary.test.mjs
git add apps/bitcraft-local/src/server/craftPlanDiscordReports.mjs apps/bitcraft-local/test/server-craft-plan-discord-reports.test.mjs apps/bitcraft-local/test/server-craft-plan-discord-boundary.test.mjs
git commit -m "feat: use effort progress in craft plan reports"
```

Expected: overview, profession, unavailable, complete, limits, slash, scheduled, and test-send paths PASS.

### Task 8: Regression, Performance, Browser, and VPS Rollout Verification

**Files:**
- Modify only if a failing check exposes a defect in files already listed above.

**Interfaces:**
- Consumes: Tasks 1-7.
- Produces: verified release-ready behavior, with no new feature surface.

- [ ] **Step 1: Run all focused feature tests**

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/craft-plan-effort-progress.test.mjs apps/bitcraft-local/test/craft-plan-effort-cache.test.mjs apps/bitcraft-local/test/craft-planning.test.mjs apps/bitcraft-local/test/craft-planning-needs-board.test.mjs apps/bitcraft-local/test/craft-planning-fishing-view.test.mjs apps/bitcraft-local/test/craft-planning-effort-view.test.mjs apps/bitcraft-local/test/game-catalog.test.mjs apps/bitcraft-local/test/server-schema-migrations.test.mjs apps/bitcraft-local/test/server-recipe-catalog.test.mjs apps/bitcraft-local/test/server-craft-plan-discord-reports.test.mjs apps/bitcraft-local/test/server-craft-plan-discord-boundary.test.mjs apps/bitcraft-local/test/craft-planning-boundary.test.mjs apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs
```

Expected: PASS with zero failures.

- [ ] **Step 2: Run the full suite and build**

```powershell
corepack pnpm --filter @workspace/bitcraft-local test
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: full suite PASS and production build completes.

- [ ] **Step 3: Measure local payload and cache reuse**

```powershell
node scripts/start-bitcraft-local-smoke.mjs --force-restart
curl.exe -s http://127.0.0.1:18449/api/local/craft-plan | Set-Content -Encoding utf8 C:\tmp\craft-plan-effort.json
```

Verify the response has one compact `effortProgress`, no raw candidates/weights, and remains within the current compact-response budget. Make concurrent requests and confirm planner telemetry increments baseline reuse/hits while the live calculation remains shared.

- [ ] **Step 4: Browser-check desktop and narrow widths**

At `http://127.0.0.1:18449/?page=planning`, verify overall and all sections show effort completion; Ocean/Lake changes Fishing and overall without a request; quantities/details stay correct; estimates are excluded; missing weights show unavailable; filters, route controls, and dialogs work; and 1440px/390px layouts remain dense.

- [ ] **Step 5: Commit only test-driven corrections, if any**

```powershell
git diff --check
git status --short
git add apps/bitcraft-local/src/server/craftPlanEffortProgress.mjs apps/bitcraft-local/src/server/craftPlanEffortCache.mjs apps/bitcraft-local/src/server/gameCatalog.mjs apps/bitcraft-local/src/server/schemaBootstrap.mjs apps/bitcraft-local/src/server/schemaMigrations.mjs apps/bitcraft-local/src/server/craftPlanning.mjs apps/bitcraft-local/src/server/craftPlanDiscordReports.mjs apps/bitcraft-local/server.mjs apps/bitcraft-local/src/pages/craftPlanningEffortView.ts apps/bitcraft-local/src/pages/CraftPlanningPage.tsx apps/bitcraft-local/src/pages/craftPlanningNeedsBoard.ts apps/bitcraft-local/src/pages/craftPlanningFishingView.ts apps/bitcraft-local/src/styles/craft-planning.css apps/bitcraft-local/test/craft-plan-effort-progress.test.mjs apps/bitcraft-local/test/craft-plan-effort-cache.test.mjs apps/bitcraft-local/test/craft-planning-effort-view.test.mjs apps/bitcraft-local/test/game-catalog.test.mjs apps/bitcraft-local/test/server-schema-migrations.test.mjs apps/bitcraft-local/test/server-recipe-catalog.test.mjs apps/bitcraft-local/test/craft-planning.test.mjs apps/bitcraft-local/test/craft-planning-needs-board.test.mjs apps/bitcraft-local/test/craft-planning-fishing-view.test.mjs apps/bitcraft-local/test/craft-planning-boundary.test.mjs apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs apps/bitcraft-local/test/server-craft-plan-discord-reports.test.mjs apps/bitcraft-local/test/server-craft-plan-discord-boundary.test.mjs
git commit -m "fix: harden effort progress integration"
```

Do not create an empty commit when no correction is required.

- [ ] **Step 6: Perform production catalog rollout after merge/deploy**

Run the normal VPS updater, then trigger **Admin -> Craft Planner -> Refresh planner catalog** once. Do not accept percentages until status reports `effortCompatible: true`, `effortModelVersion: 1`, and `effortWeightCount` above zero. Confirm bounded missing-weight coverage, both Fishing variants, one scheduled report, one Send Test, and one `/craft-plan` response without duplicate messages.

- [ ] **Step 7: Confirm production safeguards**

Server Health must show warm planner latency without material regression, shared simultaneous requests, healthy event-loop/5xx rates, at most 16 baseline entries and 2 MiB, compact responses without weights, and stable web/worker memory. If catalog coverage is incomplete, keep progress unavailable and investigate the bounded missing keys; never add a quantity fallback.
