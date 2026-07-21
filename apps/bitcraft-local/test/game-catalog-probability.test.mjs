import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { createGameCatalogRepository, normalizeGameCatalogDetail } from "../src/server/gameCatalog.mjs";
import { normalizeGameDataItemLists, normalizeGameDataResources } from "../src/server/itemProbability.mjs";
import { applySchemaBootstrap } from "../src/server/schemaBootstrap.mjs";

function createDb() {
  const db = new DatabaseSync(":memory:");
  applySchemaBootstrap(db);
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

test("probability schema stores resources, grouped item-list rows, completion outputs, and source metadata", () => {
  const db = createDb();
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name));
  for (const table of [
    "game_catalog_resources",
    "game_catalog_resource_completion_outputs",
    "game_catalog_item_lists",
    "game_catalog_item_list_possibilities",
    "game_catalog_item_list_possibility_outputs",
    "game_catalog_probability_snapshot",
    "game_catalog_probability_sources",
  ]) assert.equal(tables.has(table), true, `${table} should exist`);

  const entityColumns = new Set(db.prepare("PRAGMA table_info(game_catalog_entities)").all().map((row) => row.name));
  const recipeColumns = new Set(db.prepare("PRAGMA table_info(game_catalog_recipes)").all().map((row) => row.name));
  const outputColumns = new Set(db.prepare("PRAGMA table_info(game_catalog_recipe_outputs)").all().map((row) => row.name));
  const itemListOutputColumns = new Set(db.prepare("PRAGMA table_info(game_catalog_item_list_possibility_outputs)").all().map((row) => row.name));
  assert.equal(entityColumns.has("item_list_id"), true);
  assert.equal(recipeColumns.has("resource_id"), true);
  assert.equal(outputColumns.has("occurrence_rate"), true);
  assert.equal(outputColumns.has("yield_basis"), true);
  assert.equal(itemListOutputColumns.has("nested_item_list_id"), true);
  db.close();
});

test("catalog normalization records extraction occurrence rates without clamping values above one", () => {
  const normalized = normalizeGameCatalogDetail({
    item: { id: "11001", name: "Sticks", itemListId: "500" },
    extractionRecipes: [{
      id: 1,
      resourceId: 1,
      resourceName: "Sticks",
      extractedItemStacks: [{
        item_stack: { item_id: 11001, item_type: "Item", quantity: 1 },
        probability: 2,
      }],
      consumedItemStacks: [],
    }],
  });

  assert.equal(normalized.entity.itemListId, "500");
  assert.equal(normalized.recipes[0].activityKind, "gathering");
  assert.equal(normalized.recipes[0].resourceId, "1");
  assert.deepEqual(normalized.recipes[0].outputs, [{
    outputKey: "items:11001",
    kind: "items",
    targetId: "11001",
    quantity: 1,
    occurrenceRate: 2,
    yieldBasis: "per_progress",
    isPrimaryOutput: true,
  }]);
});

