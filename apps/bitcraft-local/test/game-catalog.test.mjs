import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { applySchemaBootstrap } from "../src/server/schemaBootstrap.mjs";
import {
  createGameCatalogRepository,
  gameCatalogKey,
  normalizeGameCatalogDetail,
} from "../src/server/gameCatalog.mjs";

const UPDATED_AT = "2026-07-10T12:00:00.000Z";

function createDb() {
  const db = new DatabaseSync(":memory:");
  applySchemaBootstrap(db);
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

function sortStrings(values) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

const baitAndShellsDetail = {
  detail: {
    item: {
      id: "1220019",
      itemType: 0,
      name: "Basic Bait and Shells",
      tag: "Bait Output",
      tier: 1,
      rarityStr: "Common",
      iconAssetName: "bait-shells.png",
    },
    craftingRecipes: [
      {
        id: "process-guppi",
        name: "Process Briny Guppi",
        actionsRequired: 12,
        buildingName: "Fishing Table",
        craftedItemStacks: [
          { item_id: "1220019", item_type: "item", quantity: 1 },
          { item_id: "7001", item_type: "item", quantity: 2 },
        ],
        craftedItems: [
          { id: "1220019", itemType: 0, name: "Basic Bait and Shells", tag: "Bait Output", tier: 1 },
          { id: "7001", itemType: 0, name: "Fish Scrap", tag: "Scrap", tier: 1 },
        ],
        consumedItemStacks: [{ item_id: "900", item_type: "item", quantity: 1 }],
        consumedItems: [{ id: "900", itemType: 0, name: "Briny Guppi", tag: "Fish", tier: 1 }],
        levelRequirements: [{ skill: { name: "Fishing" }, level: 1 }],
      },
    ],
    extractionRecipes: {
      data: [
        {
          id: "extract-shells",
          name: "Extract Shells",
          station: { name: "Salvage Bench" },
          craftedItemStacks: [{ item_id: "1220019", item_type: "item", quantity: 3 }],
          craftedItems: [{ id: "1220019", itemType: 0, name: "Basic Bait and Shells", tag: "Bait Output", tier: 1 }],
          consumedItemStacks: [{ item_id: "901", item_type: "item", quantity: 1 }],
          consumedItems: [{ id: "901", itemType: 0, name: "Shell Cluster", tag: "Shell", tier: 1 }],
          levelRequirements: [{ skill: { name: "Fishing" }, level: 5 }],
        },
      ],
    },
    recipesUsingItem: {
      results: [
        {
          id: "bundle-bait",
          name: "Bundle For Trade",
          stationName: "Packing Station",
          craftedItem: { id: "333", itemType: 1, name: "Packed Bait Bundle", tag: "Package", tier: 1 },
          craftedItemStacks: [{ item_id: "333", item_type: "cargo", quantity: 1 }],
          craftedItems: [{ id: "333", itemType: 1, name: "Packed Bait Bundle", tag: "Package", tier: 1 }],
          consumedItemStacks: [{ item_id: "1220019", item_type: "item", quantity: 10 }],
          consumedItems: [{ id: "1220019", itemType: 0, name: "Basic Bait and Shells", tag: "Bait Output", tier: 1 }],
          isPassive: true,
        },
      ],
    },
    itemListPossibilities: [
      {
        targetId: "1110012",
        targetItem: { id: "1110012", itemType: 0, name: "Crushed Rough Shells", tag: "Crushed Shells", tier: 1 },
        quantity: 1,
        chance: 0.1,
        isCargo: false,
      },
      {
        targetId: "500100",
        targetItem: { id: "500100", itemType: 1, name: "Fish Bone Bundle", tag: "Bundle", tier: 1 },
        quantity: 2,
        chance: 25,
        isCargo: true,
      },
    ],
  },
};

const baitAndShellsDetailUpdated = {
  detail: {
    item: baitAndShellsDetail.detail.item,
    craftingRecipes: baitAndShellsDetail.detail.craftingRecipes,
    extractionRecipes: [],
    recipesUsingItem: [],
    itemListPossibilities: [],
  },
};

const collidingCargoDetail = {
  cargo: {
    id: "1220019",
    itemType: 1,
    name: "Cargo With Colliding Id",
    tag: "Package",
    tier: 4,
    rarityStr: "Rare",
    iconAssetName: "cargo-collision.png",
  },
};

const implicitCargoDetail = {
  cargo: {
    id: "8080",
    name: "Implicit Cargo",
    tag: "Package",
    tier: 2,
    rarityStr: "Uncommon",
    iconAssetName: "implicit-cargo.png",
  },
};

const declaredOutputOnlyDetail = {
  item: {
    id: "4100",
    itemType: 0,
    name: "Salted Fish Crate",
    tag: "Salted Fish",
    tier: 2,
  },
  craftingRecipes: [
    {
      id: "box-salted-fish",
      name: "Box Salted Fish",
      stationName: "Packing Station",
      craftedItem: { id: "9200", itemType: 1, name: "Salted Fish Crate Package", tag: "Package", tier: 2 },
      outputQuantity: "4",
      consumedItemStacks: [{ item_id: "4100", item_type: "item", quantity: 4 }],
      consumedItems: [{ id: "4100", itemType: 0, name: "Salted Fish Crate", tag: "Salted Fish", tier: 2 }],
      isPassive: true,
    },
  ],
};

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

test("game catalog schema bootstraps normalized catalog tables, indexes, and cascade links", () => {
  const db = createDb();

  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name));
  for (const tableName of [
    "game_catalog_entities",
    "game_catalog_recipes",
    "game_catalog_recipe_inputs",
    "game_catalog_recipe_outputs",
    "game_catalog_recipe_output_components",
    "game_catalog_recipe_sources",
    "game_catalog_item_list_outputs",
    "game_catalog_effort_weights",
  ]) {
    assert.equal(tables.has(tableName), true, `${tableName} should exist`);
  }
  assert.equal(tables.has("game_catalog_refresh_runs"), false);
  assert.equal(tables.has("game_catalog_refresh_targets"), false);

  assert.deepEqual(
    sortStrings(db.prepare("PRAGMA index_list(game_catalog_entities)").all().map((row) => row.name)),
    ["idx_game_catalog_entities_kind_target", "sqlite_autoindex_game_catalog_entities_1"],
  );
  assert.deepEqual(
    sortStrings(db.prepare("PRAGMA index_list(game_catalog_recipe_outputs)").all().map((row) => row.name)),
    ["idx_game_catalog_recipe_outputs_output", "sqlite_autoindex_game_catalog_recipe_outputs_1"],
  );
  assert.deepEqual(
    sortStrings(db.prepare("PRAGMA index_list(game_catalog_recipe_inputs)").all().map((row) => row.name)),
    ["idx_game_catalog_recipe_inputs_input", "sqlite_autoindex_game_catalog_recipe_inputs_1"],
  );
  assert.deepEqual(
    sortStrings(db.prepare("PRAGMA index_list(game_catalog_item_list_outputs)").all().map((row) => row.name)),
    ["idx_game_catalog_item_list_outputs_output_producer", "sqlite_autoindex_game_catalog_item_list_outputs_1"],
  );
  assert.deepEqual(
    db.prepare("PRAGMA foreign_key_list(game_catalog_recipe_inputs)").all().map((row) => ({
      table: row.table,
      from: row.from,
      to: row.to,
      onDelete: row.on_delete,
    })),
    [{ table: "game_catalog_recipes", from: "recipe_key", to: "recipe_key", onDelete: "CASCADE" }],
  );
  assert.deepEqual(
    db.prepare("PRAGMA foreign_key_list(game_catalog_recipe_outputs)").all().map((row) => ({
      table: row.table,
      from: row.from,
      to: row.to,
      onDelete: row.on_delete,
    })),
    [{ table: "game_catalog_recipes", from: "recipe_key", to: "recipe_key", onDelete: "CASCADE" }],
  );
});

