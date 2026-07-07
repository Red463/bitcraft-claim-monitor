import assert from "node:assert/strict";
import test from "node:test";

import {
  computeCraftPlan,
  normalizeCraftPlanConfig,
  recipeKey,
} from "../src/server/craftPlanning.mjs";

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

test("normalizeCraftPlanConfig preserves targets, sources, route overrides, and multipliers", () => {
  const config = normalizeCraftPlanConfig({
    enabled: true,
    targets: [{ id: "900", kind: "items", name: "Fish Oil", quantity: "12", itemType: 0 }],
    sourceRules: {
      storageContainerIds: ["store-1", "", "store-1"],
      playerIds: ["player-1"],
      deployableContainerIds: ["player-1:cart-1"],
    },
    routeOverrides: { [recipeKey("items", "900")]: "lake-route" },
    multipliers: { [recipeKey("items", "200")]: { multiplier: "1.75", note: "Chance drop" } },
  });

  assert.equal(config.enabled, true);
  assert.equal(config.targets[0].quantity, 12);
  assert.deepEqual(config.sourceRules.storageContainerIds, ["store-1"]);
  assert.deepEqual(config.sourceRules.playerIds, ["player-1"]);
  assert.deepEqual(config.sourceRules.deployableContainerIds, ["player-1:cart-1"]);
  assert.equal(config.routeOverrides[recipeKey("items", "900")], "lake-route");
  assert.equal(config.multipliers[recipeKey("items", "200")].multiplier, 1.75);
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
    activeCrafts: [{ id: "craft-1", itemId: "101", kind: "items", quantity: 3, name: "Lake Fish" }],
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
