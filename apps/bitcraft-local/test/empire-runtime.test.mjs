import assert from "node:assert/strict";
import test from "node:test";

let runtimeModule = null;
try {
  runtimeModule = await import("../src/server/game-data/empireRuntime.ts");
} catch {
  // The first TDD run proves the adaptive Empire runtime is absent.
}

function topology() {
  return {
    cacheReady: true,
    global: null,
    regions: new Map([
      ["7", {
        sourceKey: "region:7",
        database: "relay-region-7",
        port: 4007,
        schemaFingerprint: "regional-v1",
        ready: true,
      }],
      ["19", {
        sourceKey: "region:19",
        database: "relay-region-19",
        port: 4019,
        schemaFingerprint: "regional-v1",
        ready: true,
      }],
    ]),
    discoveredAt: "2026-07-30T18:00:00.000Z",
  };
}

function regionData(regionId, empireId) {
  return {
    regionId,
    empires: [{
      entityId: empireId,
      capitalBuildingEntityId: `${empireId}0`,
      name: `Empire ${regionId}`,
      memberCount: 1,
      settlementCount: 1,
      territoryChunks: 1,
    }],
    members: [{
      entityId: `${empireId}1`,
      empireEntityId: empireId,
      username: `Member ${regionId}`,
    }],
    settlements: [{
      buildingEntityId: `${empireId}2`,
      claimEntityId: `${empireId}3`,
      empireEntityId: empireId,
      claimName: `Claim ${regionId}`,
    }],
    claimMembers: [{
      entityId: `${empireId}5`,
      claimEntityId: `${empireId}3`,
      playerEntityId: `${empireId}1`,
      username: `Member ${regionId}`,
    }],
    nodes: [{
      entityId: `${empireId}4`,
      empireEntityId: empireId,
      nickname: `Tower ${regionId}`,
      sieges: [],
    }],
  };
}

