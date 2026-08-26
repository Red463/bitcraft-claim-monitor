import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

let runtimeModule = null;
try {
  runtimeModule = await import("../src/server/game-data/globalCatalogRuntime.ts");
} catch {
  // The first TDD run proves the runtime coordinator is absent.
}
const { discoverRelayTopology } = await import("../src/server/game-data/topology.ts");
const { createCurrentStateRepository } = await import("../src/server/game-data/currentStateRepository.ts");
const { applySchemaBootstrap } = await import("../src/server/schemaBootstrap.mjs");
const { applyAdditiveColumnMigrations } = await import("../src/server/schemaMigrations.mjs");

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
      building: [{ kind: "building", id: "9", name: "Carpentry Station" }],
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
          sourceGeneration: 8,
          itemCount: 1,
          cargoCount: 1,
          descriptionCounts: {
            crafting_recipe: 1,
            extraction_recipe: 0,
            item_list: 0,
            construction_recipe: 0,
            building: 1,
            building_type: 0,
            skill: 1,
            resource: 0,
            equipment: 0,
            tool: 0,
            buff: 0,
            claim_tech: 0,
          },
          rowCount: 5,
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
      buildings: {
        data: {
          buildings: [{ kind: "building", id: "9", name: "Carpentry Station" }],
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

test("global catalog runtime persists a truthful blocked-by-schema diagnostic before opening a session", async () => {
  const diagnostics = [];
  const heartbeats = [];
  let discoveryOptions = null;
  let sessionCreates = 0;
  const attemptedAt = "2026-08-22T09:50:00.000Z";
  const diagnostic = {
    sourceKey: "global",
    schemaUrl: "https://relay.example:3000/v1/database/bitcraft-live-global/schema?version=9",
    expected: "global-v1",
    observed: "global-v2",
    attemptedAt,
    status: "mismatch",
    error: "Relay global schema fingerprint mismatch",
  };
  const runtime = new runtimeModule.RelayGlobalCatalogRuntime({
    manifest: { schemas: { global: { fingerprint: "global-v1", bindingsGenerated: true } } },
    discoverTopology: async (_baseUrl, options) => {
      discoveryOptions = options;
      return {
        cacheReady: true,
        global: {
          sourceKey: "global",
          database: "bitcraft-live-global",
          port: 3000,
          schemaFingerprint: "global-v2",
          schemaFingerprintDiagnostic: diagnostic,
          ready: true,
        },
        regions: new Map(),
        discoveredAt: attemptedAt,
      };
    },
    createSession: () => {
      sessionCreates += 1;
      throw new Error("session must not be created for a mismatched schema");
    },
    catalogRepository: {
      getSourceState: () => ({ generation: 12 }),
      replaceCatalogSnapshot: () => {},
    },
    currentStateRepository: {
      nextGeneration: () => 13,
      commitGeneration: () => {},
      recordSchemaFingerprintDiagnostic: (value) => diagnostics.push(value),
      recordSubscriptionHealth: (value, observedAt) => heartbeats.push({ value, observedAt }),
    },
  });

  await assert.rejects(
    runtime.start({ relayBaseUrl: "https://relay.example", claimId: "1" }),
    /Relay global schema fingerprint mismatch: expected global-v1, observed global-v2/,
  );

  assert.deepEqual(discoveryOptions.expectedFingerprints, { global: "global-v1" });
  assert.equal(sessionCreates, 0);
  assert.deepEqual(diagnostics, [{
    diagnostic,
    database: "bitcraft-live-global",
    ready: true,
  }]);
  assert.deepEqual(heartbeats, [{
    value: {
      sourceKey: "global",
      domain: "region",
      generation: 12,
      connected: false,
      runtimeState: "blocked_by_schema",
      lastError: "Relay global schema fingerprint mismatch",
    },
    observedAt: attemptedAt,
  }]);
  assert.deepEqual(runtime.health().schemaDiagnostic, diagnostic);
  assert.equal(runtime.health().subscription.typedState, "blocked_by_schema");
});

test("publisher-fingerprint startup replaces a stale blocker with an explicit verified diagnostic", async () => {
  const db = new DatabaseSync(":memory:");
  applySchemaBootstrap(db);
  applyAdditiveColumnMigrations(db);
  const repository = createCurrentStateRepository(db);
  await repository.recordHealth({
    provider: "relay",
    running: true,
    topologyReady: true,
    cacheReady: true,
    generation: 1,
    lastRefreshAt: "2026-08-22T09:00:00.000Z",
    lastError: null,
    sources: {
      global: {
        ready: true,
        database: "bitcraft-live-global",
        schemaFingerprint: "global-v0",
      },
    },
  }, "2026-08-22T09:00:00.000Z");
  await repository.recordSchemaFingerprintDiagnostic({
    diagnostic: {
      sourceKey: "global",
      schemaUrl: "https://old-user:old-password@relay.example:3000/v1/database/bitcraft-live-global/schema?version=9",
      expected: "global-v1",
      observed: "global-v0",
      attemptedAt: "2026-08-22T09:00:00.000Z",
      status: "mismatch",
      error: "Relay global schema fingerprint mismatch",
    },
    database: "bitcraft-live-global",
    ready: true,
  });
  assert.equal(
    repository.readHealth()?.sources.global?.schemaFingerprintDiagnostic?.status,
    "mismatch",
  );
  let schemaRequests = 0;
  const fetcher = async (input) => {
    const url = String(input);
    if (url.endsWith("/health")) {
      return new Response(JSON.stringify({
        sources: {
          global: {
            database: "bitcraft-live-global",
            port: 3000,
            schema_cached: true,
            metrics: {
              initial_subscribe_complete: true,
              publisher: { fingerprint: "global-v1" },
              upstream: { state: "up" },
            },
          },
        },
      }), { status: 200 });
    }
    if (url.endsWith("/cache-health")) {
      return new Response(JSON.stringify({ ready: true, regions: [] }), { status: 200 });
    }
    schemaRequests += 1;
    return new Response("unexpected schema request", { status: 500 });
  };
  const runtime = new runtimeModule.RelayGlobalCatalogRuntime({
    manifest: { schemas: { global: { fingerprint: "global-v1", bindingsGenerated: true } } },
    discoverTopology: (baseUrl, options) => discoverRelayTopology(baseUrl, fetcher, options),
    createSession: () => ({
      start: async () => {},
      stop: async () => {},
      health: () => ({ connected: true, applied: true, lastAppliedAt: null, lastError: null }),
    }),
    catalogRepository: {
      getSourceState: () => ({ generation: 12 }),
      replaceCatalogSnapshot: () => {},
    },
    currentStateRepository: repository,
  });

  await runtime.start({
    relayBaseUrl: "https://relay-user:relay-password@relay.example",
    claimId: "1",
  });

  assert.equal(schemaRequests, 0, "publisher fingerprint must avoid a redundant schema download");
  const storedDiagnostic = repository.readHealth()?.sources.global?.schemaFingerprintDiagnostic;
  assert.match(storedDiagnostic?.attemptedAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual({ ...storedDiagnostic, attemptedAt: "observed" }, {
    sourceKey: "global",
    schemaUrl: "https://relay.example:3000/v1/database/bitcraft-live-global/schema?version=9",
    expected: "global-v1",
    observed: "global-v1",
    attemptedAt: "observed",
    status: "verified",
    error: null,
  });
  await runtime.stop();
  db.close();
});

test("global catalog runtime sanitizes fallback diagnostics for publisher fingerprint mismatches", async () => {
  const diagnostics = [];
  let sessionCreates = 0;
  const runtime = new runtimeModule.RelayGlobalCatalogRuntime({
    manifest: { schemas: { global: { fingerprint: "global-v1", bindingsGenerated: true } } },
    discoverTopology: async () => ({
      cacheReady: true,
      global: {
        sourceKey: "global",
        database: "bitcraft-live-global",
        port: 3000,
        schemaFingerprint: "global-v2",
        ready: true,
      },
      regions: new Map(),
      discoveredAt: "2026-08-22T10:05:00.000Z",
    }),
    createSession: () => {
      sessionCreates += 1;
      throw new Error("session must not be created for a mismatched schema");
    },
    catalogRepository: {
      getSourceState: () => ({ generation: 12 }),
      replaceCatalogSnapshot: () => {},
    },
    currentStateRepository: {
      nextGeneration: () => 13,
      commitGeneration: () => {},
      recordSchemaFingerprintDiagnostic: (value) => diagnostics.push(value),
      recordSubscriptionHealth: () => {},
    },
  });

  await assert.rejects(
    runtime.start({
      relayBaseUrl: "https://relay-user:relay-password@relay.example",
      claimId: "1",
    }),
    /Relay global schema fingerprint mismatch/,
  );

  assert.equal(sessionCreates, 0);
  assert.equal(diagnostics.length, 1);
  assert.equal(
    diagnostics[0].diagnostic.schemaUrl,
    "https://relay.example:3000/v1/database/bitcraft-live-global/schema?version=9",
  );
  assert.doesNotMatch(JSON.stringify(diagnostics), /relay-user|relay-password/);
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
  const heartbeats = [];
  const runtime = new runtimeModule.RelayGlobalCatalogRuntime({
    manifest: { schemas: { global: { fingerprint: "global-v1", bindingsGenerated: true } } },
    discoverTopology: async () => ({
      cacheReady: true,
      global: {
        sourceKey: "global",
        database: "relay-global",
        port: 3000,
        schemaFingerprint: "global-v1",
        schemaFingerprintDiagnostic: {
          sourceKey: "global",
          schemaUrl: "https://relay.example:3000/v1/database/relay-global/schema?version=9",
          expected: "global-v1",
          observed: "global-v1",
          attemptedAt: "2026-07-29T20:19:00.000Z",
          status: "verified",
          error: null,
        },
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
      recordSchemaFingerprintDiagnostic: () => {},
      recordSubscriptionHealth: (heartbeat) => heartbeats.push(heartbeat),
    },
  });
  await assert.rejects(runtime.start({
    relayBaseUrl: "https://relay.example",
    claimId: "1",
  }), /connection failed/);
  assert.equal(stopped, true);
  assert.deepEqual(heartbeats, [], "connection failures must not be labeled blocked_by_schema");
  assert.equal(runtime.health().subscription.typedState, "disconnected");
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

test("global catalog runtime normalizes and retains Empire notification scope across reconnects", async () => {
  const sessions = [];
  const notificationSnapshots = [];
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
        discoveredAt: "2026-08-01T12:00:00.000Z",
      };
    },
    createSession: (options) => {
      const scopes = [];
      const state = {
        connected: true,
        applied: true,
        lastAppliedAt: "2026-08-01T12:00:00.000Z",
        lastError: null,
        notifications: {
          applied: true,
          requestedEmpireIds: [],
          appliedEmpireIds: [],
          lastAppliedAt: null,
          lastError: null,
        },
      };
      const session = {
        scopes,
        state,
        options,
        async start() {},
        async setEmpireNotificationScope(ids) {
          scopes.push([...ids]);
          state.notifications.requestedEmpireIds = [...ids];
          state.notifications.appliedEmpireIds = [...ids];
          return true;
        },
        health: () => structuredClone(state),
        async stop() {},
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
    onEmpireNotifications: (snapshot) => notificationSnapshots.push(snapshot),
  });

  assert.equal(await runtime.setEmpireNotificationScope(["20", "3", "20"]), true);
  await runtime.start({ relayBaseUrl: "https://relay.example", claimId: "1" });
  assert.deepEqual(sessions[0].scopes, [["3", "20"]]);
  assert.equal(await runtime.setEmpireNotificationScope(["20", "3"]), false);

  await sessions[0].options.onSnapshot({
    entities: [],
    descriptions: {},
    regions: [],
    foundries: [],
    foundryWarnings: [],
    siegeNotifications: {
      notifications: [{
        entityId: "1001",
        empireEntityId: "3",
        kind: "attack_won",
        occurredAt: "2026-01-01T00:00:00.000Z",
        replacements: ["Northwatch", "19:4:5"],
      }],
      outcomes: [],
      warnings: ["Unmatched siege outcome notification."],
    },
    notificationScopeEmpireIds: ["3", "20"],
    changed: ["empire-notifications"],
    database: "relay-global-1",
    schemaFingerprint: "global-v1",
    generation: 1,
    receivedAt: "2026-08-01T12:00:00.000Z",
  });
  assert.equal(notificationSnapshots.length, 1);
  assert.deepEqual(notificationSnapshots[0].siegeNotifications.warnings, [
    "Unmatched siege outcome notification.",
  ]);
  assert.deepEqual(notificationSnapshots[0].notificationScopeEmpireIds, ["3", "20"]);
  assert.equal(runtime.health().subscription.notifications.applied, true);
  assert.equal(runtime.health().lastError, null);

  sessions[0].state.connected = false;
  sessions[0].state.lastError = "socket closed";
  assert.equal(
    await runtime.reconcile({ relayBaseUrl: "https://relay.example", claimId: "1" }),
    true,
  );
  assert.deepEqual(sessions[1].scopes, [["3", "20"]]);
});

test("global catalog runtime retries the same desired notification scope after a session failure", async () => {
  let scopeCalls = 0;
  const notificationHealth = {
    applied: false,
    requestedEmpireIds: [],
    appliedEmpireIds: [],
    lastAppliedAt: null,
    lastError: null,
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
      discoveredAt: "2026-08-01T12:00:00.000Z",
    }),
    createSession: () => ({
      async start() {},
      async setEmpireNotificationScope(ids) {
        scopeCalls += 1;
        notificationHealth.requestedEmpireIds = [...ids];
        notificationHealth.lastError = scopeCalls === 1 ? "scope failed" : null;
        return scopeCalls > 1;
      },
      health: () => ({
        state: "connected",
        connected: true,
        applied: true,
        lastAppliedAt: "2026-08-01T12:00:00.000Z",
        lastError: null,
        notifications: structuredClone(notificationHealth),
      }),
      async stop() {},
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
  await runtime.start({ relayBaseUrl: "https://relay.example", claimId: "1" });
  assert.equal(await runtime.setEmpireNotificationScope(["3"]), false);
  assert.equal(await runtime.setEmpireNotificationScope(["3"]), true);
  assert.equal(scopeCalls, 2);
});

test("global catalog runtime always exposes notification health and notification success preserves a catalog error", async () => {
  let snapshotHandler;
  const session = {
    async start() {},
    async setEmpireNotificationScope() { return true; },
    health: () => ({
      state: "connected",
      connected: true,
      applied: true,
      lastAppliedAt: "2026-08-01T12:00:00.000Z",
      lastError: null,
      notifications: {
        applied: true,
        requestedEmpireIds: [],
        appliedEmpireIds: [],
        lastAppliedAt: null,
        lastError: null,
      },
    }),
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
      discoveredAt: "2026-08-01T12:00:00.000Z",
    }),
    createSession: (options) => {
      snapshotHandler = options.onSnapshot;
      return session;
    },
    catalogRepository: {
      getSourceState: () => null,
      replaceCatalogSnapshot: () => { throw new Error("catalog write failed"); },
    },
    currentStateRepository: {
      nextGeneration: () => 1,
      commitGeneration: () => {},
    },
    onEmpireNotifications: () => {},
  });

  assert.deepEqual(runtime.health().subscription.notifications, {
    applied: true,
    requestedEmpireIds: [],
    appliedEmpireIds: [],
    lastAppliedAt: null,
    lastError: null,
  });
  assert.equal(await runtime.setEmpireNotificationScope(["3"]), true);
  assert.deepEqual(runtime.health().subscription.notifications, {
    applied: false,
    requestedEmpireIds: ["3"],
    appliedEmpireIds: [],
    lastAppliedAt: null,
    lastError: null,
  });
  await runtime.start({ relayBaseUrl: "https://relay.example", claimId: "1" });
  await assert.rejects(snapshotHandler({
    entities: [],
    descriptions: {},
    regions: [],
    foundries: [],
    foundryWarnings: [],
    siegeNotifications: { notifications: [], outcomes: [], warnings: [] },
    changed: ["catalogs"],
    database: "relay-global",
    schemaFingerprint: "global-v1",
    generation: 1,
    receivedAt: "2026-08-01T12:00:00.000Z",
  }), /catalog write failed/i);
  assert.match(runtime.health().lastError, /catalog write failed/i);

  await snapshotHandler({
    entities: [],
    descriptions: {},
    regions: [],
    foundries: [],
    foundryWarnings: [],
    siegeNotifications: { notifications: [], outcomes: [], warnings: [] },
    changed: ["empire-notifications"],
    database: "relay-global",
    schemaFingerprint: "global-v1",
    generation: 2,
    receivedAt: "2026-08-01T12:01:00.000Z",
  });
  assert.match(runtime.health().lastError, /catalog write failed/i);
});

test("global catalog runtime fences late and deferred notification snapshots from a replaced session", async () => {
  const sessions = [];
  const notificationSnapshots = [];
  const lifecycleEvents = [];
  let releaseNotification;
  const deferredNotification = new Promise((resolve) => {
    releaseNotification = resolve;
  });
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
        discoveredAt: "2026-08-01T12:00:00.000Z",
      };
    },
    createSession: (options) => {
      const sessionNumber = sessions.length + 1;
      const state = {
        connected: true,
        applied: true,
        lastAppliedAt: "2026-08-01T12:00:00.000Z",
        lastError: null,
        notifications: {
          applied: true,
          requestedEmpireIds: [],
          appliedEmpireIds: [],
          lastAppliedAt: null,
          lastError: null,
        },
      };
      const session = {
        options,
        state,
        async start() {
          lifecycleEvents.push(`session-${sessionNumber}-live`);
        },
        async setEmpireNotificationScope() { return true; },
        health: () => structuredClone(state),
        async stop() {},
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
      recordSubscriptionHealth: () => {},
    },
    onEmpireNotifications: async (snapshot) => {
      notificationSnapshots.push(snapshot);
      if (notificationSnapshots.length === 1) {
        await deferredNotification;
        lifecycleEvents.push("old-notification-committed");
      }
    },
  });
  await runtime.start({ relayBaseUrl: "https://relay.example", claimId: "1" });
  const oldSnapshot = {
    entities: [],
    descriptions: {},
    regions: [],
    foundries: [],
    foundryWarnings: [],
    siegeNotifications: { notifications: [], outcomes: [], warnings: [] },
    changed: ["empire-notifications"],
    database: "relay-global-1",
    schemaFingerprint: "global-v1",
    generation: 1,
    receivedAt: "2026-08-01T12:00:00.000Z",
  };
  const deferredCommit = sessions[0].options.onSnapshot(oldSnapshot);
  sessions[0].state.connected = false;
  sessions[0].state.lastError = "socket closed";
  let reconcileCompleted = false;
  const reconcile = runtime.reconcile({
    relayBaseUrl: "https://relay.example",
    claimId: "1",
  }).then((result) => {
    reconcileCompleted = true;
    return result;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(reconcileCompleted, false);
  assert.equal(sessions.length, 1, "replacement session must wait for the old publication");
  assert.deepEqual(lifecycleEvents, ["session-1-live"]);

  releaseNotification();
  await Promise.all([deferredCommit, reconcile]);
  assert.deepEqual(lifecycleEvents, [
    "session-1-live",
    "old-notification-committed",
    "session-2-live",
  ]);

  await sessions[0].options.onSnapshot({
    ...oldSnapshot,
    generation: 2,
    receivedAt: "2026-08-01T12:02:00.000Z",
  });
  assert.equal(notificationSnapshots.length, 1, "a late old-session callback cannot publish");
});
