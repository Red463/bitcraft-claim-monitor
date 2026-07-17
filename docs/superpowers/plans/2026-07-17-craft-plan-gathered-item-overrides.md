# Craft Plan Gathered-Item Overrides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an administrator mark the exact opened Craft Planning cell as gathered so the planner retains that requirement and its downstream usages while stopping producer-recipe expansion at that item.

**Architecture:** Add a normalized `gatheredItemKeys` set to the existing Craft Plan configuration and pass it through local catalog traversal and requirement calculation. The server marks returned materials with `isGatheredOverride`; a small frontend helper owns exact-cell set semantics, while the existing item-detail dialog owns the authenticated toggle, gathered explanation, and Map link. The existing Craft Plan audit stream records each typed item identity enabled or disabled.

**Tech Stack:** Node.js 24, React, TypeScript, Vite, plain CSS, Node test runner, Node built-in SQLite-backed server configuration.

## Global Constraints

- Apply the override to the exact opened tier cell, not the whole material family.
- A cell containing multiple underlying item identities changes all of those identities in one operation.
- Stop traversal toward producer recipes and producer ingredients only; never remove downstream recipes that consume the gathered item.
- Keep required quantity, counted stock, guaranteed active output, missing quantity, `Used for`, grouping, and progress calculations unchanged.
- Preserve saved route overrides and safety buffers while gathered; ignore them until gathering is disabled.
- Keep the admin control behind the existing authenticated Craft Plan route and CSRF check.
- Ordinary users receive read-only gathered status and the Map resource-finder link.
- Link to `/?page=map`; do not add or imply resource preselection.
- Do not add a database migration, dependency, framework, or new public permission.
- Do not update the changelog, version, deployment, or remote branch during ordinary implementation unless requested.

---

## File Map

- Modify `apps/bitcraft-local/src/server/craftPlanning.mjs`: normalize gathered keys, audit changes, stop producer traversal, suppress source routes, and expose `isGatheredOverride`.
- Modify `apps/bitcraft-local/server.mjs`: pass gathered keys into catalog traversal and provide material labels to audit generation.
- Modify `apps/bitcraft-local/src/pages/CraftPlanManagerDialog.tsx`: preserve the new config field and label gathered-item audit entries.
- Create `apps/bitcraft-local/src/pages/craftPlanningGatheredOverrides.ts`: pure exact-cell key/state/update helpers.
- Modify `apps/bitcraft-local/src/pages/CraftPlanningPage.tsx`: render and save the admin toggle, refresh the open detail, and render gathered guidance plus the Map link.
- Modify `apps/bitcraft-local/src/styles/craft-planning.css`: style the compact gathered control and read-only state.
- Modify `apps/bitcraft-local/test/craft-planning.test.mjs`: backend configuration, audit, calculation, catalog traversal, and compatibility regressions.
- Create `apps/bitcraft-local/test/craft-planning-gathered-overrides.test.mjs`: exact-cell helper unit tests.
- Modify `apps/bitcraft-local/test/craft-planning-boundary.test.mjs`: server wiring and interface boundary assertions.
- Modify `apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs`: gathered-control layout assertions.

---

### Task 1: Normalize and Audit Gathered Item Identities

**Files:**
- Add: `docs/superpowers/specs/2026-07-17-craft-plan-gathered-item-overrides-design.md`
- Add: `docs/superpowers/plans/2026-07-17-craft-plan-gathered-item-overrides.md`
- Modify: `apps/bitcraft-local/src/server/craftPlanning.mjs:108-215`
- Modify: `apps/bitcraft-local/server.mjs:2072-2077, 9677-9687`
- Modify: `apps/bitcraft-local/src/pages/CraftPlanManagerDialog.tsx:15-29, 157-163`
- Test: `apps/bitcraft-local/test/craft-planning.test.mjs:190-312`

**Interfaces:**
- Consumes: existing `recipeKey(kind, id)`, `uniqueStrings`, `normalizeCraftPlanConfig`, `craftPlanAuditDetails`, and admin audit labels.
- Produces: normalized `config.gatheredItemKeys: string[]` and audit changes shaped as `{ category: "gathered_item", entityId, label, enabled }`.

- [ ] **Step 1: Write failing normalization and audit tests**

Add these tests near the existing configuration and audit tests in `apps/bitcraft-local/test/craft-planning.test.mjs`:

```js
test("normalizeCraftPlanConfig validates, deduplicates, and sorts gathered item keys", () => {
  const config = normalizeCraftPlanConfig({
    gatheredItemKeys: ["items:600", "", "items:600", "building:9", "invalid", "cargo:200"],
  });

  assert.deepEqual(config.gatheredItemKeys, ["cargo:200", "items:600"]);
  assert.deepEqual(normalizeCraftPlanConfig({}).gatheredItemKeys, []);
});

test("craftPlanAuditDetails records gathered item enable and disable changes", () => {
  const previous = normalizeCraftPlanConfig({ gatheredItemKeys: ["items:old"] });
  const next = normalizeCraftPlanConfig({ gatheredItemKeys: ["items:new"] });

  assert.deepEqual(craftPlanAuditDetails(previous, next, {
    gathered_item: {
      "items:new": "Simple Stone Carvings",
      "items:old": "Rough Stone Carvings",
    },
  }), {
    changes: [
      { category: "gathered_item", entityId: "items:new", label: "Simple Stone Carvings", enabled: true },
      { category: "gathered_item", entityId: "items:old", label: "Rough Stone Carvings", enabled: false },
    ],
    otherSettingsChanged: false,
  });
});

test("craftPlanAuditDetails falls back to a gathered typed key when its label is unavailable", () => {
  const details = craftPlanAuditDetails(
    normalizeCraftPlanConfig({ gatheredItemKeys: [] }),
    normalizeCraftPlanConfig({ gatheredItemKeys: ["items:600"] }),
  );

  assert.equal(details.changes[0].label, "items:600");
});
```

