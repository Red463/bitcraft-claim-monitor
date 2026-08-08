import assert from "node:assert/strict";
import test from "node:test";

const {
  craftVisibilityEvidence,
  enrichCraftsForPlanning,
  enrichCraftsWithCatalog,
} = await import(
  new URL("../src/server/game-data/craftProjection.ts", import.meta.url).href,
);

test("craft visibility uses exact public marker membership", () => {
  const visibility = craftVisibilityEvidence({
    craftResults: [{ entityId: "1369094287471625781" }],
  });
  const projected = enrichCraftsWithCatalog(
    { craftResults: [
      { entityId: "1369094287471625781", recipeId: "10" },
      { entityId: "1369094286813753789", recipeId: "10" },
    ] },
    () => null,
    () => ({ id: "10", isPassive: false }),
    visibility,
  );
  assert.deepEqual(
    projected.craftResults.map(({ entityId, visibility, isPublic }) => [
      entityId, visibility, isPublic,
    ]),
    [
      ["1369094287471625781", "public", true],
      ["1369094286813753789", "private", false],
    ],
  );
});

test("missing marker readiness produces unknown visibility", () => {
  const projected = enrichCraftsWithCatalog(
    { craftResults: [{ entityId: "100", recipeId: "10" }] },
    () => null,
    () => ({ id: "10", isPassive: false }),
  );
  assert.equal(projected.craftResults[0].visibility, "unknown");
  assert.equal(projected.craftResults[0].isPublic, null);
});

test("unsafe numeric active craft IDs never use public marker membership", () => {
  const roundedEntityId = 9007199254740993;
  const projected = enrichCraftsWithCatalog(
    { craftResults: [{ entityId: roundedEntityId, recipeId: "10" }] },
    () => null,
    () => ({ id: "10", isPassive: false }),
    { ready: true, publicCraftIds: new Set(["9007199254740992"]) },
  );

  assert.equal(projected.craftResults[0].visibility, "unknown");
  assert.equal(projected.craftResults[0].isPublic, null);
});

test("craft projection separates active and passive rows using normalized Relay recipes", () => {
  const entities = new Map([
    ["items:42", {
      catalogKey: "items:42",
      kind: "items",
      targetId: "42",
      name: "Nubi Crop",
      tier: 3,
    }],
    ["cargo:42", {
      catalogKey: "cargo:42",
      kind: "cargo",
      targetId: "42",
      name: "Packed Nubi Crop",
      tier: 3,
    }],
  ]);
  const recipes = new Map([
    ["10", {
      id: "10",
      name: "Pack Nubi Crop",
      isPassive: false,
      levelRequirements: [{ skillId: "5", level: 20 }],
      toolRequirements: [{ toolType: 4, level: 3, power: 25 }],
      experiencePerProgress: [{ skillId: "5", quantity: 2.5 }],
      outputs: [{ kind: "cargo", id: "42", quantity: "1" }],
    }],
    ["20", {
      id: "20",
      name: "Grow Nubi Crop",
      isPassive: true,
      levelRequirements: [],
      toolRequirements: [],
      experiencePerProgress: [],
      outputs: [{ kind: "item", id: "42", quantity: "100" }],
    }],
  ]);
  const projected = enrichCraftsWithCatalog({
    craftResults: [
      {
        entityId: "100",
        recipeId: "10",
        ownerUsername: "Ada",
        buildingName: "Exquisite Loom",
        completed: false,
        craftCount: "9007199254740993",
        progress: "4",
        totalActionsRequired: "10",
        craftedItem: [{ itemId: "42", itemType: "cargo", quantity: "1" }],
      },
      {
        entityId: "200",
        recipeId: "20",
        ownerUsername: "Grace",
        buildingName: "Large Farming Field",
        completed: false,
        craftCount: "2",
        progress: "0",
        totalActionsRequired: "1",
        craftedItem: [{ itemId: "42", itemType: "item", quantity: "100" }],
      },
      {
        entityId: "201",
        recipeId: "20",
        ownerUsername: "Grace",
        buildingName: "Large Farming Field",
        completed: true,
        craftCount: "1",
        progress: "1",
        totalActionsRequired: "1",
        craftedItem: [{ itemId: "42", itemType: "item", quantity: "100" }],
      },
      {
        entityId: "101",
        recipeId: "10",
        ownerUsername: "Ada",
        buildingName: "Exquisite Loom",
        completed: true,
        craftCount: "1",
        progress: "10",
        totalActionsRequired: "10",
        craftedItem: [{ itemId: "42", itemType: "cargo", quantity: "1" }],
      },
    ],
  }, (key) => entities.get(key) ?? null, (id) => recipes.get(id) ?? null);

  assert.equal(projected.craftResults.length, 1);
  assert.equal(projected.craftResults[0].recipeName, "Pack Nubi Crop");
  assert.equal(projected.craftResults[0].craftCount, "9007199254740993");
  assert.equal(projected.catalog["cargo:42"].name, "Packed Nubi Crop");
  assert.equal(projected.catalog["items:42"].name, "Nubi Crop");
  assert.deepEqual(projected.passiveCraftResults.map((row) => ({
    id: row.entityId,
    status: row.status,
    quantity: row.quantity,
  })), [
    { id: "200", status: "processing", quantity: "200" },
    { id: "201", status: "complete", quantity: "100" },
  ]);
});