test("normalizeGameCatalogDetail captures direct recipes, reverse recipes, byproducts, and transport metadata", () => {
  const normalized = normalizeGameCatalogDetail(baitAndShellsDetail);

  assert.deepEqual(normalized.entity, {
    catalogKey: "items:1220019",
    kind: "items",
    targetId: "1220019",
    itemType: 0,
    name: "Basic Bait and Shells",
    tag: "Bait Output",
    tier: 1,
    rarity: "Common",
    iconAssetName: "bait-shells.png",
  });

  assert.equal(normalized.recipes.length, 3);
  const processRecipe = normalized.recipes.find((recipe) => recipe.name === "Process Briny Guppi");
  assert.equal(processRecipe.sourceKind, "items");
  assert.equal(processRecipe.sourceId, "1220019");
  assert.equal(processRecipe.actionCount, 12);
  assert.equal(processRecipe.stationName, "Fishing Table");
  assert.equal(processRecipe.skillName, "Fishing");
  assert.equal(processRecipe.activityKind, "craft");
  assert.equal(processRecipe.isPassive, false);
  assert.equal(processRecipe.isTransportRoute, false);
  assert.deepEqual(processRecipe.inputs, [
    { inputKey: "items:900", kind: "items", targetId: "900", quantity: 1 },
  ]);
  assert.deepEqual(processRecipe.outputs, [
    { outputKey: "items:1220019", kind: "items", targetId: "1220019", quantity: 1, isPrimaryOutput: true },
    { outputKey: "items:7001", kind: "items", targetId: "7001", quantity: 2, isPrimaryOutput: false },
  ]);

  const bundleRecipe = normalized.recipes.find((recipe) => recipe.name === "Bundle For Trade");
  const extractionRecipe = normalized.recipes.find((recipe) => recipe.name === "Extract Shells");
  assert.equal(extractionRecipe.activityKind, "craft");
  assert.equal(bundleRecipe.sourceKind, "cargo");
  assert.equal(bundleRecipe.sourceId, "333");
  assert.equal(bundleRecipe.activityKind, "craft");
  assert.equal(bundleRecipe.isPassive, true);
  assert.equal(bundleRecipe.isTransportRoute, true);
  assert.deepEqual(bundleRecipe.inputs, [
    { inputKey: "items:1220019", kind: "items", targetId: "1220019", quantity: 10 },
  ]);
  assert.deepEqual(bundleRecipe.outputs, [
    { outputKey: "cargo:333", kind: "cargo", targetId: "333", quantity: 1, isPrimaryOutput: true },
  ]);

  assert.deepEqual(normalized.itemListOutputs, [
    { producerKey: "items:1220019", outputKey: "items:1110012", kind: "items", targetId: "1110012", quantity: 0.1, chance: 1, guaranteedQuantity: 0 },
    { producerKey: "items:1220019", outputKey: "cargo:500100", kind: "cargo", targetId: "500100", quantity: 0.5, chance: 1, guaranteedQuantity: 0 },
  ]);
});

