# Craft Plan Smithing Route Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the complete refined-ingot dependency chain while retaining transport recipes as selectable alternatives that are chosen automatically only when no valid production recipe exists.

**Architecture:** Correct recipe classification at the normalized game-catalog boundary by requiring typed cargo participation before a route can be transport. Add a read-time safeguard for stale normalized rows, then change the planner's single route-selection seam to use explicit override, production, and transport-fallback precedence. Keep the existing alternatives payload and add canonical output-derived labels for stale malformed recipe names.

**Tech Stack:** Node.js 24, JavaScript ES modules, `node:test`, built-in `node:sqlite`, existing React/TypeScript frontend consumers.

## Global Constraints

- Treat `kind + id` and stack `item_type` as authoritative identity; never infer item/cargo identity from a display name.
- Keep all valid production and transport routes visible in existing route dropdowns.
- Route precedence is explicit valid override, valid production route, then valid transport fallback.
- Preserve recursion and blocked-input protection for package/unpackage loops.
- Do not redesign the Craft Planning UI or add a route-priority database model.
- Do not add dependencies, change stock accounting, or alter active-craft and effort formulas.
- Do not send Discord notifications or perform external mutations during verification.

---

## File Map

- Modify `apps/bitcraft-local/src/server/gameCatalog.mjs`: normalize transport structure, canonicalize malformed direct recipe names, protect reads of stale transport flags, and bump the catalog normalization version.
- Modify `apps/bitcraft-local/test/game-catalog.test.mjs`: cover live-shaped malformed smithing metadata, genuine cargo transport routes, stale rows, and normalization-version refresh.
- Modify `apps/bitcraft-local/src/server/craftPlanning.mjs`: implement route precedence and canonicalize stale catalog labels at the planner adapter.
- Modify `apps/bitcraft-local/test/craft-planning.test.mjs`: cover transport visibility/defaulting/override/cycle behavior and the Refined Pyrelite-to-Ferralith-ore chain.

---

### Task 1: Correct catalog transport normalization

**Files:**
- Modify: `apps/bitcraft-local/src/server/gameCatalog.mjs:5-220,308-325`
- Test: `apps/bitcraft-local/test/game-catalog.test.mjs`

**Interfaces:**
- Consumes: normalized recipe links shaped as `{ kind: "items" | "cargo", key, targetId, quantity }`.
- Produces: `recipeHasCargoLink(inputs, outputs): boolean`, corrected `isTransportRoute`, canonical direct recipe names, and `GAME_CATALOG_NORMALIZATION_VERSION = 5`.

- [ ] **Step 1: Add failing live-shaped normalization tests**

Add this fixture and test near the existing normalization tests:

```js
const malformedFerralithDetail = {
  item: { id: "1050001", itemType: 0, name: "Ferralith Ingot", tag: "Ingot", tier: 1 },
  craftingRecipes: [{
    id: "105009",
    name: "Forge Exquisite Construction Materials Pack",
    buildingName: "Rough Smithing Station",
    levelRequirements: [{ skill: { name: "Smithing" }, level: 1 }],
    consumedItemStacks: [{ item_id: "1050003", item_type: "item", quantity: 1 }],
    consumedItems: [{ id: "1050003", itemType: 0, name: "Molten Ferralith" }],
    craftedItemStacks: [{ item_id: "1050001", item_type: "item", quantity: 1 }],
    craftedItems: [{ id: "1050001", itemType: 0, name: "Exquisite Construction Materials Pack" }],
  }],
};

const malformedRefinedFerralithDetail = {
  item: { id: "181015293", itemType: 0, name: "Refined Ferralith Ingot", tag: "Refined Ingot", tier: 1 },
  craftingRecipes: [{
    id: "998040942",
    name: "Refine Refined Ferralith Ingot",
    buildingName: "Rough Smithing Station",
    levelRequirements: [{ skill: { name: "Smithing" }, level: 1 }],
    consumedItemStacks: [
      { item_id: "1050001", item_type: "item", quantity: 5 },
      { item_id: "1858615467", item_type: "item", quantity: 1 },
    ],
    consumedItems: [
      { id: "1050001", itemType: 0, name: "Exquisite Construction Materials Pack" },
      { id: "1858615467", itemType: 0, name: "Basic Metal Solvent" },
    ],
    craftedItemStacks: [{ item_id: "181015293", item_type: "item", quantity: 1 }],
    craftedItems: [{ id: "181015293", itemType: 0, name: "Refined Ferralith Ingot" }],
  }],
};

test("catalog normalization trusts typed stacks over malformed refined-ingot display metadata", () => {
  const ingot = normalizeGameCatalogDetail(malformedFerralithDetail).recipes[0];
  const refined = normalizeGameCatalogDetail(malformedRefinedFerralithDetail).recipes[0];

  assert.equal(ingot.name, "Craft Ferralith Ingot");
  assert.equal(ingot.isTransportRoute, false);
  assert.equal(refined.name, "Refine Refined Ferralith Ingot");
  assert.equal(refined.isTransportRoute, false);
  assert.deepEqual(refined.inputs, [
    { inputKey: "items:1050001", kind: "items", targetId: "1050001", quantity: 5 },
    { inputKey: "items:1858615467", kind: "items", targetId: "1858615467", quantity: 1 },
  ]);
});
```