test("Empire runtime atomically merges only configured regional generations", async () => {
  assert.ok(runtimeModule, "Empire runtime module must exist");
  const handlers = new Map();
  const sessionConfigs = new Map();
  const writes = [];
  let stored = null;
  const runtime = new runtimeModule.RelayEmpireRuntime({
    manifest: { schemas: { regional: { fingerprint: "regional-v1", bindingsGenerated: true } } },
    discoverTopology: async () => topology(),
    createSession: (options) => ({
      start: async (config) => {
        sessionConfigs.set(config.regionId, config);
        handlers.set(config.regionId, options.onSnapshot);
      },
      stop: async () => {},
      health: () => ({ connected: true, applied: true, stage: "live" }),
    }),
    currentStateRepository: {
      read: () => stored,
      nextGeneration: () => writes.length + 1,
      commitGeneration: (batch) => {
        writes.push(batch);
        stored = batch.domains.empires;
      },
    },
    poolOptions: {
      maxSessions: 2,
      staggerMs: 0,
      idleCloseMs: 60_000,
      sleep: async () => {},
      scheduleSweep: () => () => {},
    },
    scheduleRotation: () => () => {},
  });

  await runtime.start({
    relayBaseUrl: "https://relay.example/",
    claimId: "1369094286777412590",
    primaryRegionId: "19",
    activeRegionIds: ["19", "7"],
  });
  await runtime.warmActiveRegions();
  assert.equal(sessionConfigs.get("19").includeIdentities, true);
  assert.equal(sessionConfigs.get("7").includeIdentities, false);
  const primary = regionData("19", "190");
  const secondary = regionData("7", "70");
  primary.hexite = {
    inventories: [{
      entityId: "9001",
      empireEntityId: "190",
      regionId: "19",
      sourceType: "player",
      energy: "12",
      capsules: "3",
      reserveBuilding: false,
    }],
    coverage: [{
      empireEntityId: "190",
      regionId: "19",
      playerCount: 1,
      claimCount: 1,
    }],
  };
  secondary.hexite = {
    inventories: [{
      entityId: "9002",
      empireEntityId: "70",
      regionId: "7",
      sourceType: "claim",
      energy: "5",
      capsules: "2",
      reserveBuilding: true,
    }],
    coverage: [{
      empireEntityId: "70",
      regionId: "7",
      playerCount: 1,
      claimCount: 1,
    }],
  };
  primary.empires.push(secondary.empires[0]);
  primary.members.push(secondary.members[0]);
  await handlers.get("19")({
    data: primary,
    warnings: [],
    database: "relay-region-19",
    regionId: "19",
    schemaFingerprint: "regional-v1",
    generation: 1,
    receivedAt: "2026-07-30T18:01:00.000Z",
  });
  assert.equal(writes[0].domains.empires.confidence, "partial");
  assert.deepEqual(writes[0].domains.empires.warnings, [
    "Relay empires have not loaded region 7 yet.",
  ]);

  await handlers.get("7")({
    data: secondary,
    warnings: [],
    database: "relay-region-7",
    regionId: "7",
    schemaFingerprint: "regional-v1",
    generation: 1,
    receivedAt: "2026-07-30T18:02:00.000Z",
  });
  const combined = writes[1].domains.empires.data;
  assert.equal(writes[1].domains.empires.confidence, "authoritative");
  assert.equal(combined.primaryRegionId, "19");
  assert.deepEqual(combined.activeRegionIds, ["7", "19"]);
  assert.deepEqual(combined.empires.map((row) => [row.regionId, row.entityId]), [
    ["19", "70"],
    ["19", "190"],
  ]);
  assert.deepEqual(combined.regions.map((row) => row.regionId), ["7", "19"]);
  assert.deepEqual(combined.hexite.availableRegionIds, ["7", "19"]);
  assert.deepEqual(combined.hexite.missingRegionIds, []);
  assert.deepEqual(
    combined.hexite.inventories.map((row) => [row.regionId, row.entityId]),
    [["7", "9002"], ["19", "9001"]],
  );
  assert.equal(combined.foundries, null);

  await handlers.get("19")({
    data: { ...primary, hexite: null },
    warnings: [],
    database: "relay-region-19",
    regionId: "19",
    schemaFingerprint: "regional-v1",
    generation: 2,
    receivedAt: "2026-07-30T18:02:10.000Z",
  });
  assert.equal(writes[2].domains.empires.data.hexite.inventories.length, 2);
  assert.match(
    writes[2].domains.empires.warnings.join("\n"),
    /retained last-good values/,
  );

  await runtime.updateGlobalFoundries({
    foundries: [{
      entityId: "7001",
      empireEntityId: "190",
      hexiteCapsules: "12",
      queued: "2",
      startedAt: "2026-06-04T17:55:57.807Z",
    }],
    warnings: [],
    database: "relay-global",
    schemaFingerprint: "global-v1",
    generation: 4,
    receivedAt: "2026-07-30T18:02:15.000Z",
  });
  assert.equal(writes.length, 4);
  assert.equal(writes[3].domains.empires.data.foundries[0].hexiteCapsules, "12");

  await runtime.updateGlobalFoundries({
    foundries: [{
      entityId: "7001",
      empireEntityId: "190",
      hexiteCapsules: "13",
      queued: "1",
      startedAt: "2026-06-04T17:55:57.807Z",
    }],
    warnings: [],
    database: "relay-global",
    schemaFingerprint: "global-v1",
    generation: 5,
    receivedAt: "2026-07-30T18:02:30.000Z",
  });
  assert.equal(writes.length, 5);
  assert.equal(writes[4].domains.empires.data.foundries[0].hexiteCapsules, "13");
  assert.equal(writes[4].domains.empires.provenance.sourceKey, "global");

  await assert.rejects(
    async () => handlers.get("19")({
      data: regionData("8", "80"),
      warnings: [],
      database: "relay-region-8",
      regionId: "8",
      schemaFingerprint: "regional-v1",
      generation: 1,
      receivedAt: "2026-07-30T18:03:00.000Z",
    }),
    /unconfigured region 8/,
  );
  await runtime.stop();
});