test("catalog normalization classifies only no-station extraction recipes as gathering", () => {
  const normalized = normalizeGameCatalogDetail({
    item: { id: "8000", itemType: 0, name: "Rough Stone Output", tag: "Stone Output", tier: 1 },
    extractionRecipes: [{
      id: "extract-stone-node",
      name: "Extract Rough Stone",
      craftedItemStacks: [{ item_id: "8000", item_type: "item", quantity: 1 }],
      consumedItemStacks: [],
      levelRequirements: [{ skill: { name: "Mining" }, level: 1 }],
    }],
  });

  assert.equal(normalized.recipes[0].activityKind, "gathering");
});

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

test("game catalog ignores stale transport flags on recipes with no cargo links", () => {
  const db = createDb();
  const repository = createGameCatalogRepository(db);
  repository.upsertDetail(malformedRefinedFerralithDetail, { updatedAt: UPDATED_AT });
  db.prepare("UPDATE game_catalog_recipes SET is_transport_route = 1 WHERE recipe_key = ?").run("recipe:998040942");

  const recipe = repository.listProducerRecipesForOutput("items:181015293")[0];
  assert.equal(recipe.isTransportRoute, false);
  db.close();
});

test("normalizeGameCatalogDetail sums expected yield across an item-list probability distribution", () => {
  const normalized = normalizeGameCatalogDetail({
    item: { id: "7000", itemType: 0, name: "Rough Clay", tag: "Clay", tier: 1 },
    itemListPossibilities: [
      {
        targetId: "7010",
        targetItem: { id: "7010", itemType: 0, name: "Rough Gypsite", tag: "Gypsite", tier: 1 },
        quantity: 1,
        chance: 0.1,
      },
      {
        targetId: "7010",
        targetItem: { id: "7010", itemType: 0, name: "Rough Gypsite", tag: "Gypsite", tier: 1 },
        quantity: 2,
        chance: 0.05,
      },
      {
        targetId: "7010",
        targetItem: { id: "7010", itemType: 0, name: "Rough Gypsite", tag: "Gypsite", tier: 1 },
        quantity: 1,
        chance: 0.25,
      },
    ],
  });

  assert.deepEqual(normalized.itemListOutputs, [
    { producerKey: "items:7000", outputKey: "items:7010", kind: "items", targetId: "7010", quantity: 0.45, chance: 1, guaranteedQuantity: 0 },
  ]);

  const db = createDb();
  const repository = createGameCatalogRepository(db);
  repository.upsertDetail({
    item: { id: "7000", itemType: 0, name: "Rough Clay", tag: "Clay", tier: 1 },
    itemListPossibilities: [
      {
        targetId: "7010",
        targetItem: { id: "7010", itemType: 0, name: "Rough Gypsite", tag: "Gypsite", tier: 1 },
        quantity: 1,
        chance: 0.1,
      },
      {
        targetId: "7010",
        targetItem: { id: "7010", itemType: 0, name: "Rough Gypsite", tag: "Gypsite", tier: 1 },
        quantity: 1,
        chance: 0.25,
      },
    ],
  }, { updatedAt: UPDATED_AT });

  assert.equal(
    db.prepare("SELECT COUNT(*) AS count FROM game_catalog_item_list_outputs WHERE producer_key = ? AND output_key = ?").get("items:7000", "items:7010").count,
    1,
  );
});