- [ ] **Step 2: Run the focused tests and verify the red state**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test --test-name-pattern="gathered item|gathered typed key" test/craft-planning.test.mjs
```

Expected: FAIL because `gatheredItemKeys` is not normalized and no `gathered_item` audit changes are emitted.

- [ ] **Step 3: Implement normalization and explicit audit changes**

In `normalizeCraftPlanConfig`, normalize only regular-item and cargo typed keys:

```js
  const gatheredItemKeys = uniqueStrings(raw.gatheredItemKeys)
    .filter((key) => /^(?:items|cargo):[^:\s]+$/.test(key))
    .sort((left, right) => left.localeCompare(right));
```

Return it beside the other override fields:

```js
    routeOverrides,
    sectionOverrides,
    rowNameOverrides,
    multipliers,
    gatheredItemKeys,
    buildingProgress,
```

Allow the category through persisted audit-row normalization:

```js
const CRAFT_PLAN_AUDIT_CATEGORIES = new Set([
  "public_board",
  "gathered_item",
  ...CRAFT_PLAN_AUDIT_SOURCE_RULES.map(([, category]) => category),
]);
```

Add gathered identities after the existing source-rule loop in `craftPlanAuditDetails`:

```js
  const previousGathered = new Set(previous.gatheredItemKeys);
  const nextGathered = new Set(next.gatheredItemKeys);
  const gatheredKeys = [...new Set([...previousGathered, ...nextGathered])]
    .sort((left, right) => left.localeCompare(right));
  for (const entityId of gatheredKeys) {
    if (previousGathered.has(entityId) === nextGathered.has(entityId)) continue;
    changes.push({
      category: "gathered_item",
      entityId,
      label: auditLabel(labels, "gathered_item", entityId),
      enabled: nextGathered.has(entityId),
    });
  }
```

Do not add `gatheredItemKeys` to `CRAFT_PLAN_OTHER_AUDIT_FIELDS`; its changes are already explicit.

- [ ] **Step 4: Wire material names into server audit labels**

Change `craftPlanAuditLabels` in `apps/bitcraft-local/server.mjs` to accept computed materials:

```js
function craftPlanAuditLabels(sources = {}, materials = []) {
  const storage = Object.fromEntries((sources.storage ?? []).map((source) => [String(source.sourceId), String(source.label ?? source.sourceId)]));
  const players = Object.fromEntries((sources.players ?? []).map((source) => [String(source.playerId), String(source.label ?? source.playerId)]));
  const deployable = Object.fromEntries((sources.deployables ?? []).map((source) => [String(source.sourceId), String(source.label ?? source.sourceId)]));
  const gatheredItem = Object.fromEntries((materials ?? []).map((item) => {
    const key = String(item.key ?? `${item.kind === "cargo" || item.itemType === 1 ? "cargo" : "items"}:${item.id}`);
    return [key, String(item.name ?? key)];
  }));
  return { storage, player_inventory: players, player_crafts: players, deployable, gathered_item: gatheredItem };
}
```

Pass the current full plan materials at save time:

```js
const auditDetails = craftPlanAuditDetails(
  previousConfig,
  config,
  craftPlanAuditLabels(response.sources, response.plan?.materials),
);
```

- [ ] **Step 5: Preserve the field in the manager and label audit entries**

Add the field to `CraftPlanConfig`:

```ts
  gatheredItemKeys: string[];
```

Add `gatheredItemKeys: []` to `emptyConfig()` and add the audit label:

```ts
const CRAFT_PLAN_AUDIT_CATEGORY_LABELS: Record<string, string> = {
  public_board: "Visibility",
  storage: "Settlement storage",
  player_inventory: "Player inventory",
  player_crafts: "Player crafts",
  deployable: "Deployable",
  gathered_item: "Gathered item",
};
```

- [ ] **Step 6: Run focused and manager boundary tests**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test --test-name-pattern="gathered item|gathered typed key|audit history" test/craft-planning.test.mjs test/craft-planning-boundary.test.mjs
```

Expected: PASS for all matching tests.

- [ ] **Step 7: Commit the configuration and audit contract**

```powershell
git add docs/superpowers/specs/2026-07-17-craft-plan-gathered-item-overrides-design.md docs/superpowers/plans/2026-07-17-craft-plan-gathered-item-overrides.md apps/bitcraft-local/src/server/craftPlanning.mjs apps/bitcraft-local/server.mjs apps/bitcraft-local/src/pages/CraftPlanManagerDialog.tsx apps/bitcraft-local/test/craft-planning.test.mjs
git commit -m "feat: add gathered item plan overrides"
```