test("catalog refresh preserves and aggregates repeated prospecting output components", () => {
  const db = createDb();
  const repository = createGameCatalogRepository(db);
  const detail = {
    cargo: { id: "60000", itemType: 1, name: "Argent Ore" },
    extractionRecipes: [{
      id: 5036,
      cargoId: 60000,
      resourceId: 0,
      name: "Gather Argent Ore",
      levelRequirements: [{ skill: { name: "Argent Ore Prospecting" }, level: 1 }],
      extractedItemStacks: [1, 0.5, 0.25, 0.125, 0.0625].map((probability) => ({
        item_stack: { item_id: 60000, item_type: "Cargo", quantity: 1 },
        probability,
      })),
      consumedItemStacks: [],
    }],
  };

  const normalized = normalizeGameCatalogDetail(detail);
  assert.equal(normalized.recipes[0].outputs.length, 1);
  assert.deepEqual(normalized.recipes[0].outputs[0], {
    outputKey: "cargo:60000",
    kind: "cargo",
    targetId: "60000",
    quantity: 1.9375,
    occurrenceRate: 1,
    yieldBasis: "per_progress",
    guaranteedQuantity: 1,
    isPrimaryOutput: true,
  });
  assert.equal(normalized.recipes[0].outputComponents.length, 5);

  assert.doesNotThrow(() => repository.upsertDetail(detail));
  repository.replaceProbabilitySnapshot({ itemLists: [], resources: [], sourceUrl: "https://example.test/static" });
  assert.deepEqual(
    db.prepare(`
      SELECT component_index, output_key, quantity, occurrence_rate, yield_basis
      FROM game_catalog_recipe_output_components
      WHERE recipe_key = 'recipe:5036'
      ORDER BY component_index
    `).all().map((row) => ({ ...row })),
    [1, 0.5, 0.25, 0.125, 0.0625].map((occurrenceRate, componentIndex) => ({
      component_index: componentIndex,
      output_key: "cargo:60000",
      quantity: 1,
      occurrence_rate: occurrenceRate,
      yield_basis: "per_progress",
    })),
  );
  assert.deepEqual(
    { ...db.prepare("SELECT output_key, quantity, occurrence_rate, guaranteed_quantity FROM game_catalog_recipe_outputs WHERE recipe_key = 'recipe:5036'").get() },
    { output_key: "cargo:60000", quantity: 1.9375, occurrence_rate: 1, guaranteed_quantity: 1 },
  );
  assert.deepEqual(
    repository.getProbabilityWorkbookData()?.rawRecipeOutputs.map((row) => row.occurrenceRate),
    [1, 0.5, 0.25, 0.125, 0.0625],
  );
  db.close();
});

test("repeated probabilistic components preserve an explicit zero guaranteed quantity", () => {
  const db = createDb();
  const repository = createGameCatalogRepository(db);
  repository.upsertDetail({
    cargo: { id: "60001", itemType: 1, name: "Chance-only Prospecting Ore" },
    extractionRecipes: [{
      id: 5037,
      cargoId: 60001,
      resourceId: 0,
      extractedItemStacks: [0.5, 0.25].map((probability) => ({
        item_stack: { item_id: 60001, item_type: "Cargo", quantity: 1 },
        probability,
      })),
    }],
  });

  const output = repository.listProducerRecipesForOutput("cargo:60001")[0].outputs[0];
  assert.equal(output.quantity, 0.75);
  assert.equal(output.occurrenceRate, 1);
  assert.equal(output.guaranteedQuantity, 0);
  db.close();
});

test("prospecting classification is structural and never treats displayed health as finite progress", () => {
  const db = createDb();
  const repository = createGameCatalogRepository(db);
  repository.upsertDetail({
    cargo: { id: "61000", itemType: 1, name: "Rare Prospecting Ore" },
    extractionRecipes: [{
      id: 610,
      cargoId: 61000,
      resourceId: 0,
      name: "Gather Rare Prospecting Ore",
      levelRequirements: [{ skill: { name: "Rare Ore Prospecting" }, level: 1 }],
      extractedItemStacks: [{
        item_stack: { item_id: 61000, item_type: "Cargo", quantity: 1 },
        probability: 0.5,
      }],
    }],
  });
  repository.replaceProbabilitySnapshot({
    itemLists: [],
    resources: normalizeGameDataResources([{
      id: 0,
      name: "Displayed Prospecting Node",
      max_health: 250000,
      on_destroy_yield: [{ item_id: 61000, item_type: "Cargo", quantity: 99 }],
    }]),
    sourceUrl: "https://example.test/static",
  });

  const recipe = repository.listProducerRecipesForOutput("cargo:61000")[0];
  assert.equal(recipe.gatheringMode, "prospecting");

  const route = repository.getProbabilityWorkbookData().gatheringRoutes[0];
  assert.equal(route.gatheringMode, "prospecting");
  assert.equal(route.expectedPerProgress, 0.5);
  assert.equal(route.resourceHealth, null);
  assert.equal(route.completionYield, null);
  assert.equal(route.expectedPerResource, null);
  assert.match(route.probabilityStatus, /exhaustion is unknown/i);

  const effort = repository.listProbabilityEffortCandidates()[0];
  assert.equal(effort.sourceKey, "recipe:610");
  assert.equal(effort.resourceHealth, null);
  assert.equal(effort.expectedPerResource, null);
  db.close();
});