test("normalizeGameCatalogDetail preserves complete Ocean and Lake Fish Oil distributions", () => {
  const ocean = normalizeGameCatalogDetail({
    item: { id: "1110024", itemType: 0, name: "Briny Linus Products", tag: "Oceanfish Products", tier: 1 },
    itemListPossibilities: [
      { targetId: "1110010", targetItem: { id: "1110010", name: "Basic Fish Oil", tier: 1 }, quantity: 3, chance: 0.5 },
      { targetId: "1110010", targetItem: { id: "1110010", name: "Basic Fish Oil", tier: 1 }, quantity: 3, chance: 0.45 },
      { targetId: "1110010", targetItem: { id: "1110010", name: "Basic Fish Oil", tier: 1 }, quantity: 4, chance: 0.05 },
    ],
  });
  const lake = normalizeGameCatalogDetail({
    item: { id: "1110023", itemType: 0, name: "Briny Argus Products", tag: "Lake Fish Products", tier: 1 },
    itemListPossibilities: [
      { targetId: "1110010", targetItem: { id: "1110010", name: "Basic Fish Oil", tier: 1 }, quantity: 1, chance: 0.5 },
      { targetId: "1110010", targetItem: { id: "1110010", name: "Basic Fish Oil", tier: 1 }, quantity: 1, chance: 0.5 },
    ],
  });

  assert.equal(ocean.itemListOutputs.find((output) => output.outputKey === "items:1110010")?.quantity, 3.05);
  assert.equal(ocean.itemListOutputs.find((output) => output.outputKey === "items:1110010")?.guaranteedQuantity, 3);
  assert.equal(lake.itemListOutputs.find((output) => output.outputKey === "items:1110010")?.quantity, 1);
  assert.equal(lake.itemListOutputs.find((output) => output.outputKey === "items:1110010")?.guaranteedQuantity, 1);
});

