# Craft Planner Producer Route Availability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep genuine item-list/byproduct processing routes visible without a probability snapshot, prevent automatic package-route fallback, and show honest unavailable-yield messaging.

**Architecture:** Preserve catalogue producer edges independently from validated numeric yield data. Propagate an explicit `unavailable` probability status through synthesized planner routes, stop requirement expansion at that edge, and restrict automatic selection to non-transport routes while retaining explicit transport overrides.

**Tech Stack:** Node.js 24, JavaScript ES modules, `node:test`, React 19, TypeScript, plain CSS, Vite, SQLite through `node:sqlite`.

## Global Constraints

- The Needs Board continues grouping rows by the existing family/tag.
- Detail-dialog titles continue showing exact tiered item names.
- BitJita and normalized catalogue relationships remain the source of truth; do not add item-name or recipe-name mappings.
- Unvalidated flattened item-list quantities must not drive required quantities, effort, or input expansion.
- Transport routes remain available for explicit overrides but cannot be selected automatically.
- Failed probability publication must retain the last validated snapshot.
- Preserve item-versus-cargo identity and existing route identifiers.
- Do not add dependencies or schema migrations.

---

## File map

- `apps/bitcraft-local/src/server/craftPlanning.mjs`: separate route discovery from numeric probability availability, propagate route status, stop unsafe expansion, and change automatic route selection.
- `apps/bitcraft-local/test/craft-planning.test.mjs`: exercise the complete repository-to-plan path for missing snapshots, multiple producers, transport fallback, explicit overrides, and validated calculations.
- `apps/bitcraft-local/src/pages/CraftPlanningPage.tsx`: render unavailable-yield route cards and label transport alternatives as logistics.
- `apps/bitcraft-local/test/craft-planning-boundary.test.mjs`: protect the detail-panel unavailable state and logistics labelling without introducing a browser test framework.

### Task 1: Preserve producer relationships when probability values are unavailable

**Files:**
- Modify: `apps/bitcraft-local/test/craft-planning.test.mjs:360-382`
- Modify: `apps/bitcraft-local/src/server/craftPlanning.mjs:491-611`
- Modify: `apps/bitcraft-local/src/server/craftPlanning.mjs:1008-1175`

**Interfaces:**
- Consumes: `repository.getProbabilitySnapshot(): object | null` and `repository.listByproductProducersForOutput(outputKey): ByproductProducer[]`.
- Produces: item-list possibilities and synthesized routes with compatibility-preserving `probabilityStatus: "guaranteed" | "expected" | "unavailable"`; unavailable routes retain producer metadata but expose no trusted `expectedYield`.

- [ ] **Step 1: Replace the current suppression test with a failing route-preservation regression**

Extend the fixture so the chance bundle has a real non-transport recipe consuming a source item. Require validated probabilities without publishing a snapshot, then assert the producer relationship survives and carries unavailable status:

