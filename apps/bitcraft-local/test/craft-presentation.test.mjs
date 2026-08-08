import assert from "node:assert/strict";
import test from "node:test";

let presentationModule = null;
try {
  presentationModule = await import("../src/pages/production/craftPresentation.ts");
} catch {
  // The focused red run proves the shared presentation projection is absent.
}

const payload = {
  catalog: {
    "items:42": { id: "42", name: "Iron Ore", tier: 2, iconAssetName: "iron-ore.png" },
    "cargo:42": { id: "42", name: "Crate of Iron Ore", tier: 3, iconAssetName: "iron-cargo.png" },
  },
};

test("craft presentation replaces recipe output placeholders with the compound item identity", () => {
  assert.ok(presentationModule, "expected the shared craft presentation projection");
  const projected = presentationModule.projectCraftPresentation({
    recipeName: "Smelt {0}",
    craftedItem: [{ itemId: "42", itemType: 0, quantity: "1" }],
  }, payload);

  assert.deepEqual(projected, {
    outputIdentity: "items:42",
    outputItemType: "item",
    outputItemId: "42",
    outputName: "Iron Ore",
    recipeName: "Smelt Iron Ore",
    displayName: "Iron Ore",
    iconAssetName: "iron-ore.png",
    item: payload.catalog["items:42"],
  });
});

test("craft presentation replaces any numbered Relay output placeholder", () => {
  assert.ok(presentationModule, "expected the shared craft presentation projection");
  const projected = presentationModule.projectCraftPresentation({
    recipeName: "Tan {1}",
    craftedItem: [{ itemId: "42", itemType: 0, quantity: "1" }],
  }, payload);

  assert.equal(projected.recipeName, "Tan Iron Ore");
  assert.doesNotMatch(projected.recipeName, /\{\d+\}/);
});

test("craft presentation never collides cargo and item rows with the same numeric id", () => {
  assert.ok(presentationModule, "expected the shared craft presentation projection");
  const item = presentationModule.projectCraftPresentation({
    recipeName: "Craft {0}",
    craftedItem: [{ itemId: "42", itemType: "item" }],
  }, payload);
  const cargo = presentationModule.projectCraftPresentation({
    recipeName: "Pack {0}",
    craftedItem: [{ itemId: "42", itemType: 1 }],
  }, payload);

  assert.equal(item.outputName, "Iron Ore");
  assert.equal(cargo.outputName, "Crate of Iron Ore");
  assert.equal(cargo.outputIdentity, "cargo:42");
  assert.equal(cargo.recipeName, "Pack Crate of Iron Ore");
  assert.equal(cargo.iconAssetName, "iron-cargo.png");
});

test("craft presentation keeps partial output data explicit without throwing during render", () => {
  assert.ok(presentationModule, "expected the shared craft presentation projection");
  assert.deepEqual(presentationModule.projectCraftPresentation({
    recipeName: "Craft {0}",
    craftedItem: [],
  }, payload), {
    outputIdentity: null,
    outputItemType: null,
    outputItemId: null,
    outputName: "crafted item",
    recipeName: "Craft crafted item",
    displayName: "crafted item",
    iconAssetName: null,
    item: { name: "crafted item", tier: null, iconAssetName: null },
  });
});

test("craft presentation does not infer item catalog identity when item type is missing", () => {
  assert.ok(presentationModule, "expected the shared craft presentation projection");
  const projected = presentationModule.projectCraftPresentation({
    recipeName: "Craft {0}",
    outputName: "Wrong output name",
    itemName: "Wrong item name",
    tier: 9,
    itemTier: 8,
    craftedItem: [{ itemId: "42", quantity: "3" }],
  }, payload);

  assert.equal(projected.outputIdentity, null);
  assert.equal(projected.outputItemType, null);
  assert.equal(projected.outputItemId, null);
  assert.equal(projected.outputName, "crafted item");
  assert.equal(projected.item.name, "crafted item");
  assert.equal(projected.item.tier, null);
  assert.notEqual(projected.item, payload.catalog["items:42"]);
});
