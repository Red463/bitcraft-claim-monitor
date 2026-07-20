# Craft Planner Activity and Output Classification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Craft Planner call only direct world-resource-node acquisition gathering, while bench and station recipes are crafts whose guaranteed outputs and variable byproducts are presented accurately.

**Architecture:** Persist an explicit `activityKind` on normalized catalog recipes instead of deriving activity from profession names. The planner combines that activity with each output's guaranteed and expected yields to produce one of four route types, and the detail panel renders route-specific labels, quantities, actions, and inputs.

**Tech Stack:** Node.js 24, built-in `node:sqlite`, JavaScript ES modules, React, TypeScript, plain CSS, Node test runner, pnpm/Corepack.

## Global Constraints

- Gathering means direct acquisition from a world resource node only.
- Any action performed at a bench, station, camp, or other workstation is `craft`, regardless of profession.
- Preserve expected-yield, guaranteed-yield, action-count, input-expansion, multiplier, stock, and progress calculations.
- Use an additive SQLite migration; do not reset or destructively rewrite catalog data.
- Do not infer gathering from recipe names, profession names, or broad item tags.
- Do not add dependencies, update `CHANGELOG.md`, or bump the package version.
- Keep changes inside `apps/bitcraft-local` and the focused tests named below.

## File Structure

- Modify `apps/bitcraft-local/src/server/schemaBootstrap.mjs`: add the catalog recipe activity column for new databases.
- Modify `apps/bitcraft-local/src/server/schemaMigrations.mjs`: add the safe default to existing databases.
- Modify `apps/bitcraft-local/src/server/gameCatalog.mjs`: preserve recipe provenance, persist `activityKind`, and reconstruct it from SQLite.
- Modify `apps/bitcraft-local/src/server/craftPlanning.mjs`: classify route activity and output certainty independently.
- Modify `apps/bitcraft-local/src/pages/CraftPlanningPage.tsx`: render all four route types accurately.
- Modify `apps/bitcraft-local/src/styles/craft-planning.css`: distinguish craft and gathering badges.
- Modify `apps/bitcraft-local/test/server-schema-migrations.test.mjs`, `game-catalog.test.mjs`, `craft-planning.test.mjs`, and `craft-planning-boundary.test.mjs`: focused regression coverage.

---

### Task 1: Persist recipe activity provenance in the game catalog

**Files:**
- Modify: `apps/bitcraft-local/src/server/schemaBootstrap.mjs:300-311`
- Modify: `apps/bitcraft-local/src/server/schemaMigrations.mjs:1-29`
- Modify: `apps/bitcraft-local/src/server/gameCatalog.mjs:5, 145-306, 319-334, 404-420, 800-830`
- Test: `apps/bitcraft-local/test/server-schema-migrations.test.mjs`
- Test: `apps/bitcraft-local/test/game-catalog.test.mjs`

**Interfaces:**
- Produces: recipe records with `activityKind: "craft" | "gathering"`.
- Produces: SQLite `game_catalog_recipes.activity_kind TEXT NOT NULL DEFAULT 'craft'`.
- Produces: `GAME_CATALOG_NORMALIZATION_VERSION = 6` so old normalized rows refresh.
- Consumes: existing `recipeStationName(recipe)` and stable recipe keys.

- [ ] **Step 1: Write the failing schema migration tests**

Append the ordered migration expectation and add the preservation test:

