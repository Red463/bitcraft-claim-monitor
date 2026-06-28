import assert from "node:assert/strict";
import test from "node:test";

import { craftProgressKey, hasRecentCraftContribution, productionMetrics } from "../src/pages/production/productionUtils.ts";

test("hasRecentCraftContribution detects contributors active in the current craft window", () => {
  const originalNow = Date.now;
  Date.now = () => new Date("2026-06-28T12:00:00.000Z").getTime();
  try {
    assert.equal(hasRecentCraftContribution([{ lastContributedAt: "2026-06-28T11:59:45.000Z" }]), true);
    assert.equal(hasRecentCraftContribution([{ lastContributedAt: "2026-06-28T12:00:04.000Z" }]), true);
    assert.equal(hasRecentCraftContribution([{ lastContributedAt: "2026-06-28T12:00:06.000Z" }]), false);
    assert.equal(hasRecentCraftContribution([{ lastContributedAt: "2026-06-28T11:59:29.000Z" }]), false);
    assert.equal(hasRecentCraftContribution([{ lastContributedAt: "not-a-date" }]), false);
    assert.equal(hasRecentCraftContribution([]), false);
  } finally {
    Date.now = originalNow;
  }
});
test("craftProgressKey uses stable craft identifiers before recipe fallbacks", () => {
  assert.equal(craftProgressKey({ entityId: "entity-1", id: "id-1" }), "entity-1");
  assert.equal(craftProgressKey({ id: "id-2", craftEntityId: "craft-2" }), "id-2");
  assert.equal(craftProgressKey({ craftEntityId: "craft-3" }), "craft-3");
  assert.equal(craftProgressKey({ buildingName: "Kiln", recipeId: "brick", craftedItem: [{ item_id: 42 }] }), "Kiln:brick:42");
  assert.equal(craftProgressKey({}), "structure::");
});
test("productionMetrics derives craft progress, XP, tier, and display item details", () => {
  const itemLookup = new Map([
    ["42", { id: 42, name: "Brick", tier: "3" }],
  ]);
  const metrics = productionMetrics({
    craftedItem: [{ item_id: 42 }],
    levelRequirements: [{ skill_id: "11" }],
    experiencePerProgress: [
      { skill_id: 7, quantity: 5 },
      { skill_id: 11, quantity: "12" },
    ],
    totalActionsRequired: "10",
    progress: "4",
    tier: 1,
    recipeName: "Fallback Brick",
  }, itemLookup);

  assert.deepEqual(metrics, {
    item: { id: 42, name: "Brick", tier: "3" },
    skillId: 11,
    experiencePerEffort: 12,
    total: 10,
    progress: 4,
    remaining: 6,
    tier: 3,
    totalXp: 120,
    remainingXp: 72,
    completion: 0.4,
    name: "Brick",
  });

  assert.equal(productionMetrics({ progress: 7, totalActionsRequired: 3, recipeName: "Overflow" }, new Map()).remaining, 0);
  assert.equal(productionMetrics({ recipeName: "No Item" }, new Map()).name, "No Item");
});
