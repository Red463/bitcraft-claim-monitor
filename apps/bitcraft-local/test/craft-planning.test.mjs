import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { applySchemaBootstrap } from "../src/server/schemaBootstrap.mjs";
import {
  collectLocalCatalogCraftPlanDetails,
  computeCraftPlan,
  normalizeCraftPlanConfig,
  recipeKey,
} from "../src/server/craftPlanning.mjs";
import { createGameCatalogRepository } from "../src/server/gameCatalog.mjs";

const fishOilDetail = {
  item: { id: "900", name: "Fish Oil", itemType: 0, tag: "Oil" },
  craftingRecipes: [
    {
      id: "ocean-route",
      name: "Ocean Fish Oil",
      buildingName: "Cooking Station",
      craftedItemStacks: [{ item_id: "900", item_type: "item", quantity: 1 }],
      consumedItemStacks: [{ item_id: "100", item_type: "item", quantity: 3 }],
      consumedItems: [{ id: "100", name: "Ocean Fish", tag: "Fish", tier: 2 }],
      levelRequirements: [{ skill: { name: "Fishing" }, level: 10 }],
    },
    {
      id: "lake-route",
      name: "Lake Fish Oil",
      buildingName: "Cooking Station",
      craftedItemStacks: [{ item_id: "900", item_type: "item", quantity: 1 }],
      consumedItemStacks: [{ item_id: "101", item_type: "item", quantity: 3 }],
      consumedItems: [{ id: "101", name: "Lake Fish", tag: "Fish", tier: 2 }],
      levelRequirements: [{ skill: { name: "Fishing" }, level: 10 }],
    },
  ],
};

const animalHairDetail = {
  item: { id: "200", name: "Animal Hair", itemType: 0, tag: "Hunting" },
  craftingRecipes: [],
};

const CATALOG_UPDATED_AT = "2026-07-10T12:00:00.000Z";

function createCatalogFixture(t) {
  const db = new DatabaseSync(":memory:");
  applySchemaBootstrap(db);
  db.exec("PRAGMA foreign_keys = ON;");
  t.after(() => db.close());
  return { db, repository: createGameCatalogRepository(db) };
}

function upsertCatalogDetails(repository, details) {
  for (const detail of details) repository.upsertDetail(detail, { updatedAt: CATALOG_UPDATED_AT });
}

test("normalizeCraftPlanConfig preserves targets, sources, route overrides, and multipliers", () => {
  const config = normalizeCraftPlanConfig({
    enabled: true,
    targets: [{ id: "900", kind: "items", name: "Fish Oil", quantity: "12", itemType: 0 }],
    sourceRules: {
      storageContainerIds: ["store-1", "", "store-1"],
      playerIds: ["player-1"],
      craftPlayerIds: ["player-1"],
      deployableContainerIds: ["player-1:cart-1"],
    },
    routeOverrides: { [recipeKey("items", "900")]: "lake-route" },
    multipliers: { [recipeKey("items", "200")]: { multiplier: "1.75", note: "Chance drop" } },
  });

  assert.equal(config.enabled, true);
  assert.equal(config.targets[0].quantity, 12);
  assert.deepEqual(config.sourceRules.storageContainerIds, ["store-1"]);
  assert.deepEqual(config.sourceRules.playerIds, ["player-1"]);
  assert.deepEqual(config.sourceRules.craftPlayerIds, ["player-1"]);
  assert.deepEqual(config.sourceRules.deployableContainerIds, ["player-1:cart-1"]);
  assert.equal(config.routeOverrides[recipeKey("items", "900")], "lake-route");
  assert.equal(config.multipliers[recipeKey("items", "200")].multiplier, 1.75);
});

test("normalizeCraftPlanConfig defaults craft tracking to selected players for existing plans", () => {
  const config = normalizeCraftPlanConfig({
    enabled: true,
    targets: [{ id: "900", kind: "items", name: "Fish Oil", quantity: 1, itemType: 0 }],
    sourceRules: { playerIds: ["player-1", "player-2"] },
  });

  assert.deepEqual(config.sourceRules.craftPlayerIds, ["player-1", "player-2"]);
});

test("computeCraftPlan applies recipe route overrides and offsets storage, players, deployables, and active crafts", () => {
  const config = normalizeCraftPlanConfig({
    enabled: true,
    targets: [{ id: "900", kind: "items", name: "Fish Oil", quantity: 10, itemType: 0 }],
    sourceRules: {
      storageContainerIds: ["store-1"],
      playerIds: ["player-1"],
      deployableContainerIds: ["player-1:cart-1"],
    },
    routeOverrides: { [recipeKey("items", "900")]: "lake-route" },
  });

  const plan = computeCraftPlan({
    config,
    detailsByKey: new Map([[recipeKey("items", "900"), fishOilDetail]]),
    storageSources: [{ sourceId: "store-1", label: "Pantry", items: [{ id: "101", kind: "items", quantity: 4, name: "Lake Fish" }] }],
    playerSources: [{ sourceId: "player-1", label: "Modular inventory", items: [{ id: "101", kind: "items", quantity: 6, name: "Lake Fish" }] }],
    deployableSources: [{ sourceId: "player-1:cart-1", label: "Modular cart", items: [{ id: "101", kind: "items", quantity: 5, name: "Lake Fish" }] }],
    activeCrafts: [{ id: "craft-1", playerId: "player-1", playerName: "Modular", buildingName: "Fishing Station", itemId: "101", kind: "items", quantity: 3, name: "Lake Fish" }],
  });

  const lakeFish = plan.materials.find((material) => material.name === "Lake Fish");
  const oceanFish = plan.materials.find((material) => material.name === "Ocean Fish");

  assert.equal(oceanFish, undefined);
  assert.equal(lakeFish.required, 30);
  assert.equal(lakeFish.available, 15);
  assert.equal(lakeFish.inProgress, 3);
  assert.equal(lakeFish.missing, 12);
  assert.equal(plan.gatherNext[0].section, "Fishing");
  assert.equal(plan.gatherNext[0].items[0].name, "Lake Fish");
  const fishOil = plan.materials.find((material) => material.name === "Fish Oil");
  assert.equal(fishOil.sourceRoutes.length, 1);
  assert.equal(fishOil.sourceRoutes[0].selectedRecipeId, "lake-route");
  assert.deepEqual(fishOil.sourceRoutes[0].alternatives.map((route) => route.id), ["ocean-route", "lake-route"]);
});

test("computeCraftPlan route overrides select either lake or ocean fish but never both", () => {
  for (const [selectedRecipeId, expectedFish, excludedFish] of [
    ["lake-route", "Lake Fish", "Ocean Fish"],
    ["ocean-route", "Ocean Fish", "Lake Fish"],
  ]) {
    const plan = computeCraftPlan({
      config: normalizeCraftPlanConfig({
        enabled: true,
        targets: [{ id: "900", kind: "items", name: "Fish Oil", quantity: 10, itemType: 0 }],
        routeOverrides: { [recipeKey("items", "900")]: selectedRecipeId },
      }),
      detailsByKey: new Map([[recipeKey("items", "900"), fishOilDetail]]),
    });

    assert.equal(plan.materials.find((material) => material.name === expectedFish)?.required, 30);
    assert.equal(plan.materials.some((material) => material.name === excludedFish), false);
    const fishOil = plan.materials.find((material) => material.name === "Fish Oil");
    assert.equal(fishOil.sourceRoutes.length, 1);
    assert.equal(fishOil.sourceRoutes[0].selectedRecipeId, selectedRecipeId);
  }
});

test("computeCraftPlan prefers the highest-yield probabilistic producer route", () => {
  const oil = { item: { id: "9000", name: "Simple Fish Oil", itemType: 0, tag: "Fish Oil", tier: 2 } };
  const poorFish = {
    item: { id: "9001", name: "Muddy Auratus Products", itemType: 0, tag: "Lake Fish Products", tier: 2 },
    craftingRecipes: [{ id: "poor-products", name: "Process Muddy Auratus", craftedItemStacks: [{ item_id: "9001", item_type: "item", quantity: 1 }], consumedItemStacks: [{ item_id: "9002", item_type: "item", quantity: 1 }], consumedItems: [{ id: "9002", name: "Muddy Auratus", itemType: 0, tier: 2 }] }],
    itemListPossibilities: [{ targetId: "9000", targetItem: oil.item, quantity: 1, chance: 0.005 }],
  };
  const goodFish = {
    item: { id: "9003", name: "Briny Argus Products", itemType: 0, tag: "Lake Fish Products", tier: 2 },
    craftingRecipes: [{ id: "good-products", name: "Process Briny Argus", craftedItemStacks: [{ item_id: "9003", item_type: "item", quantity: 1 }], consumedItemStacks: [{ item_id: "9004", item_type: "item", quantity: 1 }], consumedItems: [{ id: "9004", name: "Briny Argus", itemType: 0, tier: 2 }] }],
    itemListPossibilities: [{ targetId: "9000", targetItem: oil.item, quantity: 1, chance: 0.5 }],
  };
  const plan = computeCraftPlan({
    config: normalizeCraftPlanConfig({ enabled: true, targets: [{ id: "9000", kind: "items", name: "Simple Fish Oil", quantity: 10, itemType: 0 }] }),
    detailsByKey: new Map([[recipeKey("items", "9000"), oil], [recipeKey("items", "9001"), poorFish], [recipeKey("items", "9003"), goodFish]]),
  });

  assert.equal(plan.steps.find((step) => step.output.id === "9000")?.selectedRecipeId, "possibility:good-products:items:9000");
  assert.equal(plan.materials.find((material) => material.name === "Briny Argus")?.required, 20);
  assert.equal(plan.materials.some((material) => material.name === "Muddy Auratus"), false);
});

test("computeCraftPlan keeps tracked craft status and ready-to-collect outputs", () => {
  const plan = computeCraftPlan({
    config: normalizeCraftPlanConfig({
      enabled: true,
      targets: [{ id: "900", kind: "items", name: "Fish Oil", quantity: 10, itemType: 0 }],
      sourceRules: { craftPlayerIds: ["player-1"] },
    }),
    detailsByKey: new Map([[recipeKey("items", "900"), fishOilDetail]]),
    activeCrafts: [
      { id: "craft-1", playerId: "player-1", playerName: "Modular", buildingName: "Fishing Station", itemId: "900", kind: "items", name: "Fish Oil", quantity: 4, status: "In progress", completed: false },
      { id: "craft-2", playerId: "player-1", playerName: "Modular", buildingName: "Fishing Station", itemId: "900", kind: "items", name: "Fish Oil", quantity: 3, status: "Ready to collect", completed: true },
      { id: "craft-3", playerId: "player-2", playerName: "Other", buildingName: "Fishing Station", itemId: "900", kind: "items", name: "Fish Oil", quantity: 50, status: "In progress", completed: false },
    ],
  });

  const fishOil = plan.materials.find((material) => material.name === "Fish Oil");
  assert.equal(fishOil.inProgress, 7);
  assert.deepEqual(fishOil.activeCraftSources.map((source) => [source.craftId, source.status, source.completed]), [
    ["craft-1", "In progress", false],
    ["craft-2", "Ready to collect", true],
  ]);
});

test("computeCraftPlan counts completed uncollected Rough Plank and transitions it into inventory", () => {
  const config = normalizeCraftPlanConfig({
    enabled: true,
    targets: [{ id: "1020003", kind: "items", name: "Rough Plank", quantity: 1880, itemType: 0 }],
    sourceRules: { storageContainerIds: ["woodworking"], craftPlayerIds: ["player-1"] },
  });
  const detailsByKey = new Map([[recipeKey("items", "1020003"), {
    item: { id: "1020003", name: "Rough Plank", itemType: 0, tag: "Plank", tier: 1 },
  }]]);

  const waitingCollection = computeCraftPlan({
    config,
    detailsByKey,
    storageSources: [{ sourceId: "woodworking", label: "Woodworking", items: [{ id: "1020003", kind: "items", quantity: 1296, name: "Rough Plank" }] }],
    activeCrafts: [{ id: "craft-rough-plank", playerId: "player-1", playerName: "Modular", buildingName: "Exquisite Carpentry Station", itemId: "1020003", kind: "items", quantity: 612, name: "Rough Plank", status: "Ready to collect", completed: true }],
  });
  const waitingPlank = waitingCollection.materials.find((material) => material.name === "Rough Plank");
  assert.equal(waitingPlank.available, 1296);
  assert.equal(waitingPlank.inProgress, 612);
  assert.equal(waitingPlank.missing, 0);
  assert.equal(waitingPlank.available + waitingPlank.inProgress - waitingPlank.bufferedRequired, 28);
  assert.deepEqual(waitingPlank.activeCraftSources.map((source) => [source.playerName, source.status, source.quantity]), [["Modular", "Ready to collect", 612]]);

  const collected = computeCraftPlan({
    config,
    detailsByKey,
    storageSources: [{ sourceId: "woodworking", label: "Woodworking", items: [{ id: "1020003", kind: "items", quantity: 1908, name: "Rough Plank" }] }],
    activeCrafts: [],
  });
  const collectedPlank = collected.materials.find((material) => material.name === "Rough Plank");
  assert.equal(collectedPlank.available, 1908);
  assert.equal(collectedPlank.inProgress, 0);
  assert.equal(collectedPlank.missing, 0);
});