```js
test("local catalog planner preserves producer routes while validated yields are unavailable", (t) => {
  const { repository } = createCatalogFixture(t);
  upsertCatalogDetails(repository, [
    { item: { id: "4100", itemType: 0, name: "Chance Output", tag: "Output", tier: 1 } },
    {
      item: { id: "4101", itemType: 0, name: "Chance Bundle", tag: "Products", tier: 1 },
      craftingRecipes: [{
        id: "make-bundle",
        name: "Process Chance Plant",
        stationName: "Farming Station",
        craftedItemStacks: [{ item_id: "4101", item_type: "item", quantity: 1 }],
        craftedItems: [{ id: "4101", itemType: 0, name: "Chance Bundle", tag: "Products", tier: 1 }],
        consumedItemStacks: [{ item_id: "4102", item_type: "item", quantity: 1 }],
        consumedItems: [{ id: "4102", itemType: 0, name: "Chance Plant", tag: "Plant", tier: 1 }],
      }],
      itemListPossibilities: [{
        targetId: "4100",
        targetItem: { id: "4100", itemType: 0, name: "Chance Output", tag: "Output", tier: 1 },
        quantity: 1,
        chance: 0.5,
      }],
    },
    { item: { id: "4102", itemType: 0, name: "Chance Plant", tag: "Plant", tier: 1 } },
    {
      item: { id: "4103", itemType: 0, name: "Alternative Bundle", tag: "Products", tier: 1 },
      craftingRecipes: [{
        id: "make-alternative-bundle",
        name: "Process Alternative Plant",
        stationName: "Farming Station",
        craftedItemStacks: [{ item_id: "4103", item_type: "item", quantity: 1 }],
        craftedItems: [{ id: "4103", itemType: 0, name: "Alternative Bundle", tag: "Products", tier: 1 }],
        consumedItemStacks: [{ item_id: "4104", item_type: "item", quantity: 1 }],
        consumedItems: [{ id: "4104", itemType: 0, name: "Alternative Plant", tag: "Plant", tier: 1 }],
      }],
      itemListPossibilities: [{
        targetId: "4100",
        targetItem: { id: "4100", itemType: 0, name: "Chance Output", tag: "Output", tier: 1 },
        quantity: 1,
        chance: 0.25,
      }],
    },
    { item: { id: "4104", itemType: 0, name: "Alternative Plant", tag: "Plant", tier: 1 } },
  ]);

  const config = normalizeCraftPlanConfig({
    enabled: true,
    targets: [{ id: "4100", kind: "items", name: "Chance Output", quantity: 10, itemType: 0 }],
  });
  const catalog = collectLocalCatalogCraftPlanDetails(
    repository,
    config.targets,
    config.routeOverrides,
    64,
    [],
    { requireValidatedProbabilities: true },
  );
  const plan = computeCraftPlan({ config, detailsByKey: catalog.detailsByKey, catalogWarnings: catalog.warnings });
  const target = plan.materials.find((row) => row.id === "4100");

  assert.equal(catalog.detailsByKey.get("items:4101")?.itemListPossibilities.length, 1);
  assert.equal(target?.sourceRoutes?.[0]?.producerRecipe?.name, "Process Chance Plant");
  assert.equal(target?.sourceRoutes?.[0]?.probabilityStatus, "unavailable");
  assert.equal(target?.sourceRoutes?.[0]?.expectedYield, null);
  assert.deepEqual(
    target?.sourceRoutes?.[0]?.alternatives.map((route) => route.label).sort(),
    ["Process Alternative Plant -> Chance Output", "Process Chance Plant -> Chance Output"],
  );
  assert.equal(plan.materials.some((row) => row.id === "4102"), false);
  assert.equal(plan.materials.some((row) => row.id === "4104"), false);
  assert.match(plan.warnings.join("\n"), /validated output rate unavailable.*items:4100/i);
});
```

- [ ] **Step 2: Run the regression and verify the current code fails on the exact symptom**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local test -- --test-name-pattern "preserves producer routes while validated yields are unavailable"
```

Expected: FAIL because `collectLocalCatalogCraftPlanDetails` currently clears `itemListPossibilities` and never loads the byproduct producer when the snapshot is absent.

- [ ] **Step 3: Propagate probability availability without deleting producer edges**

Make `possibilityExpectedOutputs` retain the least-trusted status while it aggregates duplicate rows. Add the first statement beside the existing chance/quantity normalization, add the second line to the existing aggregate initializer, and apply the final assignment immediately after the initializer:

```js
const probabilityStatus = possibility?.probabilityStatus === "unavailable" ? "unavailable" : null;
probabilityStatus,
if (probabilityStatus === "unavailable") current.probabilityStatus = "unavailable";
```

Also leave `probabilityStatus` outside the final destructuring exclusion list so it is returned with each aggregate. The current identity and quantity fields remain byte-for-byte unchanged.

In `possibilityRecipesForTarget`, derive status from the selected crafted output and preserve discovery quantities only inside the existing synthesized stack. Replace the current probability assignments with these exact fields:

```js
const probabilityUnavailable = craftedOutput?.probabilityStatus === "unavailable";
const probabilityStatus = probabilityUnavailable ? "unavailable" : probabilistic ? "expected" : "guaranteed";
const validatedYield = !probabilityUnavailable;