- [ ] **Step 2: Add a failing stale-row safeguard test**

```js
test("game catalog ignores stale transport flags on recipes with no cargo links", () => {
  const db = createDb();
  const repository = createGameCatalogRepository(db);
  repository.upsertDetail(malformedRefinedFerralithDetail, { updatedAt: UPDATED_AT });
  db.prepare("UPDATE game_catalog_recipes SET is_transport_route = 1 WHERE recipe_key = ?").run("recipe:998040942");

  const recipe = repository.listProducerRecipesForOutput("items:181015293")[0];
  assert.equal(recipe.isTransportRoute, false);
  db.close();
});
```

Change the existing normalization-version assertion from `4` to `5`.

- [ ] **Step 3: Run the focused catalog tests and verify RED**

Run:

```sh
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test --test-name-pattern="typed stacks|stale transport flags|normalization version" test/game-catalog.test.mjs
```

Expected: FAIL because the all-item recipes are marked transport, the malformed forge name is retained, stale flags are trusted, and the version is still 4.

- [ ] **Step 4: Implement structural classification and canonical direct names**

In `gameCatalog.mjs`, set:

```js
export const GAME_CATALOG_NORMALIZATION_VERSION = 5;
```

Add the structural helper beside `displayLooksTransport`:

```js
function recipeHasCargoLink(inputs = [], outputs = []) {
  return [...inputs, ...outputs].some((entry) => entry?.kind === "cargo");
}
```

Replace `recipeLooksTransportRoute` with:

```js
function recipeLooksTransportRoute(recipe, outputs = [], inputs = []) {
  if (!recipeHasCargoLink(inputs, outputs)) return false;
  if (displayLooksTransport(recipe?.name)) return true;
  if (displayLooksTransport(recipeStationName(recipe))) return true;
  const cargoEntries = [...outputs, ...inputs].filter((entry) => entry.kind === "cargo");
  return cargoEntries.some((entry) => displayLooksTransport(entry.name) || displayLooksTransport(entry.tag));
}
```

Add:

```js
function normalizedRecipeName(recipe, sourceEntity, primaryOutput, outputs, inputs) {
  const rawName = String(recipe?.name ?? recipe?.recipeName ?? "Recipe").trim() || "Recipe";
  if (recipeHasCargoLink(inputs, outputs)) return rawName;
  if (!displayLooksTransport(rawName)) return rawName;
  if (primaryOutput?.key !== sourceEntity.catalogKey) return rawName;
  return `Craft ${sourceEntity.name}`;
}
```

In `normalizeRecipe`, replace the current recipe-name assignment with:

```js
name: normalizedRecipeName(recipe, sourceEntity, primaryOutput, outputs, inputs),
```

Finally, protect old stored rows in `mapRecipeRow`:

```js
isTransportRoute: Boolean(row.is_transport_route) && recipeHasCargoLink(inputs, outputs),
```

- [ ] **Step 5: Run the focused catalog tests and verify GREEN**