test("computeCraftPlan credits simultaneous farming co-products without recursive seed inflation", () => {
  const filamentDetail = { item: { id: "1100017", name: "Rough Wispweave Filament", itemType: 0, tag: "Filament", tier: 1 } };
  const productsDetail = {
    item: { id: "1220023", name: "Basic Wispweave Products", itemType: 0, tag: "Wispweave Products", tier: 1 },
    craftingRecipes: [{
      id: "harvest-wispweave",
      name: "Harvest Basic Wispweave Plant",
      craftedItemStacks: [{ item_id: "1220023", item_type: "item", quantity: 1 }],
      craftedItems: [{ id: "1220023", name: "Basic Wispweave Products", itemType: 0, tier: 1 }],
      consumedItemStacks: [{ item_id: "1100016", item_type: "item", quantity: 1 }],
      consumedItems: [{ id: "1100016", name: "Basic Wispweave Plant", itemType: 0, tag: "Filament Plant", tier: 1 }],
      levelRequirements: [{ skill: { name: "Farming" }, level: 1 }],
    }],
    itemListPossibilities: [
      { targetId: "1100015", targetItem: { id: "1100015", name: "Basic Wispweave Seeds", itemType: 0, tag: "Filament Seeds", tier: 1 }, quantity: 1.8, chance: 1 },
      { targetId: "1100017", targetItem: { id: "1100017", name: "Rough Wispweave Filament", itemType: 0, tag: "Filament", tier: 1 }, quantity: 5, chance: 1 },
    ],
  };
  const plantDetail = {
    item: { id: "1100016", name: "Basic Wispweave Plant", itemType: 0, tag: "Filament Plant", tier: 1 },
    craftingRecipes: [{
      id: "grow-wispweave",
      name: "Grow Basic Wispweave Plant",
      craftedItemStacks: [{ item_id: "1100016", item_type: "item", quantity: 1 }],
      consumedItemStacks: [
        { item_id: "1100015", item_type: "item", quantity: 1 },
        { item_id: "1100001", item_type: "item", quantity: 1 },
      ],
      consumedItems: [
        { id: "1100015", name: "Basic Wispweave Seeds", itemType: 0, tag: "Filament Seeds", tier: 1 },
        { id: "1100001", name: "Basic Fertilizer", itemType: 0, tag: "Fertilizer", tier: 1 },
      ],
      levelRequirements: [{ skill: { name: "Farming" }, level: 1 }],
    }],
  };
  const seedDetail = { item: { id: "1100015", name: "Basic Wispweave Seeds", itemType: 0, tag: "Filament Seeds", tier: 1 } };
  const fertilizerDetail = { item: { id: "1100001", name: "Basic Fertilizer", itemType: 0, tag: "Fertilizer", tier: 1 } };

  const plan = computeCraftPlan({
    config: normalizeCraftPlanConfig({ enabled: true, targets: [{ id: "1100017", kind: "items", name: "Rough Wispweave Filament", quantity: 715, itemType: 0 }] }),
    detailsByKey: new Map([
      [recipeKey("items", "1100017"), filamentDetail],
      [recipeKey("items", "1220023"), productsDetail],
      [recipeKey("items", "1100016"), plantDetail],
      [recipeKey("items", "1100015"), seedDetail],
      [recipeKey("items", "1100001"), fertilizerDetail],
    ]),
  });

  assert.equal(plan.materials.find((material) => material.name === "Basic Wispweave Plant")?.required, 143);
  assert.equal(plan.materials.find((material) => material.name === "Basic Fertilizer")?.required, 143);
  assert.equal(plan.materials.find((material) => material.name === "Basic Wispweave Seeds")?.missing, 0);
  assert.equal(plan.totals.missingQuantity, 1_001);
});

test("computeCraftPlan prefers same-tier seeds over plant tier-up recipes", () => {
  const simplePlantDetail = {
    item: { id: "2100016", name: "Simple Wispweave Plant", itemType: 0, tag: "Filament Plant", tier: 2 },
    craftingRecipes: [{
      id: "210016",
      name: "Grow Simple Wispweave Plant",
      craftedItemStacks: [{ item_id: "2100016", item_type: "item", quantity: 1 }],
      consumedItemStacks: [
        { item_id: "1100016", item_type: "item", quantity: 5 },
        { item_id: "2100001", item_type: "item", quantity: 1 },
      ],
      consumedItems: [
        { id: "1100016", name: "Basic Wispweave Plant", itemType: 0, tag: "Filament Plant", tier: 1 },
        { id: "2100001", name: "Simple Fertilizer", itemType: 0, tag: "Fertilizer", tier: 2 },
      ],
      levelRequirements: [{ skill: { name: "Farming" }, level: 20 }],
    }, {
      id: "210017",
      name: "Grow Simple Wispweave Plant",
      craftedItemStacks: [{ item_id: "2100016", item_type: "item", quantity: 1 }],
      consumedItemStacks: [
        { item_id: "2100015", item_type: "item", quantity: 1 },
        { item_id: "2100001", item_type: "item", quantity: 1 },
        { item_id: "104000", item_type: "item", quantity: 1 },
      ],
      consumedItems: [
        { id: "2100015", name: "Simple Wispweave Seeds", itemType: 0, tag: "Filament Seeds", tier: 2 },
        { id: "2100001", name: "Simple Fertilizer", itemType: 0, tag: "Fertilizer", tier: 2 },
        { id: "104000", name: "Water Bucket", itemType: 0, tag: "Water", tier: 1 },
      ],
      levelRequirements: [{ skill: { name: "Farming" }, level: 20 }],
    }],
  };
  const detailsByKey = new Map([
    [recipeKey("items", "2100016"), simplePlantDetail],
    [recipeKey("items", "1100016"), { item: { id: "1100016", name: "Basic Wispweave Plant", itemType: 0, tag: "Filament Plant", tier: 1 } }],
    [recipeKey("items", "2100015"), { item: { id: "2100015", name: "Simple Wispweave Seeds", itemType: 0, tag: "Filament Seeds", tier: 2 } }],
    [recipeKey("items", "2100001"), { item: { id: "2100001", name: "Simple Fertilizer", itemType: 0, tag: "Fertilizer", tier: 2 } }],
    [recipeKey("items", "104000"), { item: { id: "104000", name: "Water Bucket", itemType: 0, tag: "Water", tier: 1 } }],
  ]);

  const plan = computeCraftPlan({
    config: normalizeCraftPlanConfig({ enabled: true, targets: [{ id: "2100016", kind: "items", name: "Simple Wispweave Plant", quantity: 10, itemType: 0 }] }),
    detailsByKey,
  });

  assert.equal(plan.steps.find((step) => step.output.id === "2100016")?.selectedRecipeId, "210017");
  assert.equal(plan.materials.find((material) => material.name === "Simple Wispweave Seeds")?.required, 10);
  assert.equal(plan.materials.some((material) => material.name === "Basic Wispweave Plant"), false);
});


test("computeCraftPlan counts active crafts only for craft-tracked players", () => {
  const config = normalizeCraftPlanConfig({
    enabled: true,
    targets: [{ id: "900", kind: "items", name: "Fish Oil", quantity: 10, itemType: 0 }],
    sourceRules: {
      playerIds: ["player-1", "player-2"],
      craftPlayerIds: ["player-1"],
    },
    routeOverrides: { [recipeKey("items", "900")]: "lake-route" },
  });

  const plan = computeCraftPlan({
    config,
    detailsByKey: new Map([[recipeKey("items", "900"), fishOilDetail]]),
    activeCrafts: [
      { id: "craft-1", playerId: "player-1", playerName: "Modular", buildingName: "Fishing Station", itemId: "101", kind: "items", quantity: 3, name: "Lake Fish" },
      { id: "craft-2", playerId: "player-2", playerName: "Mosswick", buildingName: "Fishing Station", itemId: "101", kind: "items", quantity: 8, name: "Lake Fish" },
    ],
  });

  const lakeFish = plan.materials.find((material) => material.name === "Lake Fish");

  assert.equal(lakeFish.inProgress, 3);
  assert.equal(lakeFish.missing, 27);
  assert.deepEqual(lakeFish.activeCraftSources.map((source) => [source.label, source.playerName, source.quantity]), [["Fishing Station", "Modular", 3]]);
});

test("computeCraftPlan only expands the missing quantity of stocked intermediate crafts", () => {
  const plankDetail = {
    item: { id: "300", name: "Simple Plank", itemType: 0, tag: "Plank", tier: 2 },
    craftingRecipes: [{
      id: "plank-route",
      name: "Simple Plank",
      craftedItemStacks: [{ item_id: "300", item_type: "item", quantity: 1 }],
      consumedItemStacks: [{ item_id: "301", item_type: "item", quantity: 2 }],
      consumedItems: [{ id: "301", name: "Simple Wood Log", itemType: 0, tag: "Wood Log", tier: 2 }],
      levelRequirements: [{ skill: { name: "Carpentry" }, level: 20 }],
    }],
  };
  const logDetail = { item: { id: "301", name: "Simple Wood Log", itemType: 0, tag: "Wood Log", tier: 2 }, craftingRecipes: [] };

  const plan = computeCraftPlan({
    config: normalizeCraftPlanConfig({ enabled: true, targets: [{ id: "300", kind: "items", name: "Simple Plank", quantity: 10, itemType: 0 }], sourceRules: { playerIds: ["player-1"] } }),
    detailsByKey: new Map([
      [recipeKey("items", "300"), plankDetail],
      [recipeKey("items", "301"), logDetail],
    ]),
    storageSources: [{ sourceId: "store-1", label: "Carpentry chest", items: [{ id: "300", kind: "items", quantity: 6, name: "Simple Plank" }] }],
    activeCrafts: [{ id: "craft-1", playerId: "player-1", playerName: "Modular", buildingName: "Carpentry Station", itemId: "300", kind: "items", quantity: 1, name: "Simple Plank" }],
  });

  const plank = plan.materials.find((material) => material.name === "Simple Plank");
  const logs = plan.materials.find((material) => material.name === "Simple Wood Log");

  assert.equal(plank.required, 10);
  assert.equal(plank.available, 6);
  assert.equal(plank.inProgress, 1);
  assert.equal(plank.missing, 3);
  assert.equal(logs.required, 6);
});

test("computeCraftPlan prefers crafting recipes over unpacking packed transport items", () => {
  const ropeDetail = {
    item: { id: "400", name: "Fine Rope", itemType: 0, tag: "Rope", tier: 4 },
    craftingRecipes: [
      {
        id: "packed-route",
        name: "Open Packed Fine Rope",
        craftedItemStacks: [{ item_id: "400", item_type: "item", quantity: 10 }],
        consumedItemStacks: [{ item_id: "401", item_type: "item", quantity: 1 }],
        consumedItems: [{ id: "401", name: "Packed Fine Rope", itemType: 0, tag: "Rope", tier: 4 }],
      },
      {
        id: "craft-route",
        name: "Craft Fine Rope",
        craftedItemStacks: [{ item_id: "400", item_type: "item", quantity: 1 }],
        consumedItemStacks: [
          { item_id: "402", item_type: "item", quantity: 2 },
          { item_id: "403", item_type: "item", quantity: 1 },
        ],
        consumedItems: [
          { id: "402", name: "Fine Fiber", itemType: 0, tag: "Plant Fiber", tier: 4 },
          { id: "403", name: "Fine Resin", itemType: 0, tag: "Resin", tier: 4 },
        ],
      },
    ],
  };

  const plan = computeCraftPlan({
    config: normalizeCraftPlanConfig({ enabled: true, targets: [{ id: "400", kind: "items", name: "Fine Rope", quantity: 10, itemType: 0 }] }),
    detailsByKey: new Map([[recipeKey("items", "400"), ropeDetail]]),
  });

  assert.equal(plan.steps[0].selectedRecipeId, "craft-route");
  assert.equal(plan.materials.some((material) => material.name === "Packed Fine Rope"), false);
  assert.equal(plan.materials.find((material) => material.name === "Fine Fiber")?.required, 20);
  assert.deepEqual(plan.steps[0].alternatives.map((recipe) => recipe.id), ["craft-route", "packed-route"]);
});