```js
assert.deepEqual(additiveColumnMigrations.at(-1), {
  table: "game_catalog_recipes",
  column: "activity_kind",
  definition: "TEXT NOT NULL DEFAULT 'craft' CHECK (activity_kind IN ('craft', 'gathering'))",
});

test("recipe activity kind migrates old catalog rows safely as crafts", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE game_catalog_recipes (recipe_key TEXT PRIMARY KEY, name TEXT);
    INSERT INTO game_catalog_recipes (recipe_key, name) VALUES ('recipe:old', 'Split a trunk');
  `);
  applyAdditiveColumnMigrations(db, [{
    table: "game_catalog_recipes",
    column: "activity_kind",
    definition: "TEXT NOT NULL DEFAULT 'craft' CHECK (activity_kind IN ('craft', 'gathering'))",
  }]);
  assert.deepEqual(
    { ...db.prepare("SELECT recipe_key, activity_kind FROM game_catalog_recipes").get() },
    { recipe_key: "recipe:old", activity_kind: "craft" },
  );
  db.close();
});
```

- [ ] **Step 2: Write failing normalization and persistence tests**

Extend the existing `baitAndShellsDetail` assertions. Its Fishing Table craft and its extraction entry with a Salvage Bench must both be crafts:

```js
assert.equal(processRecipe.activityKind, "craft");
assert.equal(normalized.recipes.find((recipe) => recipe.name === "Extract Shells").activityKind, "craft");
assert.equal(bundleRecipe.activityKind, "craft");
```

Add a no-station extraction case:

```js
const worldExtraction = normalizeGameCatalogDetail({
  item: { id: "8000", itemType: 0, name: "Rough Stone Output", tag: "Stone Output", tier: 1 },
  extractionRecipes: [{
    id: "extract-stone-node",
    name: "Extract Rough Stone",
    craftedItemStacks: [{ item_id: "8000", item_type: "item", quantity: 1 }],
    consumedItemStacks: [],
    levelRequirements: [{ skill: { name: "Mining" }, level: 1 }],
  }],
});
assert.equal(worldExtraction.recipes[0].activityKind, "gathering");
```

Verify SQLite round-tripping and the normalization bump:

```js
assert.deepEqual(
  repository.listProducerRecipesForOutput("items:1220019").map((recipe) => ({
    name: recipe.name,
    activityKind: recipe.activityKind,
  })),
  [
    { name: "Extract Shells", activityKind: "craft" },
    { name: "Process Briny Guppi", activityKind: "craft" },
  ],
);
assert.equal(GAME_CATALOG_NORMALIZATION_VERSION, 6);
```

- [ ] **Step 3: Run the focused tests and confirm they fail**

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/server-schema-migrations.test.mjs apps/bitcraft-local/test/game-catalog.test.mjs
```

Expected: failures because `activity_kind` and `activityKind` do not exist and the normalization version is still `5`.

- [ ] **Step 4: Add the bootstrap column and additive migration**

Add after `action_count` in `schemaBootstrap.mjs`:

```sql
activity_kind TEXT NOT NULL DEFAULT 'craft' CHECK (activity_kind IN ('craft', 'gathering')),
```

Append to `additiveColumnMigrations`:

```js
{ table: "game_catalog_recipes", column: "activity_kind", definition: "TEXT NOT NULL DEFAULT 'craft' CHECK (activity_kind IN ('craft', 'gathering'))" },
```

- [ ] **Step 5: Preserve authoritative activity during normalization**

Change `normalizeRecipe` to accept activity metadata and force workstation recipes to craft:

```js
function normalizeRecipe(recipe, sourceEntity, requestedActivityKind = "craft") {
  const stationName = recipeStationName(recipe);
  const activityKind = stationName ? "craft" : requestedActivityKind === "gathering" ? "gathering" : "craft";
  const outputDisplays = unwrapArray(recipe?.craftedItems);
  const inputDisplays = unwrapArray(recipe?.consumedItems);
  const declaredPrimary = targetFromStack(
    recipe?.craftedItem ?? recipe?.outputItem ?? recipe?.targetItem ?? recipe?.target ?? {},
    recipe?.craftedItem ?? recipe?.targetItem ?? {},
  );
  const outputs = unwrapArray(recipe?.craftedItemStacks)
    .map((stack, index) => targetFromStack(stack, outputDisplays[index] ?? recipe?.craftedItem ?? {}))
    .filter((entry) => entry && entry.quantity > 0);
  if (!outputs.length && declaredPrimary) {
    const declaredQuantity = Math.max(
      1,
      toNumber(
        recipe?.outputQuantity
        ?? recipe?.quantity
        ?? recipe?.craftedQuantity
        ?? recipe?.craftedItem?.quantity
        ?? recipe?.outputItem?.quantity
        ?? declaredPrimary.quantity
        ?? 1,
        1,
      ) || 1,
    );
    outputs.push({ ...declaredPrimary, quantity: declaredQuantity });
  }
  const inputs = unwrapArray(recipe?.consumedItemStacks)
    .map((stack, index) => targetFromStack(stack, inputDisplays[index] ?? {}))
    .filter((entry) => entry && entry.quantity > 0);
  if (!outputs.length && !inputs.length) return null;

  const sourceOutputKey = sourceEntity.catalogKey;
  const singleOutputKey = outputs.length === 1 ? outputs[0].key : null;
  const primaryOutputKey = declaredPrimary?.key
    ?? (outputs.some((output) => output.key === sourceOutputKey) ? sourceOutputKey : singleOutputKey);
  const normalizedOutputs = outputs.map((output) => ({
    outputKey: output.key,
    kind: output.kind,
    targetId: output.targetId,
    quantity: output.quantity,
    isPrimaryOutput: output.key === primaryOutputKey,
  }));
  const primaryOutput = outputs.find((output) => output.key === primaryOutputKey) ?? null;
  return {
    recipeKey: recipeStableKey(sourceEntity, recipe, outputs, inputs),
    sourceKind: primaryOutput?.kind ?? sourceEntity.kind,
    sourceId: primaryOutput?.targetId ?? sourceEntity.targetId,
    actionCount: recipeActionCount(recipe),
    activityKind,
    name: normalizedRecipeName(recipe, sourceEntity, primaryOutput, outputs, inputs),
    stationName,
    skillName: recipeSkillName(recipe),
    isPassive: recipe?.isPassive === true,
    isTransportRoute: recipeLooksTransportRoute(recipe, outputs, inputs),
    inputs: inputs.map((input) => ({ inputKey: input.key, kind: input.kind, targetId: input.targetId, quantity: input.quantity })),
    outputs: normalizedOutputs,
  };
}
```

Replace the source-array merge with priority-aware normalization:

```js
const recipeCandidates = [
  ...unwrapArray(detail?.craftingRecipes).map((recipe) => ({ recipe, activityKind: "craft", priority: 2 })),
  ...unwrapArray(detail?.extractionRecipes).map((recipe) => ({ recipe, activityKind: "gathering", priority: 2 })),
  ...unwrapArray(detail?.recipesUsingItem).map((recipe) => ({ recipe, activityKind: "craft", priority: 1 })),
];
const recipesByKey = new Map();
for (const candidate of recipeCandidates) {
  const normalized = normalizeRecipe(candidate.recipe, entity, candidate.activityKind);
  if (!normalized) continue;
  const existing = recipesByKey.get(normalized.recipeKey);
  if (!existing || candidate.priority > existing.priority) {
    recipesByKey.set(normalized.recipeKey, { ...normalized, priority: candidate.priority });
  }
}
const recipes = [...recipesByKey.values()].map(({ priority, ...recipe }) => recipe);
```

Keeping crafting entries before extraction entries makes an equally authoritative duplicate safely remain craft.

- [ ] **Step 6: Persist and reconstruct `activityKind`**

Add this to `mapRecipeRow`:

```js
activityKind: row.activity_kind === "gathering" ? "gathering" : "craft",
```

Change the repository statement and arguments:

```js
INSERT INTO game_catalog_recipes (
  recipe_key, source_kind, source_id, action_count, activity_kind,
  name, station_name, skill_name, is_passive, is_transport_route, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

```js
activity_kind = excluded.activity_kind,
```

```js
recipe.actionCount,
recipe.activityKind === "gathering" ? "gathering" : "craft",
recipe.name,
```

Bump `GAME_CATALOG_NORMALIZATION_VERSION` from `5` to `6`.

- [ ] **Step 7: Run the focused catalog tests**

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/server-schema-migrations.test.mjs apps/bitcraft-local/test/game-catalog.test.mjs
```

Expected: all tests pass with zero failures.

- [ ] **Step 8: Commit the catalog activity model**

```powershell
git add apps/bitcraft-local/src/server/schemaBootstrap.mjs apps/bitcraft-local/src/server/schemaMigrations.mjs apps/bitcraft-local/src/server/gameCatalog.mjs apps/bitcraft-local/test/server-schema-migrations.test.mjs apps/bitcraft-local/test/game-catalog.test.mjs
git commit -m "fix: preserve craft planner activity type"
```

---

### Task 2: Classify planner routes by activity and output certainty

**Files:**
- Modify: `apps/bitcraft-local/src/server/craftPlanning.mjs:356-381, 477-550, 643-688, 867-928`
- Test: `apps/bitcraft-local/test/craft-planning.test.mjs:1945-2004, 2104-2172, 2395-2616`

**Interfaces:**
- Consumes: `recipe.activityKind: "craft" | "gathering"` from Task 1.
- Produces: `routeType: "craft" | "craft-byproduct" | "gathering" | "gathering-byproduct"`.
- Preserves: yield, probability, producer, inputs, alternatives, and action-count metadata.

- [ ] **Step 1: Add the exact Simple Wood Log regression test**

```js
test("computeCraftPlan treats guaranteed Forestry Station logs as craft output and resin as a craft byproduct", () => {
  const log = { id: "2010001", itemType: 0, name: "Simple Wood Log", tag: "Wood Log", tier: 2 };
  const resin = { id: "1724476397", itemType: 0, name: "Simple Amber Resin", tag: "Resin", tier: 2 };
  const output = { id: "1940258895", itemType: 0, name: "Simple Wood Log Output", tag: "Wood Log", tier: 2 };
  const trunk = { id: "1001", itemType: 1, name: "Simple Wood Trunk", tag: "Trunk", tier: 2 };
  const splitRecipe = {
    id: "201003",
    name: "Split into Simple Wood Log Output",
    buildingName: "Tier 2 Forestry Station",
    skillName: "Forestry",
    activityKind: "craft",
    craftedItemStacks: [{ item_id: output.id, item_type: "item", quantity: 1 }],
    craftedItems: [output],
    consumedItemStacks: [{ item_id: trunk.id, item_type: "cargo", quantity: 1 }],
    consumedItems: [trunk],
  };
  const detailsByKey = new Map([
    [recipeKey("items", log.id), { item: log }],
    [recipeKey("items", resin.id), { item: resin }],
    [recipeKey("items", output.id), {
      item: output,
      craftingRecipes: [splitRecipe],
      itemListPossibilities: [
        { targetId: log.id, targetItem: log, quantity: 6, chance: 1, guaranteedQuantity: 6 },
        { targetId: resin.id, targetItem: resin, quantity: 0.06, chance: 1, guaranteedQuantity: 0 },
      ],
    }],
    [recipeKey("cargo", trunk.id), { cargo: trunk }],
  ]);

  const logPlan = computeCraftPlan({
    config: normalizeCraftPlanConfig({ enabled: true, targets: [{ ...log, kind: "items", quantity: 276 }] }),
    detailsByKey,
  });
  const logRoute = logPlan.materials.find((material) => material.id === log.id)?.sourceRoutes?.[0];
  assert.equal(logRoute?.routeType, "craft");
  assert.equal(logRoute?.expectedYield, 6);
  assert.equal(logRoute?.guaranteedYield, 6);
  assert.equal(logRoute?.inputs[0]?.name, "Simple Wood Trunk");
  assert.equal(logRoute?.inputs[0]?.quantity, 1);

  const resinPlan = computeCraftPlan({
    config: normalizeCraftPlanConfig({ enabled: true, targets: [{ ...resin, kind: "items", quantity: 1 }] }),
    detailsByKey,
  });
  assert.equal(resinPlan.materials.find((material) => material.id === resin.id)?.sourceRoutes?.[0]?.routeType, "craft-byproduct");
});
```

