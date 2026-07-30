import assert from "node:assert/strict";
import test from "node:test";

let projectionModule = null;
try {
  projectionModule = await import("../src/server/game-data/publicCraftProjection.ts");
} catch {
  // The first TDD run proves the provider-neutral public-craft projection is absent.
}

test("public craft projection enriches live rows with exact catalog effort and output identity", () => {
  assert.ok(projectionModule, "public craft projection module must exist");
  const projected = projectionModule.enrichPublicCraftsWithCatalog({
    craftResults: [{
      entityId: "500",
      regionId: "19",
      recipeId: "800",
      craftCount: "9007199254740993",
      progress: "10",
      buildingDescriptionId: "1000",
      buildingNickname: "Community Forge",
      claimName: "Test Claim",
    }],
    regions: [{ regionId: "19", count: 1 }],
  }, {
    getEntity: (catalogKey) => catalogKey === "cargo:42" ? {
      catalogKey,
      targetId: "42",
      kind: "cargo",
      name: "Packed Timber",
      tier: 3,
    } : null,
    getDescription: (kind, id) => {
      if (kind === "crafting_recipe" && id === "800") {
        return {
          id: "800",
          name: "Pack Timber",
          actionsRequired: 12,
          levelRequirements: [{ skillId: "5", level: 20 }],
          experiencePerProgress: [{ skillId: "5", quantity: 2.5 }],
          outputs: [{ kind: "cargo", id: "42", quantity: "1" }],
        };
      }
      if (kind === "building" && id === "1000") {
        return { id: "1000", name: "Fine Carpentry Workshop" };
      }
      return null;
    },
  });

  assert.deepEqual(projected, {
    data: {
      craftResults: [{
        entityId: "500",
        regionId: "19",
        recipeId: "800",
        craftCount: "9007199254740993",
        progress: "10",
        buildingDescriptionId: "1000",
        buildingNickname: "Community Forge",
        claimName: "Test Claim",
        recipeName: "Pack Timber",
        buildingName: "Community Forge",
        totalActionsRequired: "108086391056891916",
        craftedItem: [{
          itemId: "42",
          itemType: "cargo",
          quantity: "1",
        }],
        levelRequirements: [{ skillId: "5", level: 20 }],
        experiencePerProgress: [{ skillId: "5", quantity: 2.5 }],
        outputName: "Packed Timber",
        tier: 3,
      }],
      regions: [{ regionId: "19", count: 1 }],
    },
    warnings: [],
  });
});

test("public craft projection preserves live rows and reports unavailable catalog joins", () => {
  assert.ok(projectionModule, "public craft projection module must exist");
  const projected = projectionModule.enrichPublicCraftsWithCatalog({
    craftResults: [{
      entityId: "500",
      regionId: "19",
      recipeId: "999",
      craftCount: "2",
      progress: "1",
      buildingDescriptionId: "1000",
      buildingNickname: null,
    }],
  }, {
    getEntity: () => null,
    getDescription: () => null,
  });

  assert.equal(projected.data.craftResults.length, 1);
  assert.equal(projected.data.craftResults[0].totalActionsRequired, null);
  assert.equal(projected.data.craftResults[0].outputName, "Recipe #999");
  assert.deepEqual(projected.warnings, [
    "Public craft 500 references unavailable crafting recipe 999.",
    "Public craft 500 references unavailable building description 1000.",
  ]);
});