isExpectedYield: true,
isProbabilistic: true,
probabilityStatus,
expectedYield: validatedYield ? effectiveExpectedYield : null,
expectedPerProgress: validatedYield ? expectedPerProgress : null,
expectedPerResource: validatedYield ? expectedPerResource : null,
guaranteedYield: validatedYield ? craftedOutput?.guaranteedQuantity ?? 0 : null,
```

Update `catalogByproductPossibility` to accept a status argument:

```js
function catalogByproductPossibility(repository, row, warnings, probabilityStatus) {
  const normalizedProbabilityStatus = probabilityStatus === "unavailable" ? "unavailable" : null;
}
```

Add this exact property to the function's existing returned possibility:

```js
probabilityStatus: normalizedProbabilityStatus,
```

Update `localCatalogDetail` to accept `probabilityStatus`, and pass that status into every `catalogByproductPossibility` call.

In `collectLocalCatalogCraftPlanDetails`, replace the route availability gate with status only:

```js
const probabilitySnapshotAvailable = Boolean(repository.getProbabilitySnapshot?.());
const probabilityStatus = requireValidatedProbabilities && !probabilitySnapshotAvailable
  ? "unavailable"
  : null;
if (probabilityStatus === "unavailable") {
  warnings.add("Validated probability snapshot unavailable; producer routes remain visible but yield calculations are disabled.");
}
```

Always call `repository.listByproductProducersForOutput(key)`. Remove the branch that filters probabilistic recipes and clears `detail.itemListPossibilities`. Ensure both `setDetail` paths rebuild possibilities with the same `probabilityStatus`.

- [ ] **Step 4: Stop requirement expansion at an unavailable yield edge**

In the recursive `resolve` function, keep `addRequired` before the route-status guard, then stop before deriving `outputPerCraft` or expanding inputs:

```js
const metadata = routeMetadata(selected, normalizedTarget);
addRequired(required, normalizedTarget, quantity, sectionForMaterial(normalizedTarget, selected ?? parentRecipe));
if (quantityToCraft <= 0 || !selected) return;
if (metadata.probabilityStatus === "unavailable") {
  warnings.push(`Validated output rate unavailable for ${key}; producer route retained without quantity expansion.`);
  return;
}
```

Move the existing `metadata` declaration above the guard and remove its later duplicate. In `routeMetadata`, preserve `null` rather than coercing an unavailable expected yield to zero:

```js
const probabilityStatus = recipe?.probabilityStatus
  ?? (recipe?.isProbabilistic === true ? "expected" : "guaranteed");
const probabilityUnavailable = probabilityStatus === "unavailable";
const expectedYield = probabilityUnavailable
  ? null
  : recipe?.expectedYield == null
    ? Math.max(0, toNumber(targetOutput?.quantity)) || null
    : toNumber(recipe.expectedYield);
```

Return `probabilityStatus`, `expectedYield`, and `isProbabilistic: recipe?.isProbabilistic === true || probabilityStatus === "expected" || probabilityUnavailable`.

- [ ] **Step 5: Run the focused regression and nearby planner tests**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local test -- --test-name-pattern "producer routes|validated snapshot|weighted item-list"
```

Expected: PASS, including the existing validated weighted-output assertions (`3.02` expected and `2` guaranteed).

- [ ] **Step 6: Commit the producer-availability seam**

```powershell
git add -- apps/bitcraft-local/src/server/craftPlanning.mjs apps/bitcraft-local/test/craft-planning.test.mjs
git commit -m "fix: retain planner producer routes without probabilities"
```

### Task 2: Prevent automatic transport fallback while preserving explicit overrides

**Files:**
- Modify: `apps/bitcraft-local/test/craft-planning.test.mjs:1385-1455`
- Modify: `apps/bitcraft-local/test/craft-planning.test.mjs:2997-3050`
- Modify: `apps/bitcraft-local/src/server/craftPlanning.mjs:348-430`
- Modify: `apps/bitcraft-local/src/server/craftPlanning.mjs:651-660`
- Modify: `apps/bitcraft-local/src/server/craftPlanning.mjs:790-815`