test("catalog normalization treats item-list id zero as no item list", () => {
  const normalized = normalizeGameCatalogDetail({
    item: { id: "11001", name: "Sticks", item_list_id: 0 },
    craftingRecipes: [],
  });

  assert.equal(normalized.entity.itemListId, undefined);
});

test("catalog normalization records probabilistic crafting output rates per craft", () => {
  const normalized = normalizeGameCatalogDetail({
    item: { id: "3001", name: "Chance Product" },
    craftingRecipes: [{
      id: 300,
      actions_required: 4,
      craftedItemStacks: [{ item_id: 3001, item_type: "Item", quantity: 2, probability: 0.5 }],
    }],
  });

  assert.deepEqual(normalized.recipes[0].outputs, [{
    outputKey: "items:3001",
    kind: "items",
    targetId: "3001",
    quantity: 2,
    occurrenceRate: 0.5,
    yieldBasis: "per_craft",
    isPrimaryOutput: true,
  }]);
});

test("detail refresh preserves the item-list identity discovered in the catalogue list", () => {
  const db = createDb();
  const repository = createGameCatalogRepository(db);
  repository.upsertEntityIdentity({ id: "100", itemType: 0, name: "Products", itemListId: "55" });
  repository.upsertDetail({ item: { id: "100", itemType: 0, name: "Products" }, craftingRecipes: [] });

  assert.equal(repository.getEntity("items:100").itemListId, "55");
  db.close();
});

test("probability snapshot publication is atomic and rebuilds producer aggregates from normalized weights", () => {
  const db = createDb();
  const repository = createGameCatalogRepository(db);
  repository.upsertDetail({ item: { id: "1007577047", name: "T2 Berry Output", itemListId: "1423411753" } });
  repository.upsertDetail({ item: { id: "2130004", name: "Simple Berry" } });
  repository.upsertDetail({ item: { id: "115737343", name: "Simple Citric Berry" } });

  const snapshot = {
    itemLists: normalizeGameDataItemLists([{ id: 1423411753, name: "T2 Berry", possibilities: [
      { probability: 1, items: [{ item_id: 2130004, item_type: "Item", quantity: 1 }] },
      { probability: 0.02, items: [{ item_id: 115737343, item_type: "Item", quantity: 1 }] },
    ] }]),
    resources: normalizeGameDataResources([{ id: 80, name: "Honeyberry Bush", max_health: 595, on_destroy_yield: [] }]),
    sourceUrl: "https://example.test/static",
    sourceRevision: "etag-1",
    sources: [
      { sourceKind: "bitjita", sourceUrl: "https://bitjita.com/api", sourceRevision: "catalog-normalization-8" },
      { sourceKind: "game_data", sourceUrl: "https://example.test/static", sourceRevision: "etag-1" },
    ],
    updatedAt: "2026-07-21T12:00:00.000Z",
  };

  const published = repository.replaceProbabilitySnapshot(snapshot);
  assert.equal(published.itemListCount, 1);
  assert.equal(published.resourceCount, 1);
  assert.deepEqual(repository.listByproductProducersForOutput("items:2130004").map((row) => ({
    producerKey: row.producerKey,
    quantity: row.quantity,
    chance: row.chance,
  })), [{ producerKey: "items:1007577047", quantity: 1 / 1.02, chance: 1 / 1.02 }]);
  assert.equal(repository.getProbabilitySnapshot().sourceRevision, "etag-1");
  assert.deepEqual(repository.getProbabilitySnapshot().sources.map((source) => source.sourceKind), ["bitjita", "game_data"]);

  assert.throws(() => repository.replaceProbabilitySnapshot({ ...snapshot, sourceRevision: "etag-2" }, () => {
    throw new Error("publish failed");
  }), /publish failed/);
  assert.equal(repository.getProbabilitySnapshot().sourceRevision, "etag-1");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM game_catalog_item_lists").get().count, 1);
  db.close();
});