Run the Step 3 command again.

Expected: PASS for the malformed metadata, stale row, genuine existing transport metadata, and version-refresh assertions.

- [ ] **Step 6: Run the complete catalog test file**

```sh
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/game-catalog.test.mjs
```

Expected: all tests pass.

- [ ] **Step 7: Commit the catalog boundary fix**

```sh
git add apps/bitcraft-local/src/server/gameCatalog.mjs apps/bitcraft-local/test/game-catalog.test.mjs
git commit -m "fix: normalize craft transport routes structurally"
```

---

### Task 2: Add production-first transport fallback

**Files:**
- Modify: `apps/bitcraft-local/src/server/craftPlanning.mjs:552-562`
- Test: `apps/bitcraft-local/test/craft-planning.test.mjs:1188-1227,2358-2410`

**Interfaces:**
- Consumes: sorted recipe arrays and optional stable route override IDs.
- Produces: `selectedRecipeForTarget(recipes, overrideId, blockedKeys)` with valid override → production → transport precedence.

- [ ] **Step 1: Change the transport-only regression to the approved behavior**

Rename `computeCraftPlan does not expand transport-only package loops by default` to `computeCraftPlan uses an unpack route when it is the only valid option without recursing into the pack loop`.

Replace its final assertions with:

```js
assert.equal(plan.steps.length, 1);
assert.equal(plan.steps[0].selectedRecipeId, "unpack-berry");
assert.deepEqual(plan.steps[0].alternatives.map((route) => route.id), ["unpack-berry"]);
assert.equal(plan.materials.find((material) => material.name === "Basic Berry")?.required, 25);
assert.equal(plan.materials.find((material) => material.name === "Basic Berry Package")?.required, 1);
assert.equal(plan.steps.some((step) => step.selectedRecipeId === "pack-berry"), false);
```

- [ ] **Step 2: Keep the existing dropdown/override test structurally transport-correct**

In `collectLocalCatalogCraftPlanDetails keeps transport routes available after real local routes and honors override ids`, change the transport route to consume cargo:

```js
consumedItemStacks: [{ item_id: "8101", item_type: "cargo", quantity: 1 }],
consumedItems: [{ id: "8101", itemType: 1, name: "Treated Board Shipment", tag: "Transport", tier: 3 }],
```

Change the identity insert and override assertion:

```js
repository.upsertEntityIdentity(
  { id: "8101", itemType: 1, name: "Treated Board Shipment", tag: "Transport", tier: 3 },
  { updatedAt: CATALOG_UPDATED_AT, kind: "cargo" },
);

assert.equal(overridePlan.materials.find((material) => material.name === "Treated Board Shipment")?.required, 1);
```

The existing assertions that production is the default, both alternatives are listed, and an explicit transport override is honoured remain unchanged.

- [ ] **Step 3: Run focused planner tests and verify RED**

```sh
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test --test-name-pattern="only valid option|transport routes available" test/craft-planning.test.mjs
```

Expected: the transport-only test FAILS because no route is selected. The production-plus-transport dropdown test continues to demonstrate the required existing behavior.

- [ ] **Step 4: Implement route precedence in one seam**

Replace `selectedRecipeForTarget` with:

```js
function selectedRecipeForTarget(recipes, overrideId, blockedKeys = []) {
  const blocked = new Set(blockedKeys);
  const isValid = (recipe) => !recipeInputs(recipe)
    .some((input) => blocked.has(recipeKey(stackKind(input), stackId(input))));
  const overridden = recipes.find((recipe) => recipeMatchesOverride(recipe, overrideId));
  if (overridden && isValid(overridden)) return overridden;
  return recipes.find((recipe) => !recipeLooksTransportRoute(recipe) && isValid(recipe))
    ?? recipes.find((recipe) => recipeLooksTransportRoute(recipe) && isValid(recipe))
    ?? null;
}
```

Do not change `routeAlternativesForUi`; it already returns the complete sorted recipe list.

- [ ] **Step 5: Run focused planner tests and verify GREEN**

Run the Step 3 command again.

Expected: PASS. The only-route unpack recipe is selected once, the reverse pack cycle is blocked, production remains the default when present, and explicit transport selection remains available.

