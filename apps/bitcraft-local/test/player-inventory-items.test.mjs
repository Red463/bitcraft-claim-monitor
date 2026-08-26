import assert from "node:assert/strict";
import test from "node:test";

const { playerInventoryItems, playerToolbeltTools } = await import(
  new URL("../src/utils/items.ts", import.meta.url).href,
);

test("player inventory UI projection preserves exact Relay quantities", () => {
  const items = playerInventoryItems({
    items: {
      "42": { id: "42", name: "Fine Pickaxe", tag: "Tool" },
    },
    inventories: [{
      inventoryName: "Toolbelt",
      pockets: [{
        contents: {
          itemId: "42",
          itemType: "item",
          quantity: "18446744073709551615",
        },
      }],
    }],
  }, "Toolbelt");

  assert.equal(items[0].quantity, "18446744073709551615");
});

test("Toolbelt projection recognizes typed Relay tools without relying on item tag wording", () => {
  const tools = playerToolbeltTools({
    items: {
      "7": { id: "7", name: "Steel Axe", tag: "Equipment", toolType: 4 },
    },
    inventories: [{
      inventoryName: "Toolbelt",
      pockets: [{ contents: { itemId: "7", itemType: "item", quantity: "1" } }],
    }],
  });

  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, "Steel Axe");
});