test("computeCraftPlan does not expand transport-only package loops by default", () => {
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

  const plan = computeCraftPlan({
    config: normalizeCraftPlanConfig({ enabled: true, targets: [{ id: "100", kind: "items", name: "Basic Berry", quantity: 25, itemType: 0 }] }),
    detailsByKey: new Map([
      [recipeKey("items", "100"), berryDetail],
      [recipeKey("cargo", "200"), packageDetail],
    ]),
  });

  assert.equal(plan.steps.length, 0);
  assert.equal(plan.materials.find((material) => material.name === "Basic Berry")?.required, 25);
  assert.equal(plan.materials.some((material) => material.name === "Basic Berry Package"), false);
});

test("computeCraftPlan stops cyclic production routes at the nearest source item", () => {
  const plantDetail = {
    item: { id: "300", name: "Basic Wispweave Plant", itemType: 0, tag: "Filament Plant", tier: 1 },
    craftingRecipes: [{
      id: "grow-plant",
      name: "Grow Basic Wispweave Plant",
      craftedItemStacks: [{ item_id: "300", item_type: "item", quantity: 1 }],
      consumedItemStacks: [{ item_id: "301", item_type: "item", quantity: 1 }],
      consumedItems: [{ id: "301", name: "Basic Wispweave Seeds", itemType: 0, tag: "Filament Seeds", tier: 1 }],
    }],
  };
  const seedDetail = {
    item: { id: "301", name: "Basic Wispweave Seeds", itemType: 0, tag: "Filament Seeds", tier: 1 },
    craftingRecipes: [{
      id: "harvest-seeds",
      name: "Harvest Basic Wispweave Seeds",
      craftedItemStacks: [{ item_id: "301", item_type: "item", quantity: 1 }],
      consumedItemStacks: [{ item_id: "300", item_type: "item", quantity: 1 }],
      consumedItems: [{ id: "300", name: "Basic Wispweave Plant", itemType: 0, tag: "Filament Plant", tier: 1 }],
    }],
  };

  const plan = computeCraftPlan({
    config: normalizeCraftPlanConfig({ enabled: true, targets: [{ id: "300", kind: "items", name: "Basic Wispweave Plant", quantity: 10, itemType: 0 }] }),
    detailsByKey: new Map([
      [recipeKey("items", "300"), plantDetail],
      [recipeKey("items", "301"), seedDetail],
    ]),
  });

  assert.equal(plan.materials.find((material) => material.name === "Basic Wispweave Plant")?.required, 10);
  assert.equal(plan.materials.find((material) => material.name === "Basic Wispweave Seeds")?.required, 10);
  assert.equal(plan.steps.length, 1);
});

test("computeCraftPlan credits planned secondary outputs before expanding their demand", () => {
  const assemblyDetail = {
    item: { id: "1000", name: "Assembly", itemType: 0, tag: "Assembly", tier: 1 },
    craftingRecipes: [{
      id: "make-assembly",
      name: "Make Assembly",
      craftedItemStacks: [{ item_id: "1000", item_type: "item", quantity: 1 }],
      consumedItemStacks: [
        { item_id: "1001", item_type: "item", quantity: 1 },
        { item_id: "1002", item_type: "item", quantity: 1 },
      ],
      consumedItems: [
        { id: "1001", name: "Primary Part", itemType: 0, tag: "Part", tier: 1 },
        { id: "1002", name: "Binding", itemType: 0, tag: "Binding", tier: 1 },
      ],
    }],
  };
  const primaryDetail = {
    item: { id: "1001", name: "Primary Part", itemType: 0, tag: "Part", tier: 1 },
    craftingRecipes: [{
      id: "make-primary-with-binding",
      name: "Make Primary Part",
      craftedItemStacks: [
        { item_id: "1001", item_type: "item", quantity: 1 },
        { item_id: "1002", item_type: "item", quantity: 1 },
      ],
      craftedItems: [
        { id: "1001", name: "Primary Part", itemType: 0, tag: "Part", tier: 1 },
        { id: "1002", name: "Binding", itemType: 0, tag: "Binding", tier: 1 },
      ],
      consumedItemStacks: [{ item_id: "1003", item_type: "item", quantity: 1 }],
      consumedItems: [{ id: "1003", name: "Raw Material", itemType: 0, tag: "Raw Material", tier: 1 }],
    }],
  };
  const bindingDetail = {
    item: { id: "1002", name: "Binding", itemType: 0, tag: "Binding", tier: 1 },
    craftingRecipes: [{
      id: "make-binding",
      name: "Make Binding",
      craftedItemStacks: [{ item_id: "1002", item_type: "item", quantity: 1 }],
      consumedItemStacks: [{ item_id: "1004", item_type: "item", quantity: 10 }],
      consumedItems: [{ id: "1004", name: "Binding Fibre", itemType: 0, tag: "Fibre", tier: 1 }],
    }],
  };

  const plan = computeCraftPlan({
    config: normalizeCraftPlanConfig({ enabled: true, targets: [{ id: "1000", kind: "items", name: "Assembly", quantity: 5, itemType: 0 }] }),
    detailsByKey: new Map([
      [recipeKey("items", "1000"), assemblyDetail],
      [recipeKey("items", "1001"), primaryDetail],
      [recipeKey("items", "1002"), bindingDetail],
      [recipeKey("items", "1003"), { item: { id: "1003", name: "Raw Material", itemType: 0, tag: "Raw Material", tier: 1 }, craftingRecipes: [] }],
      [recipeKey("items", "1004"), { item: { id: "1004", name: "Binding Fibre", itemType: 0, tag: "Fibre", tier: 1 }, craftingRecipes: [] }],
    ]),
  });

  assert.equal(plan.materials.find((item) => item.name === "Binding")?.required, 5);
  assert.equal(plan.materials.find((item) => item.name === "Binding")?.plannedOutput, 5);
  assert.equal(plan.materials.find((item) => item.name === "Binding")?.missing, 0);
  assert.equal(plan.materials.some((item) => item.name === "Binding Fibre"), false);
  assert.equal(plan.materials.find((item) => item.name === "Raw Material")?.missing, 5);
});

test("computeCraftPlan nets planned secondary outputs across target branches regardless of target order", () => {
  const bindingDetail = {
    item: { id: "1102", name: "Binding", itemType: 0, tag: "Binding", tier: 1 },
    craftingRecipes: [{
      id: "make-binding",
      name: "Make Binding",
      craftedItemStacks: [{ item_id: "1102", item_type: "item", quantity: 1 }],
      consumedItemStacks: [{ item_id: "1104", item_type: "item", quantity: 10 }],
      consumedItems: [{ id: "1104", name: "Binding Fibre", itemType: 0, tag: "Fibre", tier: 1 }],
    }],
  };
  const firstTarget = {
    item: { id: "1100", name: "Bound Part", itemType: 0, tag: "Part", tier: 1 },
    craftingRecipes: [{
      id: "make-bound-part",
      name: "Make Bound Part",
      craftedItemStacks: [{ item_id: "1100", item_type: "item", quantity: 1 }],
      consumedItemStacks: [{ item_id: "1102", item_type: "item", quantity: 1 }],
      consumedItems: [{ id: "1102", name: "Binding", itemType: 0, tag: "Binding", tier: 1 }],
    }],
  };
  const secondTarget = {
    item: { id: "1101", name: "Primary Part", itemType: 0, tag: "Part", tier: 1 },
    craftingRecipes: [{
      id: "make-primary",
      name: "Make Primary Part",
      craftedItemStacks: [
        { item_id: "1101", item_type: "item", quantity: 1 },
        { item_id: "1102", item_type: "item", quantity: 1 },
      ],
      craftedItems: [
        { id: "1101", name: "Primary Part", itemType: 0, tag: "Part", tier: 1 },
        { id: "1102", name: "Binding", itemType: 0, tag: "Binding", tier: 1 },
      ],
      consumedItemStacks: [{ item_id: "1103", item_type: "item", quantity: 1 }],
      consumedItems: [{ id: "1103", name: "Raw Material", itemType: 0, tag: "Raw Material", tier: 1 }],
    }],
  };

  const plan = computeCraftPlan({
    config: normalizeCraftPlanConfig({ enabled: true, targets: [
      { id: "1100", kind: "items", name: "Bound Part", quantity: 5, itemType: 0 },
      { id: "1101", kind: "items", name: "Primary Part", quantity: 5, itemType: 0 },
    ] }),
    detailsByKey: new Map([
      [recipeKey("items", "1100"), firstTarget],
      [recipeKey("items", "1101"), secondTarget],
      [recipeKey("items", "1102"), bindingDetail],
      [recipeKey("items", "1103"), { item: { id: "1103", name: "Raw Material", itemType: 0, tag: "Raw Material", tier: 1 }, craftingRecipes: [] }],
      [recipeKey("items", "1104"), { item: { id: "1104", name: "Binding Fibre", itemType: 0, tag: "Fibre", tier: 1 }, craftingRecipes: [] }],
    ]),
  });

  assert.equal(plan.materials.find((item) => item.name === "Binding")?.plannedOutput, 5);
  assert.equal(plan.materials.find((item) => item.name === "Binding")?.missing, 0);
  assert.equal(plan.materials.some((item) => item.name === "Binding Fibre"), false);
});
test("computeCraftPlan prefers loose-material routes over packaged transport routes", () => {
  const mixDetail = {
    item: { id: "910", name: "Infused Potter's Mix", itemType: 0, tag: "Potter's Mix", tier: 3 },
    craftingRecipes: [
      {
        id: "packaged-mix-route",
        name: "Mix Infused Potter's Mix",
        craftedItemStacks: [{ item_id: "910", item_type: "item", quantity: 1 }],
        consumedItemStacks: [
          { item_id: "911", item_type: "item", quantity: 5 },
          { item_id: "912", item_type: "item", quantity: 1 },
        ],
        consumedItems: [
          { id: "911", name: "Sturdy Pebbles", itemType: 0, tag: "Pebbles", tier: 3 },
          { id: "912", name: "Infused Clay Lump Package", itemType: 0, tag: "Clay Lump Package", tier: 3 },
        ],
      },
      {
        id: "loose-mix-route",
        name: "Mix Infused Potter's Mix",
        craftedItemStacks: [{ item_id: "910", item_type: "item", quantity: 1 }],
        consumedItemStacks: [
          { item_id: "911", item_type: "item", quantity: 5 },
          { item_id: "913", item_type: "item", quantity: 2 },
        ],
        consumedItems: [
          { id: "911", name: "Sturdy Pebbles", itemType: 0, tag: "Pebbles", tier: 3 },
          { id: "913", name: "Infused Clay Lump", itemType: 0, tag: "Clay", tier: 3 },
        ],
      },
    ],
  };
  const pebblesDetail = { item: { id: "911", name: "Sturdy Pebbles", itemType: 0, tag: "Pebbles", tier: 3 }, craftingRecipes: [] };
  const clayPackageDetail = {
    item: { id: "912", name: "Infused Clay Lump Package", itemType: 0, tag: "Clay Lump Package", tier: 3 },
    craftingRecipes: [{
      id: "package-clay-route",
      name: "Package {I} into {O}",
      craftedItemStacks: [{ item_id: "912", item_type: "item", quantity: 1 }],
      consumedItemStacks: [{ item_id: "913", item_type: "item", quantity: 500 }],
      consumedItems: [{ id: "913", name: "Infused Clay Lump", itemType: 0, tag: "Clay", tier: 3 }],
    }],
  };
  const clayDetail = { item: { id: "913", name: "Infused Clay Lump", itemType: 0, tag: "Clay", tier: 3 }, craftingRecipes: [] };

  const plan = computeCraftPlan({
    config: normalizeCraftPlanConfig({ enabled: true, targets: [{ id: "910", kind: "items", name: "Infused Potter's Mix", quantity: 4, itemType: 0 }] }),
    detailsByKey: new Map([
      [recipeKey("items", "910"), mixDetail],
      [recipeKey("items", "911"), pebblesDetail],
      [recipeKey("items", "912"), clayPackageDetail],
      [recipeKey("items", "913"), clayDetail],
    ]),
  });

  assert.equal(plan.steps[0].selectedRecipeId, "loose-mix-route");
  assert.deepEqual(plan.steps[0].alternatives.map((recipe) => recipe.id), ["loose-mix-route", "packaged-mix-route"]);
  assert.equal(plan.materials.some((material) => material.name === "Infused Clay Lump Package"), false);
  const clay = plan.materials.find((material) => material.name === "Infused Clay Lump");
  assert.equal(clay?.required, 8);
  assert.deepEqual(clay?.recipeUsages.map((usage) => usage.output.name), ["Infused Potter's Mix"]);
});
test("computeCraftPlan uses API recipe detail tiers instead of name or id fallback inference", () => {
  const detail = {
    item: { id: "900000", name: "Tier Upgrade", itemType: 0, tier: 6 },
    craftingRecipes: [{
      id: "tier-upgrade-route",
      name: "Tier Upgrade",
      craftedItemStacks: [{ item_id: "900000", item_type: "item", quantity: 1 }],
      consumedItemStacks: [
        { item_id: "602001", item_type: "item", quantity: 4 },
        { item_id: "102999", item_type: "item", quantity: 2 },
      ],
      consumedItems: [
        { id: "602001", name: "Hexite Wood Fragment", itemType: 0 },
        { id: "102999", name: "Woodworking Sandpaper", itemType: 0 },
      ],
      levelRequirements: [{ skill: { name: "Carpentry" }, level: 60 }],
    }],
  };
  const hexiteDetail = { item: { id: "602001", name: "Hexite Wood Fragment", itemType: 0, tier: 6 }, craftingRecipes: [] };
  const sandpaperDetail = { item: { id: "102999", name: "Woodworking Sandpaper", itemType: 0 }, craftingRecipes: [] };

  const plan = computeCraftPlan({
    config: normalizeCraftPlanConfig({ enabled: true, targets: [{ id: "900000", kind: "items", name: "Tier Upgrade", quantity: 3, itemType: 0, tier: 6 }] }),
    detailsByKey: new Map([
      [recipeKey("items", "900000"), detail],
      [recipeKey("items", "602001"), hexiteDetail],
      [recipeKey("items", "102999"), sandpaperDetail],
    ]),
  });

  const hexite = plan.materials.find((material) => material.name === "Hexite Wood Fragment");
  const sandpaper = plan.materials.find((material) => material.name === "Woodworking Sandpaper");
  assert.equal(hexite?.tier, 6);
  assert.equal(hexite?.required, 12);
  assert.equal(sandpaper?.tier, null);
  assert.equal(sandpaper?.required, 6);
});