- [ ] **Step 6: Run the complete planner test file**

```sh
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/craft-planning.test.mjs
```

Expected: all tests pass.

- [ ] **Step 7: Commit route fallback behavior**

```sh
git add apps/bitcraft-local/src/server/craftPlanning.mjs apps/bitcraft-local/test/craft-planning.test.mjs
git commit -m "fix: fall back to transport craft routes"
```

---

### Task 3: Recover stale labels and prove the refined-ingot chain

**Files:**
- Modify: `apps/bitcraft-local/src/server/craftPlanning.mjs:812-852`
- Test: `apps/bitcraft-local/test/craft-planning.test.mjs`

**Interfaces:**
- Consumes: repository recipe links and canonical entities from `repository.getEntity(catalogKey)`.
- Produces: `catalogPlannerRecipeName(repository, recipe): string` and an end-to-end plan containing Refined Ferralith, regular Ferralith, molten Ferralith, and ore.

- [ ] **Step 1: Add a failing stale-label and dependency-chain fixture**

Add a test named `local catalog recovers malformed Ferralith recipes and expands Refined Pyrelite to ore`. Use `createCatalogFixture(t)` and `upsertCatalogDetails` with these exact details:

```js
const malformedFerralithDetail = {
  item: { id: "1050001", itemType: 0, name: "Ferralith Ingot", tag: "Ingot", tier: 1 },
  craftingRecipes: [{
    id: "105009",
    name: "Forge Exquisite Construction Materials Pack",
    buildingName: "Rough Smithing Station",
    craftedItemStacks: [{ item_id: "1050001", item_type: "item", quantity: 1 }],
    craftedItems: [{ id: "1050001", itemType: 0, name: "Exquisite Construction Materials Pack" }],
    consumedItemStacks: [{ item_id: "1050003", item_type: "item", quantity: 1 }],
    consumedItems: [{ id: "1050003", itemType: 0, name: "Molten Ferralith" }],
    levelRequirements: [{ skill: { name: "Smithing" }, level: 1 }],
  }],
};

const malformedRefinedFerralithDetail = {
  item: { id: "181015293", itemType: 0, name: "Refined Ferralith Ingot", tag: "Refined Ingot", tier: 1 },
  craftingRecipes: [{
    id: "998040942",
    name: "Refine Refined Ferralith Ingot",
    buildingName: "Rough Smithing Station",
    craftedItemStacks: [{ item_id: "181015293", item_type: "item", quantity: 1 }],
    craftedItems: [{ id: "181015293", itemType: 0, name: "Refined Ferralith Ingot" }],
    consumedItemStacks: [
      { item_id: "1050001", item_type: "item", quantity: 5 },
      { item_id: "1858615467", item_type: "item", quantity: 1 },
    ],
    consumedItems: [
      { id: "1050001", itemType: 0, name: "Exquisite Construction Materials Pack" },
      { id: "1858615467", itemType: 0, name: "Basic Metal Solvent" },
    ],
    levelRequirements: [{ skill: { name: "Smithing" }, level: 1 }],
  }],
};

const details = [
  {
    item: { id: "647670203", itemType: 0, name: "Refined Pyrelite Ingot", tag: "Refined Ingot", tier: 2 },
    craftingRecipes: [{
      id: "1810363538",
      name: "Refine Refined Pyrelite Ingot",
      craftedItemStacks: [{ item_id: "647670203", item_type: "item", quantity: 1 }],
      craftedItems: [{ id: "647670203", itemType: 0, name: "Refined Pyrelite Ingot", tag: "Refined Ingot", tier: 2 }],
      consumedItemStacks: [
        { item_id: "2050001", item_type: "item", quantity: 5 },
        { item_id: "1537761415", item_type: "item", quantity: 1 },
        { item_id: "181015293", item_type: "item", quantity: 2 },
      ],
      consumedItems: [
        { id: "2050001", itemType: 0, name: "Pyrelite Ingot" },
        { id: "1537761415", itemType: 0, name: "Simple Metal Solvent" },
        { id: "181015293", itemType: 0, name: "Refined Ferralith Ingot" },
      ],
      levelRequirements: [{ skill: { name: "Smithing" }, level: 20 }],
    }],
  },
  malformedRefinedFerralithDetail,
  malformedFerralithDetail,
  {
    item: { id: "1050003", itemType: 0, name: "Molten Ferralith", tag: "Molten Ingot", tier: 1 },
    craftingRecipes: [{
      id: "105000",
      name: "Smelt Molten Ferralith",
      craftedItemStacks: [{ item_id: "1050003", item_type: "item", quantity: 1 }],
      craftedItems: [{ id: "1050003", itemType: 0, name: "Molten Ferralith" }],
      consumedItemStacks: [{ item_id: "1040003", item_type: "item", quantity: 1 }],
      consumedItems: [{ id: "1040003", itemType: 0, name: "Ferralith Ore Concentrate" }],
      levelRequirements: [{ skill: { name: "Smithing" }, level: 1 }],
    }],
  },
  {
    item: { id: "1040003", itemType: 0, name: "Ferralith Ore Concentrate", tag: "Ore Concentrate", tier: 1 },
    extractionRecipes: [{
      id: "103006",
      name: "Extract Ferralith Ore Concentrate",
      craftedItemStacks: [{ item_id: "1040003", item_type: "item", quantity: 1 }],
      craftedItems: [{ id: "1040003", itemType: 0, name: "Ferralith Ore Concentrate" }],
      consumedItemStacks: [{ item_id: "1040002", item_type: "item", quantity: 2 }],
      consumedItems: [{ id: "1040002", itemType: 0, name: "Ferralith Ore Piece" }],
      levelRequirements: [{ skill: { name: "Mining" }, level: 1 }],
    }],
  },
  {
    item: { id: "1040002", itemType: 0, name: "Ferralith Ore Piece", tag: "Ore Piece", tier: 1 },
    extractionRecipes: [{
      id: "103005",
      name: "Extract Ferralith Ore Piece",
      craftedItemStacks: [{ item_id: "1040002", item_type: "item", quantity: 4 }],
      craftedItems: [{ id: "1040002", itemType: 0, name: "Ferralith Ore Piece" }],
      consumedItemStacks: [{ item_id: "1001", item_type: "cargo", quantity: 1 }],
      consumedItems: [{ id: "1001", itemType: 1, name: "Ferralith Ore Chunk" }],
      levelRequirements: [{ skill: { name: "Mining" }, level: 1 }],
    }],
  },
  { cargo: { id: "1001", itemType: 1, name: "Ferralith Ore Chunk", tag: "Ore Chunk", tier: 1 }, craftingRecipes: [] },
  { item: { id: "2050001", itemType: 0, name: "Pyrelite Ingot", tag: "Ingot", tier: 2 }, craftingRecipes: [] },
  { item: { id: "1537761415", itemType: 0, name: "Simple Metal Solvent", tag: "Metal Solvent", tier: 2 }, craftingRecipes: [] },
  { item: { id: "1858615467", itemType: 0, name: "Basic Metal Solvent", tag: "Metal Solvent", tier: 1 }, craftingRecipes: [] },
];
```