- [ ] **Step 2: Add the four-way route matrix tests**

Add this focused helper, which varies only activity and guarantee:

```js
function itemListRouteFixture({ activityKind, guaranteedQuantity }) {
  const target = { id: "9100", itemType: 0, name: "Stone Fragment", tag: "Stone", tier: 1 };
  const producer = { id: "9101", itemType: 0, name: "Stone Output", tag: "Stone Output", tier: 1 };
  const source = { id: "9102", itemType: 1, name: "Stone Source", tag: "Stone Source", tier: 1 };
  const station = activityKind === "craft" ? "Mining Station" : null;
  const recipe = {
    id: `stone-${activityKind}`,
    name: activityKind === "craft" ? "Process Stone" : "Gather Stone",
    activityKind,
    buildingName: station,
    skillName: "Mining",
    gatheringSource: activityKind === "gathering"
      ? { tag: "Stone Output", label: "Stone", skill: "Mining" }
      : null,
    craftedItemStacks: [{ item_id: producer.id, item_type: "item", quantity: 1 }],
    craftedItems: [producer],
    consumedItemStacks: station ? [{ item_id: source.id, item_type: "cargo", quantity: 1 }] : [],
    consumedItems: station ? [source] : [],
  };
  const detailsByKey = new Map([
    [recipeKey("items", target.id), { item: target }],
    [recipeKey("items", producer.id), {
      item: producer,
      craftingRecipes: [recipe],
      itemListPossibilities: [{
        targetId: target.id,
        targetItem: target,
        quantity: 6,
        chance: 1,
        guaranteedQuantity,
      }],
    }],
    [recipeKey("cargo", source.id), { cargo: source }],
  ]);
  const plan = computeCraftPlan({
    config: normalizeCraftPlanConfig({ enabled: true, targets: [{ ...target, kind: "items", quantity: 6 }] }),
    detailsByKey,
  });
  return plan.materials.find((material) => material.id === target.id)?.sourceRoutes?.[0];
}
```

Then assert:

```js
for (const [activityKind, guaranteedQuantity, expectedRouteType] of [
  ["craft", 6, "craft"],
  ["craft", 0, "craft-byproduct"],
  ["gathering", 6, "gathering"],
  ["gathering", 0, "gathering-byproduct"],
]) {
  test(`item-list route ${activityKind} with guarantee ${guaranteedQuantity} becomes ${expectedRouteType}`, () => {
    assert.equal(itemListRouteFixture({ activityKind, guaranteedQuantity }).routeType, expectedRouteType);
  });
}
```

The helper uses a workstation for `craft`, and no workstation plus `gatheringSource: { tag: "Stone Output", label: "Stone", skill: "Mining" }` for gathering.

Update old heuristic assertions: Forestry Station, Fishing Table, and Foraging Camp results are craft/craft-byproduct; only synthetic Sand/Clay node routes remain gathering.

- [ ] **Step 3: Run the focused planner test and confirm it fails**

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/craft-planning.test.mjs
```

Expected: the log route remains `gathering-byproduct`, and the new route types do not exist.

- [ ] **Step 4: Replace profession inference with activity helpers**

Remove `GATHERING_SKILLS` and `isGatheringRecipe`. Add:

```js
function recipeStationName(recipe) {
  return String(
    recipe?.buildingName
    ?? recipe?.building_name
    ?? recipe?.stationName
    ?? recipe?.station_name
    ?? recipe?.station?.name
    ?? recipe?.building?.name
    ?? "",
  ).trim();
}

