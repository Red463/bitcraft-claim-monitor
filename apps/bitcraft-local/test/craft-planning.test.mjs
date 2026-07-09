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
    config: normalizeCraftPlanConfig({ enabled: true, targets: [{ id: "300", kind: "items", name: "Simple Plank", quantity: 10, itemType: 0 }] }),
    detailsByKey: new Map([
      [recipeKey("items", "300"), plankDetail],
      [recipeKey("items", "301"), logDetail],
    ]),
    storageSources: [{ sourceId: "store-1", label: "Carpentry chest", items: [{ id: "300", kind: "items", quantity: 6, name: "Simple Plank" }] }],
    activeCrafts: [{ id: "craft-1", itemId: "300", kind: "items", quantity: 1, name: "Simple Plank" }],
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
  assert.equal(oceanFish.recipeUsages[0].selectedRecipeId, "ocean-route");
  assert.deepEqual(oceanFish.recipeUsages[0].alternatives.map((recipe) => [recipe.id, recipe.label]), [["ocean-route", "Ocean Fish Oil"], ["lake-route", "Lake Fish Oil"]]);
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

test("computeCraftPlan keeps refined materials under their natural profession instead of Scholar", () => {
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
  assert.equal(refinedPlank?.section, "Carpentry");
});
