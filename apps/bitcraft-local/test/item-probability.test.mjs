import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateGatheringYield,
  normalizeGameDataItemLists,
  normalizeGameDataResources,
  resolveItemListProbabilities,
} from "../src/server/itemProbability.mjs";

function output(outputKey, quantity = 1) {
  const [kind, targetId] = outputKey.split(":");
  return { outputKey, kind, targetId, quantity };
}

test("item-list weights normalize across every possibility including empty outcomes", () => {
  const result = resolveItemListProbabilities([
    {
      itemListId: "berries",
      possibilities: [
        { possibilityIndex: 0, rawWeight: 1, outputs: [output("items:simple")] },
        { possibilityIndex: 1, rawWeight: 0.02, outputs: [output("items:citric")] },
      ],
    },
  ]);

  const list = result.lists.get("berries");
  assert.equal(list.valid, true);
  assert.equal(list.totalWeight, 1.02);
  assert.equal(list.outputs.get("items:simple").chance, 1 / 1.02);
  assert.equal(list.outputs.get("items:simple").expectedQuantity, 1 / 1.02);
  assert.equal(list.outputs.get("items:simple").guaranteedQuantity, 0);
  assert.equal(list.outputs.get("items:citric").chance, 0.02 / 1.02);
});

test("item-list resolution handles grouped items, duplicates, empty outcomes, and nested rolls", () => {
  const result = resolveItemListProbabilities([
    {
      itemListId: "child",
      possibilities: [
        { possibilityIndex: 0, rawWeight: 1, outputs: [output("items:a", 1), output("items:a", 2), output("cargo:b", 4)] },
        { possibilityIndex: 1, rawWeight: 1, outputs: [] },
      ],
    },
    {
      itemListId: "parent",
      possibilities: [
        { possibilityIndex: 0, rawWeight: 1, outputs: [output("items:wrapper", 2)] },
        { possibilityIndex: 1, rawWeight: 1, outputs: [] },
      ],
    },
  ], new Map([["items:wrapper", "child"]]));

  const child = result.lists.get("child");
  assert.deepEqual(child.outputs.get("items:a"), {
    outputKey: "items:a",
    kind: "items",
    targetId: "a",
    expectedQuantity: 1.5,
    chance: 0.5,
    guaranteedQuantity: 0,
  });
  assert.equal(child.outputs.get("cargo:b").expectedQuantity, 2);

  const parent = result.lists.get("parent");
  assert.equal(parent.outputs.get("items:a").expectedQuantity, 1.5);
  assert.equal(parent.outputs.get("items:a").chance, 0.375);
  assert.equal(parent.outputs.get("cargo:b").expectedQuantity, 2);
  assert.equal(parent.outputs.get("cargo:b").chance, 0.375);
});

test("invalid zero-weight and cyclic item lists are unavailable instead of guessed", () => {
  const result = resolveItemListProbabilities([
    { itemListId: "zero", possibilities: [{ possibilityIndex: 0, rawWeight: 0, outputs: [output("items:a")] }] },
    { itemListId: "cycle-a", possibilities: [{ possibilityIndex: 0, rawWeight: 1, outputs: [output("items:cycle-b")] }] },
    { itemListId: "cycle-b", possibilities: [{ possibilityIndex: 0, rawWeight: 1, outputs: [output("items:cycle-a")] }] },
  ], new Map([["items:cycle-a", "cycle-a"], ["items:cycle-b", "cycle-b"]]));

  assert.equal(result.lists.get("zero").valid, false);
  assert.equal(result.lists.get("cycle-a").valid, false);
  assert.match(result.warnings.join("\n"), /zero total weight/i);
  assert.match(result.warnings.join("\n"), /cycle/i);
});

test("GameData normalization preserves raw weights, item/cargo identity, and resource completion yields", () => {
  const lists = normalizeGameDataItemLists([
    {
      id: 7,
      name: "Grouped",
      possibilities: [{ probability: 16_000, items: [
        { item_id: 11, item_type: "Item", quantity: 2 },
        { item_id: 11, item_type: "Item", quantity: 3 },
        { item_id: 11, item_type: "Cargo", quantity: 4 },
      ] }],
    },
  ]);
  assert.equal(lists[0].possibilities[0].rawWeight, 16_000);
  assert.deepEqual(lists[0].possibilities[0].outputs.map((row) => [row.outputKey, row.quantity]), [
    ["items:11", 2],
    ["items:11", 3],
    ["cargo:11", 4],
  ]);

  const resources = normalizeGameDataResources([{ id: 80, name: "Honeyberry Bush", max_health: 595, on_destroy_yield: [
    { item_id: 2130004, item_type: "Item", quantity: 2 },
  ] }]);
  assert.equal(resources[0].maxHealth, 595);
  assert.deepEqual(resources[0].completionOutputs[0], {
    outputKey: "items:2130004",
    kind: "items",
    targetId: "2130004",
    quantity: 2,
    occurrenceRate: 1,
  });
});

test("gathering yield uses occurrence rate per progress and adds full-resource completion output", () => {
  const honeyberry = calculateGatheringYield({
    outputQuantity: 1,
    occurrenceRate: 0.06723,
    listExpectedQuantity: 1 / 1.02,
    listChance: 1 / 1.02,
    resourceHealth: 595,
  });
  assert.equal(honeyberry.expectedPerProgress, 0.06723 / 1.02);
  assert.equal(honeyberry.expectedPerResource, 39.2175);
  assert.equal(honeyberry.probabilityStatus, "expected");

  const sticks = calculateGatheringYield({
    outputQuantity: 1,
    occurrenceRate: 2,
    resourceHealth: 50,
    completionQuantity: 5,
  });
  assert.equal(sticks.expectedPerProgress, 2);
  assert.equal(sticks.expectedPerResource, 105);
  assert.equal(sticks.probabilityStatus, "expected");
});
