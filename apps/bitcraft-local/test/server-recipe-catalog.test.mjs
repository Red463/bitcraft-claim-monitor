import assert from "node:assert/strict";
import test from "node:test";

import {
  recipeCatalogKey,
  recipeKindFromItemType,
  recipeTargetFromDetail,
  recipeTargetFromRow,
} from "../src/server/recipeCatalog.mjs";

test("recipe catalog helpers normalize keys and BitJita item kinds", () => {
  assert.equal(recipeCatalogKey("cargo", " 42 "), "cargo:42");
  assert.equal(recipeCatalogKey("items", " 42 "), "items:42");
  assert.equal(recipeCatalogKey("unknown", " 42 "), "items:42");

  assert.equal(recipeKindFromItemType(1), "cargo");
  assert.equal(recipeKindFromItemType("1"), "cargo");
  assert.equal(recipeKindFromItemType("cargo"), "cargo");
  assert.equal(recipeKindFromItemType(0), "items");
});

test("recipe catalog helpers normalize BitJita detail payloads with fallback metadata", () => {
  assert.deepEqual(recipeTargetFromDetail({
    item: {
      id: "2020003",
      itemType: 0,
      name: "Simple Plank",
      tier: "2",
      rarityStr: "Common",
      tag: "Plank",
      iconAssetName: "plank.png",
    },
  }), {
    id: "2020003",
    kind: "items",
    itemType: 0,
    name: "Simple Plank",
    tier: 2,
    rarity: "Common",
    tag: "Plank",
    iconAssetName: "plank.png",
  });

  assert.deepEqual(recipeTargetFromDetail({ cargo: { id: "900", name: "Timber Package" } }, { tier: 4, rarity: "Rare" }), {
    id: "900",
    kind: "cargo",
    itemType: 1,
    name: "Timber Package",
    tier: 4,
    rarity: "Rare",
    tag: null,
    iconAssetName: null,
  });
});

test("recipe catalog helpers normalize cached recipe catalog rows", () => {
  assert.deepEqual(recipeTargetFromRow({
    target_id: "2020003",
    kind: "items",
    item_type: "0",
    name: "Simple Plank",
    tier: "2",
    rarity: "Common",
    tag: "Plank",
    icon_asset_name: "plank.png",
  }), {
    id: "2020003",
    kind: "items",
    itemType: 0,
    name: "Simple Plank",
    tier: 2,
    rarity: "Common",
    tag: "Plank",
    iconAssetName: "plank.png",
  });
});
