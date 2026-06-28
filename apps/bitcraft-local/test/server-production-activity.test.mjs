import assert from "node:assert/strict";
import test from "node:test";

import {
  craftDisplayName,
  craftJobKey,
  craftOutputItem,
  normalizeProductionJob,
  normalizeProfessionKey,
  productionMetrics,
} from "../src/server/productionActivity.mjs";

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
    items: [{ id: "2020003", name: "Simple Plank", tier: "2" }],
    cargos: [],
  };

  assert.deepEqual(craftOutputItem(job, craftsPayload), { id: "2020003", name: "Simple Plank", tier: "2" });
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

test("production activity helpers normalize profession keys defensively", () => {
  assert.equal(normalizeProfessionKey("Leather working!"), "leatherworking");
  assert.equal(normalizeProfessionKey(null), "");
});
