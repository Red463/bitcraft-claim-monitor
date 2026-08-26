import assert from "node:assert/strict";
import test from "node:test";

const {
  addDecimalQuantities,
  buildCatalogItemDetail,
  enrichInventoryWithCatalog,
  formatDecimalQuantity,
  inventoryStackKey,
  mergeClaimInventoryWithBanks,
} = await import(
  new URL("../src/server/game-data/inventoryProjection.ts", import.meta.url).href,
);

test("claim inventory composition adds live Town Bank containers without duplicating shared storage", () => {
  const shared = {
    claim: { entityId: "1369094286777412590", regionId: "19" },
    dimensions: [{
      dimensionId: "77",
      kind: "Claim",
      buildings: [{ entityId: "100", name: "Chest", inventory: [] }],
    }],
    buildings: [{ entityId: "100", name: "Chest", inventory: [] }],
  };
  const banks = {
    buildings: [
      { entityId: "8001", name: "Town Bank — Ada", inventory: [] },
      { entityId: "100", name: "Impossible duplicate", inventory: [] },
    ],
  };

  assert.deepEqual(mergeClaimInventoryWithBanks(shared, banks), {
    claim: { entityId: "1369094286777412590", regionId: "19" },
    dimensions: [{
      dimensionId: "77",
      kind: "Claim",
      buildings: [{ entityId: "100", name: "Chest", inventory: [] }],
    }],
    buildings: [
      { entityId: "100", name: "Chest", inventory: [] },
      { entityId: "8001", name: "Town Bank — Ada", inventory: [] },
    ],
  });
});

test("inventory catalog enrichment preserves item/cargo collisions and exact quantities", () => {
  const entities = new Map([
    ["items:42", {
      catalogKey: "items:42",
      kind: "items",
      targetId: "42",
      name: "Ancient Timber",
      tier: 4,
    }],
    ["cargo:42", {
      catalogKey: "cargo:42",
      kind: "cargo",
      targetId: "42",
      name: "Ancient Timber Package",
      tier: 4,
    }],
  ]);
  const inventory = enrichInventoryWithCatalog({
    claim: { entityId: "1369094286777412590", regionId: "19" },
    dimensions: [{
      dimensionId: "77",
      kind: "Claim",
      buildings: [{
        entityId: "100",
        name: "Chest",
        nickname: "Materials",
        items: [
          { itemId: "42", itemType: "item", quantity: "9007199254740993" },
          { itemId: "42", itemType: "cargo", quantity: "2" },
        ],
      }],
    }],
    buildings: [],
  }, (key) => entities.get(key) ?? null);

  assert.equal(inventory.catalog["items:42"].name, "Ancient Timber");
  assert.equal(inventory.catalog["cargo:42"].name, "Ancient Timber Package");
  assert.equal(inventoryStackKey({ itemId: "42", itemType: "item" }), "items:42");
  assert.equal(inventoryStackKey({ itemId: "42", itemType: "cargo" }), "cargo:42");
  assert.equal(inventory.dimensions[0].buildings[0].items[0].quantity, "9007199254740993");
});

test("inventory quantity helpers do not round decimal integer strings", () => {
  assert.equal(addDecimalQuantities(["9007199254740993", "7"]), "9007199254741000");
  assert.equal(formatDecimalQuantity("9007199254740993", "en-GB"), "9,007,199,254,740,993");
});

test("catalog item detail is composed from normalized Relay descriptions", () => {
  const detail = buildCatalogItemDetail({
    kind: "item",
    id: "42",
    entity: {
      catalogKey: "items:42",
      kind: "items",
      targetId: "42",
      name: "Timber",
      tier: 2,
    },
    recipes: [
      {
        kind: "crafting_recipe",
        id: "10",
        name: "Saw Timber",
        actionsRequired: 12,
        buildingRequirement: { buildingType: "5", tier: 2 },
        levelRequirements: [{ skillId: "7", level: 10 }],
        inputs: [{ kind: "item", id: "41", quantity: "2" }],
        outputs: [{ kind: "item", id: "42", quantity: "1" }],
      },
      {
        kind: "crafting_recipe",
        id: "11",
        name: "Build Frame",
        actionsRequired: 4,
        buildingRequirement: null,
        levelRequirements: [{ skillId: "7", level: 5 }],
        inputs: [{ kind: "item", id: "42", quantity: "3" }],
        outputs: [{ kind: "cargo", id: "42", quantity: "1" }],
      },
    ],
    skills: [{
      kind: "skill",
      id: "7",
      name: "Carpentry",
    }],
  });

  assert.equal(detail.item.name, "Timber");
  assert.deepEqual(detail.craftingRecipes.map((recipe) => recipe.name), ["Saw Timber"]);
  assert.deepEqual(detail.recipesUsingItem.map((recipe) => recipe.name), ["Build Frame"]);
  assert.deepEqual(detail.relatedSkills, [{ id: "7", name: "Carpentry" }]);
  assert.equal(detail.marketStats, null);
});
