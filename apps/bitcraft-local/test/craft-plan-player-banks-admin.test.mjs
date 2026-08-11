import assert from "node:assert/strict";
import test from "node:test";

import { resolveCraftPlanPlayerBanks } from "../src/server/craftPlanPlayerBanksAdmin.mjs";

const members = [{ playerEntityId: "9007199254740993", userName: "Alice" }];

test("player-bank discovery validates the player and settlement membership", async () => {
  assert.deepEqual(await resolveCraftPlanPlayerBanks({ playerId: "", members, loadInventory: async () => ({}) }), {
    status: 400,
    body: { error: "Player ID is required" },
  });
  assert.deepEqual(await resolveCraftPlanPlayerBanks({ playerId: "different", members, loadInventory: async () => ({}) }), {
    status: 404,
    body: { error: "Settlement player not found" },
  });
});

test("player-bank discovery returns normalized stocked and empty banks with warnings", async () => {
  const result = await resolveCraftPlanPlayerBanks({
    playerId: "9007199254740993",
    members,
    trackedBankIds: [],
    loadInventory: async () => ({
      warnings: ["Relay snapshot is stale"],
      data: {
        inventories: [
          {
            id: "9223372036854775806",
            name: "Town Bank",
            claimName: "Northwatch",
            pockets: [{ contents: { item_id: "55", item_type: 0, quantity: 3, name: "Stone" } }],
          },
          { id: "9223372036854775807", name: "Settlement Bank", claimName: "Southwatch", pockets: [] },
        ],
      },
    }),
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body.warnings, ["Relay snapshot is stale"]);
  assert.equal(result.body.playerId, "9007199254740993");
  assert.equal(result.body.playerName, "Alice");
  assert.deepEqual(result.body.banks.map((bank) => ({ sourceId: bank.sourceId, claimName: bank.claimName, itemCount: bank.itemCount })), [
    { sourceId: "9007199254740993:9223372036854775806", claimName: "Northwatch", itemCount: 1 },
    { sourceId: "9007199254740993:9223372036854775807", claimName: "Southwatch", itemCount: 0 },
  ]);
  const item = result.body.banks[0].items[0];
  assert.deepEqual({ id: item.id, kind: item.kind, itemType: item.itemType, quantity: item.quantity }, {
    id: "55", kind: "items", itemType: 0, quantity: 3,
  });
});

test("player-bank discovery converts Relay failures into a 502 response", async () => {
  const result = await resolveCraftPlanPlayerBanks({
    playerId: "9007199254740993",
    members,
    loadInventory: async () => { throw new Error("Relay unavailable"); },
  });
  assert.deepEqual(result, { status: 502, body: { error: "Relay unavailable" } });
});