function recipeActivityKind(recipe) {
  if (recipeStationName(recipe)) return "craft";
  return recipe?.activityKind === "gathering" ? "gathering" : "craft";
}

function routeIsGathering(recipe) {
  if (recipe?.routeType != null) {
    return recipe.routeType === "gathering" || recipe.routeType === "gathering-byproduct";
  }
  return recipeActivityKind(recipe) === "gathering";
}

function routeTypeForItemListOutput(recipe, output) {
  const activityKind = recipeActivityKind(recipe);
  const expectedYield = Math.max(0, toNumber(output?.quantity));
  const guaranteedYield = Math.max(0, toNumber(output?.guaranteedQuantity));
  return guaranteedYield + 1e-9 < expectedYield ? `${activityKind}-byproduct` : activityKind;
}
```

Replace `routeMetadata` so direct routes use activity and gathering skills appear only on genuine gathering routes:

```js
function routeMetadata(recipe) {
  const gathering = routeIsGathering(recipe);
  const gatheringSkill = recipe?.gatheringSkill ?? recipeSkillName(recipe);
  return {
    routeType: recipe?.routeType ?? recipeActivityKind(recipe),
    gatheringSkill: gathering ? gatheringSkill || null : null,
    producer: recipe?.producer ?? null,
    producerRecipe: recipe?.producerRecipe ?? null,
    expectedYield: recipe?.expectedYield == null ? null : toNumber(recipe.expectedYield),
    isProbabilistic: recipe?.isProbabilistic === true,
    dropChance: recipe?.dropChance == null ? null : toNumber(recipe.dropChance),
    dropQuantity: recipe?.dropQuantity == null ? null : toNumber(recipe.dropQuantity),
    guaranteedYield: recipe?.guaranteedYield == null ? null : toNumber(recipe.guaranteedYield),
    gatheringSource: recipe?.gatheringSource ?? null,
  };
}
```

Preserve provenance for non-catalog details by replacing `directRecipesForTarget` with:

```js
function directRecipesForTarget(detail, target) {
  const unwrapped = unwrapRecipeDetail(detail);
  const candidates = [
    ...(unwrapped?.craftingRecipes ?? []).map((recipe) => ({ recipe, fallbackActivityKind: "craft" })),
    ...(unwrapped?.extractionRecipes ?? []).map((recipe) => ({ recipe, fallbackActivityKind: "gathering" })),
  ];
  return candidates
    .map(({ recipe, fallbackActivityKind }) => ({
      ...recipe,
      activityKind: recipe?.activityKind ?? fallbackActivityKind,
    }))
    .filter((recipe) => recipeOutputs(recipe).some((stack) => stackMatches(stack, target)));
}
```

- [ ] **Step 5: Classify item-list outputs and reconstructed catalog recipes**

In `possibilityRecipesForTarget`:

```js
const craftedOutput = craftedOutputs.find((candidate) => candidate.id === String(target.id) && candidate.kind === target.kind);
const routeType = routeTypeForItemListOutput(recipe, craftedOutput);
const gathering = routeType === "gathering" || routeType === "gathering-byproduct";
```

Store:

```js
routeType,
gatheringSkill: gathering ? recipeSkillName(recipe) : null,
isProbabilistic: (craftedOutput?.guaranteedQuantity ?? 0) + 1e-9 < (craftedOutput?.quantity ?? 0),
expectedYield: yieldQuantity * outputPerCraft,
guaranteedYield: craftedOutput?.guaranteedQuantity ?? 0,
```

Pass repository activity through `catalogPlannerRecipe`:

```js
activityKind: recipe.activityKind === "gathering" ? "gathering" : "craft",
```

Mark only synthetic world-node recipes explicitly:

```js
activityKind: "gathering",
```

- [ ] **Step 6: Restrict gathering preference and source grouping**

```js
const gatheringRoutes = recipes.filter(routeIsGathering);
return (gatheringRoutes.length ? gatheringRoutes : recipes)
  .sort((a, b) => recipeSortScore(a, target, detailsByKey) - recipeSortScore(b, target, detailsByKey));
