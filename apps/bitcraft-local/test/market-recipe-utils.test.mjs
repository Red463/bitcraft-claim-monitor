import assert from "node:assert/strict";
import test from "node:test";

import { normalizeBuyOrder, sortBuyOrdersByBestPrice } from "../src/utils/marketOrders.ts";
import { buildRecipePlan, recipeKey } from "../src/utils/recipeTree.ts";

test("normalizeBuyOrder parses BitJita string numbers and totals", () => {
  const order = normalizeBuyOrder({
    entityId: "order-1",
    itemId: 1020003,
    itemType: 0,
    priceThreshold: "12",
    quantity: "8",
    storedCoins: "96",
    createdAt: "2026-06-08 10:00:41.470432+00",
    claimName: "Jaruudsalem",
    ownerUsername: "TomSalmon",
    regionId: 12,
    regionName: "Elyndor",
  });
  assert.equal(order.unitPrice, 12);
  assert.equal(order.quantity, 8);
  assert.equal(order.totalValue, 96);
  assert.equal(order.claimName, "Jaruudsalem");
  assert.equal(order.ownerUsername, "TomSalmon");
});

test("sortBuyOrdersByBestPrice prioritizes best unit price then quantity", () => {
  const orders = [
    normalizeBuyOrder({ entityId: "a", priceThreshold: "5", quantity: "100" }),
    normalizeBuyOrder({ entityId: "b", priceThreshold: "7", quantity: "2" }),
    normalizeBuyOrder({ entityId: "c", priceThreshold: "7", quantity: "5" }),
  ];
  assert.deepEqual(sortBuyOrdersByBestPrice(orders).map((order) => order.id), ["c", "b", "a"]);
});

test("buildRecipePlan recursively rolls up raw materials using output quantities", () => {
  const target = { id: "plank", kind: "items", itemType: 0, name: "Sturdy Plank" };
  const details = new Map([
    [recipeKey("items", "plank"), {
      item: { id: "plank", name: "Sturdy Plank", itemType: 0 },
      craftingRecipes: [{
        id: "plank-recipe",
        name: "Treat Sturdy Stripped Wood Into Sturdy Plank",
        buildingName: "Sturdy Carpentry Station",
        buildingTier: 3,
        consumedItemStacks: [
          { item_id: "stripped", item_type: "item", quantity: 2 },
          { item_id: "sandpaper", item_type: "item", quantity: 1 },
        ],
        consumedItems: [
          { id: "stripped", name: "Sturdy Stripped Wood", itemType: 0 },
          { id: "sandpaper", name: "Woodworking Sandpaper", itemType: 0 },
        ],
        craftedItemStacks: [{ item_id: "plank", item_type: "item", quantity: 1 }],
      }],
    }],
    [recipeKey("items", "stripped"), {
      item: { id: "stripped", name: "Sturdy Stripped Wood", itemType: 0 },
      craftingRecipes: [{
        id: "strip-recipe",
        name: "Saw Sturdy Log",
        buildingName: "Sturdy Carpentry Station",
        buildingTier: 3,
        consumedItemStacks: [{ item_id: "log", item_type: "item", quantity: 3 }],
        consumedItems: [{ id: "log", name: "Sturdy Wood Log", itemType: 0 }],
        craftedItemStacks: [{ item_id: "stripped", item_type: "item", quantity: 1 }],
      }],
    }],
    [recipeKey("items", "log"), {
      item: { id: "log", name: "Sturdy Wood Log", itemType: 0 },
      craftingRecipes: [],
      extractionRecipes: [],
    }],
  ]);

  const plan = buildRecipePlan(target, 2, details);
  assert.equal(plan.steps.length, 2);
  assert.deepEqual(plan.directMaterials.map((material) => [material.name, material.quantity]), [
    ["Sturdy Stripped Wood", 4],
    ["Woodworking Sandpaper", 2],
  ]);
  assert.deepEqual(plan.rawMaterials.map((material) => [material.name, material.quantity]), [
    ["Sturdy Wood Log", 12],
    ["Woodworking Sandpaper", 2],
  ]);
  assert.equal(plan.steps[0].output.name, "Sturdy Stripped Wood");
  assert.equal(plan.steps[1].output.name, "Sturdy Plank");
});

test("buildRecipePlan honors selected alternate recipes", () => {
  const target = { id: "plank", kind: "items", itemType: 0, name: "Simple Plank" };
  const details = new Map([
    [recipeKey("items", "plank"), {
      item: { id: "plank", name: "Simple Plank", itemType: 0 },
      craftingRecipes: [
        {
          id: "default-route",
          name: "Make Plank From Logs",
          consumedItemStacks: [{ item_id: "log", item_type: "item", quantity: 4 }],
          consumedItems: [{ id: "log", name: "Simple Log", itemType: 0 }],
          craftedItemStacks: [{ item_id: "plank", item_type: "item", quantity: 1 }],
        },
        {
          id: "alternate-route",
          name: "Make Plank From Boards",
          consumedItemStacks: [{ item_id: "board", item_type: "item", quantity: 2 }],
          consumedItems: [{ id: "board", name: "Simple Board", itemType: 0 }],
          craftedItemStacks: [{ item_id: "plank", item_type: "item", quantity: 1 }],
        },
      ],
    }],
  ]);

  const plan = buildRecipePlan(target, 3, details, 14, { [recipeKey("items", "plank")]: "alternate-route" });
  assert.deepEqual(plan.directMaterials.map((material) => [material.name, material.quantity]), [["Simple Board", 6]]);
  assert.deepEqual(plan.rawMaterials.map((material) => [material.name, material.quantity]), [["Simple Board", 6]]);
  assert.equal(plan.steps[0].recipeName, "Make Plank From Boards");
});
