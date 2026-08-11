import assert from "node:assert/strict";
import test from "node:test";

import { buildCraftPlanBankGroups, finalizeLegacyBankMigrations, initiallyExpandedBankPlayerIds, mergeLegacyBankDiscovery, runBankDiscoveryQueue } from "../src/pages/craftPlanBankSelection.mjs";

test("legacy bank discovery selects only currently non-empty banks", () => {
  const result = mergeLegacyBankDiscovery({
    bankPlayerIds: ["player-1"],
    bankContainerIds: ["player-2:bank-old"],
  }, "player-1", [
    { sourceId: "player-1:bank-stocked", itemCount: 2 },
    { sourceId: "player-1:bank-empty", itemCount: 0 },
  ]);

  assert.deepEqual(result.bankPlayerIds, ["player-1"]);
  assert.deepEqual(result.bankContainerIds, ["player-2:bank-old", "player-1:bank-stocked"]);
});

test("successful zero-bank migrations clear legacy mode while failed players remain protected", () => {
  const result = finalizeLegacyBankMigrations({
    bankPlayerIds: ["player-empty", "player-failed"],
    bankContainerIds: [],
  }, ["player-empty"]);

  assert.deepEqual(result.bankPlayerIds, ["player-failed"]);
  assert.deepEqual(result.bankContainerIds, []);
});

test("bank groups hide untracked empty banks and sort tracked groups first", () => {
  const groups = buildCraftPlanBankGroups({
    players: [{ playerId: "player-1", label: "Alice" }, { playerId: "player-2", label: "Bob" }],
    bankLoads: {
      "player-1": { status: "loaded", banks: [{ sourceId: "player-1:stocked", label: "Northwatch", itemCount: 2 }, { sourceId: "player-1:empty", label: "Empty", itemCount: 0 }] },
      "player-2": { status: "loaded", banks: [{ sourceId: "player-2:missing", label: "Missing", itemCount: 0, unavailable: true }] },
    },
    trackedBankIds: ["player-2:missing"],
    search: "",
    trackedOnly: false,
  });

  assert.deepEqual(groups.map((group) => [group.playerName, group.visibleBanks.map((bank) => bank.sourceId)]), [
    ["Bob", ["player-2:missing"]],
    ["Alice", ["player-1:stocked"]],
  ]);
  assert.deepEqual(buildCraftPlanBankGroups({
    players: [{ playerId: "player-1", label: "Alice" }],
    bankLoads: { "player-1": { status: "loaded", banks: [{ sourceId: "player-1:stocked", label: "Northwatch", itemCount: 2 }] } },
    trackedBankIds: [],
    search: "north",
    trackedOnly: true,
  }), []);
});

test("only legacy or exact-tracked players begin expanded", () => {
  assert.deepEqual(initiallyExpandedBankPlayerIds({
    bankPlayerIds: ["player-1"],
    bankContainerIds: ["player-2:bank-a"],
  }), ["player-1", "player-2"]);
});

test("bank discovery queue never exceeds its concurrency", async () => {
  let active = 0;
  let maximumActive = 0;
  const completed = [];
  await runBankDiscoveryQueue([1, 2, 3, 4, 5], async (value) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setImmediate(resolve));
    completed.push(value);
    active -= 1;
  }, 3);

  assert.equal(maximumActive, 3);
  assert.deepEqual(completed.slice().sort(), [1, 2, 3, 4, 5]);
});