---

### Task 2: Stop Producer Expansion at Gathered Items

**Files:**
- Modify: `apps/bitcraft-local/src/server/craftPlanning.mjs:625-779, 918-1008, 1312-1361`
- Modify: `apps/bitcraft-local/server.mjs:2316-2318`
- Test: `apps/bitcraft-local/test/craft-planning.test.mjs`
- Test: `apps/bitcraft-local/test/craft-planning-boundary.test.mjs:272-297`

**Interfaces:**
- Consumes: `config.gatheredItemKeys: string[]` from Task 1.
- Produces: `material.isGatheredOverride: boolean`; `collectLocalCatalogCraftPlanDetails(repository, targets, routeOverrides, maxDepth, gatheredItemKeys)`; no source routes or producer steps for marked keys. The existing fourth-position `maxDepth` argument remains compatible.

- [ ] **Step 1: Write a failing calculation regression for the exact stop boundary**

Add this test in `apps/bitcraft-local/test/craft-planning.test.mjs` near the existing packed-route tests:

```js
test("computeCraftPlan keeps downstream consumers but stops producer expansion at gathered items", () => {
  const plannedPack = { id: "500", kind: "cargo", itemType: 1, name: "Scholar Supply Pack", quantity: 1 };
  const carvings = { id: "600", kind: "items", itemType: 0, name: "Rough Stone Carvings", tier: 1 };
  const misleadingPack = { id: "601", kind: "cargo", itemType: 1, name: "Stone Carvings Package", tier: 1 };
  const detailsByKey = new Map([
    [recipeKey("cargo", "500"), {
      cargo: plannedPack,
      craftingRecipes: [{
        id: "craft-scholar-pack",
        name: "Craft Scholar Supply Pack",
        craftedItemStacks: [{ item_id: "500", item_type: "cargo", quantity: 1 }],
        consumedItemStacks: [{ item_id: "600", item_type: "item", quantity: 5 }],
        consumedItems: [carvings],
        levelRequirements: [{ skill: { name: "Scholar" }, level: 1 }],
      }],
    }],
    [recipeKey("items", "600"), {
      item: carvings,
      craftingRecipes: [{
        id: "unpack-carvings",
        name: "Unpack Stone Carvings Package",
        isTransportRoute: true,
        craftedItemStacks: [{ item_id: "600", item_type: "item", quantity: 5 }],
        consumedItemStacks: [{ item_id: "601", item_type: "cargo", quantity: 1 }],
        consumedItems: [misleadingPack],
      }],
    }],
    [recipeKey("cargo", "601"), { cargo: misleadingPack, craftingRecipes: [] }],
  ]);
  const config = normalizeCraftPlanConfig({
    enabled: true,
    targets: [plannedPack],
    gatheredItemKeys: [recipeKey("items", "600")],
    routeOverrides: { [recipeKey("items", "600")]: "unpack-carvings" },
    multipliers: { [recipeKey("items", "600")]: { multiplier: 1.5, note: "retained" } },
  });

  const plan = computeCraftPlan({
    config,
    detailsByKey,
    storageSources: [{ sourceId: "store-1", label: "Scholar chest", items: [{ ...carvings, quantity: 2 }] }],
  });
  const carvingMaterial = plan.materials.find((item) => item.key === recipeKey("items", "600"));

  assert.deepEqual(plan.steps.map((step) => step.selectedRecipeId), ["craft-scholar-pack"]);
  assert.equal(carvingMaterial.required, 5);
  assert.equal(carvingMaterial.available, 2);
  assert.equal(carvingMaterial.missing, 3);
  assert.equal(carvingMaterial.isGatheredOverride, true);
  assert.deepEqual(carvingMaterial.sourceRoutes, []);
  assert.equal(carvingMaterial.recipeUsages[0].output.name, "Scholar Supply Pack");
  assert.equal(plan.materials.some((item) => item.key === recipeKey("cargo", "601")), false);
  assert.equal(plan.config.routeOverrides[recipeKey("items", "600")], "unpack-carvings");
  assert.equal(plan.config.multipliers[recipeKey("items", "600")].multiplier, 1.5);
});
```

- [ ] **Step 2: Write failing compatibility tests for independent targets and restoration**

Add:

