import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { applySchemaBootstrap } from "../src/server/schemaBootstrap.mjs";

let catalogRepositoryModule = null;
try {
  catalogRepositoryModule = await import("../src/server/catalogRepository.mjs");
} catch {
  // The first TDD run proves the provider-neutral repository is absent.
}

function createDb() {
  const db = new DatabaseSync(":memory:");
  applySchemaBootstrap(db);
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

test("provider catalog snapshot atomically preserves item/cargo identity and removes stale rows", () => {
  assert.ok(catalogRepositoryModule, "provider catalog repository module must exist");
  const db = createDb();
  const repository = catalogRepositoryModule.createProviderCatalogRepository(db);

  repository.replaceEntitySnapshot([
    { kind: "item", id: "42", name: "Timber", iconAssetName: "Items/Timber" },
    { kind: "cargo", id: "42", name: "Timber Crate", iconAssetName: "GeneratedIcons/Cargo/Timber Crate" },
    { kind: "item", id: "99", name: "Old row" },
  ], {
    provider: "relay",
    database: "relay-mirror-bc-global",
    schemaFingerprint: "global-v1",
    generation: 7,
    receivedAt: "2026-07-29T20:00:00.000Z",
  });

  const result = repository.replaceEntitySnapshot([
    { kind: "item", id: "42", name: "Timber Plank", iconAssetName: "Items/Timber" },
    { kind: "cargo", id: "42", name: "Timber Crate", iconAssetName: "GeneratedIcons/Cargo/Timber Crate" },
  ], {
    provider: "relay",
    database: "relay-mirror-bc-global",
    schemaFingerprint: "global-v1",
    generation: 8,
    receivedAt: "2026-07-29T20:05:00.000Z",
  });

  assert.deepEqual(result, { generation: 8, rowCount: 2, removedCount: 1 });
  assert.equal(repository.getEntity("items:42").name, "Timber Plank");
  assert.equal(repository.getEntity("cargo:42").name, "Timber Crate");
  assert.equal(repository.getEntity("items:99"), null);
  assert.deepEqual(repository.getSourceState(), {
    provider: "relay",
    database: "relay-mirror-bc-global",
    schemaFingerprint: "global-v1",
    generation: 8,
    receivedAt: "2026-07-29T20:05:00.000Z",
    rowCount: 2,
  });
  assert.deepEqual(
    repository.searchEntities("timber", 10).map((row) => row.catalogKey).sort(),
    ["cargo:42", "items:42"],
  );
  assert.deepEqual(
    repository.findEntities("timber").map((row) => row.catalogKey).sort(),
    ["cargo:42", "items:42"],
  );
  assert.deepEqual(repository.listEntities().map((row) => row.name), ["Timber Crate", "Timber Plank"]);
});

test("provider catalog findEntities does not truncate candidates before live-order filters", () => {
  const db = createDb();
  const repository = catalogRepositoryModule.createProviderCatalogRepository(db);
  repository.replaceEntitySnapshot(Array.from({ length: 75 }, (_, index) => ({
    kind: "item",
    id: String(index + 1),
    name: `Timber ${String(index + 1).padStart(3, "0")}`,
  })), {
    provider: "relay",
    database: "relay-global",
    schemaFingerprint: "global-v1",
    generation: 1,
    receivedAt: "2026-07-30T12:00:00.000Z",
  });

  assert.equal(repository.searchEntities("timber", 50).length, 50);
  assert.equal(repository.findEntities("timber").length, 75);
  assert.equal(repository.findEntities("timber").at(-1).targetId, "75");
  db.close();
});

test("provider catalog snapshot rejects malformed generations without changing last-good rows", () => {
  assert.ok(catalogRepositoryModule, "provider catalog repository module must exist");
  const db = createDb();
  const repository = catalogRepositoryModule.createProviderCatalogRepository(db);
  repository.replaceEntitySnapshot([
    { kind: "item", id: "42", name: "Last good" },
  ], {
    provider: "relay",
    database: "relay-global",
    schemaFingerprint: "global-v1",
    generation: 1,
    receivedAt: "2026-07-29T20:00:00.000Z",
  });

  assert.throws(() => repository.replaceEntitySnapshot([
    { kind: "item", id: "42", name: "Duplicate A" },
    { kind: "item", id: "42", name: "Duplicate B" },
  ], {
    provider: "relay",
    database: "relay-global",
    schemaFingerprint: "global-v1",
    generation: 2,
    receivedAt: "2026-07-29T20:01:00.000Z",
  }), /duplicate catalog identity/i);

  assert.equal(repository.getEntity("items:42").name, "Last good");
  assert.equal(repository.getSourceState().generation, 1);
});

test("provider catalog repository replaces normalized description tables in the same generation", () => {
  assert.ok(catalogRepositoryModule, "provider catalog repository module must exist");
  const db = createDb();
  const repository = catalogRepositoryModule.createProviderCatalogRepository(db);
  const descriptions = {
    crafting_recipe: [{ kind: "crafting_recipe", id: "77", name: "Saw Timber" }],
    construction_recipe: [],
    building: [],
    skill: [{ kind: "skill", id: "5", name: "Forestry" }],
    resource: [],
    equipment: [],
    buff: [],
    claim_tech: [],
  };

  repository.replaceCatalogSnapshot({
    entities: [{ kind: "item", id: "42", name: "Timber", tier: 2 }],
    descriptions,
  }, {
    provider: "relay",
    database: "relay-global",
    schemaFingerprint: "global-v1",
    generation: 1,
    receivedAt: "2026-07-29T20:30:00.000Z",
  });
  assert.deepEqual(repository.listDescriptions("skill"), [
    { kind: "skill", id: "5", name: "Forestry" },
  ]);
  assert.deepEqual(repository.getDescription("crafting_recipe", "77"), {
    kind: "crafting_recipe",
    id: "77",
    name: "Saw Timber",
  });
  assert.equal(repository.getDescription("crafting_recipe", "999"), null);

  repository.replaceCatalogSnapshot({
    entities: [{ kind: "item", id: "42", name: "Timber", tier: 2 }],
    descriptions: { ...descriptions, skill: [] },
  }, {
    provider: "relay",
    database: "relay-global",
    schemaFingerprint: "global-v1",
    generation: 2,
    receivedAt: "2026-07-29T20:31:00.000Z",
  });
  assert.deepEqual(repository.listDescriptions("skill"), []);
  assert.equal(repository.getSourceState().rowCount, 2);
});

test("provider tool descriptions retain row identity and resolve the strongest row by item", () => {
  assert.ok(catalogRepositoryModule, "provider catalog repository module must exist");
  const db = createDb();
  const repository = catalogRepositoryModule.createProviderCatalogRepository(db);
  repository.replaceCatalogSnapshot({
    entities: [{ kind: "item", id: "42", name: "Multi-tool" }],
    descriptions: {
      tool: [
        { kind: "tool", id: "100", itemId: "42", toolType: 2, level: 1, power: 5 },
        { kind: "tool", id: "101", itemId: "42", toolType: 4, level: 3, power: 25 },
      ],
    },
  }, {
    provider: "relay",
    database: "relay-global",
    schemaFingerprint: "global-v1",
    generation: 1,
    receivedAt: "2026-07-30T11:00:00.000Z",
  });

  assert.equal(repository.listDescriptions("tool").length, 2);
  assert.deepEqual(repository.getDescription("tool", "42"), {
    kind: "tool",
    id: "101",
    itemId: "42",
    toolType: 4,
    level: 3,
    power: 25,
  });
});

test("provider catalog generation atomically replaces live recipes, probabilities, and effort weights", () => {
  assert.ok(catalogRepositoryModule, "provider catalog repository module must exist");
  const db = createDb();
  const repository = catalogRepositoryModule.createProviderCatalogRepository(db);
  repository.replaceCatalogSnapshot({
    entities: [
      { kind: "item", id: "42", name: "Timber", tier: 2, itemListId: "17" },
      { kind: "item", id: "43", name: "Plank", tier: 2 },
    ],
    descriptions: {
      crafting_recipe: [{
        kind: "crafting_recipe",
        id: "77",
        name: "Saw Timber",
        actionsRequired: 4,
        isPassive: false,
        buildingRequirement: { buildingType: "6", tier: 2 },
        levelRequirements: [{ skillId: "5", level: 1 }],
        inputs: [{ kind: "item", id: "42", quantity: "2" }],
        outputs: [{ kind: "item", id: "43", quantity: "1" }],
      }],
      extraction_recipe: [{
        kind: "extraction_recipe",
        id: "88",
        resourceId: "9",
        cargoId: null,
        name: "Chop",
        levelRequirements: [{ skillId: "5", level: 1 }],
        inputs: [],
        outputs: [{ kind: "item", id: "42", quantity: "1", probability: 0.5 }],
      }],
      item_list: [{
        kind: "item_list",
        id: "17",
        name: "Timber yield",
        possibilities: [{
          probability: 1,
          items: [{ kind: "item", id: "43", quantity: "2" }],
        }],
      }],
      construction_recipe: [],
      building: [],
      building_type: [{ kind: "building_type", id: "6", name: "Carpentry Station" }],
      skill: [{ kind: "skill", id: "5", name: "Forestry" }],
      resource: [{
        kind: "resource",
        id: "9",
        name: "Tree",
        tier: 2,
        tag: "Wood",
        maxHealth: 10,
        onDestroyYield: [{ kind: "item", id: "42", quantity: "1" }],
      }],
      equipment: [],
      tool: [],
      buff: [],
      claim_tech: [],
    },
  }, {
    provider: "relay",
    database: "relay-global",
    schemaFingerprint: "global-v1",
    generation: 1,
    receivedAt: "2026-07-30T12:00:00.000Z",
  });

  const recipes = db.prepare(`
    SELECT recipe_key, activity_kind, station_name, skill_name, resource_id
    FROM game_catalog_recipes ORDER BY recipe_key
  `).all().map((row) => ({ ...row }));
  assert.deepEqual(recipes, [
    {
      recipe_key: "extraction:88",
      activity_kind: "gathering",
      station_name: null,
      skill_name: "Forestry",
      resource_id: "9",
    },
    {
      recipe_key: "recipe:77",
      activity_kind: "craft",
      station_name: "Carpentry Station (Tier 2)",
      skill_name: "Forestry",
      resource_id: null,
    },
  ]);
  assert.deepEqual(repository.getProbabilitySnapshot(), {
    sourceUrl: "spacetimedb://relay-global",
    sourceRevision: "global-v1",
    itemListCount: 1,
    resourceCount: 1,
    warnings: [],
    sources: [
      {
        sourceKind: "relay_global",
        sourceUrl: "spacetimedb://relay-global",
        sourceRevision: "global-v1",
        updatedAt: "2026-07-30T12:00:00.000Z",
      },
    ],
    updatedAt: "2026-07-30T12:00:00.000Z",
  });
  assert.ok(
    db.prepare("SELECT COUNT(*) AS count FROM game_catalog_effort_weights").get().count >= 1,
    "live provider generation should publish planner effort weights",
  );
});

test("malformed live catalog projection rolls back the complete provider generation", () => {
  assert.ok(catalogRepositoryModule, "provider catalog repository module must exist");
  const db = createDb();
  const repository = catalogRepositoryModule.createProviderCatalogRepository(db);
  const descriptions = {
    crafting_recipe: [],
    extraction_recipe: [],
    item_list: [{
      kind: "item_list",
      id: "17",
      name: "Last good",
      possibilities: [{
        probability: 1,
        items: [{ kind: "item", id: "42", quantity: "1" }],
      }],
    }],
    construction_recipe: [],
    building: [],
    building_type: [],
    skill: [],
    resource: [{
      kind: "resource",
      id: "9",
      name: "Tree",
      tier: 1,
      tag: "Wood",
      maxHealth: 5,
      onDestroyYield: [],
    }],
    equipment: [],
    tool: [],
    buff: [],
    claim_tech: [],
  };
  repository.replaceCatalogSnapshot({
    entities: [{ kind: "item", id: "42", name: "Last good", itemListId: "17" }],
    descriptions,
  }, {
    provider: "relay",
    database: "relay-global",
    schemaFingerprint: "global-v1",
    generation: 1,
    receivedAt: "2026-07-30T12:00:00.000Z",
  });

  assert.throws(() => repository.replaceCatalogSnapshot({
    entities: [{ kind: "item", id: "42", name: "Must roll back", itemListId: "17" }],
    descriptions: {
      ...descriptions,
      crafting_recipe: [{
        kind: "crafting_recipe",
        id: "77",
        name: "Broken",
        actionsRequired: 1,
        isPassive: false,
        buildingRequirement: null,
        levelRequirements: [],
        inputs: [],
        outputs: [{ kind: "item", id: "42", quantity: "-1" }],
      }],
    },
  }, {
    provider: "relay",
    database: "relay-global",
    schemaFingerprint: "global-v2",
    generation: 2,
    receivedAt: "2026-07-30T12:01:00.000Z",
  }), /quantity/i);

  assert.equal(repository.getEntity("items:42").name, "Last good");
  assert.equal(repository.getSourceState().generation, 1);
  assert.equal(repository.getProbabilitySnapshot().sourceRevision, "global-v1");
  assert.deepEqual(db.prepare("SELECT recipe_key FROM game_catalog_recipes").all(), []);
});