test("computeCraftPlan enriches emitted materials from fetched item details", () => {
  const detail = {
    item: { id: "700", name: "Berry Jam", itemType: 0, tier: 6, tag: "Food" },
    craftingRecipes: [{
      id: "berry-jam-route",
      name: "Berry Jam",
      craftedItemStacks: [{ item_id: "700", item_type: "item", quantity: 1 }],
      consumedItemStacks: [{ item_id: "6130004", item_type: "item", quantity: 2 }],
      consumedItems: [{ id: "6130004", name: "Peerless Berry", itemType: 0 }],
      levelRequirements: [{ skill: { name: "Foraging" }, level: 60 }],
    }],
  };
  const peerlessBerryDetail = {
    item: { id: "6130004", name: "Peerless Berry", itemType: 0, tag: "Berry", tier: 6 },
    craftingRecipes: [],
  };

  const plan = computeCraftPlan({
    config: normalizeCraftPlanConfig({ enabled: true, targets: [{ id: "700", kind: "items", name: "Berry Jam", quantity: 5, itemType: 0 }] }),
    detailsByKey: new Map([
      [recipeKey("items", "700"), detail],
      [recipeKey("items", "6130004"), peerlessBerryDetail],
    ]),
  });

  const berry = plan.materials.find((material) => material.id === "6130004");
  assert.equal(berry?.name, "Peerless Berry");
  assert.equal(berry?.tag, "Berry");
  assert.equal(berry?.tier, 6);
  assert.equal(berry?.required, 10);
  assert.equal(berry?.section, "Foraging");
});
test("computeCraftPlan leaves missing tier null when API detail is unavailable", () => {
  const detail = {
    item: { id: "900000", name: "Tier Upgrade", itemType: 0, tier: 6 },
    craftingRecipes: [{
      id: "tier-upgrade-route",
      name: "Tier Upgrade",
      craftedItemStacks: [{ item_id: "900000", item_type: "item", quantity: 1 }],
      consumedItemStacks: [{ item_id: "602001", item_type: "item", quantity: 4 }],
      consumedItems: [{ id: "602001", name: "Hexite Wood Fragment", itemType: 0 }],
      levelRequirements: [{ skill: { name: "Carpentry" }, level: 60 }],
    }],
  };

  const plan = computeCraftPlan({
    config: normalizeCraftPlanConfig({ enabled: true, targets: [{ id: "900000", kind: "items", name: "Tier Upgrade", quantity: 3, itemType: 0, tier: 6 }] }),
    detailsByKey: new Map([[recipeKey("items", "900000"), detail]]),
  });

  const hexite = plan.materials.find((material) => material.name === "Hexite Wood Fragment");
  assert.equal(hexite?.tier, null);
  assert.equal(hexite?.required, 12);
});

test("computeCraftPlan exposes source locations and recipe alternatives for material details", () => {
  const config = normalizeCraftPlanConfig({
    enabled: true,
    targets: [{ id: "900", kind: "items", name: "Fish Oil", quantity: 4, itemType: 0 }],
  });

  const plan = computeCraftPlan({
    config,
    detailsByKey: new Map([[recipeKey("items", "900"), fishOilDetail]]),
    storageSources: [{ sourceId: "store-1", label: "Pantry", items: [{ id: "100", kind: "items", quantity: 5, name: "Ocean Fish" }] }],
  });

  const oceanFish = plan.materials.find((material) => material.name === "Ocean Fish");
  assert.equal(oceanFish.required, 12);
  assert.deepEqual(oceanFish.sources.map((source) => [source.label, source.quantity]), [["Pantry", 5]]);
  assert.equal(oceanFish.recipeUsages.length, 1);
  assert.equal(oceanFish.recipeUsages[0].output.name, "Fish Oil");
  assert.equal(oceanFish.recipeUsages[0].output.quantity, 4);
  assert.equal(oceanFish.recipeUsages[0].requiredQuantity, 12);
  assert.equal(oceanFish.recipeUsages[0].quantityPerCraft, 3);
  assert.equal(oceanFish.recipeUsages[0].selectedRecipeId, "ocean-route");
  assert.deepEqual(oceanFish.recipeUsages[0].alternatives.map((recipe) => [recipe.id, recipe.label]), [["ocean-route", "Ocean Fish Oil"], ["lake-route", "Lake Fish Oil"]]);
  assert.equal(oceanFish.recipeUsages[0].alternatives[0].inputs[0].quantityPerCraft, 3);
  assert.deepEqual(plan.steps[0].alternatives.map((recipe) => [recipe.id, recipe.label]), [["ocean-route", "Ocean Fish Oil"], ["lake-route", "Lake Fish Oil"]]);
});

test("computeCraftPlan applies per-item multipliers and records unavailable sources", () => {
  const config = normalizeCraftPlanConfig({
    enabled: true,
    targets: [{ id: "200", kind: "items", name: "Animal Hair", quantity: 10, itemType: 0 }],
    sourceRules: { playerIds: ["player-1"] },
    multipliers: { [recipeKey("items", "200")]: { multiplier: 1.8, note: "Chance drop" } },
  });

  const plan = computeCraftPlan({
    config,
    detailsByKey: new Map([[recipeKey("items", "200"), animalHairDetail]]),
    playerSources: [{ sourceId: "player-1", label: "Modular inventory", unavailable: true, error: "HTTP 403", items: [] }],
  });

  const hair = plan.materials.find((material) => material.name === "Animal Hair");
  assert.equal(hair.required, 10);
  assert.equal(hair.bufferedRequired, 18);
  assert.equal(hair.missing, 18);
  assert.equal(plan.unavailableSources[0].sourceId, "player-1");
});

test("computeCraftPlan expands cached recipe-detail wrappers and keeps final targets out of gather next", () => {
  const codexDetail = {
    item: { id: "500", name: "Advanced Codex", itemType: 0, tag: "Research", tier: 5 },
    craftingRecipes: [{
      id: "advanced-codex-route",
      name: "Advanced Codex",
      buildingName: "Scholar Station",
      craftedItemStacks: [{ item_id: "500", item_type: "item", quantity: 1 }],
      consumedItemStacks: [{ item_id: "501", item_type: "item", quantity: 2 }],
      consumedItems: [{ id: "501", name: "Advanced Research Notes", tag: "Research", tier: 5 }],
      levelRequirements: [{ skill: { name: "Scholar" }, level: 50 }],
    }],
  };

  const plan = computeCraftPlan({
    config: normalizeCraftPlanConfig({ enabled: true, targets: [{ id: "500", kind: "items", name: "Advanced Codex", quantity: 25, itemType: 0 }] }),
    detailsByKey: new Map([[recipeKey("items", "500"), { detail: codexDetail, cached: true }]]),
  });

  assert.equal(plan.targets[0].missing, 25);
  assert.equal(plan.materials.some((material) => material.name === "Advanced Codex" && material.missing > 0), true);
  assert.equal(plan.gatherNext.some((group) => group.items.some((item) => item.name === "Advanced Codex")), false);
  const notes = plan.materials.find((material) => material.name === "Advanced Research Notes");
  assert.equal(notes.required, 50);
  assert.equal(plan.gatherNext[0].items[0].name, "Advanced Research Notes");
});

test("computeCraftPlan keeps uncrafted final targets out of gather next", () => {
  const plan = computeCraftPlan({
    config: normalizeCraftPlanConfig({ enabled: true, targets: [{ id: "500", kind: "items", name: "Advanced Codex", quantity: 25, itemType: 0 }] }),
  });

  assert.equal(plan.targets[0].missing, 25);
  assert.equal(plan.materials.find((material) => material.name === "Advanced Codex")?.missing, 25);
  assert.deepEqual(plan.gatherNext, []);
});

test("computeCraftPlan keeps refined materials under the profession that crafts them", () => {
  const refinedPlankDetail = {
    item: { id: "305", name: "Refined Simple Plank", itemType: 0, tag: "Refined Plank", tier: 2 },
    craftingRecipes: [{
      id: "refine-plank-route",
      name: "Research Refined Simple Plank",
      craftedItemStacks: [{ item_id: "305", item_type: "item", quantity: 1 }],
      consumedItemStacks: [{ item_id: "300", item_type: "item", quantity: 5 }],
      consumedItems: [{ id: "300", name: "Simple Plank", itemType: 0, tag: "Plank", tier: 1 }],
      levelRequirements: [{ skill: { name: "Scholar" }, level: 20 }],
    }],
  };
  const plankDetail = { item: { id: "300", name: "Simple Plank", itemType: 0, tag: "Plank", tier: 1 }, craftingRecipes: [] };

  const plan = computeCraftPlan({
    config: normalizeCraftPlanConfig({ enabled: true, targets: [{ id: "305", kind: "items", name: "Refined Simple Plank", quantity: 10, itemType: 0 }] }),
    detailsByKey: new Map([
      [recipeKey("items", "305"), refinedPlankDetail],
      [recipeKey("items", "300"), plankDetail],
    ]),
  });

  const refinedPlank = plan.materials.find((material) => material.name === "Refined Simple Plank");
  assert.equal(refinedPlank?.section, "Scholar");
});
test("computeCraftPlan does not infer sections from item names or tags without recipe API context", () => {
  const plan = computeCraftPlan({
    config: normalizeCraftPlanConfig({ enabled: true, targets: [{ id: "800", kind: "items", name: "Advanced Codex", quantity: 1, itemType: 0 }] }),
    detailsByKey: new Map([[recipeKey("items", "800"), {
      item: { id: "800", name: "Advanced Codex", itemType: 0, tag: "Research", tier: 5 },
      craftingRecipes: [{
        id: "codex-route",
        name: "Advanced Codex",
        craftedItemStacks: [{ item_id: "800", item_type: "item", quantity: 1 }],
        consumedItemStacks: [{ item_id: "305", item_type: "item", quantity: 25 }],
        consumedItems: [{ id: "305", name: "Refined Simple Plank", itemType: 0, tag: "Refined Plank", tier: 2 }],
      }],
    }]]),
  });

  const refinedPlank = plan.materials.find((material) => material.name === "Refined Simple Plank");
  assert.equal(refinedPlank?.section, "Other");
});
test("normalizeCraftPlanConfig preserves valid section overrides", () => {
  const config = normalizeCraftPlanConfig({
    sectionOverrides: {
      "tag:Refined Plank": "Scholar",
      "item:items:123": "Foraging",
      "bad": "Not A Section",
      "tag:Blank": "",
    },
  });

  assert.deepEqual(config.sectionOverrides, {
    "tag:Refined Plank": "Scholar",
    "item:items:123": "Foraging",
  });
});