```js
test("computeCraftPlan retains independently targeted packages when an input is gathered", () => {
  const carvingsKey = recipeKey("items", "600");
  const packageKey = recipeKey("cargo", "601");
  const plan = computeCraftPlan({
    config: normalizeCraftPlanConfig({
      enabled: true,
      targets: [
        { id: "600", kind: "items", itemType: 0, name: "Rough Stone Carvings", quantity: 5 },
        { id: "601", kind: "cargo", itemType: 1, name: "Stone Carvings Package", quantity: 1 },
      ],
      gatheredItemKeys: [carvingsKey],
    }),
    detailsByKey: new Map([
      [carvingsKey, { item: { id: "600", itemType: 0, name: "Rough Stone Carvings" }, craftingRecipes: [] }],
      [packageKey, { cargo: { id: "601", itemType: 1, name: "Stone Carvings Package" }, craftingRecipes: [] }],
    ]),
  });

  assert.equal(plan.materials.some((item) => item.key === carvingsKey), true);
  assert.equal(plan.materials.some((item) => item.key === packageKey), true);
});

test("computeCraftPlan restores retained routes after a gathered override is removed", () => {
  const key = recipeKey("items", "600");
  const detailsByKey = new Map([[key, {
    item: { id: "600", itemType: 0, name: "Rough Stone Carvings" },
    craftingRecipes: [{
      id: "unpack-carvings",
      name: "Unpack Stone Carvings Package",
      craftedItemStacks: [{ item_id: "600", item_type: "item", quantity: 5 }],
      consumedItemStacks: [{ item_id: "601", item_type: "cargo", quantity: 1 }],
      consumedItems: [{ id: "601", itemType: 1, name: "Stone Carvings Package" }],
    }],
  }]]);
  const shared = {
    enabled: true,
    targets: [{ id: "600", kind: "items", itemType: 0, name: "Rough Stone Carvings", quantity: 5 }],
    routeOverrides: { [key]: "unpack-carvings" },
  };

  const gathered = computeCraftPlan({ config: normalizeCraftPlanConfig({ ...shared, gatheredItemKeys: [key] }), detailsByKey });
  const restored = computeCraftPlan({ config: normalizeCraftPlanConfig({ ...shared, gatheredItemKeys: [] }), detailsByKey });

  assert.equal(gathered.steps.length, 0);
  assert.equal(restored.steps[0].selectedRecipeId, "unpack-carvings");
  assert.equal(restored.materials.some((item) => item.key === recipeKey("cargo", "601")), true);
});

test("computeCraftPlan does not reintroduce personal fishing routes for gathered fish oil", () => {
  const key = recipeKey("items", "900");
  const plan = computeCraftPlan({
    config: normalizeCraftPlanConfig({
      enabled: true,
      targets: [{ id: "900", kind: "items", itemType: 0, name: "Simple Fish Oil", tag: "Fish Oil", quantity: 10 }],
      gatheredItemKeys: [key],
    }),
    detailsByKey: new Map([[key, {
      item: { id: "900", itemType: 0, name: "Simple Fish Oil", tag: "Fish Oil", tier: 2 },
      craftingRecipes: [{
        id: "ocean-route",
        name: "Ocean Fish Oil",
        craftedItemStacks: [{ item_id: "900", item_type: "item", quantity: 1 }],
        consumedItemStacks: [{ item_id: "100", item_type: "item", quantity: 3 }],
        consumedItems: [{ id: "100", itemType: 0, name: "Ocean Fish" }],
      }],
    }]]),
  });
  const tier = plan.personalViews.fishing.tiers[0];

  assert.equal(tier.remainingOil, 10);
  assert.equal(Object.values(tier.routes).some((route) => route.available), false);
});
```

- [ ] **Step 3: Run calculation tests and verify the red state**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test --test-name-pattern="stops producer expansion|independently targeted packages|restores retained routes|personal fishing routes" test/craft-planning.test.mjs
```

Expected: FAIL because gathered keys do not affect requirement recursion or material output.

- [ ] **Step 4: Stop recursion after stock allocation and requirement registration**

Create one set in `computeCraftPlan`:

```js
  const gatheredItemKeys = new Set(normalized.gatheredItemKeys);
