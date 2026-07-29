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