test("Empire runtime publishes exact committed Empire notification scopes without delaying base generations", async () => {
  const handlers = new Map();
  const writes = [];
  const scopes = [];
  let releaseFirstScope;
  const firstScopePending = new Promise((resolve) => {
    releaseFirstScope = resolve;
  });
  const runtime = new runtimeModule.RelayEmpireRuntime({
    manifest: { schemas: { regional: { fingerprint: "regional-v1", bindingsGenerated: true } } },
    discoverTopology: async () => topology(),
    createSession: (options) => ({
      start: async (config) => handlers.set(config.regionId, options.onSnapshot),
      stop: async () => {},
      health: () => ({ connected: true, applied: true, stage: "live" }),
    }),
    currentStateRepository: {
      read: () => writes.at(-1)?.domains.empires ?? null,
      nextGeneration: () => writes.length + 1,
      commitGeneration: (batch) => writes.push(batch),
    },
    onNotificationScopeChanged: (ids) => {
      scopes.push(ids);
      return scopes.length === 1 ? firstScopePending : undefined;
    },
    poolOptions: {
      maxSessions: 2,
      staggerMs: 0,
      idleCloseMs: 60_000,
      sleep: async () => {},
      scheduleSweep: () => () => {},
    },
    scheduleRotation: () => () => {},
  });

  await runtime.start({
    relayBaseUrl: "https://relay.example",
    claimId: "1369094286777412590",
    primaryRegionId: "19",
    activeRegionIds: ["7", "19"],
  });
  await runtime.warmActiveRegions();
  const primary = regionData("19", "190");
  primary.empires.push({ entityId: "800", regionId: "19", name: "Attacker" });
  primary.empires.push({ entityId: "999", regionId: "19", name: "Unrelated identity" });
  primary.nodes[0].sieges = [{
    entityId: "1905",
    buildingEntityId: primary.nodes[0].entityId,
    empireEntityId: "800",
    defenderEmpireEntityId: "190",
    role: "attacker",
    active: true,
  }];

  const primaryCommit = handlers.get("19")({
    data: primary,
    warnings: [],
    database: "relay-region-19",
    regionId: "19",
    schemaFingerprint: "regional-v1",
    generation: 1,
    receivedAt: "2026-07-30T18:01:00.000Z",
  });
  assert.equal(
    await Promise.race([
      primaryCommit.then(() => "committed"),
      new Promise((resolve) => setTimeout(() => resolve("blocked"), 100)),
    ]),
    "committed",
    "notification scope replacement must not delay the regional generation",
  );
  assert.deepEqual(scopes[0], ["190", "800"]);
  for (let index = 0; index < 10 && !writes.at(-1).domains.empires.warnings.some((warning) => /scope is updating/.test(warning)); index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.match(
    writes.at(-1).domains.empires.warnings.join("\n"),
    /notification scope is updating; retained last-good outcomes/i,
  );

  releaseFirstScope();
  const secondary = regionData("7", "70");
  secondary.nodes[0].sieges = [{
    entityId: "705",
    buildingEntityId: secondary.nodes[0].entityId,
    empireEntityId: "701",
    defenderEmpireEntityId: "70",
    role: "attacker",
    active: true,
  }];
  await handlers.get("7")({
    data: secondary,
    warnings: [],
    database: "relay-region-7",
    regionId: "7",
    schemaFingerprint: "regional-v1",
    generation: 1,
    receivedAt: "2026-07-30T18:02:00.000Z",
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(scopes.at(-1), ["70", "190", "701", "800"]);

  await handlers.get("7")({
    data: { ...secondary, settlements: [], claimMembers: [], nodes: [] },
    warnings: [],
    database: "relay-region-7",
    regionId: "7",
    schemaFingerprint: "regional-v1",
    generation: 2,
    receivedAt: "2026-07-30T18:03:00.000Z",
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(scopes.at(-1), ["190", "800"]);
  assert.equal(scopes.flat().includes("999"), false);
  await runtime.stop();
});

test("Empire runtime atomically retains compact last-good siege outcomes and records notification failures", async () => {
  const handlers = new Map();
  const writes = [];
  let stored = null;
  let failScope = false;
  const runtime = new runtimeModule.RelayEmpireRuntime({
    manifest: { schemas: { regional: { fingerprint: "regional-v1", bindingsGenerated: true } } },
    discoverTopology: async () => topology(),
    createSession: (options) => ({
      start: async (config) => handlers.set(config.regionId, options.onSnapshot),
      stop: async () => {},
      health: () => ({ connected: true, applied: true, stage: "live" }),
    }),
    currentStateRepository: {
      read: () => stored,
      nextGeneration: () => writes.length + 1,
      commitGeneration: (batch) => {
        writes.push(batch);
        stored = batch.domains.empires;
      },
    },
    onNotificationScopeChanged: async () => {
      if (failScope) throw new Error("notification scope unavailable");
    },
    poolOptions: {
      maxSessions: 1,
      staggerMs: 0,
      idleCloseMs: 60_000,
      sleep: async () => {},
      scheduleSweep: () => () => {},
    },
    scheduleRotation: () => () => {},
  });
  await runtime.start({
    relayBaseUrl: "https://relay.example",
    claimId: "1369094286777412590",
    primaryRegionId: "19",
    activeRegionIds: ["19"],
  });
  const primary = regionData("19", "190");
  primary.nodes[0].sieges = [{
    entityId: "1905",
    buildingEntityId: primary.nodes[0].entityId,
    empireEntityId: "800",
    defenderEmpireEntityId: "190",
    role: "attacker",
    active: true,
  }];
  await handlers.get("19")({
    data: primary,
    warnings: [],
    database: "relay-region-19",
    regionId: "19",
    schemaFingerprint: "regional-v1",
    generation: 1,
    receivedAt: "2026-07-30T18:01:00.000Z",
  });

  await runtime.updateGlobalSiegeNotifications({
    siegeNotifications: {
      notifications: [{ entityId: "raw-normalized-row-must-not-be-stored" }],
      outcomes: [{
        eventKey: "event-1",
        occurredAt: "2026-07-30T18:00:00.000Z",
        watchtowerLabel: "North Watch",
        encodedLocation: "19:1:2",
        attackerEmpireEntityId: "800",
        defenderEmpireEntityId: "190",
        outcome: "attacker_won",
      }],
      warnings: ["Unmatched siege outcome notifications at 2026-07-30T17:00:00.000Z."],
    },
    database: "relay-global",
    schemaFingerprint: "global-v1",
    generation: 2,
    receivedAt: "2026-07-30T18:02:00.000Z",
  });
  assert.deepEqual(stored.data.siegeOutcomes, [{
    eventKey: "event-1",
    occurredAt: "2026-07-30T18:00:00.000Z",
    watchtowerLabel: "North Watch",
    encodedLocation: "19:1:2",
    attackerEmpireEntityId: "800",
    defenderEmpireEntityId: "190",
    outcome: "attacker_won",
  }]);
  assert.equal(JSON.stringify(stored.data).includes("raw-normalized-row-must-not-be-stored"), false);
  assert.match(stored.warnings.join("\n"), /Global Siege: Unmatched siege outcome/);

  await assert.rejects(
    runtime.updateGlobalSiegeNotifications({
      siegeNotifications: {
        notifications: [],
        outcomes: [{
          ...stored.data.siegeOutcomes[0],
          attackerEmpireEntityId: "not-decimal",
        }],
        warnings: [],
      },
      database: "relay-global",
      schemaFingerprint: "global-v1",
      generation: 3,
      receivedAt: "2026-07-30T18:03:00.000Z",
    }),
    /attacker/i,
  );
  assert.equal(stored.data.siegeOutcomes[0].eventKey, "event-1");

  failScope = true;
  const expandedPrimary = {
    ...primary,
    nodes: [{
      ...primary.nodes[0],
      sieges: [
        ...primary.nodes[0].sieges,
        {
          entityId: "1906",
          buildingEntityId: primary.nodes[0].entityId,
          empireEntityId: "801",
          defenderEmpireEntityId: "190",
          role: "attacker",
          active: true,
        },
      ],
    }],
  };
  await handlers.get("19")({
    data: expandedPrimary,
    warnings: [],
    database: "relay-region-19",
    regionId: "19",
    schemaFingerprint: "regional-v1",
    generation: 2,
    receivedAt: "2026-07-30T18:04:00.000Z",
  });
  for (let index = 0; index < 10 && !stored.warnings.some((warning) => /scope unavailable/.test(warning)); index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(stored.data.siegeOutcomes[0].eventKey, "event-1");
  assert.match(stored.warnings.join("\n"), /notification scope unavailable/);

  failScope = false;
  await handlers.get("19")({
    data: expandedPrimary,
    warnings: [],
    database: "relay-region-19",
    regionId: "19",
    schemaFingerprint: "regional-v1",
    generation: 3,
    receivedAt: "2026-07-30T18:05:00.000Z",
  });
  for (let index = 0; index < 10 && stored.warnings.some((warning) => /scope unavailable/.test(warning)); index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.doesNotMatch(stored.warnings.join("\n"), /notification scope unavailable/);
  assert.deepEqual(runtime.health().notifications.appliedEmpireIds, ["190", "800", "801"]);
  await runtime.stop();
});

test("Empire runtime reconciles scope and never carries a rejected regional candidate forward", async () => {
  assert.ok(runtimeModule, "Empire runtime module must exist");
  const handlers = new Map();
  const writes = [];
  let rejectRegion7 = true;
  const stopped = [];
  const runtime = new runtimeModule.RelayEmpireRuntime({
    manifest: { schemas: { regional: { fingerprint: "regional-v1", bindingsGenerated: true } } },
    discoverTopology: async () => topology(),
    createSession: (options) => {
      let regionId = null;
      return {
        start: async (config) => {
          regionId = config.regionId;
          handlers.set(regionId, options.onSnapshot);
        },
        stop: async () => { if (regionId) stopped.push(regionId); },
        health: () => ({ connected: true, applied: true, stage: "live" }),
      };
    },
    currentStateRepository: {
      read: () => null,
      nextGeneration: () => writes.length + 1,
      commitGeneration: (batch) => {
        const latestRegion = batch.domains.empires.provenance.regionId;
        if (latestRegion === "7" && rejectRegion7) {
          throw new Error("forced repository rejection");
        }
        writes.push(batch);
      },
    },
    poolOptions: {
      maxSessions: 2,
      staggerMs: 0,
      idleCloseMs: 60_000,
      sleep: async () => {},
      scheduleSweep: () => () => {},
    },
    scheduleRotation: () => () => {},
  });
  await runtime.start({
    relayBaseUrl: "https://relay.example",
    claimId: "1369094286777412590",
    primaryRegionId: "19",
    activeRegionIds: ["7", "19"],
  });
  await runtime.warmActiveRegions();

  await assert.rejects(handlers.get("7")({
    data: regionData("7", "70"),
    warnings: [],
    database: "relay-region-7",
    regionId: "7",
    schemaFingerprint: "regional-v1",
    generation: 1,
    receivedAt: "2026-07-30T18:02:00.000Z",
  }), /forced repository rejection/);
  await handlers.get("19")({
    data: regionData("19", "190"),
    warnings: [],
    database: "relay-region-19",
    regionId: "19",
    schemaFingerprint: "regional-v1",
    generation: 1,
    receivedAt: "2026-07-30T18:03:00.000Z",
  });
  assert.deepEqual(
    writes[0].domains.empires.data.empires.map((row) => row.entityId),
    ["190"],
  );

  rejectRegion7 = false;
  const changed = await runtime.reconcile({
    relayBaseUrl: "https://relay.example",
    claimId: "1369094286777412591",
    primaryRegionId: "7",
    activeRegionIds: ["7"],
  });
  assert.equal(changed, true);
  assert.equal(stopped.includes("19"), true);
  assert.deepEqual(runtime.health().activeRegionIds, ["7"]);
  await runtime.stop();
});

test("Empire runtime gives each regional session a fresh topology resolver", async () => {
  const sessionOptions = new Map();
  let discovery = topology();
  const runtime = new runtimeModule.RelayEmpireRuntime({
    manifest: { schemas: { regional: { fingerprint: "regional-v1", bindingsGenerated: true } } },
    discoverTopology: async () => discovery,
    createSession: (options) => ({
      start: async (config) => sessionOptions.set(config.regionId, options),
      stop: async () => {},
      health: () => ({ connected: true, applied: false, stage: "base", reconnects: 0 }),
    }),
    currentStateRepository: {
      read: () => null,
      nextGeneration: () => 1,
      commitGeneration: () => {},
    },
    poolOptions: {
      maxSessions: 1,
      staggerMs: 0,
      idleCloseMs: 60_000,
      sleep: async () => {},
      scheduleSweep: () => () => {},
    },
    scheduleRotation: () => () => {},
  });
  await runtime.start({
    relayBaseUrl: "https://relay.example",
    claimId: "1369094286777412590",
    primaryRegionId: "19",
    activeRegionIds: ["19"],
  });

  discovery = topology();
  discovery.regions.set("19", {
    sourceKey: "region:19",
    database: "relay-region-19-new",
    port: 5019,
    schemaFingerprint: "regional-v1",
    ready: true,
  });
  const refreshed = await sessionOptions.get("19").refreshSource();
  assert.deepEqual(refreshed, {
    uri: "wss://relay.example:5019",
    database: "relay-region-19-new",
    schemaFingerprint: "regional-v1",
  });

  await runtime.stop();
});

test("Empire runtime persists the regional session reconnect count", async () => {
  let snapshotHandler = null;
  const healthWrites = [];
  const runtime = new runtimeModule.RelayEmpireRuntime({
    manifest: { schemas: { regional: { fingerprint: "regional-v1", bindingsGenerated: true } } },
    discoverTopology: async () => topology(),
    createSession: (options) => ({
      start: async () => { snapshotHandler = options.onSnapshot; },
      stop: async () => {},
      health: () => ({
        connected: true,
        applied: true,
        stage: "live",
        reconnects: 7,
        lastApplyDurationMs: 12,
      }),
    }),
    currentStateRepository: {
      read: () => null,
      nextGeneration: () => 1,
      commitGeneration: () => {},
      recordSubscriptionHealth: (health) => healthWrites.push(health),
    },
    poolOptions: {
      maxSessions: 1,
      staggerMs: 0,
      idleCloseMs: 60_000,
      sleep: async () => {},
      scheduleSweep: () => () => {},
    },
    scheduleRotation: () => () => {},
  });
  await runtime.start({
    relayBaseUrl: "https://relay.example",
    claimId: "1369094286777412590",
    primaryRegionId: "19",
    activeRegionIds: ["19"],
  });
  await snapshotHandler({
    data: regionData("19", "190"),
    warnings: [],
    database: "relay-region-19",
    regionId: "19",
    schemaFingerprint: "regional-v1",
    generation: 8,
    receivedAt: "2026-07-30T18:04:00.000Z",
  });

  assert.equal(healthWrites[0].reconnects, 7);
  assert.equal(healthWrites[0].applyDurationMs, 12);

  await runtime.stop();
});

test("Empire runtime keeps replicated Empire identity rows from the primary region only", async () => {
  const handlers = new Map();
  const writes = [];
  const membershipObservations = [];
  const runtime = new runtimeModule.RelayEmpireRuntime({
    manifest: { schemas: { regional: { fingerprint: "regional-v1", bindingsGenerated: true } } },
    discoverTopology: async () => topology(),
    createSession: (options) => ({
      start: async (config) => handlers.set(config.regionId, options.onSnapshot),
      stop: async () => {},
      health: () => ({ connected: true, applied: true, stage: "live", reconnects: 0 }),
    }),
    currentStateRepository: {
      read: () => null,
      nextGeneration: () => writes.length + 1,
      commitGeneration: (batch) => writes.push(batch),
    },
    onSnapshotCommitted: (observation) => membershipObservations.push(observation),
    poolOptions: {
      maxSessions: 2,
      staggerMs: 0,
      idleCloseMs: 60_000,
      sleep: async () => {},
      scheduleSweep: () => () => {},
    },
    scheduleRotation: () => () => {},
  });
  await runtime.start({
    relayBaseUrl: "https://relay.example",
    claimId: "1369094286777412590",
    primaryRegionId: "19",
    activeRegionIds: ["7", "19"],
  });
  await runtime.warmActiveRegions();
  await handlers.get("19")({
    data: regionData("19", "190"),
    warnings: [],
    database: "relay-region-19",
    regionId: "19",
    schemaFingerprint: "regional-v1",
    generation: 1,
    receivedAt: "2026-07-30T18:01:00.000Z",
  });
  const secondary = regionData("7", "190");
  secondary.empires = [];
  secondary.members = [];
  secondary.settlements[0] = {
    ...secondary.settlements[0],
    buildingEntityId: "792",
    claimEntityId: "793",
  };
  secondary.claimMembers[0] = {
    ...secondary.claimMembers[0],
    entityId: "795",
    claimEntityId: "793",
  };
  secondary.nodes[0] = { ...secondary.nodes[0], entityId: "794" };
  await handlers.get("7")({
    data: secondary,
    warnings: [],
    database: "relay-region-7",
    regionId: "7",
    schemaFingerprint: "regional-v1",
    generation: 1,
    receivedAt: "2026-07-30T18:02:00.000Z",
  });

  const combined = writes.at(-1).domains.empires.data;
  assert.deepEqual(combined.empires.map((row) => row.entityId), ["190"]);
  assert.deepEqual(combined.members.map((row) => row.entityId), ["1901"]);
  assert.deepEqual(combined.settlements.map((row) => row.regionId), ["7", "19"]);
  assert.deepEqual(combined.nodes.map((row) => row.regionId), ["7", "19"]);
  assert.equal(combined.regions.find((row) => row.regionId === "7").memberCount, 1);

  await runtime.stop();
  assert.deepEqual(
    membershipObservations.map((observation) => observation.observedAt),
    ["2026-07-30T18:01:00.000Z"],
  );
});

test("Empire runtime preserves a failed region when another region commits successfully", async () => {
  const handlers = new Map();
  const failures = new Map();
  const writes = [];
  const markedErrors = [];
  const runtime = new runtimeModule.RelayEmpireRuntime({
    manifest: { schemas: { regional: { fingerprint: "regional-v1", bindingsGenerated: true } } },
    discoverTopology: async () => topology(),
    createSession: (options) => ({
      start: async (config) => {
        handlers.set(config.regionId, options.onSnapshot);
        failures.set(config.regionId, options.onFailure);
      },
      stop: async () => {},
      health: () => ({ connected: true, applied: true, stage: "live", reconnects: 0 }),
    }),
    currentStateRepository: {
      read: () => null,
      nextGeneration: () => writes.length + 1,
      commitGeneration: (batch) => writes.push(batch),
      markError: (...args) => markedErrors.push(args),
    },
    poolOptions: {
      maxSessions: 2,
      staggerMs: 0,
      idleCloseMs: 60_000,
      sleep: async () => {},
      scheduleSweep: () => () => {},
    },
    scheduleRotation: () => () => {},
  });
  await runtime.start({
    relayBaseUrl: "https://relay.example",
    claimId: "1369094286777412590",
    primaryRegionId: "19",
    activeRegionIds: ["7", "19"],
  });
  await runtime.warmActiveRegions();
  await handlers.get("7")({
    data: regionData("7", "70"),
    warnings: [],
    database: "relay-region-7",
    regionId: "7",
    schemaFingerprint: "regional-v1",
    generation: 1,
    receivedAt: "2026-07-30T18:01:00.000Z",
  });
  await handlers.get("19")({
    data: regionData("19", "190"),
    warnings: [],
    database: "relay-region-19",
    regionId: "19",
    schemaFingerprint: "regional-v1",
    generation: 1,
    receivedAt: "2026-07-30T18:02:00.000Z",
  });

  failures.get("7")("Relay region 7 disconnected");
  assert.equal(markedErrors.at(-1)[2], "Region 7: Relay region 7 disconnected");
  await handlers.get("19")({
    data: regionData("19", "190"),
    warnings: [],
    database: "relay-region-19",
    regionId: "19",
    schemaFingerprint: "regional-v1",
    generation: 2,
    receivedAt: "2026-07-30T18:03:00.000Z",
  });

  const latest = writes.at(-1).domains.empires;
  assert.equal(latest.confidence, "partial");
  assert.match(latest.warnings.join("\n"), /Region 7: Relay region 7 disconnected/);
  assert.equal(
    latest.data.regions.find((region) => region.regionId === "7").lastError,
    "Relay region 7 disconnected",
  );
  assert.equal(runtime.health().lastError, "Relay region 7 disconnected");

  await runtime.stop();
});

test("Empire runtime publishes a pruned scope fence before reconnecting changed regions", async () => {
  const claimId = "1369094286777412590";
  let stored = {
    data: {
      primaryRegionId: "19",
      activeRegionIds: ["7", "19"],
      empires: [
        { entityId: "70", regionId: "19" },
        { entityId: "190", regionId: "19" },
      ],
      members: [
        { entityId: "701", empireEntityId: "70", regionId: "19" },
        { entityId: "1901", empireEntityId: "190", regionId: "19" },
      ],
      settlements: [
        { buildingEntityId: "72", claimEntityId: "73", empireEntityId: "70", regionId: "7" },
        { buildingEntityId: "1902", claimEntityId: "1903", empireEntityId: "190", regionId: "19" },
      ],
      claimMembers: [],
      nodes: [
        { entityId: "74", empireEntityId: "70", regionId: "7" },
        { entityId: "1904", empireEntityId: "190", regionId: "19" },
      ],
      regions: [
        {
          regionId: "7",
          empireCount: 1,
          memberCount: 1,
          settlementCount: 1,
          claimMemberCount: 0,
          nodeCount: 1,
          database: "relay-region-7",
          schemaFingerprint: "regional-v1",
          receivedAt: "2026-07-30T18:00:00.000Z",
          warnings: [],
        },
        {
          regionId: "19",
          empireCount: 1,
          memberCount: 1,
          settlementCount: 1,
          claimMemberCount: 0,
          nodeCount: 1,
          database: "relay-region-19",
          schemaFingerprint: "regional-v1",
          receivedAt: "2026-07-30T18:00:00.000Z",
          warnings: [],
        },
      ],
    },
    confidence: "authoritative",
    generation: 4,
    lastError: null,
    provenance: {
      provider: "relay",
      sourceKey: "region:19",
      regionId: "19",
      database: "relay-region-19",
      schemaFingerprint: "regional-v1",
      sourceObservedAt: null,
      receivedAt: "2026-07-30T18:00:00.000Z",
    },
    warnings: [],
  };
  const writes = [];
  const runtime = new runtimeModule.RelayEmpireRuntime({
    manifest: { schemas: { regional: { fingerprint: "regional-v1", bindingsGenerated: true } } },
    discoverTopology: async () => topology(),
    createSession: () => ({
      start: async () => {},
      stop: async () => {},
      health: () => ({ connected: true, applied: false, stage: "base", reconnects: 0 }),
    }),
    currentStateRepository: {
      read: () => stored,
      nextGeneration: () => stored.generation + 1,
      commitGeneration: (batch) => {
        writes.push(batch);
        const envelope = batch.domains.empires;
        stored = {
          data: envelope.data,
          confidence: envelope.confidence,
          generation: batch.generation,
          lastError: null,
          provenance: envelope.provenance,
          warnings: envelope.warnings,
        };
      },
    },
    poolOptions: {
      maxSessions: 1,
      staggerMs: 0,
      idleCloseMs: 60_000,
      sleep: async () => {},
      scheduleSweep: () => () => {},
    },
    scheduleRotation: () => () => {},
    now: () => Date.parse("2026-07-30T18:05:00.000Z"),
  });

  await runtime.start({
    relayBaseUrl: "https://relay.example",
    claimId,
    primaryRegionId: "19",
    activeRegionIds: ["19"],
  });

  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].domains.empires.data.activeRegionIds, ["19"]);
  assert.deepEqual(
    writes[0].domains.empires.data.settlements.map((row) => row.regionId),
    ["19"],
  );
  assert.deepEqual(
    writes[0].domains.empires.data.nodes.map((row) => row.regionId),
    ["19"],
  );
  assert.equal(writes[0].domains.empires.confidence, "partial");
  assert.match(writes[0].domains.empires.warnings.join("\n"), /scope changed/i);

  await runtime.stop();
});
