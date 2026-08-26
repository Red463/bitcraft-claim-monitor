import assert from "node:assert/strict";
import test from "node:test";

import {
  craftDisplayName,
  craftJobKey,
  craftOutputItem,
  isCompletedProductionJob,
  mergeCurrentCraftRows,
  normalizeProductionJob,
  normalizeProfessionKey,
  productionMetrics,
} from "../src/server/productionActivity.mjs";

test("mergeCurrentCraftRows prefers completed selected-player craft data over public duplicates", () => {
  const publicCraft = {
    entityId: "craft-rough-plank",
    ownerEntityId: "player-1",
    ownerUsername: "Modular",
    completed: false,
    progress: 12000,
  };
  const completedPlayerCraft = {
    ...publicCraft,
    completed: true,
    progress: 24480,
    totalActionsRequired: 24480,
    buildingName: "Exquisite Carpentry Station",
  };

  const merged = mergeCurrentCraftRows([publicCraft], [completedPlayerCraft]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].completed, true);
  assert.equal(merged[0].buildingName, "Exquisite Carpentry Station");
});

test("production activity helpers keep stable craft identity independent of crafter changes", () => {
  const baseJob = {
    claimEntityId: "claim-1",
    buildingEntityId: "station-1",
    recipeName: "Simple Plank",
    craftedItem: [{ item_id: "2020003", item_type: "0" }],
    isPublic: true,
    crafterUsername: "First Crafter",
  };
  const updatedCrafterJob = { ...baseJob, crafterUsername: "Later Crafter", progress: 25 };

  assert.equal(
    craftJobKey(baseJob),
    "craft|claim-1|station-1|simple plank|2020003|0|public",
  );
  assert.equal(craftJobKey(updatedCrafterJob), craftJobKey(baseJob));
  assert.equal(craftJobKey({ entityId: "craft-entity-1" }), "craft-entity-1");
  assert.equal(craftJobKey({ entityId: "", id: " ", craftEntityId: "", claimId: "claim-1", recipeName: "Simple Plank", isPublic: true }), "craft|claim-1|simple plank|public");
});

test("production activity helpers normalize production jobs with catalog item metadata", () => {
  const job = {
    claimEntityId: "claim-1",
    buildingName: "Public Workshop",
    recipeName: "Fallback Plank",
    ownerUsername: "Tester",
    craftedItem: [{ item_id: "2020003", item_type: "0" }],
    levelRequirements: [{ skill_id: "3" }],
    experiencePerProgress: [{ skill_id: "3", quantity: "12" }],
    totalActionsRequired: "10",
    remainingCraftWork: "6",
  };
  const craftsPayload = {
    items: [{ id: "2020003", name: "Simple Plank", tier: "2", itemType: "0", rarityStr: "Common", iconAssetName: "simple_plank.png" }],
    cargos: [],
  };

  assert.deepEqual(craftOutputItem(job, craftsPayload), { id: "2020003", name: "Simple Plank", tier: "2", itemType: "0", rarityStr: "Common", iconAssetName: "simple_plank.png" });
  assert.equal(craftDisplayName(job, craftsPayload), "Simple Plank");
  assert.deepEqual(productionMetrics(job), {
    skillId: 3,
    skillName: "Carpentry",
    professionKey: "carpentry",
    totalEffort: 10,
    remainingEffort: 6,
    progressPct: 40,
    totalXp: 120,
  });

  const normalized = normalizeProductionJob(job, craftsPayload);
  assert.equal(normalized.label, "Simple Plank");
  assert.equal(normalized.tier, 2);
  assert.equal(normalized.buildingName, "Public Workshop");
  assert.equal(normalized.crafterName, "Tester");
  assert.equal(normalized.totalXp, 120);
  assert.equal(normalized.raw, job);
});

test("production activity helpers preserve stored normalized item metadata without a fresh catalog", () => {
  const stored = {
    key: "craft|claim-1|station-1|simple plank|2020003|0|public",
    label: "Simple Plank",
    itemId: "2020003",
    itemType: "0",
    itemName: "Simple Plank",
    tier: 2,
    rarity: "Common",
    iconAssetName: "simple_plank.png",
    buildingName: "Public Workshop",
    crafterName: "Tester",
    raw: { entityId: "craft-1" },
  };

  const normalized = normalizeProductionJob(stored);

  assert.equal(normalized.label, "Simple Plank");
  assert.equal(normalized.itemId, "2020003");
  assert.equal(normalized.itemType, "0");
  assert.equal(normalized.itemName, "Simple Plank");
  assert.equal(normalized.tier, 2);
  assert.equal(normalized.rarity, "Common");
  assert.equal(normalized.iconAssetName, "simple_plank.png");
  assert.equal(normalized.buildingName, "Public Workshop");
  assert.equal(normalized.crafterName, "Tester");
});
test("production metrics resolve normalized camel-case Relay skill ids", () => {
  assert.deepEqual(productionMetrics({
    levelRequirements: [{ skillId: "10" }],
    experiencePerProgress: [{ skillId: "10", quantity: "2.5" }],
    totalActionsRequired: "4",
  }), {
    skillId: 10,
    skillName: "Tailoring",
    professionKey: "tailoring",
    totalEffort: 4,
    remainingEffort: 4,
    progressPct: 0,
    totalXp: 10,
  });
});
test("production metrics prefer the confirmed skill catalog over a provider Unknown label", () => {
  assert.equal(productionMetrics({
    levelRequirements: [{ skillId: "3", skillName: "Unknown" }],
    experiencePerProgress: [{ skillId: "3", quantity: "2" }],
  }).skillName, "Carpentry");
});
test("production activity helpers identify jobs that are already complete", () => {
  assert.equal(isCompletedProductionJob({ totalActionsRequired: 100, progress: 100 }), true);
  assert.equal(isCompletedProductionJob({ totalActionsRequired: 100, remainingCraftWork: 0 }), true);
  assert.equal(isCompletedProductionJob({ progressPct: 100 }), true);
  assert.equal(isCompletedProductionJob({ totalEffort: 100, remainingEffort: 0, progressPct: 100 }), true);
  assert.equal(isCompletedProductionJob({ status: "complete" }), true);
  assert.equal(isCompletedProductionJob({ status: "ready_to_collect" }), true);
  assert.equal(isCompletedProductionJob({ totalActionsRequired: 100, progress: 99 }), false);
  assert.equal(isCompletedProductionJob({ totalActionsRequired: 100, remainingCraftWork: 1 }), false);
});
test("production activity helpers normalize profession keys defensively", () => {
  assert.equal(normalizeProfessionKey("Leather working!"), "leatherworking");
  assert.equal(normalizeProfessionKey(null), "");
});