test("computeCraftPlan applies row section overrides after API section resolution", () => {
  const detail = {
    item: { id: "305", name: "Refined Simple Plank", itemType: 0, tag: "Refined Plank", tier: 2 },
    craftingRecipes: [{
      id: "refine-plank-route",
      name: "Research Refined Simple Plank",
      craftedItemStacks: [{ item_id: "305", item_type: "item", quantity: 1 }],
      consumedItemStacks: [{ item_id: "300", item_type: "item", quantity: 5 }],
      consumedItems: [{ id: "300", name: "Simple Plank", itemType: 0, tag: "Plank", tier: 1 }],
      levelRequirements: [{ skill: { name: "Scholar" }, level: 20 }],
    }],
  };

  const plan = computeCraftPlan({
    config: normalizeCraftPlanConfig({
      enabled: true,
      targets: [{ id: "305", kind: "items", name: "Refined Simple Plank", quantity: 10, itemType: 0 }],
      sectionOverrides: { "tag:Refined Plank": "Carpentry" },
    }),
    detailsByKey: new Map([[recipeKey("items", "305"), detail]]),
  });

  const refinedPlank = plan.materials.find((material) => material.name === "Refined Simple Plank");
  assert.equal(refinedPlank?.apiSection, "Scholar");
  assert.equal(refinedPlank?.section, "Carpentry");
  assert.equal(refinedPlank?.sectionOverrideKey, "tag:Refined Plank");
  assert.equal(refinedPlank?.sectionOverride, "Carpentry");
});

test("computeCraftPlan expands item list possibilities through producer item routes", () => {
  const crushedShellDetail = {
    item: { id: "1110012", name: "Crushed Rough Shells", itemType: 0, tag: "Crushed Shells", tier: 1 },
    craftingRecipes: [],
    recipesUsingItem: [],
  };
  const baitAndShellsDetail = {
    item: { id: "1220019", name: "Basic Bait and Shells", itemType: 0, tag: "Bait Output", tier: 1, itemListId: "1110025" },
    craftingRecipes: [{
      id: "process-guppi",
      name: "Process Briny Guppi",
      craftedItemStacks: [{ item_id: "1220019", item_type: "item", quantity: 1 }],
      craftedItems: [{ id: "1220019", name: "Basic Bait and Shells", itemType: 0, tag: "Bait Output", tier: 1 }],
      consumedItemStacks: [{ item_id: "900", item_type: "item", quantity: 1 }],
      consumedItems: [{ id: "900", name: "Briny Guppi", itemType: 0, tag: "Fish", tier: 1 }],
      levelRequirements: [{ skill: { name: "Fishing" }, level: 1 }],
    }],
    itemListPossibilities: [{
      targetId: "1110012",
      targetItem: { id: "1110012", name: "Crushed Rough Shells", tier: 1 },
      quantity: 1,
      chance: 0.1,
      isCargo: false,
    }],
  };
  const fishDetail = { item: { id: "900", name: "Briny Guppi", itemType: 0, tag: "Fish", tier: 1 } };

  const plan = computeCraftPlan({
    config: normalizeCraftPlanConfig({ enabled: true, targets: [{ id: "1110012", kind: "items", name: "Crushed Rough Shells", quantity: 2, itemType: 0 }] }),
    detailsByKey: new Map([
      [recipeKey("items", "1110012"), crushedShellDetail],
      [recipeKey("items", "1220019"), baitAndShellsDetail],
      [recipeKey("items", "900"), fishDetail],
    ]),
  });

  assert.equal(plan.steps[0].selectedRecipeId, "possibility:process-guppi:items:1110012");
  const fish = plan.materials.find((material) => material.name === "Briny Guppi");
  assert.equal(fish?.section, "Fishing");
  assert.equal(fish?.required, 20);
  const shells = plan.materials.find((material) => material.name === "Crushed Rough Shells");
  assert.equal(shells?.sourceRoutes?.[0]?.recipeName, "Process Briny Guppi -> Crushed Rough Shells");
});

test("computeCraftPlan expands item list possibilities through cargo processing routes", () => {
  const woodLogDetail = {
    item: { id: "5010001", name: "Exquisite Wood Log", itemType: 0, tag: "Wood Log", tier: 5 },
    craftingRecipes: [{
      id: "unpack-log-package",
      name: "Unpack Exquisite Wood Log Package",
      craftedItemStacks: [{ item_id: "5010001", item_type: "item", quantity: 100 }],
      consumedItemStacks: [{ item_id: "550000", item_type: "cargo", quantity: 1 }],
      consumedItems: [{ id: "550000", name: "Exquisite Wood Log Package", itemType: 1, tag: "Package", tier: 5 }],
      levelRequirements: [{ skill: { name: "Forestry" }, level: 1 }],
    }],
  };
  const woodLogOutputDetail = {
    item: { id: "338345776", name: "Exquisite Wood Log Output", itemType: 0, tag: "Wood Log", tier: 5 },
    craftingRecipes: [{
      id: "split-trunk",
      name: "Split into Exquisite Wood Log Output",
      craftedItemStacks: [{ item_id: "338345776", item_type: "item", quantity: 1 }],
      consumedItemStacks: [{ item_id: "1004", item_type: "cargo", quantity: 1 }],
      consumedItems: [{ id: "1004", name: "Exquisite Trunk", itemType: 1, tag: "Trunk", tier: 5 }],
      levelRequirements: [{ skill: { name: "Forestry" }, level: 50 }],
    }],
    itemListPossibilities: [{
      targetId: "5010001",
      targetItem: { id: "5010001", name: "Exquisite Wood Log", tier: 5 },
      quantity: 6,
      chance: 0.94,
      isCargo: false,
    }, {
      targetId: "5010001",
      targetItem: { id: "5010001", name: "Exquisite Wood Log", tier: 5 },
      quantity: 6,
      chance: 0.06,
      isCargo: false,
    }],
  };
  const trunkDetail = {
    cargo: { id: "1004", name: "Exquisite Trunk", itemType: 1, tag: "Trunk", tier: 5 },
  };

  const plan = computeCraftPlan({
    config: normalizeCraftPlanConfig({ enabled: true, targets: [{ id: "5010001", kind: "items", name: "Exquisite Wood Log", quantity: 18, itemType: 0 }] }),
    detailsByKey: new Map([
      [recipeKey("items", "5010001"), woodLogDetail],
      [recipeKey("items", "338345776"), woodLogOutputDetail],
      [recipeKey("cargo", "1004"), trunkDetail],
    ]),
  });

  assert.equal(plan.steps[0].selectedRecipeId, "possibility:split-trunk:items:5010001");
  assert.equal(plan.materials.some((material) => material.name === "Exquisite Wood Log Package"), false);
  const trunk = plan.materials.find((material) => material.name === "Exquisite Trunk");
  assert.equal(trunk?.kind, "cargo");
  assert.equal(trunk?.tag, "Trunk");
  assert.equal(trunk?.tier, 5);
  assert.equal(trunk?.section, "Forestry");
  assert.equal(trunk?.required, 3);
  const log = plan.materials.find((material) => material.name === "Exquisite Wood Log");
  assert.equal(log?.sourceRoutes?.[0]?.recipeName, "Split into Exquisite Wood Log Output -> Exquisite Wood Log");
});

test("normalizeCraftPlanConfig preserves valid row name overrides", () => {
  const config = normalizeCraftPlanConfig({
    rowNameOverrides: {
      "tag:Refined Plank": "Finished Planks",
      " ": "Ignored",
      "tag:Empty": " ",
    },
  });

  assert.deepEqual(config.rowNameOverrides, {
    "tag:Refined Plank": "Finished Planks",
  });
});

test("computeCraftPlan applies row name overrides after API row identity resolution", () => {
  const detail = {
    item: { id: "305", name: "Refined Simple Plank", itemType: 0, tag: "Refined Plank", tier: 2 },
    craftingRecipes: [{
      id: "refine-plank-route",
      name: "Research Refined Simple Plank",
      craftedItemStacks: [{ item_id: "305", item_type: "item", quantity: 1 }],
      consumedItemStacks: [{ item_id: "300", item_type: "item", quantity: 5 }],
      consumedItems: [{ id: "300", name: "Simple Plank", itemType: 0, tag: "Plank", tier: 1 }],
      levelRequirements: [{ skill: { name: "Scholar" }, level: 20 }],
    }],
  };
  const plan = computeCraftPlan({
    config: normalizeCraftPlanConfig({
      enabled: true,
      targets: [{ id: "305", kind: "items", name: "Refined Simple Plank", quantity: 10, itemType: 0 }],
      rowNameOverrides: { "tag:Refined Plank": "Finished Planks" },
    }),
    detailsByKey: new Map([[recipeKey("items", "305"), detail]]),
  });

  const material = plan.materials.find((item) => item.name === "Refined Simple Plank");
  assert.equal(material?.sectionOverrideKey, "tag:Refined Plank");
  assert.equal(material?.rowNameOverride, "Finished Planks");
});