test("game catalog repository persists expected and guaranteed item-list quantities", () => {
  const db = createDb();
  const repository = createGameCatalogRepository(db);
  repository.upsertDetail({
    item: { id: "1110024", itemType: 0, name: "Briny Linus Products", tag: "Oceanfish Products", tier: 1 },
    itemListPossibilities: [
      { targetId: "1110010", targetItem: { id: "1110010", name: "Basic Fish Oil", tier: 1 }, quantity: 3, chance: 0.5 },
      { targetId: "1110010", targetItem: { id: "1110010", name: "Basic Fish Oil", tier: 1 }, quantity: 3, chance: 0.45 },
      { targetId: "1110010", targetItem: { id: "1110010", name: "Basic Fish Oil", tier: 1 }, quantity: 4, chance: 0.05 },
    ],
  }, { updatedAt: UPDATED_AT });

  assert.deepEqual(repository.listByproductProducersForOutput("items:1110010").map((row) => ({
    quantity: row.quantity,
    guaranteedQuantity: row.guaranteedQuantity,
  })), [{ quantity: 3.05, guaranteedQuantity: 3 }]);
  db.close();
});

test("normalizeGameCatalogDetail preserves an explicit zero guaranteed item-list quantity", () => {
  const normalized = normalizeGameCatalogDetail({
    item: { id: "5001", itemType: 0, name: "T1 Clay Output", tag: "Clay Output", tier: 1 },
    itemListPossibilities: [{
      targetId: "3001",
      targetItem: { id: "3001", itemType: 0, name: "Rough Gypsite", tag: "Gypsite", tier: 1 },
      quantity: 0.02,
      chance: 1,
      guaranteedQuantity: 0,
    }],
  });

  assert.equal(normalized.itemListOutputs[0].quantity, 0.02);
  assert.equal(normalized.itemListOutputs[0].guaranteedQuantity, 0);
});

test("game catalog repository derives and atomically replaces versioned effort weights", () => {
  const db = createDb();
  const repository = createGameCatalogRepository(db);
  repository.upsertDetail(baitAndShellsDetail, { updatedAt: UPDATED_AT });

  const candidates = repository.listCraftingEffortCandidates();
  assert.equal(candidates.some((row) => row.catalogKey === "items:1220019" && row.actionsRequired === 12 && row.outputQuantity === 1), true);
  assert.equal(candidates.some((row) => row.catalogKey === "items:1110012" && row.actionsRequired === 12 && row.outputQuantity === 0.1), true);

  repository.replaceEffortWeights([
    { catalogKey: "items:1110012", effortWeight: 120, method: "crafting", sourceKey: "recipe:process-guppi" },
    { catalogKey: "items:1110012", effortWeight: 50, method: "gathering", sourceKey: "resource:clay" },
  ], 1, "2026-07-14T12:01:00.000Z");
  assert.deepEqual(repository.getEffortWeights(1).get("items:1110012"), {
    catalogKey: "items:1110012",
    effortWeight: 50,
    method: "gathering",
    sourceKey: "resource:clay",
    modelVersion: 1,
    updatedAt: "2026-07-14T12:01:00.000Z",
  });
  assert.equal(repository.getEffortWeightRevision(1), "2026-07-14T12:01:00.000Z");

  repository.replaceEffortWeights([
    { catalogKey: "items:1220019", effortWeight: 8, method: "crafting", sourceKey: "recipe:replacement" },
  ], 1, "2026-07-14T12:02:00.000Z");
  assert.deepEqual([...repository.getEffortWeights(1).keys()], ["items:1220019"]);
  assert.equal(repository.getEffortWeights(2).size, 0);
  assert.equal(repository.getEffortWeightRevision(1), "2026-07-14T12:02:00.000Z");
  db.close();
});

