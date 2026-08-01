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
  const foundryWrites = [];
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
    onEmpireFoundries: (snapshot) => foundryWrites.push(snapshot),
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
      extraction_recipe: [],
      item_list: [],
      construction_recipe: [],
      building: [],
      building_type: [],
      skill: [{ kind: "skill", id: "5", name: "Forestry", category: "Profession" }],
      resource: [],
      equipment: [],
      tool: [],
      buff: [],
      claim_tech: [],
    },
    regions: [{
      regionId: "19",
      regionName: "Zephra",
      active: true,
      syncing: false,
      allowPlayerSpawns: true,
      signedInPlayers: 42,
      playersInQueue: 2,
    }],
    foundries: [{
      entityId: "7001",
      empireEntityId: "501",
      hexiteCapsules: "12",
      queued: "2",
      startedAt: "2026-06-04T17:55:57.807Z",
    }],
    foundryWarnings: [],
    changed: ["catalogs", "region", "empire-foundries"],
    database: "relay-global",
    schemaFingerprint: "global-v1",
    generation: 8,
    receivedAt: "2026-07-29T20:20:00.000Z",
  });

  assert.equal(catalogWrites.length, 1);
  assert.equal(foundryWrites.length, 1);
  assert.equal(foundryWrites[0].foundries[0].hexiteCapsules, "12");
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
            extraction_recipe: 0,
            item_list: 0,
            construction_recipe: 0,
            building: 0,
            building_type: 0,
            skill: 1,
            resource: 0,
            equipment: 0,
            tool: 0,
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
      region: {
        data: {
          regions: [{
            regionId: "19",
            regionName: "Zephra",
            active: true,
            syncing: false,
            allowPlayerSpawns: true,
            signedInPlayers: 42,
            playersInQueue: 2,
          }],
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

  await snapshotHandler({
    entities: [],
    descriptions: {},
    regions: [{
      regionId: "19",
      regionName: "Zephra",
      active: true,
      syncing: false,
      allowPlayerSpawns: true,
      signedInPlayers: 43,
      playersInQueue: 1,
    }],
    changed: ["region"],
    database: "relay-global",
    schemaFingerprint: "global-v1",
    generation: 9,
    receivedAt: "2026-07-29T20:21:00.000Z",
  });
  assert.equal(catalogWrites.length, 1, "population updates must not rewrite the catalog");
  assert.deepEqual(Object.keys(domainWrites[1].domains), ["region"]);
  assert.equal(domainWrites[1].domains.region.data.regions[0].signedInPlayers, 43);

  await snapshotHandler({
    entities: [],
    descriptions: {},
    regions: [],
    foundries: [{
      entityId: "7001",
      empireEntityId: "501",
      hexiteCapsules: "13",
      queued: "1",
      startedAt: "2026-06-04T17:55:57.807Z",
    }],
    foundryWarnings: [],
    changed: ["empire-foundries"],
    database: "relay-global",
    schemaFingerprint: "global-v1",
    generation: 10,
    receivedAt: "2026-07-29T20:22:00.000Z",
  });
  assert.equal(foundryWrites.length, 2);
  assert.equal(foundryWrites[1].foundries[0].hexiteCapsules, "13");
  assert.equal(domainWrites.length, 2, "Foundry-only changes must not publish an empty browser domain generation");
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

test("global catalog runtime rediscovers topology after disconnect and changes claim atomically", async () => {
  assert.ok(runtimeModule, "global catalog runtime module must exist");
  const sessions = [];
  let discoveryCount = 0;
  const runtime = new runtimeModule.RelayGlobalCatalogRuntime({
    manifest: { schemas: { global: { fingerprint: "global-v1", bindingsGenerated: true } } },
    discoverTopology: async () => {
      discoveryCount += 1;
      return {
        cacheReady: true,
        global: {
          sourceKey: "global",
          database: `relay-global-${discoveryCount}`,
          port: 3000 + discoveryCount,
          schemaFingerprint: "global-v1",
          ready: true,
        },
        regions: new Map(),
        discoveredAt: "2026-07-30T08:00:00.000Z",
      };
    },
    createSession: () => {
      const state = {
        connected: true,
        applied: true,
        lastAppliedAt: "2026-07-30T08:00:00.000Z",
        lastError: null,
      };
      const session = {
        state,
        stopped: false,
        async start() {},
        health: () => ({ ...state }),
        async stop() { session.stopped = true; },
      };
      sessions.push(session);
      return session;
    },
    catalogRepository: {
      getSourceState: () => null,
      replaceCatalogSnapshot: () => {},
    },
    currentStateRepository: {
      nextGeneration: () => 1,
      commitGeneration: () => {},
    },
  });

  await runtime.start({ relayBaseUrl: "https://relay.example", claimId: "1" });
  assert.equal(await runtime.reconcile({ relayBaseUrl: "https://relay.example", claimId: "1" }), false);

  sessions[0].state.connected = false;
  sessions[0].state.lastError = "socket closed";
  assert.equal(await runtime.reconcile({ relayBaseUrl: "https://relay.example", claimId: "1" }), true);
  assert.equal(sessions[0].stopped, true);
  assert.equal(discoveryCount, 2);

  assert.equal(await runtime.reconcile({ relayBaseUrl: "https://relay.example", claimId: "2" }), true);
  assert.equal(sessions[1].stopped, true);
  assert.equal(runtime.health().claimId, "2");
  assert.equal(discoveryCount, 3);
});

test("healthy global catalog runtime replaces its session when the discovered source changes", async () => {
  let now = 0;
  let sourceRevision = 1;
  let discoveryCount = 0;
  const sessions = [];
  const runtime = new runtimeModule.RelayGlobalCatalogRuntime({
    manifest: { schemas: { global: { fingerprint: "global-v1", bindingsGenerated: true } } },
    now: () => now,
    topologyRefreshMs: 60_000,
    discoverTopology: async () => {
      discoveryCount += 1;
      return {
        cacheReady: true,
        global: {
          sourceKey: "global",
          database: `relay-global-${sourceRevision}`,
          port: 3000 + sourceRevision,
          schemaFingerprint: "global-v1",
          ready: true,
        },
        regions: new Map(),
        discoveredAt: "2026-08-01T08:00:00.000Z",
      };
    },
    createSession: () => {
      const session = {
        stopped: false,
        async start() {},
        health: () => ({
          connected: true,
          applied: true,
          lastAppliedAt: "2026-08-01T08:00:00.000Z",
          lastError: null,
        }),
        async stop() { session.stopped = true; },
      };
      sessions.push(session);
      return session;
    },
    catalogRepository: {
      getSourceState: () => null,
      replaceCatalogSnapshot: () => {},
    },
    currentStateRepository: {
      nextGeneration: () => 1,
      commitGeneration: () => {},
    },
  });

  await runtime.start({ relayBaseUrl: "https://relay.example", claimId: "1" });
  now = 59_999;
  assert.equal(await runtime.reconcile({ relayBaseUrl: "https://relay.example", claimId: "1" }), false);
  assert.equal(discoveryCount, 1);

  sourceRevision = 2;
  now = 60_000;
  assert.equal(await runtime.reconcile({ relayBaseUrl: "https://relay.example", claimId: "1" }), true);
  assert.equal(sessions[0].stopped, true);
  assert.equal(runtime.health().source.database, "relay-global-2");
  assert.equal(discoveryCount, 3);
});