test("computeCraftPlan treats gathering byproducts as acquisition routes and ignores direct craft overrides", () => {
  const gypsiteDetail = {
    item: { id: "3001", name: "Rough Gypsite", itemType: 0, tag: "Gypsite", tier: 1 },
    craftingRecipes: [{
      id: "craft-gypsite",
      name: "Craft Rough Gypsite",
      craftedItemStacks: [{ item_id: "3001", item_type: "item", quantity: 1 }],
      craftedItems: [{ id: "3001", name: "Rough Gypsite", itemType: 0, tag: "Gypsite", tier: 1 }],
      consumedItemStacks: [
        { item_id: "4001", item_type: "item", quantity: 10 },
        { item_id: "4002", item_type: "item", quantity: 20 },
      ],
      consumedItems: [
        { id: "4001", name: "Rough Brick", itemType: 0, tag: "Brick", tier: 1 },
        { id: "4002", name: "Ancient Mortar", itemType: 0, tag: "Mortar", tier: 1 },
      ],
      levelRequirements: [{ skill: { name: "Masonry" }, level: 1 }],
    }],
  };
  const clayOutputDetail = {
    item: { id: "5001", name: "Rough Clay Output", itemType: 0, tag: "Clay Output", tier: 1, itemListId: "5000" },
    craftingRecipes: [{
      id: "gather-clay",
      name: "Gather Rough Clay",
      craftedItemStacks: [{ item_id: "5001", item_type: "item", quantity: 1 }],
      craftedItems: [{ id: "5001", name: "Rough Clay Output", itemType: 0, tag: "Clay Output", tier: 1 }],
      consumedItemStacks: [{ item_id: "6001", item_type: "cargo", quantity: 1 }],
      consumedItems: [{ id: "6001", name: "Rough Clay Deposit", itemType: 1, tag: "Clay Deposit", tier: 1 }],
      levelRequirements: [{ skill: { name: "Foraging" }, level: 1 }],
    }],
    itemListPossibilities: [{
      targetId: "3001",
      targetItem: { id: "3001", name: "Rough Gypsite", itemType: 0, tag: "Gypsite", tier: 1 },
      quantity: 1,
      chance: 0.25,
      isCargo: false,
    }],
  };
  const clayDepositDetail = {
    cargo: { id: "6001", name: "Rough Clay Deposit", itemType: 1, tag: "Clay Deposit", tier: 1 },
  };

  const plan = computeCraftPlan({
    config: normalizeCraftPlanConfig({
      enabled: true,
      targets: [{ id: "3001", kind: "items", name: "Rough Gypsite", quantity: 4, itemType: 0 }],
      routeOverrides: { "items:3001": "craft-gypsite" },
    }),
    detailsByKey: new Map([
      [recipeKey("items", "3001"), gypsiteDetail],
      [recipeKey("items", "5001"), clayOutputDetail],
      [recipeKey("cargo", "6001"), clayDepositDetail],
    ]),
  });

  assert.equal(plan.steps[0].selectedRecipeId, "possibility:gather-clay:items:3001");
  assert.equal(plan.materials.some((material) => material.name === "Rough Brick"), false);
  assert.equal(plan.materials.some((material) => material.name === "Ancient Mortar"), false);
  const clayDeposit = plan.materials.find((material) => material.name === "Rough Clay Deposit");
  assert.equal(clayDeposit?.kind, "cargo");
  assert.equal(clayDeposit?.required, 16);
  const gypsite = plan.materials.find((material) => material.name === "Rough Gypsite");
  assert.equal(gypsite?.sourceRoutes?.[0]?.recipeName, "Gather Rough Clay -> Rough Gypsite");
  assert.equal(gypsite?.sourceRoutes?.[0]?.routeType, "gathering-byproduct");
  assert.equal(gypsite?.sourceRoutes?.[0]?.gatheringSkill, "Foraging");
  assert.equal(gypsite?.sourceRoutes?.[0]?.producer?.name, "Rough Clay Output");
  assert.equal(gypsite?.sourceRoutes?.[0]?.expectedYield, 0.25);
  assert.deepEqual(gypsite?.sourceRoutes?.[0]?.alternatives.map((route) => route.id), ["possibility:gather-clay:items:3001"]);
  assert.equal(plan.steps.some((step) => step.selectedRecipeId === "craft-gypsite"), false);
});
test("collectLocalCatalogCraftPlanDetails builds a full recursive plan from normalized local catalog rows", (t) => {
  const { repository } = createCatalogFixture(t);
  upsertCatalogDetails(repository, [
    {
      item: { id: "700", itemType: 0, name: "Peerless Berry Tart", tag: "Food", tier: 6 },
      craftingRecipes: [{
        id: "bake-tart",
        name: "Bake Peerless Berry Tart",
        stationName: "Cooking Station",
        craftedItemStacks: [{ item_id: "700", item_type: "item", quantity: 1 }],
        craftedItems: [{ id: "700", itemType: 0, name: "Peerless Berry Tart", tag: "Food", tier: 6 }],
        consumedItemStacks: [{ item_id: "701", item_type: "item", quantity: 2 }],
        consumedItems: [{ id: "701", itemType: 0, name: "Berry Filling" }],
        levelRequirements: [{ skill: { name: "Cooking" }, level: 60 }],
      }],
    },
    {
      item: { id: "701", itemType: 0, name: "Peerless Berry Filling", tag: "Filling", tier: 6 },
      craftingRecipes: [{
        id: "cook-filling",
        name: "Cook Peerless Berry Filling",
        stationName: "Cooking Station",
        craftedItemStacks: [{ item_id: "701", item_type: "item", quantity: 1 }],
        craftedItems: [{ id: "701", itemType: 0, name: "Peerless Berry Filling", tag: "Filling", tier: 6 }],
        consumedItemStacks: [{ item_id: "6130004", item_type: "item", quantity: 3 }],
        consumedItems: [{ id: "6130004", itemType: 0, name: "Peerless Berry" }],
        levelRequirements: [{ skill: { name: "Cooking" }, level: 60 }],
      }],
    },
    {
      item: { id: "6130004", itemType: 0, name: "Peerless Berry", tag: "Berry", tier: 6 },
      craftingRecipes: [],
      extractionRecipes: [],
      itemListPossibilities: [],
    },
  ]);

  const config = normalizeCraftPlanConfig({
    enabled: true,
    targets: [{ id: "700", kind: "items", name: "Peerless Berry Tart", quantity: 2, itemType: 0 }],
    sourceRules: { playerIds: ["player-1"], craftPlayerIds: ["player-1"] },
  });
  const { detailsByKey, warnings } = collectLocalCatalogCraftPlanDetails(repository, config.targets, config.routeOverrides);
  const plan = computeCraftPlan({
    config,
    detailsByKey,
    catalogWarnings: warnings,
    storageSources: [{ sourceId: "store-1", label: "Pantry", items: [{ id: "6130004", kind: "items", quantity: 1, name: "Peerless Berry" }] }],
    activeCrafts: [{ id: "craft-berry", playerId: "player-1", playerName: "Tester", buildingName: "Foraging Basket", itemId: "6130004", kind: "items", quantity: 2, name: "Peerless Berry" }],
  });

  assert.equal(detailsByKey.has(recipeKey("items", "700")), true);
  assert.equal(detailsByKey.has(recipeKey("items", "701")), true);
  assert.equal(detailsByKey.has(recipeKey("items", "6130004")), true);
  assert.deepEqual(plan.steps.map((step) => step.selectedRecipeId), ["cook-filling", "bake-tart"]);
  const berry = plan.materials.find((material) => material.id === "6130004");
  assert.equal(berry?.name, "Peerless Berry");
  assert.equal(berry?.tag, "Berry");
  assert.equal(berry?.tier, 6);
  assert.equal(berry?.required, 12);
  assert.equal(berry?.available, 1);
  assert.equal(berry?.inProgress, 2);
  assert.equal(berry?.missing, 9);
});

test("computeCraftPlan keeps direct overrides for non-gathering co-products", () => {
  const catalyst = { id: "7100", name: "Basic Catalyst", itemType: 0, tag: "Catalyst", tier: 1 };
  const batch = { id: "7200", name: "Basic Pigment Batch", itemType: 0, tag: "Pigment Output", tier: 1 };
  const detailsByKey = new Map([
    [recipeKey("items", catalyst.id), {
      item: catalyst,
      craftingRecipes: [{
        id: "craft-catalyst",
        name: "Craft Basic Catalyst",
        craftedItemStacks: [{ item_id: catalyst.id, item_type: "item", quantity: 1 }],
        craftedItems: [catalyst],
        consumedItemStacks: [{ item_id: "7300", item_type: "item", quantity: 2 }],
        consumedItems: [{ id: "7300", name: "Basic Solvent", itemType: 0, tag: "Solvent", tier: 1 }],
        levelRequirements: [{ skill: { name: "Scholar" }, level: 1 }],
      }],
    }],
    [recipeKey("items", batch.id), {
      item: batch,
      craftingRecipes: [{
        id: "process-pigment",
        name: "Process Basic Pigment",
        craftedItemStacks: [{ item_id: batch.id, item_type: "item", quantity: 1 }],
        craftedItems: [batch],
        consumedItemStacks: [{ item_id: "7400", item_type: "item", quantity: 1 }],
        consumedItems: [{ id: "7400", name: "Basic Flower", itemType: 0, tag: "Flower", tier: 1 }],
        levelRequirements: [{ skill: { name: "Scholar" }, level: 1 }],
      }],
      itemListPossibilities: [{ targetId: catalyst.id, targetItem: catalyst, quantity: 1, chance: 0.5 }],
    }],
  ]);
  const plan = computeCraftPlan({
    config: normalizeCraftPlanConfig({
      enabled: true,
      targets: [{ ...catalyst, kind: "items", quantity: 1 }],
      routeOverrides: { [`items:${catalyst.id}`]: "craft-catalyst" },
    }),
    detailsByKey,
  });

  assert.equal(plan.steps.find((step) => step.output.id === catalyst.id)?.selectedRecipeId, "craft-catalyst");
  const route = plan.materials.find((material) => material.id === catalyst.id)?.sourceRoutes?.[0];
  assert.equal(route?.routeType, "craft");
  assert.equal(route?.alternatives.some((alternative) => alternative.routeType === "byproduct"), true);
});

test("computeCraftPlan classifies Crushed Shells from a Fishing item-list producer", () => {
  const shells = { id: "1110012", name: "Crushed Rough Shells", itemType: 0, tag: "Crushed Shells", tier: 1 };
  const baitOutput = { id: "1220019", name: "Basic Bait and Shells", itemType: 0, tag: "Bait Output", tier: 1 };
  const detailsByKey = new Map([
    [recipeKey("items", shells.id), {
      item: shells,
      craftingRecipes: [{
        id: "craft-shells",
        name: "Craft Crushed Rough Shells",
        craftedItemStacks: [{ item_id: shells.id, item_type: "item", quantity: 1 }],
        craftedItems: [shells],
        consumedItemStacks: [{ item_id: "1110999", item_type: "item", quantity: 10 }],
        consumedItems: [{ id: "1110999", name: "Shell Compound", itemType: 0, tag: "Material", tier: 1 }],
        levelRequirements: [{ skill: { name: "Scholar" }, level: 1 }],
      }],
    }],
    [recipeKey("items", baitOutput.id), {
      item: baitOutput,
      craftingRecipes: [{
        id: "fish-bait-shells",
        name: "Catch Rough Bait and Shells",
        craftedItemStacks: [{ item_id: baitOutput.id, item_type: "item", quantity: 1 }],
        craftedItems: [baitOutput],
        consumedItemStacks: [{ item_id: "6100", item_type: "item", quantity: 1 }],
        consumedItems: [{ id: "6100", name: "Basic Bait", itemType: 0, tag: "Bait", tier: 1 }],
        levelRequirements: [{ skill: { name: "Fishing" }, level: 1 }],
      }],
      itemListPossibilities: [{ targetId: shells.id, targetItem: shells, quantity: 1, chance: 0.2 }],
    }],
  ]);
  const plan = computeCraftPlan({
    config: normalizeCraftPlanConfig({
      enabled: true,
      targets: [{ ...shells, kind: "items", quantity: 2 }],
      routeOverrides: { [`items:${shells.id}`]: "craft-shells" },
    }),
    detailsByKey,
  });

  const route = plan.materials.find((material) => material.id === shells.id)?.sourceRoutes?.[0];
  assert.equal(route?.routeType, "gathering-byproduct");
  assert.equal(route?.gatheringSkill, "Fishing");
  assert.equal(route?.alternatives.some((alternative) => alternative.id === "craft-shells"), false);
});