```

Build `gatheringSources` only from `routeIsGathering`. Craft routes remain available to normal route overrides and retain workstation inputs.

- [ ] **Step 7: Run the focused planner tests**

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/craft-planning.test.mjs
```

Expected: zero failures; logs are `craft`, resin is `craft-byproduct`, and synthetic node cases remain gathering.

- [ ] **Step 8: Commit planner classification**

```powershell
git add apps/bitcraft-local/src/server/craftPlanning.mjs apps/bitcraft-local/test/craft-planning.test.mjs
git commit -m "fix: classify craft planner routes by activity"
```

---

### Task 3: Render route-specific acquisition details

**Files:**
- Modify: `apps/bitcraft-local/src/pages/CraftPlanningPage.tsx:298-340`
- Modify: `apps/bitcraft-local/src/styles/craft-planning.css:448-489`
- Test: `apps/bitcraft-local/test/craft-planning-boundary.test.mjs:90-98`

**Interfaces:**
- Consumes: the four `routeType` values from Task 2.
- Consumes: yield, probability, producer, inputs, and craft-count metadata.
- Produces: `Craft output`, `Craft byproduct`, `Gathering output`, and `Gathering byproduct` labels.

- [ ] **Step 1: Write failing UI boundary assertions**

```js
assert.match(page, /Craft output/);
assert.match(page, /Craft byproduct/);
assert.match(page, /Gathering output/);
assert.match(page, /Gathering byproduct/);
assert.match(page, /routeType\.startsWith\("gathering"\)/);
assert.match(page, /routeType\.endsWith\("-byproduct"\)/);
assert.match(page, /Guaranteed output:/);
assert.match(page, /per craft/);
assert.match(page, /per gathering action/);
assert.match(page, /Craft inputs/);
assert.doesNotMatch(page, /route\.routeType === "gathering-byproduct"/);
```

- [ ] **Step 2: Run the boundary test and confirm it fails**

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/craft-planning-boundary.test.mjs
```

Expected: failures for new route labels and generalized predicates.

- [ ] **Step 3: Derive presentation from route type without adding hooks**

```tsx
const routeType = String(route.routeType ?? "craft");
const gatheringRoute = routeType.startsWith("gathering");
const byproductRoute = routeType.endsWith("-byproduct");
const routeKindLabel = routeType === "gathering-byproduct"
  ? "Gathering byproduct"
  : routeType === "gathering"
    ? "Gathering output"
    : routeType === "craft-byproduct"
      ? "Craft byproduct"
      : "Craft output";
const actionNoun = gatheringRoute ? "gathering action" : "craft";
const guaranteedOutput = !byproductRoute
  && Number(route.guaranteedYield) > 0
  && Number(route.guaranteedYield) + 1e-9 >= Number(route.expectedYield);
const displayedRecipeName = route.producerRecipe?.name ?? route.recipeName ?? "Selected recipe";
const actionLabel = gatheringRoute
  ? "Estimated gathering actions"
  : byproductRoute
    ? "Estimated crafts"
    : "Crafts required";
```

Render:

```tsx
<span className={`craft-plan-route-kind is-${gatheringRoute ? "gathering" : "craft"}`}>{routeKindLabel}</span>
<strong>{displayedRecipeName}</strong>
```

- [ ] **Step 4: Render certainty, actions, and inputs accurately**

For routes with `expectedYield`:

```tsx
<p className="craft-plan-byproduct-note">
  {guaranteedOutput ? "Guaranteed output: " : "Expected yield: "}
  {formatNumber(
    guaranteedOutput ? Number(route.guaranteedYield) : Number(route.expectedYield),
    Number(route.expectedYield) < 1 ? 2 : 1,
  )} {itemName(route.output)} per {actionNoun}
  {!guaranteedOutput && route.dropChance != null
    ? ` (${formatNumber(Number(route.dropChance) * 100, 1)}% chance for ${formatNumber(Number(route.dropQuantity) || 0, 1)})`
    : ""}.