test("probability snapshot preserves nested item-list references in raw catalogue rows", () => {
  const db = createDb();
  const repository = createGameCatalogRepository(db);
  repository.upsertDetail({ item: { id: "10", name: "Outer Producer", itemListId: "100" } });
  repository.upsertDetail({ item: { id: "20", name: "Nested Producer", itemListId: "200" } });
  repository.upsertDetail({ item: { id: "30", name: "Final Output" } });
  repository.replaceProbabilitySnapshot({
    itemLists: normalizeGameDataItemLists([
      { id: 100, possibilities: [{ probability: 1, items: [{ item_id: 20, item_type: "Item", quantity: 1 }] }] },
      { id: 200, possibilities: [{ probability: 1, items: [{ item_id: 30, item_type: "Item", quantity: 2 }] }] },
    ]),
    resources: normalizeGameDataResources([{ id: 1, name: "Test Resource", max_health: 1, on_destroy_yield: [
      { item_id: 20, item_type: "Item", quantity: 1 },
    ] }]),
    sourceUrl: "https://example.test/static",
  });

  const workbookData = repository.getProbabilityWorkbookData();
  assert.equal(workbookData.rawItemLists.find((row) => row.outputKey === "items:20")?.nestedItemListId, "200");
  assert.equal(repository.listByproductProducersForOutput("items:30")[0]?.quantity, 2);
  assert.deepEqual(repository.listResourceCompletionOutputs("1").map((row) => [row.outputKey, row.quantity]), [["items:30", 2]]);
  db.close();
});

test("probability effort candidates combine extraction rates, weighted lists, resource health, and completion output", () => {
  const db = createDb();
  const repository = createGameCatalogRepository(db);
  repository.upsertDetail({
    item: { id: "1007577047", name: "T2 Berry Output", itemListId: "1423411753" },
    extractionRecipes: [{
      id: 78,
      resourceId: 80,
      extractedItemStacks: [{ item_stack: { item_id: 1007577047, item_type: "Item", quantity: 1 }, probability: 0.06723 }],
    }],
  });
  repository.upsertDetail({ item: { id: "2130004", name: "Simple Berry" } });
  repository.upsertDetail({ item: { id: "115737343", name: "Simple Citric Berry" } });
  repository.replaceProbabilitySnapshot({
    itemLists: normalizeGameDataItemLists([{ id: 1423411753, possibilities: [
      { probability: 1, items: [{ item_id: 2130004, item_type: "Item", quantity: 1 }] },
      { probability: 0.02, items: [{ item_id: 115737343, item_type: "Item", quantity: 1 }] },
    ] }]),
    resources: normalizeGameDataResources([{ id: 80, name: "Honeyberry Bush", max_health: 595, on_destroy_yield: [
      { item_id: 2130004, item_type: "Item", quantity: 2 },
    ] }]),
    sourceUrl: "https://example.test/static",
  });

  const candidates = repository.listProbabilityEffortCandidates();
  const simple = candidates.find((row) => row.catalogKey === "items:2130004");
  const citric = candidates.find((row) => row.catalogKey === "items:115737343");
  assert.equal(simple.sourceKey, "resource:80");
  assert.equal(simple.expectedPerResource, 41.2175);
  assert.ok(Math.abs(simple.effortWeight - (595 / 41.2175)) < 1e-12);
  assert.equal(citric.expectedPerResource, 0.78435);
  assert.ok(Math.abs(citric.effortWeight - (595 / 0.78435)) < 1e-12);

  const workbookData = repository.getProbabilityWorkbookData();
  assert.equal(workbookData.entities.length, 3);
  assert.equal(workbookData.rawItemLists.length, 2);
  assert.equal(workbookData.gatheringRoutes.find((row) => row.outputKey === "items:2130004").expectedPerResource, 41.2175);
  assert.equal(workbookData.gatheringRoutes.find((row) => row.outputKey === "items:115737343").listChance, 0.02 / 1.02);
  assert.equal(workbookData.craftingRoutes.length, 0);
  db.close();
});