test("collectLocalCatalogCraftPlanDetails exposes normalized byproduct routes through clay and tree producers", (t) => {
  const { repository } = createCatalogFixture(t);
  upsertCatalogDetails(repository, [
    {
      item: { id: "3001", itemType: 0, name: "Rough Gypsite", tag: "Gypsite", tier: 1 },
      craftingRecipes: [{
        id: "craft-gypsite",
        name: "Craft Rough Gypsite",
        stationName: "Masonry Station",
        craftedItemStacks: [{ item_id: "3001", item_type: "item", quantity: 1 }],
        craftedItems: [{ id: "3001", itemType: 0, name: "Rough Gypsite", tag: "Gypsite", tier: 1 }],
        consumedItemStacks: [
          { item_id: "4001", item_type: "item", quantity: 10 },
          { item_id: "4002", item_type: "item", quantity: 20 },
        ],
        consumedItems: [
          { id: "4001", itemType: 0, name: "Rough Brick", tag: "Brick", tier: 1 },
          { id: "4002", itemType: 0, name: "Ancient Mortar", tag: "Mortar", tier: 1 },
        ],
        levelRequirements: [{ skill: { name: "Masonry" }, level: 1 }],
      }],
    },
    {
      item: { id: "5001", itemType: 0, name: "Rough Clay Output", tag: "Clay Output", tier: 1 },
      craftingRecipes: [{
        id: "gather-clay",
        name: "Gather Rough Clay",
        stationName: "Foraging Camp",
        craftedItemStacks: [{ item_id: "5001", item_type: "item", quantity: 1 }],
        craftedItems: [{ id: "5001", itemType: 0, name: "Rough Clay Output", tag: "Clay Output", tier: 1 }],
        consumedItemStacks: [{ item_id: "6001", item_type: "cargo", quantity: 1 }],
        consumedItems: [{ id: "6001", itemType: 1, name: "Rough Clay Deposit", tag: "Clay Deposit", tier: 1 }],
        levelRequirements: [{ skill: { name: "Foraging" }, level: 1 }],
      }],
      itemListPossibilities: [{
        targetId: "3001",
        targetItem: { id: "3001", itemType: 0, name: "Rough Gypsite", tag: "Gypsite", tier: 1 },
        quantity: 1,
        chance: 0.25,
        isCargo: false,
      }],
    },
    { cargo: { id: "6001", itemType: 1, name: "Rough Clay Deposit", tag: "Clay Deposit", tier: 1 } },
    {
      item: { id: "3002", itemType: 0, name: "Rough Resin", tag: "Resin", tier: 1 },
      craftingRecipes: [{
        id: "craft-resin",
        name: "Craft Rough Resin",
        stationName: "Forestry Station",
        craftedItemStacks: [{ item_id: "3002", item_type: "item", quantity: 1 }],
        craftedItems: [{ id: "3002", itemType: 0, name: "Rough Resin", tag: "Resin", tier: 1 }],
        consumedItemStacks: [
          { item_id: "4003", item_type: "item", quantity: 8 },
          { item_id: "4004", item_type: "item", quantity: 4 },
        ],
        consumedItems: [
          { id: "4003", itemType: 0, name: "Rough Bark", tag: "Bark", tier: 1 },
          { id: "4004", itemType: 0, name: "Tree Sap", tag: "Sap", tier: 1 },
        ],
        levelRequirements: [{ skill: { name: "Forestry" }, level: 1 }],
      }],
    },
    {
      item: { id: "5002", itemType: 0, name: "Rough Trunk Output", tag: "Trunk Output", tier: 1 },
      craftingRecipes: [{
        id: "split-trunk",
        name: "Split Rough Trunk",
        stationName: "Forestry Camp",
        craftedItemStacks: [{ item_id: "5002", item_type: "item", quantity: 1 }],
        craftedItems: [{ id: "5002", itemType: 0, name: "Rough Trunk Output", tag: "Trunk Output", tier: 1 }],
        consumedItemStacks: [{ item_id: "6002", item_type: "cargo", quantity: 1 }],
        consumedItems: [{ id: "6002", itemType: 1, name: "Rough Trunk", tag: "Trunk", tier: 1 }],
        levelRequirements: [{ skill: { name: "Forestry" }, level: 1 }],
      }],
      itemListPossibilities: [{
        targetId: "3002",
        targetItem: { id: "3002", itemType: 0, name: "Rough Resin", tag: "Resin", tier: 1 },
        quantity: 2,
        chance: 0.5,
        isCargo: false,
      }, {
        targetId: "4003",
        targetItem: { id: "4003", itemType: 0, name: "Rough Bark", tag: "Bark", tier: 1 },
        quantity: 1,
        chance: 1,
        isCargo: false,
      }],
    },
    { cargo: { id: "6002", itemType: 1, name: "Rough Trunk", tag: "Trunk", tier: 1 } },
  ]);

  const config = normalizeCraftPlanConfig({
    enabled: true,
    targets: [
      { id: "3001", kind: "items", name: "Rough Gypsite", quantity: 4, itemType: 0 },
      { id: "3002", kind: "items", name: "Rough Resin", quantity: 3, itemType: 0 },
    ],
  });
  const { detailsByKey, warnings } = collectLocalCatalogCraftPlanDetails(repository, config.targets, config.routeOverrides);
  const plan = computeCraftPlan({ config, detailsByKey, catalogWarnings: warnings });

  assert.equal(plan.steps.find((step) => step.output.name === "Rough Gypsite")?.selectedRecipeId, "possibility:gather-clay:items:3001");
  assert.equal(plan.steps.find((step) => step.output.name === "Rough Resin")?.selectedRecipeId, "possibility:split-trunk:items:3002");
  assert.equal(plan.materials.find((material) => material.name === "Rough Gypsite")?.sourceRoutes?.[0]?.routeType, "gathering-byproduct");
  assert.equal(plan.materials.find((material) => material.name === "Rough Resin")?.sourceRoutes?.[0]?.routeType, "gathering-byproduct");
  assert.equal(plan.materials.find((material) => material.name === "Rough Resin")?.sourceRoutes?.[0]?.gatheringSkill, "Forestry");
  assert.equal(plan.materials.some((material) => material.name === "Rough Brick"), false);
  assert.equal(plan.materials.some((material) => material.name === "Ancient Mortar"), false);
  assert.equal(plan.materials.some((material) => material.name === "Tree Sap"), false);
  assert.equal(plan.materials.find((material) => material.name === "Rough Clay Deposit")?.required, 16);
  assert.equal(plan.materials.find((material) => material.name === "Rough Trunk")?.required, 3);
});

test("collectLocalCatalogCraftPlanDetails reports missing local rows without inferring identity from names", (t) => {
  const { repository } = createCatalogFixture(t);
  const config = normalizeCraftPlanConfig({
    enabled: true,
    targets: [{ id: "999999", kind: "items", name: "Peerless Mythril T6 Bar", quantity: 2, itemType: 0 }],
  });

  const { detailsByKey, warnings } = collectLocalCatalogCraftPlanDetails(repository, config.targets, config.routeOverrides);
  const plan = computeCraftPlan({ config, detailsByKey, catalogWarnings: warnings });

  assert.equal(detailsByKey.has(recipeKey("items", "999999")), false);
  const material = plan.materials.find((item) => item.id === "999999");
  assert.equal(material?.name, "Peerless Mythril T6 Bar");
  assert.equal(material?.tag, null);
  assert.equal(material?.tier, null);
  assert.match(plan.warnings.join("\n"), /local catalog/i);
  assert.match(plan.warnings.join("\n"), /items:999999/);
});

test("collectLocalCatalogCraftPlanDetails reports incomplete byproduct producer recipes", (t) => {
  const { repository } = createCatalogFixture(t);
  upsertCatalogDetails(repository, [
    {
      item: { id: "8500", itemType: 0, name: "Rare Sap", tag: "Sap", tier: 2 },
      craftingRecipes: [{
        id: "craft-sap",
        name: "Craft Rare Sap",
        craftedItemStacks: [{ item_id: "8500", item_type: "item", quantity: 1 }],
        craftedItems: [{ id: "8500", itemType: 0, name: "Rare Sap", tag: "Sap", tier: 2 }],
        consumedItemStacks: [{ item_id: "8501", item_type: "item", quantity: 10 }],
        consumedItems: [{ id: "8501", itemType: 0, name: "Sap Compound", tag: "Material", tier: 2 }],
        levelRequirements: [{ skill: { name: "Scholar" }, level: 1 }],
      }],
    },
    {
      item: { id: "8600", itemType: 0, name: "Tree Output", tag: "Tree Output", tier: 2 },
      craftingRecipes: [],
      itemListPossibilities: [{
        targetId: "8500",
        targetItem: { id: "8500", itemType: 0, name: "Rare Sap", tag: "Sap", tier: 2 },
        quantity: 1,
        chance: 0.1,
      }],
    },
  ]);
  const config = normalizeCraftPlanConfig({
    enabled: true,
    targets: [{ id: "8500", kind: "items", name: "Rare Sap", quantity: 1, itemType: 0 }],
  });

  const { warnings } = collectLocalCatalogCraftPlanDetails(repository, config.targets, config.routeOverrides);
  const byproductWarnings = warnings.filter((warning) => /byproduct routes are incomplete/i.test(warning));
  assert.equal(byproductWarnings.length, 1);
  assert.match(byproductWarnings[0], /Rare Sap/);
  assert.match(byproductWarnings[0], /items:8500/);
});

test("collectLocalCatalogCraftPlanDetails ignores incomplete byproduct candidates when a usable producer exists", (t) => {
  const { repository } = createCatalogFixture(t);
  upsertCatalogDetails(repository, [
    {
      item: { id: "8700", itemType: 0, name: "Tree Resin", tag: "Resin", tier: 1 },
      craftingRecipes: [],
    },
    {
      item: { id: "8701", itemType: 0, name: "Incomplete Tree", tag: "Tree", tier: 1 },
      craftingRecipes: [],
      itemListPossibilities: [{ targetId: "8700", targetItem: { id: "8700", itemType: 0, name: "Tree Resin", tag: "Resin", tier: 1 }, quantity: 1, chance: 0.1 }],
    },
    {
      item: { id: "8702", itemType: 0, name: "Gatherable Tree", tag: "Tree", tier: 1 },
      craftingRecipes: [{
        id: "gather-tree",
        name: "Gather Tree",
        craftedItemStacks: [{ item_id: "8702", item_type: "item", quantity: 1 }],
        craftedItems: [{ id: "8702", itemType: 0, name: "Gatherable Tree", tag: "Tree", tier: 1 }],
        consumedItemStacks: [],
        consumedItems: [],
        levelRequirements: [{ skill: { name: "Forestry" }, level: 1 }],
      }],
      itemListPossibilities: [{ targetId: "8700", targetItem: { id: "8700", itemType: 0, name: "Tree Resin", tag: "Resin", tier: 1 }, quantity: 1, chance: 0.1 }],
    },
  ]);

  const { warnings } = collectLocalCatalogCraftPlanDetails(repository, [{ id: "8700", kind: "items", name: "Tree Resin", quantity: 1, itemType: 0 }]);
  assert.equal(warnings.some((warning) => /byproduct routes are incomplete/i.test(warning)), false);
});

test("collectLocalCatalogCraftPlanDetails keeps transport routes available after real local routes and honors override ids", (t) => {
  const { db, repository } = createCatalogFixture(t);
  upsertCatalogDetails(repository, [{
    item: { id: "8100", itemType: 0, name: "Treated Board", tag: "Board", tier: 3 },
    craftingRecipes: [
      {
        id: "transport-route",
        name: "A Trade Shipment",
        stationName: "Hauling Station",
        craftedItemStacks: [{ item_id: "8100", item_type: "item", quantity: 10 }],
        craftedItems: [{ id: "8100", itemType: 0, name: "Treated Board", tag: "Board", tier: 3 }],
        consumedItemStacks: [{ item_id: "8101", item_type: "item", quantity: 1 }],
        consumedItems: [{ id: "8101", itemType: 0, name: "Shipment Token", tag: "Transport", tier: 3 }],
        levelRequirements: [{ skill: { name: "Construction" }, level: 1 }],
      },
      {
        id: "craft-route",
        name: "Z Saw Treated Board",
        stationName: "Carpentry Station",
        craftedItemStacks: [{ item_id: "8100", item_type: "item", quantity: 1 }],
        craftedItems: [{ id: "8100", itemType: 0, name: "Treated Board", tag: "Board", tier: 3 }],
        consumedItemStacks: [{ item_id: "8102", item_type: "item", quantity: 2 }],
        consumedItems: [{ id: "8102", itemType: 0, name: "Raw Board", tag: "Board", tier: 3 }],
        levelRequirements: [{ skill: { name: "Carpentry" }, level: 30 }],
      },
    ],
  }]);
  repository.upsertEntityIdentity({ id: "8101", itemType: 0, name: "Shipment Token", tag: "Transport", tier: 3 }, { updatedAt: CATALOG_UPDATED_AT, kind: "items" });
  repository.upsertEntityIdentity({ id: "8102", itemType: 0, name: "Raw Board", tag: "Board", tier: 3 }, { updatedAt: CATALOG_UPDATED_AT, kind: "items" });
  db.prepare("UPDATE game_catalog_recipes SET is_transport_route = 1 WHERE recipe_key = ?").run("items:8100:recipe:transport-route");

  const baseConfig = normalizeCraftPlanConfig({
    enabled: true,
    targets: [{ id: "8100", kind: "items", name: "Treated Board", quantity: 10, itemType: 0 }],
  });
  const { detailsByKey } = collectLocalCatalogCraftPlanDetails(repository, baseConfig.targets, baseConfig.routeOverrides);
  const defaultPlan = computeCraftPlan({ config: baseConfig, detailsByKey });
  assert.equal(defaultPlan.steps[0].selectedRecipeId, "craft-route");
  assert.deepEqual(defaultPlan.steps[0].alternatives.map((recipe) => recipe.id), ["craft-route", "transport-route"]);

  const overrideConfig = normalizeCraftPlanConfig({
    enabled: true,
    targets: [{ id: "8100", kind: "items", name: "Treated Board", quantity: 10, itemType: 0 }],
    routeOverrides: { [recipeKey("items", "8100")]: "transport-route" },
  });
  const overridePlan = computeCraftPlan({ config: overrideConfig, detailsByKey });
  assert.equal(overridePlan.steps[0].selectedRecipeId, "transport-route");
  assert.equal(overridePlan.materials.find((material) => material.name === "Shipment Token")?.required, 1);
  assert.deepEqual(overridePlan.steps[0].alternatives.map((recipe) => recipe.id), ["craft-route", "transport-route"]);
});
test("collectLocalCatalogCraftPlanDetails uses recipe names as legacy route ids for hashed normalized recipes", (t) => {
  const { repository } = createCatalogFixture(t);
  upsertCatalogDetails(repository, [{
    item: { id: "8200", itemType: 0, name: "Legacy Board", tag: "Board", tier: 2 },
    craftingRecipes: [
      {
        name: "A Legacy Board Route",
        stationName: "Carpentry Station",
        craftedItemStacks: [{ item_id: "8200", item_type: "item", quantity: 1 }],
        craftedItems: [{ id: "8200", itemType: 0, name: "Legacy Board", tag: "Board", tier: 2 }],
        consumedItemStacks: [{ item_id: "8201", item_type: "item", quantity: 1 }],
        consumedItems: [{ id: "8201", itemType: 0, name: "A Route Input", tag: "Board", tier: 2 }],
        levelRequirements: [{ skill: { name: "Carpentry" }, level: 20 }],
      },
      {
        name: "Z Legacy Board Route",
        stationName: "Carpentry Station",
        craftedItemStacks: [{ item_id: "8200", item_type: "item", quantity: 1 }],
        craftedItems: [{ id: "8200", itemType: 0, name: "Legacy Board", tag: "Board", tier: 2 }],
        consumedItemStacks: [{ item_id: "8202", item_type: "item", quantity: 2 }],
        consumedItems: [{ id: "8202", itemType: 0, name: "Z Route Input", tag: "Board", tier: 2 }],
        levelRequirements: [{ skill: { name: "Carpentry" }, level: 20 }],
      },
    ],
  }]);
  repository.upsertEntityIdentity({ id: "8201", itemType: 0, name: "A Route Input", tag: "Board", tier: 2 }, { updatedAt: CATALOG_UPDATED_AT, kind: "items" });
  repository.upsertEntityIdentity({ id: "8202", itemType: 0, name: "Z Route Input", tag: "Board", tier: 2 }, { updatedAt: CATALOG_UPDATED_AT, kind: "items" });

  const target = { id: "8200", kind: "items", name: "Legacy Board", quantity: 3, itemType: 0 };
  const { detailsByKey } = collectLocalCatalogCraftPlanDetails(repository, [target], {});
  const detail = detailsByKey.get(recipeKey("items", "8200"));
  const routeIds = detail.craftingRecipes.map((recipe) => recipe.id);
  assert.deepEqual(routeIds, ["A Legacy Board Route", "Z Legacy Board Route"]);

  const nameOverrideConfig = normalizeCraftPlanConfig({
    enabled: true,
    targets: [target],
    routeOverrides: { [recipeKey("items", "8200")]: "Z Legacy Board Route" },
  });
  const nameOverridePlan = computeCraftPlan({ config: nameOverrideConfig, detailsByKey });
  assert.equal(nameOverridePlan.steps[0].selectedRecipeId, "Z Legacy Board Route");
  assert.equal(nameOverridePlan.materials.find((material) => material.name === "Z Route Input")?.required, 6);

  const fullCatalogKey = repository.listProducerRecipesForOutput(recipeKey("items", "8200"))
    .find((recipe) => recipe.name === "Z Legacy Board Route")?.recipeKey;
  const keyOverrideConfig = normalizeCraftPlanConfig({
    enabled: true,
    targets: [target],
    routeOverrides: { [recipeKey("items", "8200")]: fullCatalogKey },
  });
  const keyOverridePlan = computeCraftPlan({ config: keyOverrideConfig, detailsByKey });
  assert.equal(keyOverridePlan.steps[0].selectedRecipeId, "Z Legacy Board Route");
});