**Interfaces:**
- Consumes: recipe records with `isTransportRoute` or recognizable package metadata and `routeOverrides[outputKey]`.
- Produces: `selectedRecipeForTarget` selects a transport route only when the matching override is valid; route UI metadata includes `isTransportRoute`.

- [ ] **Step 1: Change the only-unpack test into a failing no-fallback invariant**

Use the complete Berry/package loop fixture and change its expectations:

```js
test("computeCraftPlan does not automatically use an unpack route when it is the only catalog option", () => {
  const berryDetail = {
    item: { id: "100", name: "Basic Berry", itemType: 0, tag: "Berry", tier: 1 },
    craftingRecipes: [{
      id: "unpack-berry",
      name: "Unpack Basic Berry Package",
      isTransportRoute: true,
      craftedItemStacks: [{ item_id: "100", item_type: "item", quantity: 500 }],
      consumedItemStacks: [{ item_id: "200", item_type: "cargo", quantity: 1 }],
      consumedItems: [{ id: "200", name: "Basic Berry Package", itemType: 1, tag: "Package", tier: 1 }],
    }],
  };
  const packageDetail = {
    cargo: { id: "200", name: "Basic Berry Package", itemType: 1, tag: "Package", tier: 1 },
    craftingRecipes: [{
      id: "pack-berry",
      name: "Package Basic Berry",
      isTransportRoute: true,
      craftedItemStacks: [{ item_id: "200", item_type: "cargo", quantity: 1 }],
      consumedItemStacks: [{ item_id: "100", item_type: "item", quantity: 500 }],
      consumedItems: [{ id: "100", name: "Basic Berry", itemType: 0, tag: "Berry", tier: 1 }],
    }],
  };
  const detailsByKey = new Map([
    [recipeKey("items", "100"), berryDetail],
    [recipeKey("cargo", "200"), packageDetail],
  ]);
  const plan = computeCraftPlan({
    config: normalizeCraftPlanConfig({
      enabled: true,
      targets: [{ id: "100", kind: "items", name: "Basic Berry", quantity: 500, itemType: 0 }],
    }),
    detailsByKey,
  });

  assert.equal(plan.steps.length, 0);
  assert.deepEqual(plan.materials.find((row) => row.id === "100")?.sourceRoutes, []);
  assert.equal(plan.materials.some((row) => row.id === "200"), false);
  assert.match(plan.warnings.join("\n"), /only transport routes.*items:100/i);
});
```

Add a second assertion using the same fixture with `routeOverrides: { "items:100": "unpack-berry" }`:

```js
const overridePlan = computeCraftPlan({
  config: normalizeCraftPlanConfig({
    enabled: true,
    targets: [{ id: "100", kind: "items", name: "Basic Berry", quantity: 500, itemType: 0 }],
    routeOverrides: { "items:100": "unpack-berry" },
  }),
  detailsByKey,
});
assert.equal(overridePlan.steps[0]?.selectedRecipeId, "unpack-berry");
```

