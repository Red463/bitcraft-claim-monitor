import assert from "node:assert/strict";
import test from "node:test";

import { playerInventoryContainerSources, sourceItemFromContents, trackedCraftPlanOutputs } from "../src/server/craftPlanSources.mjs";

test("trackedCraftPlanOutputs expands farming product possibilities into expected Needs Board outputs", () => {
  const payload = {
    craftResults: [{
      entityId: "craft-wispweave",
      ownerEntityId: "player-oddfawn",
      ownerUsername: "Oddfawn",
      buildingName: "Exquisite Farming Station",
      craftCount: 506,
      completed: false,
      craftedItem: [{ item_id: 3220023, quantity: 1, item_type: "item" }],
    }],
    items: [{ id: 3220023, name: "Infused Wispweave Products", tier: 3, tag: "Wispweave Output" }],
  };
  const detailsByKey = new Map([["items:3220023", {
    item: payload.items[0],
    itemListPossibilities: [
      { targetId: "3100017", targetItem: { id: "3100017", name: "Sturdy Wispweave Filament", tier: 3, tag: "Filament" }, quantity: 3, chance: 0.2 },
      { targetId: "3100017", targetItem: { id: "3100017", name: "Sturdy Wispweave Filament", tier: 3, tag: "Filament" }, quantity: 4, chance: 0.2 },
      { targetId: "3100017", targetItem: { id: "3100017", name: "Sturdy Wispweave Filament", tier: 3, tag: "Filament" }, quantity: 5, chance: 0.2 },
      { targetId: "3100017", targetItem: { id: "3100017", name: "Sturdy Wispweave Filament", tier: 3, tag: "Filament" }, quantity: 6, chance: 0.2 },
      { targetId: "3100017", targetItem: { id: "3100017", name: "Sturdy Wispweave Filament", tier: 3, tag: "Filament" }, quantity: 7, chance: 0.2 },
    ],
  }]]);

  const outputs = trackedCraftPlanOutputs([payload], detailsByKey);
  const filament = outputs.find((output) => output.itemId === "3100017");

  assert.equal(filament?.quantity, 2530);
  assert.equal(filament?.guaranteedQuantity, 1518);
  assert.equal(filament?.playerName, "Oddfawn");
  assert.equal(filament?.buildingName, "Exquisite Farming Station");
  assert.equal(filament?.status, "In progress");
});

test("trackedCraftPlanOutputs preserves ordinary direct craft outputs", () => {
  const payload = {
    craftResults: [{
      entityId: "craft-plank",
      ownerEntityId: "player-modular",
      ownerUsername: "Modular",
      buildingName: "Exquisite Carpentry Station",
      craftCount: 612,
      completed: true,
      craftedItem: [{ item_id: 1020003, quantity: 1, item_type: "item" }],
    }],
    items: [{ id: 1020003, name: "Rough Plank", tier: 1, tag: "Plank" }],
  };

  const outputs = trackedCraftPlanOutputs([payload], new Map());

  assert.equal(outputs.length, 1);
  assert.equal(outputs[0].itemId, "1020003");
  assert.equal(outputs[0].quantity, 612);
  assert.equal(outputs[0].guaranteedQuantity, 612);
  assert.equal(outputs[0].status, "Ready to collect");
});

test("trackedCraftPlanOutputs keeps expected output without guaranteeing a partial distribution", () => {
  const payload = {
    craftResults: [{
      entityId: "craft-fish-products",
      ownerEntityId: "player-fisher",
      craftCount: 2,
      craftedItem: [{ item_id: 1903, quantity: 1, item_type: "item" }],
    }],
    items: [{ id: 1903, name: "Ocean Fish Products", tier: 1, tag: "Fish Products" }],
  };
  const detailsByKey = new Map([["items:1903", {
    item: payload.items[0],
    itemListPossibilities: [{
      targetId: "1900",
      targetItem: { id: "1900", name: "Basic Fish Oil", tier: 1, tag: "Fish Oil" },
      quantity: 4,
      chance: 0.5,
    }],
  }]]);

  const oil = trackedCraftPlanOutputs([payload], detailsByKey).find((output) => output.itemId === "1900");

  assert.equal(oil?.quantity, 4);
  assert.equal(oil?.guaranteedQuantity, 0);
});

test("trackedCraftPlanOutputs estimates Straw from active Embergrain processing", () => {
  const payload = {
    craftResults: [{
      entityId: "craft-embergrain",
      ownerEntityId: "player-farmer",
      ownerUsername: "Farmer",
      buildingName: "Basic Farming Station",
      craftCount: 10,
      craftedItem: [{ item_id: 3200001, quantity: 1, item_type: "item" }],
    }],
    items: [{ id: 3200001, name: "Basic Embergrain Products", tier: 1, tag: "Grain Output" }],
  };
  const detailsByKey = new Map([["items:3200001", {
    item: payload.items[0],
    itemListPossibilities: [{
      targetId: "straw",
      targetItem: { id: "straw", name: "Rough Straw", tier: 1, tag: "Straw" },
      quantity: 0.2,
      chance: 1,
      guaranteedQuantity: 0,
    }],
  }]]);

  const straw = trackedCraftPlanOutputs([payload], detailsByKey).find((output) => output.itemId === "straw");

  assert.equal(straw?.quantity, 2);
  assert.equal(straw?.guaranteedQuantity, 0);
  assert.equal(straw?.buildingName, "Basic Farming Station");
});

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
  assert.equal(result.inventory.playerName, "Modular");
  assert.equal(result.inventory.label, "Modular inventory");
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

test("sourceItemFromContents uses BitJita itemType to distinguish items and cargo", () => {
  const item = sourceItemFromContents({ itemId: 5130004, itemType: 0, quantity: 12 });
  const cargo = sourceItemFromContents({ itemId: 3100001, itemType: 1, quantity: 34 });

  assert.equal(item?.kind, "items");
  assert.equal(item?.itemType, 0);
  assert.equal(item?.name, "Item #5130004");
  assert.equal(cargo?.kind, "cargo");
  assert.equal(cargo?.itemType, 1);
  assert.equal(cargo?.name, "Cargo #3100001");
});
