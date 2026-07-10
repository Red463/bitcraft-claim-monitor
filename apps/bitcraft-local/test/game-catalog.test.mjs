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

test("game catalog schema bootstraps normalized catalog tables, indexes, and cascade links", () => {
  const db = createDb();

  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name));
  for (const tableName of [
    "game_catalog_entities",
    "game_catalog_recipes",
    "game_catalog_recipe_inputs",
    "game_catalog_recipe_outputs",
    "game_catalog_item_list_outputs",
    "game_catalog_refresh_runs",
  ]) {
    assert.equal(tables.has(tableName), true, `${tableName} should exist`);
  }

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
    sortStrings(db.prepare("PRAGMA index_list(game_catalog_refresh_runs)").all().map((row) => row.name)),
    ["idx_game_catalog_refresh_runs_status_time", "idx_game_catalog_refresh_runs_updated_at"],
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
  assert.equal(processRecipe.stationName, "Fishing Table");
  assert.equal(processRecipe.skillName, "Fishing");
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
  assert.equal(bundleRecipe.sourceKind, "cargo");
  assert.equal(bundleRecipe.sourceId, "333");
  assert.equal(bundleRecipe.isPassive, true);
  assert.equal(bundleRecipe.isTransportRoute, true);
  assert.deepEqual(bundleRecipe.inputs, [
    { inputKey: "items:1220019", kind: "items", targetId: "1220019", quantity: 10 },
  ]);
  assert.deepEqual(bundleRecipe.outputs, [
    { outputKey: "cargo:333", kind: "cargo", targetId: "333", quantity: 1, isPrimaryOutput: true },
  ]);

  assert.deepEqual(normalized.itemListOutputs, [
    { producerKey: "items:1220019", outputKey: "items:1110012", kind: "items", targetId: "1110012", quantity: 1, chance: 0.1 },
    { producerKey: "items:1220019", outputKey: "cargo:500100", kind: "cargo", targetId: "500100", quantity: 2, chance: 25 },
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
    repository.listProducerRecipesForOutput("items:1220019").map((recipe) => recipe.name),
    ["Extract Shells", "Process Briny Guppi"],
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
      quantity: 1,
      chance: 0.1,
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

test("game catalog repository persists resumable refresh runs and list identity writes", () => {
  const db = createDb();
  const repository = createGameCatalogRepository(db);

  repository.upsertEntityIdentity({ id: "1220019", itemType: 0, name: "Basic Bait and Shells", tag: "Bait Output", tier: 1, rarityStr: "Common", iconAssetName: "bait-shells.png" }, { updatedAt: UPDATED_AT, kind: "items" });
  repository.upsertEntityIdentity({ id: "1220019", itemType: 1, name: "Cargo With Colliding Id", tag: "Package", tier: 4, rarityStr: "Rare", iconAssetName: "cargo-collision.png" }, { updatedAt: UPDATED_AT, kind: "cargo" });

  const started = repository.beginRefreshRun({
    status: "running",
    phase: "detail_items",
    totalCount: 2,
    itemCount: 1,
    cargoCount: 1,
    startedAt: "2026-07-10T12:00:00.000Z",
    updatedAt: "2026-07-10T12:00:00.000Z",
  });

  assert.equal(started.status, "running");
  assert.equal(started.phase, "detail_items");
  assert.equal(started.totalCount, 2);

  repository.updateRefreshRun(started.id, {
    status: "failed",
    phase: "detail_cargo",
    cursorKind: "items",
    cursorId: "1220019",
    processedCount: 1,
    recipeCount: 3,
    byproductCount: 2,
    failureCount: 1,
    lastError: "HTTP 429",
    updatedAt: "2026-07-10T12:05:00.000Z",
  });

  assert.deepEqual(repository.getLatestRefreshRun(), {
    id: started.id,
    status: "failed",
    phase: "detail_cargo",
    cursorKind: "items",
    cursorId: "1220019",
    processedCount: 1,
    totalCount: 2,
    itemCount: 1,
    cargoCount: 1,
    recipeCount: 3,
    byproductCount: 2,
    failureCount: 1,
    startedAt: "2026-07-10T12:00:00.000Z",
    completedAt: null,
    lastError: "HTTP 429",
    updatedAt: "2026-07-10T12:05:00.000Z",
  });

  repository.updateRefreshRun(started.id, {
    status: "completed",
    phase: "complete",
    processedCount: 2,
    completedAt: "2026-07-10T12:06:00.000Z",
    updatedAt: "2026-07-10T12:06:00.000Z",
  });

  assert.deepEqual(repository.listRefreshRuns(5), [{
    id: started.id,
    status: "completed",
    phase: "complete",
    cursorKind: "items",
    cursorId: "1220019",
    processedCount: 2,
    totalCount: 2,
    itemCount: 1,
    cargoCount: 1,
    recipeCount: 3,
    byproductCount: 2,
    failureCount: 1,
    startedAt: "2026-07-10T12:00:00.000Z",
    completedAt: "2026-07-10T12:06:00.000Z",
    lastError: "HTTP 429",
    updatedAt: "2026-07-10T12:06:00.000Z",
  }]);

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
});