test("effort weight publication rolls back when its completion callback fails", () => {
  const db = createDb();
  const repository = createGameCatalogRepository(db);
  repository.replaceEffortWeights([
    { catalogKey: "items:old", effortWeight: 2, method: "crafting", sourceKey: "recipe:old" },
  ], 1, "2026-07-14T12:01:00.000Z");

  assert.throws(() => repository.replaceEffortWeights([
    { catalogKey: "items:new", effortWeight: 3, method: "crafting", sourceKey: "recipe:new" },
  ], 1, "2026-07-14T12:02:00.000Z", () => {
    db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)")
      .run("test_effort_publish", "new", "2026-07-14T12:02:00.000Z");
    throw new Error("forced publish failure");
  }), /forced publish failure/);

  assert.deepEqual([...repository.getEffortWeights(1).keys()], ["items:old"]);
  assert.equal(db.prepare("SELECT value FROM app_settings WHERE key = ?").get("test_effort_publish"), undefined);
  db.close();
});

test("normalizeGameCatalogDetail preserves the full expected yield of farming co-products", () => {
  const normalized = normalizeGameCatalogDetail({
    item: { id: "1220023", itemType: 0, name: "Basic Wispweave Products", tag: "Wispweave Products", tier: 1 },
    itemListPossibilities: [
      ...[3, 2, 1, 1, 1].map((quantity) => ({
        targetId: "1100015",
        targetItem: { id: "1100015", itemType: 0, name: "Basic Wispweave Seeds", tag: "Filament Seeds", tier: 1 },
        quantity,
        chance: 0.2,
      })),
      ...[3, 4, 5, 6, 7].map((quantity) => ({
        targetId: "1100017",
        targetItem: { id: "1100017", itemType: 0, name: "Rough Wispweave Filament", tag: "Filament", tier: 1 },
        quantity,
        chance: 0.2,
      })),
    ],
  });

  assert.deepEqual(normalized.itemListOutputs, [
    { producerKey: "items:1220023", outputKey: "items:1100015", kind: "items", targetId: "1100015", quantity: 1.6, chance: 1, guaranteedQuantity: 1 },
    { producerKey: "items:1220023", outputKey: "items:1100017", kind: "items", targetId: "1100017", quantity: 5, chance: 1, guaranteedQuantity: 3 },
  ]);
});

test("normalizeGameCatalogDetail preserves top-level cargo payloads without itemType and declared-output-only recipes", () => {
  assert.deepEqual(normalizeGameCatalogDetail(implicitCargoDetail).entity, {
    catalogKey: "cargo:8080",
    kind: "cargo",
    targetId: "8080",
    itemType: 1,
    name: "Implicit Cargo",
    tag: "Package",
    tier: 2,
    rarity: "Uncommon",
    iconAssetName: "implicit-cargo.png",
  });

  const normalized = normalizeGameCatalogDetail(declaredOutputOnlyDetail);
  assert.equal(normalized.recipes.length, 1);
  assert.deepEqual(normalized.recipes[0].outputs, [
    { outputKey: "cargo:9200", kind: "cargo", targetId: "9200", quantity: 4, isPrimaryOutput: true },
  ]);
});