After inserting the details, simulate the existing production cache:

```js
db.prepare("UPDATE game_catalog_recipes SET name = ?, is_transport_route = 1 WHERE recipe_key = ?")
  .run("Forge Exquisite Construction Materials Pack", "recipe:105009");
db.prepare("UPDATE game_catalog_recipes SET is_transport_route = 1 WHERE recipe_key IN (?, ?)")
  .run("recipe:998040942", "recipe:105000");
```

Compute the plan:

```js
const target = { id: "647670203", kind: "items", itemType: 0, name: "Refined Pyrelite Ingot", quantity: 196 };
const config = normalizeCraftPlanConfig({ enabled: true, targets: [target] });
const { detailsByKey, warnings } = collectLocalCatalogCraftPlanDetails(repository, config.targets, config.routeOverrides);
const plan = computeCraftPlan({ config, detailsByKey, catalogWarnings: warnings });
const material = (key) => plan.materials.find((entry) => entry.key === key);

assert.equal(material("items:181015293")?.required, 392);
assert.equal(material("items:181015293")?.sourceRoutes[0]?.recipeName, "Refine Refined Ferralith Ingot");
assert.equal(material("items:1050001")?.required, 1960);
assert.equal(material("items:1050001")?.sourceRoutes[0]?.recipeName, "Craft Ferralith Ingot");
assert.equal(material("items:1050003")?.required, 1960);
assert.equal(material("items:1040003")?.required, 1960);
assert.equal(material("items:1040002")?.required, 3920);
assert.equal(material("cargo:1001")?.required, 980);
```