</p>
```

Render the action total for item-list routes:

```tsx
{route.expectedYield != null ? (
  <div className="craft-plan-action-summary">
    <span>{actionLabel} <strong>{quantity(baseActions)}</strong></span>
    {routeMultiplier > 1 ? <span>With {formatNumber((routeMultiplier - 1) * 100, 1)}% extra <strong>{quantity(bufferedActions)} actions</strong></span> : null}
  </div>
) : null}
```

Show workstation item-list inputs under the craft label, while retaining the gathering wording for true node routes:

```tsx
{producerInputs.length ? (
  <div className="craft-plan-producer-requirements">
    <small>{gatheringRoute ? "Gather/process" : "Craft inputs"}</small>
    {producerInputs.map((input: AnyRecord, inputIndex: number) => (
      <span key={itemKey(input) + "-producer-" + inputIndex}>
        {itemNode(input)}<strong>{quantity(input.quantity)}</strong>
      </span>
    ))}
  </div>
) : null}
```

Retain safety-buffer controls only for `route.isProbabilistic`. Direct craft routes retain existing input chips, and gathering-source cards render only for gathering routes with multiple sources.

- [ ] **Step 5: Add compact badge color modifiers**

```css
.craft-plan-route-kind.is-craft { color: var(--accent); }
.craft-plan-route-kind.is-gathering { color: var(--positive); }
```

Do not change modal sizing, add animation, or introduce nested cards.

- [ ] **Step 6: Run the boundary test and production build**

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/craft-planning-boundary.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: the boundary test passes and Vite completes without TypeScript errors.

- [ ] **Step 7: Commit the UI presentation**

```powershell
git add apps/bitcraft-local/src/pages/CraftPlanningPage.tsx apps/bitcraft-local/src/styles/craft-planning.css apps/bitcraft-local/test/craft-planning-boundary.test.mjs
git commit -m "fix: present craft planner route types accurately"
```

---

### Task 4: Verify the complete behavior

**Files:**
- Verify only; no planned file changes.

**Interfaces:**
- Consumes: completed catalog, planner, and UI changes from Tasks 1-3.
- Produces: evidence that the reported recipe and surrounding behavior work together.

- [ ] **Step 1: Run the full application test suite**

```powershell
corepack pnpm --filter @workspace/bitcraft-local test
```

Expected: zero failed tests.

- [ ] **Step 2: Run a fresh production build**

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: TypeScript checking and Vite build both succeed.

- [ ] **Step 3: Restart the stable smoke server and confirm health**

```powershell
node scripts/start-bitcraft-local-smoke.mjs --force-restart
curl.exe -s http://127.0.0.1:18449/api/local/health
```

Expected: launcher returns within 15 seconds and health reports a healthy server. `--force-restart` is required because backend catalog and schema code changed.

- [ ] **Step 4: Browser-check the reported Simple Wood Log panel**

Open `http://127.0.0.1:18449/?page=dashboard`, open Craft Planning, and inspect Simple Wood Log. Confirm:

- Badge is `Craft output`, not `Gathering byproduct`.
- Recipe is `Split into Simple Wood Log Output`.
- Workstation is the catalog Forestry Station.
- Guaranteed output is six Simple Wood Logs per craft.
- Craft input is one Simple Wood Trunk.
- Resin is a variable `Craft byproduct` when inspected.
- No console errors occur and the dialog remains viewport-fixed and scrollable.

- [ ] **Step 5: Inspect final scope**

```powershell
git status --short
git diff --stat HEAD~3..HEAD
```

Expected: only focused files from this plan changed; `.impeccable/` remains unrelated and untracked; no changelog or package-version files changed.