```

Extend `buildRequirementMapPass` and `buildRequirementMap` with a `gatheredItemKeys` set:

```js
function buildRequirementMapPass(targets, detailsByKey, routeOverrides, gatheredItemKeys = new Set(), multipliers = {}, effectiveStockTotals = new Map()) {
```

```js
function buildRequirementMap(targets, detailsByKey, routeOverrides, gatheredItemKeys = new Set(), multipliers = {}, effectiveStockTotals = new Map()) {
  return buildRequirementMapPass(targets, detailsByKey, routeOverrides, gatheredItemKeys, multipliers, effectiveStockTotals);
}
```

At the start of `resolve`, use this ordering so a marked item remains required and stocked but never selects a recipe:

```js
  function resolve(target, quantity, stack, parentRecipe) {
    const key = recipeKey(target.kind, target.id);
    const detail = detailsByKey.get(key);
    if (stack.includes(key)) return;
    const normalizedTarget = detail ? mergeDetailTarget(detail, target) : target;
    const availableSupply = remainingSupply.get(key) ?? 0;
    const allocatedSupply = Math.min(quantity, availableSupply);
    remainingSupply.set(key, availableSupply - allocatedSupply);
    const quantityToCraft = Math.max(0, quantity - allocatedSupply);
    addRequired(required, normalizedTarget, quantity, sectionForMaterial(normalizedTarget, parentRecipe));
    if (gatheredItemKeys.has(key)) return;
    if (!detail || stack.length > 14) {
      if (!detail) warnings.push(`No recipe data was available for ${target.name}; it was treated as a source material.`);
      return;
    }
    const recipes = recipesForTarget(detail, normalizedTarget, detailsByKey);
    const selected = selectedRecipeForTarget(recipes, routeOverrides[key], [...stack, key]);
    if (quantityToCraft <= 0 || !selected) return;
```

Remove the superseded duplicate normalization, stock-allocation, `addRequired`, and guard lines later in the existing function. Preserve the remainder of recipe input recursion unchanged.

Call the pass with the set:

```js
const { required, steps, usages, warnings } = buildRequirementMap(
  calculationTargets,
  detailsByKey,
  normalized.routeOverrides,
  gatheredItemKeys,
  normalized.multipliers,
  effectiveStockTotals,
);
```

- [ ] **Step 5: Suppress routes and expose material state**

Extend `sourceRoutesForTarget` and return immediately for marked keys:

```js
function sourceRoutesForTarget(target, detailsByKey, routeOverrides, gatheredItemKeys) {
  const targetKey = recipeKey(target.kind, target.id);
  if (gatheredItemKeys.has(targetKey)) return [];
  const detail = detailsByKey.get(targetKey);
```

Use the set when creating materials and expose the flag:

```js
    const sourceRoutes = sourceRoutesForTarget(
      { ...item, ...enrichedItem },
      detailsByKey,
      normalized.routeOverrides,
      gatheredItemKeys,
    );
```

```js
      isGatheredOverride: gatheredItemKeys.has(item.key),
      multiplier,
```

Because `compactCraftPlanItem` spreads all summary properties, `isGatheredOverride` will reach both the compact board response and lazy detail response without another projection change.

Pass the same set into the browser-local fishing projection so a gathered fish-oil cell cannot reintroduce personal producer routes:

```js
export function buildPersonalFishingView({ materials, detailsByKey, availableTotals, activeCraftTotals, gatheredItemKeys = new Set(), multipliers = {}, warnings }) {
  const fishOilMaterials = (materials ?? []).filter((item) => String(item?.tag ?? "").toLowerCase().includes("fish oil"));
  return { tiers: fishOilMaterials.map((oil) => {
    const alternatives = gatheredItemKeys.has(oil.key) ? [] : recipesForTarget(detailsByKey.get(oil.key), oil, detailsByKey);
```

Call it with `gatheredItemKeys`:

```js
  const personalViews = {
    fishing: buildPersonalFishingView({
      materials,
      detailsByKey,
      availableTotals,
      activeCraftTotals: countedActiveTotals,
      gatheredItemKeys,
      multipliers: normalized.multipliers,
      warnings,
    }),
  };
```

- [ ] **Step 6: Write a failing local-catalog traversal test**

Add this test beside existing local catalog recursion tests:

```js
test("collectLocalCatalogCraftPlanDetails stops below gathered catalog items", (t) => {
  const { repository } = createCatalogFixture(t);
  upsertCatalogDetails(repository, [
    {
      item: { id: "700", itemType: 0, name: "Scholar Pack" },
      craftingRecipes: [{
        id: "craft-pack",
        craftedItemStacks: [{ item_id: "700", item_type: "item", quantity: 1 }],
        consumedItemStacks: [{ item_id: "600", item_type: "item", quantity: 2 }],
        consumedItems: [{ id: "600", itemType: 0, name: "Stone Carvings" }],
      }],
    },
    {
      item: { id: "600", itemType: 0, name: "Stone Carvings" },
      craftingRecipes: [{
        id: "unpack-carvings",
        craftedItemStacks: [{ item_id: "600", item_type: "item", quantity: 2 }],
        consumedItemStacks: [{ item_id: "601", item_type: "cargo", quantity: 1 }],
        consumedItems: [{ id: "601", itemType: 1, name: "Stone Carvings Package" }],
      }],
    },
    { cargo: { id: "601", itemType: 1, name: "Stone Carvings Package" }, craftingRecipes: [] },
  ]);

  const result = collectLocalCatalogCraftPlanDetails(
    repository,
    [{ id: "700", kind: "items", itemType: 0, name: "Scholar Pack", quantity: 1 }],
    {},
    64,
    [recipeKey("items", "600")],
  );

  assert.equal(result.detailsByKey.has(recipeKey("items", "700")), true);
  assert.equal(result.detailsByKey.has(recipeKey("items", "600")), true);
  assert.equal(result.detailsByKey.has(recipeKey("cargo", "601")), false);
  assert.deepEqual(result.warnings, []);
});
```

- [ ] **Step 7: Stop local catalog traversal and wire the server call**

Change the collector signature and create its set:

```js
export function collectLocalCatalogCraftPlanDetails(repository, targets, routeOverrides = {}, maxDepth = 64, gatheredItemKeys = []) {
  const gatheredKeys = new Set(gatheredItemKeys);
```

Inside `visit`, after the recursion-limit and `visiting` checks but before loading byproduct producers, add:

```js
    if (gatheredKeys.has(key)) {
      setDetail(key, target);
      completed.add(key);
      return;
    }
```

Pass the normalized keys from `computedCraftPlanResponseFresh`:

```js
const { detailsByKey, warnings: catalogWarnings } = collectLocalCatalogCraftPlanDetails(
  gameCatalogRepository,
  catalogTargets,
  config.routeOverrides,
  64,
  config.gatheredItemKeys,
);
```

Update the matching assertion in `craft-planning-boundary.test.mjs`:

```js
assert.match(computedCraftPlan, /collectLocalCatalogCraftPlanDetails\(\s*gameCatalogRepository,\s*catalogTargets,\s*config\.routeOverrides,\s*64,\s*config\.gatheredItemKeys,\s*\)/s);
```

- [ ] **Step 8: Run all backend Craft Planning tests**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test --test-name-pattern="CraftPlan|craftPlan|craft plan|gathered|catalog" test/craft-planning.test.mjs test/craft-planning-boundary.test.mjs
```

Expected: PASS for the matching configuration, calculation, catalog, audit, and boundary tests.

- [ ] **Step 9: Commit the planner stop boundary**

```powershell
git add apps/bitcraft-local/src/server/craftPlanning.mjs apps/bitcraft-local/server.mjs apps/bitcraft-local/test/craft-planning.test.mjs apps/bitcraft-local/test/craft-planning-boundary.test.mjs
git commit -m "fix: stop craft expansion at gathered items"
```

---

### Task 3: Implement Exact-Cell Override Helpers

**Files:**
- Create: `apps/bitcraft-local/src/pages/craftPlanningGatheredOverrides.ts`
- Create: `apps/bitcraft-local/test/craft-planning-gathered-overrides.test.mjs`

**Interfaces:**
- Consumes: `itemKey(item)` from `craftPlanningNeedsBoard.ts` and the normalized `gatheredItemKeys` array.
- Produces: `cellItemKeys(items)`, `gatheredCellState(cellKeys, gatheredItemKeys)`, and `setCellGathered(gatheredItemKeys, cellKeys, enabled)`.

- [ ] **Step 1: Write failing exact-cell helper tests**

Create `apps/bitcraft-local/test/craft-planning-gathered-overrides.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import {
  cellItemKeys,
  gatheredCellState,
  setCellGathered,
} from "../src/pages/craftPlanningGatheredOverrides.ts";

test("cellItemKeys returns every unique typed identity in stable order", () => {
  assert.deepEqual(cellItemKeys([
    { id: "600-b", kind: "items" },
    { id: "600-a", kind: "items" },
    { id: "600-b", kind: "items" },
  ]), ["items:600-a", "items:600-b"]);
});

test("gatheredCellState distinguishes none, mixed, and all", () => {
  const cellKeys = ["items:600-a", "items:600-b"];
  assert.equal(gatheredCellState(cellKeys, []), "none");
  assert.equal(gatheredCellState(cellKeys, ["items:600-a"]), "mixed");
  assert.equal(gatheredCellState(cellKeys, ["items:600-a", "items:600-b"]), "all");
});

test("setCellGathered changes only identities in the exact opened cell", () => {
  const current = ["items:stone-carvings-t2"];
  const cell = ["items:stone-carvings-t1-a", "items:stone-carvings-t1-b"];

  const enabled = setCellGathered(current, cell, true);
  assert.deepEqual(enabled, [
    "items:stone-carvings-t1-a",
    "items:stone-carvings-t1-b",
    "items:stone-carvings-t2",
  ]);
  assert.deepEqual(setCellGathered(enabled, cell, false), ["items:stone-carvings-t2"]);
});
```

- [ ] **Step 2: Run the helper test and verify the red state**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test --test-name-pattern="cellItemKeys|gatheredCellState|exact opened cell" test/craft-planning-gathered-overrides.test.mjs
```

Expected: FAIL with module-not-found for `craftPlanningGatheredOverrides.ts`.

- [ ] **Step 3: Implement the pure helper module**

Create `apps/bitcraft-local/src/pages/craftPlanningGatheredOverrides.ts`:

```ts
import type { AnyRecord } from "../main-app-data";
import { itemKey } from "./craftPlanningNeedsBoard";

export type GatheredCellState = "none" | "mixed" | "all";

export function cellItemKeys(items: AnyRecord[]): string[] {
  return [...new Set((Array.isArray(items) ? items : []).map(itemKey).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

export function gatheredCellState(cellKeys: string[], gatheredItemKeys: string[]): GatheredCellState {
  if (!cellKeys.length) return "none";
  const gathered = new Set(gatheredItemKeys);
  const count = cellKeys.filter((key) => gathered.has(key)).length;
  if (count === 0) return "none";
  return count === cellKeys.length ? "all" : "mixed";
}

export function setCellGathered(
  gatheredItemKeys: string[],
  cellKeys: string[],
  enabled: boolean,
): string[] {
  const next = new Set(gatheredItemKeys);
  for (const key of cellKeys) {
    if (enabled) next.add(key);
    else next.delete(key);
  }
  return [...next].sort((left, right) => left.localeCompare(right));
}
```

- [ ] **Step 4: Run the helper tests and build**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test --test-name-pattern="cellItemKeys|gatheredCellState|exact opened cell" test/craft-planning-gathered-overrides.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: helper tests PASS and the TypeScript/Vite build succeeds.

- [ ] **Step 5: Commit exact-cell semantics**

```powershell
git add apps/bitcraft-local/src/pages/craftPlanningGatheredOverrides.ts apps/bitcraft-local/test/craft-planning-gathered-overrides.test.mjs
git commit -m "test: define exact cell gathered overrides"
```

---

### Task 4: Add the Admin Toggle and Read-Only Gathered Guidance

**Files:**
- Modify: `apps/bitcraft-local/src/pages/CraftPlanningPage.tsx:1-16, 80-99, 184-195, 224-311, 378-460`
- Modify: `apps/bitcraft-local/src/styles/craft-planning.css`
- Modify: `apps/bitcraft-local/test/craft-planning-boundary.test.mjs:18-101, 175-190`
- Modify: `apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs:169-181`

**Interfaces:**
- Consumes: Task 2's `material.isGatheredOverride` and Task 3's exact-cell helpers.
- Produces: an admin-only immediate-save toggle, mixed-state disclosure, read-only gathered explanation, and `/?page=map` link while preserving `Used for`.

- [ ] **Step 1: Write failing UI and CSS boundary assertions**

Extend the main Craft Planning page boundary test with:

```js
  assert.match(page, /Treat this cell as gathered/);
  assert.match(page, /cellItemKeys/);
  assert.match(page, /gatheredCellState/);
  assert.match(page, /setCellGathered/);
  assert.match(page, /canManage[\s\S]*craft-plan-gathered-control/);
  assert.match(page, /x-csrf-token/);
  assert.match(page, /href="\/\?page=map"/);
  assert.match(page, /Open Map resource finder/);
  assert.match(page, /must be gathered or supplied from counted stock/);
```

Extend the audit-manager test with:

```js
  assert.match(manager, /gathered_item:\s*"Gathered item"/);
  assert.match(manager, /gatheredItemKeys:\s*string\[\]/);
```

Add to the `How to get this` CSS boundary test:

```js
  assert.match(css, /\.craft-plan-gathered-control\s*\{/);
  assert.match(css, /\.craft-plan-gathered-state\s*\{/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.craft-plan-gathered-control/);
```

- [ ] **Step 2: Run boundary tests and verify the red state**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test --test-name-pattern="read-only plan sections|audit history|How to get this" test/craft-planning-boundary.test.mjs test/craft-planning-css-boundary.test.mjs
```

Expected: FAIL because the gathered control, copy, Map link, and styles are absent.

- [ ] **Step 3: Add selected-cell state and saving state**

In `CraftPlanningPage.tsx`, import `MapPin` and the helpers:

```ts
import { AlertTriangle, ClipboardList, Factory, LoaderCircle, MapPin, Package, Route, Search, Target, X } from "lucide-react";
import { cellItemKeys, gatheredCellState, setCellGathered } from "./craftPlanningGatheredOverrides";
```

Add saving state beside the existing route states:

```ts
  const [gatheredSavePending, setGatheredSavePending] = React.useState(false);
```

Derive exact-cell state with ordinary constants, not hooks:

```ts
  const selectedNeedKeys = selectedNeed ? cellItemKeys(selectedNeed.items) : [];
  const selectedGatheredState = gatheredCellState(selectedNeedKeys, config.gatheredItemKeys ?? []);
  const selectedNeedGathered = selectedGatheredState === "all";
```

- [ ] **Step 4: Add the authenticated immediate-save function**

Add this function beside the existing `saveRouteOverride` and `saveMultiplier` functions:

```ts
  async function saveGatheredOverride(enabled: boolean) {
    if (!canManage || !adminAuth?.csrfToken || !selectedNeed || !selectedNeedKeys.length) return;
    const openCell = selectedNeed;
    setRouteStatus(null);
    setRouteError(null);
    setGatheredSavePending(true);
    try {
      const gatheredItemKeys = setCellGathered(config.gatheredItemKeys ?? [], selectedNeedKeys, enabled);
      const response = await fetch(LOCAL_API + "/admin/craft-plan", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": String(adminAuth.csrfToken),
        },
        body: JSON.stringify({ ...config, gatheredItemKeys }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "HTTP " + response.status);
      const refreshedPlan = body.plan;
      if (refreshedPlan && Array.isArray(refreshedPlan.materials)) {
        setPlan(refreshedPlan);
        const byKey = new Map(refreshedPlan.materials.map((item: AnyRecord) => [itemKey(item), item]));
        const items = openCell.items.map((item) => byKey.get(itemKey(item)) ?? item);
        setSelectedNeed({ ...openCell, item: items[0] ?? openCell.item, items });
        const keys = new Set(selectedNeedKeys);
        setDetailSteps((Array.isArray(refreshedPlan.steps) ? refreshedPlan.steps : []).filter((step: AnyRecord) => keys.has(itemKey(step.output ?? {}))));
      }
      setRouteStatus(enabled ? "This cell is now treated as gathered." : "Recipe expansion restored for this cell.");
      setManagerRefreshToken((value) => value + 1);
    } catch (err) {
      setRouteError(err instanceof Error ? err.message : String(err));
    } finally {
      setGatheredSavePending(false);
    }
  }
```

This uses the admin response's full plan to keep the dialog open and current; the existing refresh token then reconciles the public board response.

- [ ] **Step 5: Render the control, mixed state, gathered explanation, and Map link**

Inside the `How to get this` card, directly after its heading, render the admin control:

```tsx
              {canManage ? (
                <div className="craft-plan-gathered-control" data-state={selectedGatheredState}>
                  <label className="compact-toggle">
                    <input
                      type="checkbox"
                      checked={selectedNeedGathered}
                      aria-checked={selectedGatheredState === "mixed" ? "mixed" : selectedNeedGathered}
                      disabled={gatheredSavePending || detailLoading}
                      onChange={(event) => void saveGatheredOverride(event.target.checked)}
                    />
                    <span>Treat this cell as gathered</span>
                  </label>
                  <small>Stops producer-recipe expansion for this exact cell. The item remains required and counted stock still applies.</small>
                  {selectedGatheredState === "mixed" ? <small className="craft-plan-gathered-mixed">Some underlying items are already marked. Changing this toggle applies one state to the whole displayed cell.</small> : null}
                </div>
              ) : null}
```

Wrap the existing source-route rendering in a gathered-state branch:

```tsx
              {selectedNeedGathered ? (
                <div className="craft-plan-gathered-state">
                  <strong>This item is treated as gathered.</strong>
                  <p>The remaining amount must be gathered or supplied from counted stock. Producer recipes and package routes are ignored.</p>
                  <a className="toolbar-button" href="/?page=map"><MapPin size={15} /> Open Map resource finder</a>
                </div>
              ) : selectedNeedSourceRoutes.length ? selectedNeedSourceRoutes.map((route, index) => {
```

Keep the complete existing route mapping as the second branch and its existing no-route paragraph as the final branch. Do not move or conditionally hide the separate `Used for` card.

- [ ] **Step 6: Add dense responsive styling**

Add to `apps/bitcraft-local/src/styles/craft-planning.css` near the other detail-card rules:

```css
.craft-plan-gathered-control {
  display: grid;
  gap: 6px;
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1px solid rgba(143, 164, 186, 0.24);
  border-radius: 8px;
  background: rgba(7, 15, 24, 0.42);
}

.craft-plan-gathered-control > small {
  color: var(--text-muted);
  line-height: 1.4;
}

.craft-plan-gathered-control .craft-plan-gathered-mixed {
  color: var(--accent);
}

.craft-plan-gathered-state {
  display: grid;
  justify-items: start;
  gap: 8px;
  padding: 12px;
  border: 1px solid rgba(231, 188, 52, 0.28);
  border-radius: 8px;
  background: rgba(231, 188, 52, 0.07);
}

.craft-plan-gathered-state p {
  margin: 0;
  color: var(--text-muted);
  line-height: 1.45;
}

@media (max-width: 760px) {
  .craft-plan-gathered-control,
  .craft-plan-gathered-state {
    padding: 10px;
  }
}
```

- [ ] **Step 7: Run UI boundaries and build**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test --test-name-pattern="read-only plan sections|audit history|How to get this|exact opened cell" test/craft-planning-boundary.test.mjs test/craft-planning-css-boundary.test.mjs test/craft-planning-gathered-overrides.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: all matching tests PASS and the build succeeds without TypeScript or Vite errors.

- [ ] **Step 8: Commit the modal interface**

```powershell
git add apps/bitcraft-local/src/pages/CraftPlanningPage.tsx apps/bitcraft-local/src/styles/craft-planning.css apps/bitcraft-local/test/craft-planning-boundary.test.mjs apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs
git commit -m "feat: control gathered items from craft details"
```

---

### Task 5: Full Verification and Diff Review

**Files:**
- Review: all files listed in the File Map
- Verify: `apps/bitcraft-local`

**Interfaces:**
- Consumes: completed Tasks 1-4.
- Produces: a verified implementation ready for user review, without release or remote mutations.

- [ ] **Step 1: Run the full application test suite**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local test
```

Expected: every test passes; no live Discord notification is sent.

- [ ] **Step 2: Run the production build**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: TypeScript checking and Vite production build both succeed.

- [ ] **Step 3: Perform a focused diff review**

Run:

```powershell
git diff --check
git status --short
git diff --stat origin/main...HEAD
git diff origin/main...HEAD -- apps/bitcraft-local/src/server/craftPlanning.mjs apps/bitcraft-local/server.mjs apps/bitcraft-local/src/pages/craftPlanningGatheredOverrides.ts apps/bitcraft-local/src/pages/CraftPlanningPage.tsx apps/bitcraft-local/src/pages/CraftPlanManagerDialog.tsx apps/bitcraft-local/src/styles/craft-planning.css apps/bitcraft-local/test/craft-planning.test.mjs apps/bitcraft-local/test/craft-planning-gathered-overrides.test.mjs apps/bitcraft-local/test/craft-planning-boundary.test.mjs apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs
```

Expected:

- `git diff --check` prints nothing.
- Only the spec, plan, and listed implementation/test files are changed by this feature.
- The recursion guard occurs after requirement/stock registration and before producer selection.
- The `Used for` card remains outside the gathered-route conditional.
- No changelog, package version, database, generated build output, or log file is staged.

- [ ] **Step 4: Report verification without publishing**

Report the exact test count and build result. State that no version bump, changelog update, push, deployment, database action, or VPS command was performed. Do not commit additional files unless the diff review uncovered a required correction.