test("craft projection preserves unknown recipes without misclassifying them as passive", () => {
  const projected = enrichCraftsWithCatalog({
    craftResults: [{
      entityId: "300",
      recipeId: "999",
      completed: false,
      craftCount: "1",
      progress: "0",
      totalActionsRequired: "5",
      craftedItem: [{ itemId: "7", itemType: "item", quantity: "1" }],
    }],
  }, () => null, () => null);

  assert.equal(projected.craftResults.length, 1);
  assert.equal(projected.passiveCraftResults.length, 0);
});

test("passive craft projection groups only identical member, output, structure, and status rows", () => {
  const entities = new Map([
    ["items:42", { id: "42", name: "Iron Ore", tier: 2 }],
    ["cargo:42", { id: "42", name: "Crate of Iron Ore", tier: 3 }],
  ]);
  const projected = enrichCraftsWithCatalog({
    craftResults: [
      { entityId: "1", recipeId: "10", ownerEntityId: "101", ownerUsername: "Ada", buildingEntityId: "501", buildingName: "Mine", completed: false, craftCount: "2", timestamp: "2026-08-08T10:00:00.000Z", craftedItem: [{ itemId: "42", itemType: 0, quantity: "3" }] },
      { entityId: "2", recipeId: "10", ownerEntityId: "101", ownerUsername: "Ada", buildingEntityId: "501", buildingName: "Mine", completed: false, craftCount: "4", timestamp: "2026-08-08T11:00:00.000Z", craftedItem: [{ itemId: "42", itemType: 0, quantity: "3" }] },
      { entityId: "3", recipeId: "10", ownerEntityId: "102", ownerUsername: "Grace", buildingEntityId: "501", buildingName: "Mine", completed: false, craftCount: "1", timestamp: "2026-08-08T09:00:00.000Z", craftedItem: [{ itemId: "42", itemType: 0, quantity: "3" }] },
      { entityId: "4", recipeId: "11", ownerEntityId: "101", ownerUsername: "Ada", buildingEntityId: "501", buildingName: "Mine", completed: false, craftCount: "5", timestamp: "2026-08-08T08:00:00.000Z", craftedItem: [{ itemId: "42", itemType: 1, quantity: "1" }] },
      { entityId: "5", recipeId: "10", ownerEntityId: "101", ownerUsername: "Ada", buildingEntityId: "502", buildingName: "Deep Mine", completed: false, craftCount: "1", timestamp: "2026-08-08T07:00:00.000Z", craftedItem: [{ itemId: "42", itemType: 0, quantity: "3" }] },
      { entityId: "6", recipeId: "10", ownerEntityId: "101", ownerUsername: "Ada", buildingEntityId: "501", buildingName: "Mine", completed: true, craftCount: "1", timestamp: "invalid", craftedItem: [{ itemId: "42", itemType: 0, quantity: "3" }] },
    ],
  }, (key) => entities.get(key) ?? null, (id) => ({ id, name: "Craft {0}", isPassive: true }));

  assert.deepEqual(projected.passiveCraftResults.map((row) => ({
    memberEntityId: row.memberEntityId,
    outputIdentity: row.outputIdentity,
    structureEntityId: row.structureEntityId,
    status: row.status,
    quantity: row.quantity,
    craftCount: row.craftCount,
    timestamp: row.timestamp,
  })), [
    { memberEntityId: "101", outputIdentity: "items:42", structureEntityId: "501", status: "processing", quantity: "18", craftCount: "6", timestamp: "2026-08-08T11:00:00.000Z" },
    { memberEntityId: "102", outputIdentity: "items:42", structureEntityId: "501", status: "processing", quantity: "3", craftCount: "1", timestamp: "2026-08-08T09:00:00.000Z" },
    { memberEntityId: "101", outputIdentity: "cargo:42", structureEntityId: "501", status: "processing", quantity: "5", craftCount: "5", timestamp: "2026-08-08T08:00:00.000Z" },
    { memberEntityId: "101", outputIdentity: "items:42", structureEntityId: "502", status: "processing", quantity: "3", craftCount: "1", timestamp: "2026-08-08T07:00:00.000Z" },
    { memberEntityId: "101", outputIdentity: "items:42", structureEntityId: "501", status: "complete", quantity: "3", craftCount: "1", timestamp: null },
  ]);
});

