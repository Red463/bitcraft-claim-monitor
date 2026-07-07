import assert from "node:assert/strict";
import test from "node:test";

import { playerInventoryContainerSources } from "../src/server/craftPlanSources.mjs";

test("playerInventoryContainerSources reads wrapped BitJita inventories and separates player storage", () => {
  const result = playerInventoryContainerSources("player-1", "Modular", {
    data: {
      items: [
        { id: "100", name: "Simple Wood Log", tier: 1 },
        { id: "200", name: "Fine Plank", tier: 4 },
        { id: "300", name: "Honey", tier: 1 },
      ],
      inventories: [
        {
          entityId: "player-inventory",
          inventoryName: "Inventory",
          pockets: [{ contents: { itemId: 100, itemType: 0, quantity: 5 } }],
        },
        {
          entityId: "personal-cache-1",
          playerOwnerEntityId: "player-1",
          inventoryName: "Modular's Personal Cache (III)",
          pockets: [{ contents: { itemId: 200, itemType: 0, quantity: 12 } }],
        },
        {
          entityId: "town-bank-1",
          playerOwnerEntityId: "player-1",
          inventoryName: "Town Bank",
          claimName: "Timbersteel Trade",
          pockets: [{ contents: { itemId: 300, itemType: 0, quantity: 99 } }],
        },
      ],
    },
  });

  assert.deepEqual(result.inventory.items.map((item) => item.name), ["Simple Wood Log"]);
  assert.equal(result.deployableOptions.length, 2);
  assert.equal(result.deployableOptions[0].sourceId, "player-1:personal-cache-1");
  assert.equal(result.deployableOptions[0].label, "Modular - Modular's Personal Cache (III)");
  assert.equal(result.deployableOptions[0].items[0].name, "Fine Plank");
  assert.equal(result.deployableOptions[1].label, "Modular - Town Bank (Timbersteel Trade)");
});

test("playerInventoryContainerSources applies deployable allow-list only to counted sources", () => {
  const result = playerInventoryContainerSources("player-1", "Modular", {
    inventories: [
      { entityId: "cart-1", inventoryName: "Cart", pockets: [{ contents: { itemId: 1, itemType: 0, quantity: 1 } }] },
      { entityId: "stash-1", inventoryName: "Personal Stash", pockets: [{ contents: { itemId: 2, itemType: 0, quantity: 1 } }] },
    ],
  }, ["player-1:stash-1"]);

  assert.deepEqual(result.deployableOptions.map((source) => source.sourceId), ["player-1:cart-1", "player-1:stash-1"]);
  assert.deepEqual(result.deployables.map((source) => source.sourceId), ["player-1:stash-1"]);
});

test("craft plan source lookup ignores non-array catalog wrappers", () => {
  const result = playerInventoryContainerSources("player-1", "Modular", {
    items: { rows: [] },
    data: { items: { rows: [] }, inventories: [{ entityId: "player-inventory", inventoryName: "Inventory", pockets: [{ contents: { itemId: 999, itemType: 0, quantity: 3 } }] }] },
  });

  assert.equal(result.inventory.items[0].name, "Item #999");
  assert.equal(result.inventory.items[0].quantity, 3);
});