- [ ] **Step 2: Run the transport regression and verify failure**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local test -- --test-name-pattern "does not automatically use an unpack route"
```

Expected: FAIL because `selectedRecipeForTarget` currently falls back to the first valid transport recipe.

- [ ] **Step 3: Restrict automatic selection to non-transport routes**

Replace the final fallback in `selectedRecipeForTarget`:

```js
function selectedRecipeForTarget(recipes, overrideId, blockedKeys = []) {
  const blocked = new Set(blockedKeys);
  const isValid = (recipe) => !recipeInputs(recipe)
    .some((input) => blocked.has(recipeKey(stackKind(input), stackId(input))));
  const overridden = recipes.find((recipe) => recipeMatchesOverride(recipe, overrideId));
  if (overridden && isValid(overridden)) return overridden;
  return recipes.find((recipe) => !recipeLooksTransportRoute(recipe) && isValid(recipe)) ?? null;
}
```

Expose transport identity by adding this exact property to the existing `routeMetadata` return object:

```js
isTransportRoute: recipeLooksTransportRoute(recipe),
```

In recursive requirement resolution, distinguish an empty catalogue from transport-only options:

```js
if (!selected && recipes.some(recipeLooksTransportRoute)) {
  warnings.push(`Only transport routes are available for ${key}; no package conversion was selected automatically.`);
}
```

Place this warning after `addRequired` and before returning for `!selected`.

- [ ] **Step 4: Preserve the existing explicit override contract**

Update the repository-backed transport test to keep these assertions:

```js
assert.equal(defaultPlan.steps[0].selectedRecipeId, "craft-route");
assert.deepEqual(defaultPlan.steps[0].alternatives.map((recipe) => recipe.id), ["craft-route", "transport-route"]);
assert.equal(overridePlan.steps[0].selectedRecipeId, "transport-route");
assert.equal(overridePlan.materials.find((material) => material.name === "Treated Board Shipment")?.required, 1);
```

Also add:

```js
assert.equal(defaultPlan.steps[0].alternatives.find((recipe) => recipe.id === "transport-route")?.isTransportRoute, true);
```

- [ ] **Step 5: Run all transport and producer-route tests**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local test -- --test-name-pattern "transport|unpack|package|producer routes"
```

Expected: PASS. Non-transport routes remain default, transport overrides remain functional, and transport-only catalogues no longer generate production steps.

- [ ] **Step 6: Commit route-selection behaviour**

```powershell
git add -- apps/bitcraft-local/src/server/craftPlanning.mjs apps/bitcraft-local/test/craft-planning.test.mjs
git commit -m "fix: stop automatic planner transport fallback"
```

### Task 3: Explain unavailable yields and logistics alternatives in the detail panel

**Files:**
- Modify: `apps/bitcraft-local/src/pages/CraftPlanningPage.tsx:64-70`
- Modify: `apps/bitcraft-local/src/pages/CraftPlanningPage.tsx:295-367`
- Modify: `apps/bitcraft-local/test/craft-planning-boundary.test.mjs`

**Interfaces:**
- Consumes: source routes with `probabilityStatus`, `producerRecipe`, `inputs`, and alternative `isTransportRoute` values.
- Produces: visible unavailable-rate explanation and `[Logistics]` option labels while preserving exact modal titles and family grouping.

- [ ] **Step 1: Add a failing frontend boundary test for the two new states**

Add a source-boundary test following the file's existing read-and-match pattern:

```js
test("craft planning details explain unavailable producer yields and label logistics routes", () => {
  const page = readFileSync(new URL("../src/pages/CraftPlanningPage.tsx", import.meta.url), "utf8");

  assert.match(page, /probabilityStatus\s*===\s*["']unavailable["']/);
  assert.match(page, /Validated output rate unavailable/);
  assert.match(page, /route is known, but required completions and inputs cannot be calculated/i);
  assert.match(page, /isTransportRoute[\s\S]*?Logistics/);
});
```