- [ ] **Step 2: Run the focused chain test and verify RED**

```sh
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test --test-name-pattern="expands Refined Pyrelite to ore" test/craft-planning.test.mjs
```

Expected: FAIL because the stale stored recipe name is exposed as `Forge Exquisite Construction Materials Pack`.

- [ ] **Step 3: Canonicalize stale all-item catalog labels in the planner adapter**

Add beside `catalogRouteId`:

```js
function catalogPlannerRecipeName(repository, recipe) {
  const rawName = String(recipe?.name ?? "Recipe").trim() || "Recipe";
  const links = [...(recipe?.inputs ?? []), ...(recipe?.outputs ?? [])];
  if (links.some((link) => normalizeKind(link.kind) === "cargo")) return rawName;
  if (!/\b(pack|package|unpack|packed|transport|bundle|crate)\b/i.test(rawName)) return rawName;
  const primary = recipe?.outputs?.find((output) => output.isPrimaryOutput) ?? recipe?.outputs?.[0];
  const entity = primary?.outputKey ? repository.getEntity(primary.outputKey) : null;
  return entity?.name ? `Craft ${entity.name}` : rawName;
}
```

At the start of `catalogPlannerRecipe`, calculate:

```js
const name = catalogPlannerRecipeName(repository, recipe);
```

Use that value in the returned object:

```js
name,
```

Do not change `id`, `recipeKey`, or `catalogRecipeKey`; saved route overrides must remain stable.

- [ ] **Step 4: Run the chain test and verify GREEN**

Run the Step 2 command again.

Expected: PASS with the exact T2 → T1 refined → regular ingot → molten → ore quantities.

- [ ] **Step 5: Run both focused backend test files**

```sh
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/game-catalog.test.mjs test/craft-planning.test.mjs
```

Expected: all tests pass.

- [ ] **Step 6: Commit the stale-label and chain regression**

```sh
git add apps/bitcraft-local/src/server/craftPlanning.mjs apps/bitcraft-local/test/craft-planning.test.mjs
git commit -m "test: cover refined ingot dependency recovery"
```

---

### Task 4: Full verification

**Files:**
- Inspect: all files changed by Tasks 1-3

**Interfaces:**
- Consumes: completed catalog and planner behavior.
- Produces: fresh build/test evidence and a clean focused diff ready for user-requested release work.

- [ ] **Step 1: Inspect scope and whitespace**

```sh
git status --short
git diff --check
git diff --stat HEAD~3
```

Expected: only the catalog, planner, their two test files, and this approved planning documentation are in scope; no whitespace errors.

- [ ] **Step 2: Run the production build**

```sh
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: TypeScript checking and Vite build complete with exit code 0.

- [ ] **Step 3: Run the full test suite**

```sh
corepack pnpm --filter @workspace/bitcraft-local test
```

Expected: all tests pass with zero failures.

- [ ] **Step 4: Re-run the exact regression test**

```sh
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test --test-name-pattern="expands Refined Pyrelite to ore|only valid option|transport routes available" test/craft-planning.test.mjs
```

Expected: all selected regressions pass.

- [ ] **Step 5: Review final behavior against the specification**

Confirm from test output and diff:

- malformed all-item smithing recipes are production routes;
- production is preferred by default;
- transport alternatives remain visible;
- explicit transport overrides work;
- transport-only fallback works without expanding the reverse package loop;
- stale labels display the canonical output item;
- the Ferralith ore chain and quantities are present;
- normalization version 5 schedules corrected catalog refresh data.

Do not edit `CHANGELOG.md` or `package.json` unless the user subsequently asks to push, deploy, publish, or prepare a release.
