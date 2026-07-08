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
  assert.equal(result.deployableOptions.some((source) => source.sourceId === "player-1:cart" && source.label === "Cart"), true);
  const cache = result.deployableOptions.find((source) => source.sourceId === "player-1:personal-cache-1");
  assert.equal(cache?.label, "Personal Cache (III)");
  assert.equal(cache?.playerName, "Modular");
  assert.equal(cache?.containerKind, "Personal Cache");
  assert.equal(cache?.items[0].name, "Fine Plank");
  assert.equal(result.deployableOptions.some((source) => /Town Bank/.test(source.label)), false);
});

test("playerInventoryContainerSources applies deployable allow-list only to counted sources", () => {
  const result = playerInventoryContainerSources("player-1", "Modular", {
    inventories: [
      { entityId: "cart-1", inventoryName: "Cart", pockets: [{ contents: { itemId: 1, itemType: 0, quantity: 1 } }] },
      { entityId: "stash-1", inventoryName: "Personal Stash", pockets: [{ contents: { itemId: 2, itemType: 0, quantity: 1 } }] },
    ],
  }, ["player-1:stash-1"]);

  assert.deepEqual(result.deployableOptions.map((source) => source.sourceId), ["player-1:cart", "player-1:stash-1"]);
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
test("playerInventoryContainerSources uses one stable cart source id for carts and wagons", () => {
  const cartResult = playerInventoryContainerSources("player-1", "Modular", {
    inventories: [
      { entityId: "cart-iii", inventoryName: "Modular's Cart (III)", pockets: [{ contents: { itemId: 1, itemType: 0, quantity: 1 } }] },
    ],
  }, ["player-1:cart"]);
  const wagonResult = playerInventoryContainerSources("player-1", "Modular", {
    inventories: [
      { entityId: "wagon-i", inventoryName: "Modular's Wagon (I)", pockets: [{ contents: { itemId: 1, itemType: 0, quantity: 1 } }] },
    ],
  }, ["player-1:cart"]);

  assert.equal(cartResult.deployableOptions[0].sourceId, "player-1:cart");
  assert.equal(cartResult.deployables[0].sourceId, "player-1:cart");
  assert.equal(cartResult.deployableOptions[0].label, "Cart");
  assert.equal(wagonResult.deployableOptions[0].sourceId, "player-1:cart");
  assert.equal(wagonResult.deployables[0].sourceId, "player-1:cart");
  assert.equal(wagonResult.deployableOptions[0].label, "Cart");
});
test("playerInventoryContainerSources exposes a selectable cart source even when none is deployed", () => {
  const result = playerInventoryContainerSources("player-1", "Modular", {
    inventories: [
      { entityId: "player-inventory", inventoryName: "Inventory", pockets: [{ contents: { itemId: 1, itemType: 0, quantity: 1 } }] },
    ],
  }, ["player-1:cart"]);

  const option = result.deployableOptions.find((source) => source.sourceId === "player-1:cart");
  assert.equal(option?.label, "Cart");
  assert.equal(option?.itemCount, 0);
  assert.equal(result.deployables.find((source) => source.sourceId === "player-1:cart")?.items.length, 0);
});