- [ ] **Step 2: Run the boundary test and verify failure**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local test -- --test-name-pattern "explain unavailable producer yields"
```

Expected: FAIL because the page has no unavailable-probability branch or logistics option label.

- [ ] **Step 3: Label transport alternatives explicitly**

Update `recipeOptionLabel` without changing non-transport labels:

```tsx
function recipeOptionLabel(recipe: AnyRecord, output?: AnyRecord) {
  const inputs = Array.isArray(recipe.inputs) ? recipe.inputs.map(itemName).filter(Boolean) : [];
  const label = String(recipe.label ?? recipe.name ?? recipe.id ?? "Recipe");
  const station = String(recipe.buildingName ?? "").trim();
  const routeKind = recipe.isTransportRoute ? "[Logistics] " : "";
  if (inputs.length && output) return `${routeKind}${inputs.join(" + ")} -> ${itemName(output)}${station ? ` - ${station}` : ""}`;
  return `${routeKind}${label}${station ? ` - ${station}` : ""}`;
}
```

- [ ] **Step 4: Render the unavailable-yield route state**

Inside the source-route map, add:

```tsx
const probabilityUnavailable = route.probabilityStatus === "unavailable";
const itemListRoute = route.expectedYield != null || probabilityUnavailable;
```

Make the numeric item-list summary conditional. Render this branch before the current validated item-list branch, leaving the validated and deterministic branches unchanged:

```tsx
{probabilityUnavailable ? (
  <div className="craft-plan-chance-summary" role="status">
    <p className="craft-plan-byproduct-note"><strong>Validated output rate unavailable.</strong></p>
    <p className="legend">This production route is known, but required completions and inputs cannot be calculated until a validated probability snapshot is available.</p>
    {producerInputs.length ? (
      <div className="craft-plan-producer-requirements">
        <small>Producer recipe inputs</small>
        {producerInputs.map((input: AnyRecord, inputIndex: number) => (
          <span key={itemKey(input) + "-producer-" + inputIndex}>{itemNode(input)}<strong>x{quantity(input.quantityPerCraft ?? input.quantity)}</strong></span>
        ))}
      </div>
    ) : null}
  </div>
)
```

Do not render action counts, resource equivalents, safety-buffer controls, or expanded total input quantities in the unavailable branch.

- [ ] **Step 5: Run the focused frontend test and build**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local test -- --test-name-pattern "explain unavailable producer yields"
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: PASS and a successful Vite production build with no TypeScript errors.

- [ ] **Step 6: Commit the detail-panel presentation**

```powershell
git add -- apps/bitcraft-local/src/pages/CraftPlanningPage.tsx apps/bitcraft-local/test/craft-planning-boundary.test.mjs
git commit -m "fix: explain unavailable planner producer yields"
```

### Task 4: Verify Wispweave, Straw, and the generic route invariants

**Files:**
- Modify only if a regression is found: files already listed in Tasks 1-3.

**Interfaces:**
- Consumes: completed implementation and the existing local catalogue fixture/database.
- Produces: evidence that the exact reported cases and the generic class are fixed.

- [ ] **Step 1: Run the full application test suite**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local test
```

Expected: all tests pass with zero failures.

- [ ] **Step 2: Run the production build**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: successful TypeScript and Vite build.

- [ ] **Step 3: Start the stable smoke server against the built app**

Run:

```powershell
node scripts/start-bitcraft-local-smoke.mjs --force-restart
curl.exe -s http://127.0.0.1:18449/api/local/health
```

Expected: the launcher returns promptly and the health endpoint reports success.

- [ ] **Step 4: Browser-smoke the reported cases**

Open `http://127.0.0.1:18449/?page=craft-planning` and verify:

- The board still contains one `Filament` family row.
- Opening its T5 cell keeps the title `Exquisite Wispweave Filament`.
- The selected route is the Wispweave plant processing chain, not `Unpack {1}`.
- Rough Straw lists Embergrain and every other catalogued producer alternative.
- If the local database lacks a validated snapshot, both cards show the unavailable-rate explanation and no invented counts.
- A transport alternative, if present, is labelled `[Logistics]` and is not selected unless explicitly overridden.

- [ ] **Step 5: Inspect warnings and working-tree scope**

Run:

```powershell
rg -n "\[DEBUG-" apps/bitcraft-local/src apps/bitcraft-local/test
git diff --check
git status --short
```

Expected: no debug instrumentation, no whitespace errors, and only task-related files plus the pre-existing unrelated `.impeccable/` and workbook-plan file.

- [ ] **Step 6: Commit any verification-only corrections, if needed**

If Tasks 1-5 required a task-scoped correction, stage only those named files and commit:

```powershell
git add -- apps/bitcraft-local/src/server/craftPlanning.mjs apps/bitcraft-local/src/pages/CraftPlanningPage.tsx apps/bitcraft-local/test/craft-planning.test.mjs apps/bitcraft-local/test/craft-planning-boundary.test.mjs
git commit -m "test: cover planner producer route invariants"
```

If no correction was required, do not create an empty commit.
