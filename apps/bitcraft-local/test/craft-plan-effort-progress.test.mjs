import assert from "node:assert/strict";
import test from "node:test";

import {
  CRAFT_PLAN_EFFORT_MODEL_VERSION,
  calculateCraftPlanEffortProgress,
  craftingEffortCandidate,
  gatheringEffortCandidate,
  selectLowestEffortWeights,
} from "../src/server/craftPlanEffortProgress.mjs";

test("effort candidates use actions or inverse gathering probability", () => {
  assert.equal(CRAFT_PLAN_EFFORT_MODEL_VERSION, 1);
  assert.equal(craftingEffortCandidate({ catalogKey: "items:oil", sourceKey: "recipe:oil", actionsRequired: 12, outputQuantity: 3, probability: 1 }).effortWeight, 4);
  assert.equal(craftingEffortCandidate({ catalogKey: "items:straw", sourceKey: "recipe:grain", actionsRequired: 8, outputQuantity: 2, probability: 0.5 }).effortWeight, 8);
  assert.equal(gatheringEffortCandidate({ catalogKey: "items:gypsite", sourceKey: "resource:clay", outputQuantity: 1, probability: 0.02 }).effortWeight, 50);
});

test("invalid candidates are rejected and the cheapest verified route wins", () => {
  assert.equal(craftingEffortCandidate({ catalogKey: "items:x", actionsRequired: 0, outputQuantity: 2 }), null);
  assert.equal(craftingEffortCandidate({ catalogKey: "items:x", outputQuantity: 2 }), null);
  assert.equal(gatheringEffortCandidate({ catalogKey: "items:x", outputQuantity: 1, probability: 0 }), null);
  const weights = selectLowestEffortWeights([
    { catalogKey: "items:x", sourceKey: "slow", method: "crafting", effortWeight: 8 },
    { catalogKey: "items:x", sourceKey: "fast", method: "gathering", effortWeight: 3 },
  ]);
  assert.equal(weights.get("items:x").effortWeight, 3);
  assert.equal(weights.get("items:x").sourceKey, "fast");
});

test("progress compares a zero-stock baseline with confirmed live missing effort", () => {
  const baselinePlan = { materials: [
    { key: "items:plank", section: "Carpentry", bufferedRequired: 100, missing: 100 },
    { key: "items:stone", section: "Masonry", bufferedRequired: 10, missing: 10 },
  ], personalViews: { fishing: { tiers: [] } } };
  const currentPlan = { materials: [
    { key: "items:plank", section: "Carpentry", bufferedRequired: 100, missing: 25 },
    { key: "items:stone", section: "Masonry", bufferedRequired: 10, missing: 10 },
  ], personalViews: { fishing: { tiers: [] } } };
  const weights = new Map([["items:plank", { effortWeight: 2 }], ["items:stone", { effortWeight: 10 }]]);
  const result = calculateCraftPlanEffortProgress({ baselinePlan, currentPlan, weights });
  assert.equal(result.sections.Carpentry.completion, 75);
  assert.equal(result.sections.Masonry.completion, 0);
  assert.deepEqual(result.overall, { state: "ready", baselineEffort: 300, remainingEffort: 150, completion: 50 });
});

test("a missing weight disables only its section and overall", () => {
  const baselinePlan = { materials: [
    { key: "items:known", section: "Carpentry", bufferedRequired: 10, missing: 10 },
    { key: "items:unknown", section: "Fishing", bufferedRequired: 5, missing: 5 },
  ], personalViews: { fishing: { tiers: [] } } };
  const currentPlan = { materials: [
    { key: "items:known", section: "Carpentry", bufferedRequired: 10, missing: 0 },
    { key: "items:unknown", section: "Fishing", bufferedRequired: 5, missing: 5 },
  ], personalViews: { fishing: { tiers: [] } } };
  const result = calculateCraftPlanEffortProgress({ baselinePlan, currentPlan, weights: new Map([["items:known", { effortWeight: 2 }]]) });
  assert.equal(result.state, "partial");
  assert.equal(result.sections.Carpentry.completion, 100);
  assert.equal(result.sections.Fishing.state, "unavailable");
  assert.equal(result.overall.state, "unavailable");
  assert.deepEqual(result.coverage.missingWeightKeys, ["items:unknown"]);
});

test("empty plans are complete without requiring catalog weights", () => {
  const result = calculateCraftPlanEffortProgress({ baselinePlan: { materials: [] }, currentPlan: { materials: [] }, weights: new Map() });
  assert.equal(result.state, "empty");
  assert.deepEqual(result.overall, { state: "empty", baselineEffort: 0, remainingEffort: 0, completion: 100 });
});
