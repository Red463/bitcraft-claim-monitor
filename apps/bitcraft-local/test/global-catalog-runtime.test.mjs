import assert from "node:assert/strict";
import test from "node:test";

let runtimeModule = null;
try {
  runtimeModule = await import("../src/server/game-data/globalCatalogRuntime.ts");
} catch {
  // The first TDD run proves the runtime coordinator is absent.
}

test("global catalog runtime discovers topology and atomically publishes repository/domain state", async () => {
  assert.ok(runtimeModule, "global catalog runtime module must exist");
  const catalogWrites = [];
  const domainWrites = [];
  let startedConfig = null;
  let snapshotHandler = null;
  const session = {
    async start(config) {
      startedConfig = config;
    },
    health: () => ({ connected: true, applied: true, lastAppliedAt: "2026-07-29T20:20:00.000Z", lastError: null }),
    async stop() {},
  };
  const runtime = new runtimeModule.RelayGlobalCatalogRuntime({
    manifest: { schemas: { global: { fingerprint: "global-v1", bindingsGenerated: true } } },
    discoverTopology: async () => ({
      cacheReady: true,
      global: {
        sourceKey: "global",
        database: "relay-global",
        port: 3000,
        schemaFingerprint: "global-v1",
        ready: true,
      },
      regions: new Map(),
      discoveredAt: "2026-07-29T20:19:00.000Z",
    }),
    createSession: (options) => {
      snapshotHandler = options.onSnapshot;
      return session;
    },
    catalogRepository: {
      getSourceState: () => ({ generation: 7 }),
      replaceCatalogSnapshot: (snapshot, metadata) => catalogWrites.push({ snapshot, metadata }),
    },
    currentStateRepository: {
      nextGeneration: () => 21,
      commitGeneration: (batch) => domainWrites.push(batch),
    },
  });

  await runtime.start({
    relayBaseUrl: "https://relay.bitcraftsync.app/",
    claimId: "1369094286777412590",
  });
  assert.deepEqual(startedConfig, {
    uri: "wss://relay.bitcraftsync.app:3000",
    database: "relay-global",
    schemaFingerprint: "global-v1",
    manifest: { schemas: { global: { fingerprint: "global-v1", bindingsGenerated: true } } },
    generation: 8,
  });

  await snapshotHandler({
    entities: [
      { kind: "item", id: "1", name: "Timber", tier: 1, tag: "Wood" },
      { kind: "cargo", id: "1", name: "Timber Crate", tier: 1, tag: "Packaged" },
    ],
    descriptions: {
      crafting_recipe: [{ kind: "crafting_recipe", id: "77", name: "Saw Timber" }],
      construction_recipe: [],
      building: [],
      skill: [{ kind: "skill", id: "5", name: "Forestry", category: "Profession" }],
      resource: [],
      equipment: [],
      buff: [],
      claim_tech: [],
    },
    database: "relay-global",
    schemaFingerprint: "global-v1",
    generation: 8,
    receivedAt: "2026-07-29T20:20:00.000Z",
  });

  assert.equal(catalogWrites.length, 1);
  assert.deepEqual(catalogWrites[0].metadata, {
    provider: "relay",
    database: "relay-global",
    schemaFingerprint: "global-v1",
    generation: 8,
    receivedAt: "2026-07-29T20:20:00.000Z",
  });
  assert.deepEqual(domainWrites[0], {
    claimId: "1369094286777412590",
    generation: 21,
    domains: {
      catalogs: {
        data: {
          itemCount: 1,
          cargoCount: 1,
          descriptionCounts: {
            crafting_recipe: 1,
            construction_recipe: 0,
            building: 0,
            skill: 1,
            resource: 0,
            equipment: 0,
            buff: 0,
            claim_tech: 0,
          },
          rowCount: 4,
        },
        confidence: "authoritative",
        provenance: {
          provider: "relay",
          sourceKey: "global",
          regionId: null,
          database: "relay-global",
          schemaFingerprint: "global-v1",
          sourceObservedAt: null,
          receivedAt: "2026-07-29T20:20:00.000Z",
        },
        warnings: [],
      },
      skills: {
        data: {
          profession: [{ kind: "skill", id: "5", name: "Forestry", category: "Profession" }],
          adventure: [],
        },
        confidence: "authoritative",
        provenance: {
          provider: "relay",
          sourceKey: "global",
          regionId: null,
          database: "relay-global",
          schemaFingerprint: "global-v1",
          sourceObservedAt: null,
          receivedAt: "2026-07-29T20:20:00.000Z",
        },
        warnings: [],
      },
    },
  });
});

test("global catalog runtime refuses an unavailable global source without constructing a session", async () => {
  assert.ok(runtimeModule, "global catalog runtime module must exist");
  let constructed = false;
  const runtime = new runtimeModule.RelayGlobalCatalogRuntime({
    manifest: { schemas: { global: { fingerprint: "global-v1", bindingsGenerated: true } } },
    discoverTopology: async () => ({
      cacheReady: false,
      global: null,
      regions: new Map(),
      discoveredAt: "2026-07-29T20:19:00.000Z",
    }),
    createSession: () => {
      constructed = true;
      return {};
    },
    catalogRepository: {
      getSourceState: () => null,
      replaceCatalogSnapshot: () => assert.fail("must preserve last-good catalog"),
    },
    currentStateRepository: {
      nextGeneration: () => 1,
      commitGeneration: () => assert.fail("must preserve last-good domain"),
    },
  });

  await assert.rejects(runtime.start({
    relayBaseUrl: "https://relay.example",
    claimId: "1",
  }), /global source is not ready/i);
  assert.equal(constructed, false);
  assert.match(runtime.health().lastError, /global source is not ready/i);
});

test("global catalog runtime stops a session whose startup rejects", async () => {
  assert.ok(runtimeModule, "global catalog runtime module must exist");
  let stopped = false;
  const runtime = new runtimeModule.RelayGlobalCatalogRuntime({
    manifest: { schemas: { global: { fingerprint: "global-v1", bindingsGenerated: true } } },
    discoverTopology: async () => ({
      cacheReady: true,
      global: {
        sourceKey: "global",
        database: "relay-global",
        port: 3000,
        schemaFingerprint: "global-v1",
        ready: true,
      },
      regions: new Map(),
      discoveredAt: "2026-07-29T20:19:00.000Z",
    }),
    createSession: () => ({
      start: async () => { throw new Error("connection failed"); },
      stop: async () => { stopped = true; },
      health: () => ({}),
    }),
    catalogRepository: {
      getSourceState: () => null,
      replaceCatalogSnapshot: () => {},
    },
    currentStateRepository: {
      nextGeneration: () => 1,
      commitGeneration: () => {},
    },
  });
  await assert.rejects(runtime.start({
    relayBaseUrl: "https://relay.example",
    claimId: "1",
  }), /connection failed/);
  assert.equal(stopped, true);
});
