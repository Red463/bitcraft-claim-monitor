import assert from "node:assert/strict";
import test from "node:test";

let projectionModule = null;
try {
  projectionModule = await import(
    new URL("../src/server/game-data/constructionProjection.ts", import.meta.url).href,
  );
} catch {
  // The first TDD run proves the construction projection is absent.
}

test("construction projection joins exact contributions to global recipe requirements", () => {
  assert.ok(projectionModule, "construction projection module must exist");
  const entities = new Map([
    ["items:3090004", {
      name: "Sturdy Rope",
      tier: 3,
      rarity: "Common",
      iconAssetName: "GeneratedIcons/Items/Rope",
    }],
    ["items:29375800", {
      name: "Refined Simple Plank",
      tier: 2,
      rarity: "Epic",
      iconAssetName: "GeneratedIcons/Items/PlankTreated",
    }],
    ["cargo:1202", {
      name: "Sturdy Timber",
      tier: 3,
      rarity: "Common",
      iconAssetName: "GeneratedIcons/Cargo/Timber",
    }],
  ]);
  const descriptions = new Map([
    ["construction_recipe:3023", {
      id: "3023",
      name: "Sturdy Fishing Station",
      actionsRequired: 375,
      buildingDescriptionId: "3032",
      inputs: [
        { kind: "item", id: "3090004", quantity: "5" },
        { kind: "item", id: "29375800", quantity: "1" },
        { kind: "cargo", id: "1202", quantity: "4" },
      ],
    }],
    ["building:3032", {
      id: "3032",
      name: "Sturdy Fishing Station",
      iconAssetName: "GeneratedIcons/Buildings/FishingStation",
    }],
  ]);

  const result = projectionModule.enrichConstructionWithCatalog({
    projects: [{
      entityId: "1369094286786348937",
      constructionRecipeId: "3023",
      ownerId: "1369094286739106500",
      items: [{ itemId: "3090004", itemType: "item", quantity: "5" }],
      cargos: [
        { itemId: "1202", itemType: "cargo", quantity: "1" },
        { itemId: "1202", itemType: "cargo", quantity: "3" },
      ],
      progress: "0",
    }],
  }, (key) => entities.get(key) ?? null, (kind, id) => (
    descriptions.get(`${kind}:${id}`) ?? null
  ));

  assert.deepEqual(result, {
    data: {
      projects: [{
        entityId: "1369094286786348937",
        constructionRecipeId: "3023",
        ownerId: "1369094286739106500",
        items: [{ itemId: "3090004", itemType: "item", quantity: "5" }],
        cargos: [
          { itemId: "1202", itemType: "cargo", quantity: "1" },
          { itemId: "1202", itemType: "cargo", quantity: "3" },
        ],
        progress: "0",
        recipeId: "3023",
        recipeName: "Sturdy Fishing Station",
        name: "Sturdy Fishing Station",
        buildingDescriptionId: "3032",
        buildingName: "Sturdy Fishing Station",
        actionsRequired: "375",
        catalogComplete: true,
        materials: [
          {
            type: "item",
            itemId: "3090004",
            name: "Sturdy Rope",
            required: "5",
            contributed: "5",
            stored: "0",
            tier: 3,
            rarity: "Common",
            iconAssetName: "GeneratedIcons/Items/Rope",
          },
          {
            type: "item",
            itemId: "29375800",
            name: "Refined Simple Plank",
            required: "1",
            contributed: "0",
            stored: "0",
            tier: 2,
            rarity: "Epic",
            iconAssetName: "GeneratedIcons/Items/PlankTreated",
          },
          {
            type: "cargo",
            itemId: "1202",
            name: "Sturdy Timber",
            required: "4",
            contributed: "4",
            stored: "0",
            tier: 3,
            rarity: "Common",
            iconAssetName: "GeneratedIcons/Cargo/Timber",
          },
        ],
      }],
    },
    warnings: [],
  });
});

test("construction projection exposes missing catalog rows instead of inventing requirements", () => {
  assert.ok(projectionModule, "construction projection module must exist");
  const result = projectionModule.enrichConstructionWithCatalog({
    projects: [{
      entityId: "9",
      constructionRecipeId: "404",
      items: [],
      cargos: [],
    }],
  }, () => null, () => null);

  assert.deepEqual(result, {
    data: {
      projects: [{
        entityId: "9",
        constructionRecipeId: "404",
        items: [],
        cargos: [],
        recipeId: "404",
        recipeName: null,
        name: "Construction project #9",
        buildingDescriptionId: null,
        buildingName: null,
        actionsRequired: "0",
        catalogComplete: false,
        materials: [],
      }],
    },
    warnings: ["Construction project 9 is missing global recipe 404."],
  });
});