test("partial passive crafts do not invent typed ids or merge unrelated rows", () => {
  const requestedCatalogKeys = [];
  const projected = enrichCraftsWithCatalog({ craftResults: [
    { entityId: "91", recipeId: "10", ownerUsername: "Unknown", buildingName: "Unknown", completed: false, craftCount: "1", craftedItem: [{ itemId: "42", quantity: "3" }] },
    { entityId: "92", recipeId: "10", ownerUsername: "Unknown", buildingName: "Unknown", completed: false, craftCount: "1", craftedItem: [] },
  ] }, (key) => {
    requestedCatalogKeys.push(key);
    return { id: "42", name: "Wrong inferred item" };
  }, (id) => ({ id, name: "Craft {0}", isPassive: true }));

  assert.equal(projected.passiveCraftResults.length, 2);
  assert.deepEqual(requestedCatalogKeys, []);
  assert.deepEqual(projected.passiveCraftResults.map((row) => ({
    memberEntityId: row.memberEntityId,
    outputIdentity: row.outputIdentity,
    structureEntityId: row.structureEntityId,
  })), [
    { memberEntityId: null, outputIdentity: null, structureEntityId: null },
    { memberEntityId: null, outputIdentity: null, structureEntityId: null },
  ]);
});

test("passive crafts with missing quantities or counts stay partial and out of exact groups", () => {
  const projected = enrichCraftsWithCatalog({ craftResults: [
    { entityId: "101", recipeId: "10", ownerEntityId: "1", buildingEntityId: "2", completed: false, craftCount: "2", craftedItem: [{ itemId: "42", itemType: "item", quantity: "3" }] },
    { entityId: "102", recipeId: "10", ownerEntityId: "1", buildingEntityId: "2", completed: false, craftCount: "2", craftedItem: [{ itemId: "42", itemType: "item" }] },
    { entityId: "103", recipeId: "10", ownerEntityId: "1", buildingEntityId: "2", completed: false, craftedItem: [{ itemId: "42", itemType: "item", quantity: "3" }] },
  ] }, () => ({ id: "42", name: "Iron Ore" }), (id) => ({ id, name: "Craft {0}", isPassive: true }));

  assert.equal(projected.passiveCraftResults.length, 3);
  assert.deepEqual(projected.passiveCraftResults.map((row) => ({
    entityId: row.entityId,
    quantity: row.quantity,
    craftCount: row.craftCount,
  })), [
    { entityId: "101", quantity: "6", craftCount: "2" },
    { entityId: "102", quantity: null, craftCount: "2" },
    { entityId: "103", quantity: null, craftCount: null },
  ]);
});

test("planner craft projection retains complete rows and marks unknown recipe kinds safely", () => {
  const projected = enrichCraftsForPlanning({
    craftResults: [{
      entityId: "complete-passive",
      recipeId: "20",
      completed: true,
      craftCount: "2",
      craftedItem: [{ itemId: "42", itemType: "item", quantity: "3" }],
    }, {
      entityId: "unknown",
      recipeId: "999",
      completed: false,
      craftCount: "1",
      craftedItem: [{ itemId: "7", itemType: "cargo", quantity: "1" }],
    }],
  }, (key) => ({
    catalogKey: key,
    targetId: key.split(":")[1],
    name: key === "items:42" ? "Nubi Crop" : "Unknown Cargo",
  }), (id) => id === "20" ? {
    id: "20",
    name: "Grow Nubi Crop",
    isPassive: true,
  } : null);

  assert.deepEqual(projected.craftResults.map((row) => [
    row.entityId,
    row.completed,
    row.isPassive,
  ]), [
    ["complete-passive", true, true],
    ["unknown", false, null],
  ]);
  assert.equal(projected.catalog["items:42"].name, "Nubi Crop");
  assert.equal(projected.catalog["cargo:7"].name, "Unknown Cargo");
  assert.deepEqual(projected.warnings, [
    "Craft unknown references unavailable recipe 999.",
  ]);
});