test("game catalog repository stores normalized entries, preserves item-cargo collisions, answers planner queries, and replaces stale rows", () => {
  const db = createDb();
  const repository = createGameCatalogRepository(db);

  repository.upsertDetail(baitAndShellsDetail, { updatedAt: UPDATED_AT });
  repository.upsertDetail(collidingCargoDetail, { updatedAt: UPDATED_AT });
  repository.upsertDetail(implicitCargoDetail, { updatedAt: UPDATED_AT });
  repository.upsertDetail(declaredOutputOnlyDetail, { updatedAt: UPDATED_AT });

  assert.deepEqual(repository.getEntity(gameCatalogKey("items", "1220019")), {
    catalogKey: "items:1220019",
    kind: "items",
    targetId: "1220019",
    itemType: 0,
    name: "Basic Bait and Shells",
    tag: "Bait Output",
    tier: 1,
    rarity: "Common",
    iconAssetName: "bait-shells.png",
    updatedAt: UPDATED_AT,
  });
  assert.deepEqual(repository.getEntity(gameCatalogKey("cargo", "1220019")), {
    catalogKey: "cargo:1220019",
    kind: "cargo",
    targetId: "1220019",
    itemType: 1,
    name: "Cargo With Colliding Id",
    tag: "Package",
    tier: 4,
    rarity: "Rare",
    iconAssetName: "cargo-collision.png",
    updatedAt: UPDATED_AT,
  });
  assert.deepEqual(repository.getEntity(gameCatalogKey("cargo", "8080")), {
    catalogKey: "cargo:8080",
    kind: "cargo",
    targetId: "8080",
    itemType: 1,
    name: "Implicit Cargo",
    tag: "Package",
    tier: 2,
    rarity: "Uncommon",
    iconAssetName: "implicit-cargo.png",
    updatedAt: UPDATED_AT,
  });

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
  assert.deepEqual(
    repository.listProducerRecipesForOutput("cargo:9200").map((recipe) => ({
      name: recipe.name,
      outputs: recipe.outputs,
    })),
    [{
      name: "Box Salted Fish",
      outputs: [{ outputKey: "cargo:9200", kind: "cargo", targetId: "9200", quantity: 4, isPrimaryOutput: true }],
    }],
  );
  assert.deepEqual(
    repository.listRecipesConsumingInput("items:1220019").map((recipe) => ({
      name: recipe.name,
      stationName: recipe.stationName,
      isTransportRoute: recipe.isTransportRoute,
      outputs: recipe.outputs.map((output) => output.outputKey),
    })),
    [{
      name: "Bundle For Trade",
      stationName: "Packing Station",
      isTransportRoute: true,
      outputs: ["cargo:333"],
    }],
  );
  assert.deepEqual(
    repository.listByproductProducersForOutput("items:1110012").map((row) => ({
      producerKey: row.producer.catalogKey,
      producerName: row.producer.name,
      quantity: row.quantity,
      chance: row.chance,
    })),
    [{
      producerKey: "items:1220019",
      producerName: "Basic Bait and Shells",
      quantity: 0.1,
      chance: 1,
    }],
  );

  repository.upsertDetail(baitAndShellsDetailUpdated, { updatedAt: "2026-07-10T12:05:00.000Z" });

  assert.deepEqual(
    repository.listProducerRecipesForOutput("items:1220019").map((recipe) => recipe.name),
    ["Process Briny Guppi"],
  );
  assert.deepEqual(repository.listRecipesConsumingInput("items:1220019"), []);
  assert.deepEqual(repository.listByproductProducersForOutput("items:1110012"), []);
});

test("game catalog recipes use one global identity across direct and reverse detail payloads", () => {
  const direct = normalizeGameCatalogDetail(baitAndShellsDetail).recipes.find((recipe) => recipe.name === "Process Briny Guppi");
  const reverse = normalizeGameCatalogDetail({
    item: { id: "900", itemType: 0, name: "Briny Guppi", tag: "Fish", tier: 1 },
    recipesUsingItem: [baitAndShellsDetail.detail.craftingRecipes[0]],
  }).recipes[0];
  assert.equal(direct.recipeKey, reverse.recipeKey);

  const db = createDb();
  const repository = createGameCatalogRepository(db);
  repository.upsertDetail(baitAndShellsDetail, { updatedAt: UPDATED_AT });
  repository.upsertDetail({
    item: { id: "900", itemType: 0, name: "Briny Guppi", tag: "Fish", tier: 1 },
    recipesUsingItem: [baitAndShellsDetail.detail.craftingRecipes[0]],
  }, { updatedAt: UPDATED_AT });

  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM game_catalog_recipes WHERE name = ?").get("Process Briny Guppi").count, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM game_catalog_recipe_sources WHERE recipe_key = ?").get(direct.recipeKey).count, 2);
});