test("collectLocalCatalogCraftPlanDetails loads only the selected producer route dependencies", (t) => {
  const { repository } = createCatalogFixture(t);
  upsertCatalogDetails(repository, [
    {
      item: { id: "8300", itemType: 0, name: "Routing Target", tag: "Tool", tier: 3 },
      craftingRecipes: [
        {
          id: "basic-route",
          name: "Basic Route",
          stationName: "Workshop",
          craftedItemStacks: [{ item_id: "8300", item_type: "item", quantity: 1 }],
          craftedItems: [{ id: "8300", itemType: 0, name: "Routing Target", tag: "Tool", tier: 3 }],
          consumedItemStacks: [{ item_id: "8301", item_type: "item", quantity: 1 }],
          consumedItems: [{ id: "8301", itemType: 0, name: "Basic Input", tag: "Part", tier: 3 }],
          levelRequirements: [{ skill: { name: "Smithing" }, level: 30 }],
        },
        {
          id: "deep-route",
          name: "Deep Route",
          stationName: "Workshop",
          craftedItemStacks: [{ item_id: "8300", item_type: "item", quantity: 1 }],
          craftedItems: [{ id: "8300", itemType: 0, name: "Routing Target", tag: "Tool", tier: 3 }],
          consumedItemStacks: [{ item_id: "8302", item_type: "item", quantity: 2 }],
          consumedItems: [{ id: "8302", itemType: 0, name: "Refined Input", tag: "Part", tier: 3 }],
          levelRequirements: [{ skill: { name: "Smithing" }, level: 30 }],
        },
      ],
    },
    {
      item: { id: "8301", itemType: 0, name: "Basic Input", tag: "Part", tier: 3 },
      craftingRecipes: [],
    },
    {
      item: { id: "8302", itemType: 0, name: "Refined Input", tag: "Part", tier: 3 },
      craftingRecipes: [{
        id: "refine-input",
        name: "Refine Input",
        stationName: "Smithing Station",
        craftedItemStacks: [{ item_id: "8302", item_type: "item", quantity: 1 }],
        craftedItems: [{ id: "8302", itemType: 0, name: "Refined Input", tag: "Part", tier: 3 }],
        consumedItemStacks: [{ item_id: "8303", item_type: "item", quantity: 4 }],
        consumedItems: [{ id: "8303", itemType: 0, name: "Deep Ore", tag: "Ore", tier: 3 }],
        levelRequirements: [{ skill: { name: "Mining" }, level: 30 }],
      }],
    },
    {
      item: { id: "8303", itemType: 0, name: "Deep Ore", tag: "Ore", tier: 3 },
      craftingRecipes: [],
    },
  ]);

  const target = { id: "8300", kind: "items", name: "Routing Target", quantity: 2, itemType: 0 };
  const { detailsByKey } = collectLocalCatalogCraftPlanDetails(repository, [target], {});
  assert.equal(detailsByKey.has(recipeKey("items", "8301")), true);
  assert.equal(detailsByKey.has(recipeKey("items", "8302")), false);
  assert.equal(detailsByKey.has(recipeKey("items", "8303")), false);

  const overrideConfig = normalizeCraftPlanConfig({
    enabled: true,
    targets: [target],
    routeOverrides: { [recipeKey("items", "8300")]: "deep-route" },
  });
  const overrideDetails = collectLocalCatalogCraftPlanDetails(repository, [target], overrideConfig.routeOverrides).detailsByKey;
  const overridePlan = computeCraftPlan({ config: overrideConfig, detailsByKey: overrideDetails });
  assert.equal(overridePlan.steps[0].selectedRecipeId, "refine-input");
  assert.equal(overridePlan.steps[1].selectedRecipeId, "deep-route");
  assert.equal(overridePlan.materials.find((material) => material.name === "Deep Ore")?.required, 16);
});

test("collectLocalCatalogCraftPlanDetails does not report depth warnings for unused alternate branches", (t) => {
  const { repository } = createCatalogFixture(t);
  const details = [];
  for (let id = 9000; id <= 9020; id += 1) {
    const nextId = id + 1;
    details.push({
      item: { id: String(id), itemType: 0, name: `Branch ${id}`, tag: "Part", tier: 1 },
      craftingRecipes: id < 9020 ? [{
        id: `route-${id}`,
        name: `Route ${id}`,
        craftedItemStacks: [{ item_id: String(id), item_type: "item", quantity: 1 }],
        craftedItems: [{ id: String(id), itemType: 0, name: `Branch ${id}`, tag: "Part", tier: 1 }],
        consumedItemStacks: [{ item_id: String(nextId), item_type: "item", quantity: 1 }],
        consumedItems: [{ id: String(nextId), itemType: 0, name: `Branch ${nextId}`, tag: "Part", tier: 1 }],
      }] : [],
    });
  }
  details.unshift({
    item: { id: "8999", itemType: 0, name: "Target", tag: "Tool", tier: 1 },
    craftingRecipes: [{
      id: "short-route",
      name: "A Short Route",
      craftedItemStacks: [{ item_id: "8999", item_type: "item", quantity: 1 }],
      craftedItems: [{ id: "8999", itemType: 0, name: "Target", tag: "Tool", tier: 1 }],
      consumedItemStacks: [{ item_id: "9100", item_type: "item", quantity: 1 }],
      consumedItems: [{ id: "9100", itemType: 0, name: "Short Input", tag: "Part", tier: 1 }],
    }, {
      id: "deep-route",
      name: "Z Deep Route",
      craftedItemStacks: [{ item_id: "8999", item_type: "item", quantity: 1 }],
      craftedItems: [{ id: "8999", itemType: 0, name: "Target", tag: "Tool", tier: 1 }],
      consumedItemStacks: [{ item_id: "9000", item_type: "item", quantity: 1 }],
      consumedItems: [{ id: "9000", itemType: 0, name: "Branch 9000", tag: "Part", tier: 1 }],
    }],
  }, { item: { id: "9100", itemType: 0, name: "Short Input", tag: "Part", tier: 1 }, craftingRecipes: [] });
  upsertCatalogDetails(repository, details);

  const result = collectLocalCatalogCraftPlanDetails(repository, [{ id: "8999", kind: "items", name: "Target", quantity: 1, itemType: 0 }], {});
  assert.equal(result.detailsByKey.has(recipeKey("items", "9100")), true);
  assert.equal(result.detailsByKey.has(recipeKey("items", "9000")), false);
  assert.equal(result.warnings.some((warning) => /recursion limit/i.test(warning)), false);
});

test("collectLocalCatalogCraftPlanDetails queries shared completed subgraphs once", (t) => {
  const { repository } = createCatalogFixture(t);
  upsertCatalogDetails(repository, [
    {
      item: { id: "8400", itemType: 0, name: "Shared Target", tag: "Tool", tier: 4 },
      craftingRecipes: [{
        id: "shared-target-route",
        name: "Shared Target Route",
        stationName: "Workshop",
        craftedItemStacks: [{ item_id: "8400", item_type: "item", quantity: 1 }],
        craftedItems: [{ id: "8400", itemType: 0, name: "Shared Target", tag: "Tool", tier: 4 }],
        consumedItemStacks: [
          { item_id: "8401", item_type: "item", quantity: 1 },
          { item_id: "8402", item_type: "item", quantity: 1 },
        ],
        consumedItems: [
          { id: "8401", itemType: 0, name: "Left Part", tag: "Part", tier: 4 },
          { id: "8402", itemType: 0, name: "Right Part", tag: "Part", tier: 4 },
        ],
        levelRequirements: [{ skill: { name: "Smithing" }, level: 40 }],
      }],
    },
    {
      item: { id: "8401", itemType: 0, name: "Left Part", tag: "Part", tier: 4 },
      craftingRecipes: [{
        id: "left-route",
        name: "Left Route",
        craftedItemStacks: [{ item_id: "8401", item_type: "item", quantity: 1 }],
        craftedItems: [{ id: "8401", itemType: 0, name: "Left Part", tag: "Part", tier: 4 }],
        consumedItemStacks: [{ item_id: "8403", item_type: "item", quantity: 2 }],
        consumedItems: [{ id: "8403", itemType: 0, name: "Shared Core", tag: "Core", tier: 4 }],
      }],
    },
    {
      item: { id: "8402", itemType: 0, name: "Right Part", tag: "Part", tier: 4 },
      craftingRecipes: [{
        id: "right-route",
        name: "Right Route",
        craftedItemStacks: [{ item_id: "8402", item_type: "item", quantity: 1 }],
        craftedItems: [{ id: "8402", itemType: 0, name: "Right Part", tag: "Part", tier: 4 }],
        consumedItemStacks: [{ item_id: "8403", item_type: "item", quantity: 3 }],
        consumedItems: [{ id: "8403", itemType: 0, name: "Shared Core", tag: "Core", tier: 4 }],
      }],
    },
    {
      item: { id: "8403", itemType: 0, name: "Shared Core", tag: "Core", tier: 4 },
      craftingRecipes: [],
    },
  ]);

  const calls = new Map();
  const countedRepository = {
    getEntity: (...args) => repository.getEntity(...args),
    listByproductProducersForOutput: (...args) => repository.listByproductProducersForOutput(...args),
    listProducerRecipesForOutput: (key) => {
      calls.set(key, (calls.get(key) ?? 0) + 1);
      return repository.listProducerRecipesForOutput(key);
    },
  };

  collectLocalCatalogCraftPlanDetails(countedRepository, [{ id: "8400", kind: "items", name: "Shared Target", quantity: 1, itemType: 0 }], {});

  assert.equal(calls.get(recipeKey("items", "8403")), 1);
});