test("game catalog detail replacement rolls back all writes when a linked row fails", () => {
  const db = createDb();
  const repository = createGameCatalogRepository(db);
  repository.upsertDetail(baitAndShellsDetail, { updatedAt: UPDATED_AT });
  const before = db.prepare("SELECT recipe_key, name FROM game_catalog_recipes ORDER BY recipe_key").all();
  db.exec(`
    CREATE TRIGGER fail_catalog_output
    BEFORE INSERT ON game_catalog_recipe_outputs
    BEGIN
      SELECT RAISE(ABORT, 'forced catalog output failure');
    END;
  `);

  assert.throws(
    () => repository.upsertDetail(baitAndShellsDetailUpdated, { updatedAt: "2026-07-10T12:05:00.000Z" }),
    /Recipe recipe:.*forced catalog output failure/,
  );
  assert.deepEqual(db.prepare("SELECT recipe_key, name FROM game_catalog_recipes ORDER BY recipe_key").all(), before);
  assert.equal(repository.listProducerRecipesForOutput("items:1220019").length, 2);
});
test("game catalog repository preserves separate item and cargo identities without refresh-ledger APIs", () => {
  const db = createDb();
  const repository = createGameCatalogRepository(db);

  repository.upsertEntityIdentity({ id: "1220019", itemType: 0, name: "Basic Bait and Shells", tag: "Bait Output", tier: 1, rarityStr: "Common", iconAssetName: "bait-shells.png" }, { updatedAt: UPDATED_AT, kind: "items" });
  repository.upsertEntityIdentity({ id: "1220019", itemType: 1, name: "Cargo With Colliding Id", tag: "Package", tier: 4, rarityStr: "Rare", iconAssetName: "cargo-collision.png" }, { updatedAt: UPDATED_AT, kind: "cargo" });

  assert.deepEqual(repository.getEntity(gameCatalogKey("items", "1220019")), {
    catalogKey: "items:1220019",
    kind: "items",
    targetId: "1220019",
    itemType: 0,
    name: "Basic Bait and Shells",
    tag: "Bait Output",
    tier: 1,
    rarity: "Common",
    iconAssetName: "bait-shells.png",
    updatedAt: UPDATED_AT,
  });
  assert.deepEqual(repository.getEntity(gameCatalogKey("cargo", "1220019")), {
    catalogKey: "cargo:1220019",
    kind: "cargo",
    targetId: "1220019",
    itemType: 1,
    name: "Cargo With Colliding Id",
    tag: "Package",
    tier: 4,
    rarity: "Rare",
    iconAssetName: "cargo-collision.png",
    updatedAt: UPDATED_AT,
  });
  assert.equal("beginRefreshRun" in repository, false);
  assert.equal("replaceRefreshTargets" in repository, false);
  db.close();
});

test("game catalog repository searches normalized item and cargo identities with exact and prefix priority", () => {
  const db = createDb();
  const repository = createGameCatalogRepository(db);
  repository.upsertEntityIdentity({ id: "100", itemType: 0, name: "Rough Plank", tier: 1 }, { updatedAt: UPDATED_AT });
  repository.upsertEntityIdentity({ id: "200", itemType: 0, name: "Rough Plank Bundle", tier: 1 }, { updatedAt: UPDATED_AT });
  repository.upsertEntityIdentity({ id: "300", itemType: 1, name: "Packed Rough Plank", tier: 1 }, { updatedAt: UPDATED_AT, kind: "cargo" });
  repository.upsertEntityIdentity({ id: "400", itemType: 0, name: "Fine Rough Plank", tier: 3 }, { updatedAt: UPDATED_AT });

  assert.deepEqual(
    repository.searchEntities("rough plank", 4).map((row) => [row.kind, row.targetId, row.name]),
    [
      ["items", "100", "Rough Plank"],
      ["items", "200", "Rough Plank Bundle"],
      ["cargo", "300", "Packed Rough Plank"],
      ["items", "400", "Fine Rough Plank"],
    ],
  );
  assert.deepEqual(repository.searchEntities("300", 10).map((row) => row.catalogKey), ["cargo:300"]);
  assert.equal(repository.searchEntities("r", 10).length, 0);
  db.close();
});
