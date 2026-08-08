import assert from "node:assert/strict";
import test from "node:test";

import { DOMAIN_KEYS } from "../src/server/game-data/contracts.ts";

let runtimeModule = null;
try {
  runtimeModule = await import("../src/server/game-data/regionalMarketRuntime.ts");
} catch {
  // The first TDD run proves the cross-region market runtime is absent.
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
      ["9", {
        sourceKey: "region:9",
        database: "relay-region-9",
        port: 4009,
        schemaFingerprint: "regional-v1",
        ready: true,
      }],
    ]),
    discoveredAt: "2026-07-30T12:00:00.000Z",
  };
}

function order(regionId, entityId) {
  return {
    entityId,
    claimEntityId: `${entityId}1`,
    claimName: `Claim ${regionId}`,
    regionId,
    ownerEntityId: `${entityId}2`,
    ownerUsername: `Buyer ${regionId}`,
    itemId: "43",
    itemType: "item",
    price: "25",
    priceThreshold: "25",
    quantity: "8",
    storedCoins: "200",
    timestamp: "2026-07-30T12:00:00.000Z",
    side: "buy",
  };
}

function closedListing(regionId, entityId) {
  return {
    entityId,
    claimEntityId: `${entityId}1`,
    claimName: `Claim ${regionId}`,
    regionId,
    ownerEntityId: `${entityId}2`,
    ownerUsername: `Seller ${regionId}`,
    itemId: "1",
    itemType: "item",
    quantity: "200",
    closureKind: "sale_proceeds",
    timestamp: "2026-07-30T12:00:30.000Z",
  };
}

test("regional market runtime merges configured regions into one durable live domain", async () => {
  assert.ok(runtimeModule, "regional market runtime module must exist");
  assert.equal(DOMAIN_KEYS.includes("regional-market"), true);
  const handlers = new Map();
  const writes = [];
  const committedSnapshots = [];
  const runtime = new runtimeModule.RelayRegionalMarketRuntime({
    manifest: { schemas: { regional: { fingerprint: "regional-v1", bindingsGenerated: true } } },
    discoverTopology: async () => topology(),
    createSession: (options) => {
      let regionId = null;
      return {
        start: async (config) => {
          regionId = config.regionId;
          handlers.set(regionId, options.onSnapshot);
        },
        stop: async () => {},
        health: () => ({ connected: true, applied: true }),
      };
    },
    currentStateRepository: {
      read: () => null,
      nextGeneration: () => writes.length + 1,
      commitGeneration: (batch) => writes.push(batch),
    },
    onCurrentPublished: (snapshot) => committedSnapshots.push(snapshot),
    poolOptions: {
      maxSessions: 2,
      staggerMs: 0,
      idleCloseMs: 60_000,
      sleep: async () => {},
      scheduleSweep: () => () => {},
    },
  });

  await runtime.start({
    relayBaseUrl: "https://relay.example/",
    claimId: "1369094286777412590",
    primaryRegionId: "19",
    activeRegionIds: ["19", "7"],
  });
  await runtime.warmActiveRegions();

  await handlers.get("19")({
    data: {
      orders: [order("19", "190")],
      closedListings: [closedListing("19", "690")],
      stalls: [{
        entityId: "9007199254740993",
        regionId: "19",
        claimEntityId: "100",
        orders: [],
      }],
    },
    warnings: [],
    database: "relay-region-19",
    regionId: "19",
    schemaFingerprint: "regional-v1",
    generation: 1,
    receivedAt: "2026-07-30T12:01:00.000Z",
  });
  assert.equal(writes[0].domains["regional-market"].confidence, "partial");
  assert.deepEqual(writes[0].domains["regional-market"].warnings, [
    "Relay regional market has not loaded region 7 yet.",
  ]);

  await handlers.get("7")({
    data: {
      orders: [order("7", "70")],
      closedListings: [closedListing("7", "670")],
      stalls: [],
    },
    warnings: [],
    database: "relay-region-7",
    regionId: "7",
    schemaFingerprint: "regional-v1",
    generation: 1,
    receivedAt: "2026-07-30T12:02:00.000Z",
  });
  await Promise.resolve();
  assert.deepEqual(
    writes[1].domains["regional-market"].data.orders.map((row) => row.entityId),
    ["70", "190"],
  );
  assert.equal(writes[1].domains["regional-market"].confidence, "authoritative");
  assert.deepEqual(
    writes[1].domains["regional-market"].data.activeRegionIds,
    ["7", "19"],
  );
  assert.deepEqual(
    writes[1].domains["regional-market"].data.stalls.map((row) => row.entityId),
    ["9007199254740993"],
  );
  assert.deepEqual(
    writes[1].domains["regional-market"].data.closedListings.map((row) => row.entityId),
    ["670", "690"],
  );
  assert.deepEqual(
    writes[1].domains["regional-market"].data.regions.map((row) => [row.regionId, row.count]),
    [["7", 1], ["19", 1]],
  );
  assert.deepEqual(
    committedSnapshots.map((entry) => ({
      claimId: entry.claimId,
      orderIds: entry.currentData.orders.map((row) => row.entityId),
      previousOrderIds: entry.previousData?.orders.map((row) => row.entityId) ?? null,
      isRegionBaseline: entry.isRegionBaseline,
      observedAt: entry.observedAt,
    })),
    [{
      claimId: "1369094286777412590",
      orderIds: ["190"],
      previousOrderIds: null,
      isRegionBaseline: true,
      observedAt: "2026-07-30T12:01:00.000Z",
    }, {
      claimId: "1369094286777412590",
      orderIds: ["70", "190"],
      previousOrderIds: ["190"],
      isRegionBaseline: true,
      observedAt: "2026-07-30T12:02:00.000Z",
    }],
  );
  await runtime.stop();
});

test("regional market runtime restores last-good regions before live sessions finish", async () => {
  assert.ok(runtimeModule, "regional market runtime module must exist");
  let handler;
  const writes = [];
  const runtime = new runtimeModule.RelayRegionalMarketRuntime({
    manifest: { schemas: { regional: { fingerprint: "regional-v1", bindingsGenerated: true } } },
    discoverTopology: async () => topology(),
    createSession: (options) => {
      handler = options.onSnapshot;
      return {
        start: async () => {},
        stop: async () => {},
        health: () => ({}),
      };
    },
    currentStateRepository: {
      read: () => ({
        data: {
          orders: [order("7", "70")],
          regions: [{
            regionId: "7",
            count: 1,
            database: "relay-region-7",
            schemaFingerprint: "regional-v1",
            receivedAt: "2026-07-30T11:00:00.000Z",
            warnings: [],
          }],
        },
        confidence: "partial",
        generation: 9,
        lastError: null,
        provenance: {
          provider: "relay",
          sourceKey: "region:7",
          regionId: "7",
          database: "relay-region-7",
          schemaFingerprint: "regional-v1",
          sourceObservedAt: null,
          receivedAt: "2026-07-30T11:00:00.000Z",
        },
        warnings: [],
      }),
      nextGeneration: () => 10,
      commitGeneration: (batch) => writes.push(batch),
    },
    poolOptions: {
      maxSessions: 1,
      staggerMs: 0,
      sleep: async () => {},
      scheduleSweep: () => () => {},
    },
  });
  await runtime.start({
    relayBaseUrl: "https://relay.example",
    claimId: "1369094286777412590",
    primaryRegionId: "19",
    activeRegionIds: ["7", "19"],
  });
  await handler({
    data: { orders: [order("19", "190")] },
    warnings: [],
    database: "relay-region-19",
    regionId: "19",
    schemaFingerprint: "regional-v1",
    generation: 1,
    receivedAt: "2026-07-30T12:03:00.000Z",
  });
  assert.deepEqual(
    writes[0].domains["regional-market"].data.orders.map((row) => row.entityId),
    ["70", "190"],
  );
  assert.equal(writes[0].domains["regional-market"].confidence, "authoritative");
  await runtime.stop();
});

test("regional market runtime reconciles claim and region configuration without a process restart", async () => {
  assert.ok(runtimeModule, "regional market runtime module must exist");
  const handlers = new Map();
  const writes = [];
  const stopped = [];
  const runtime = new runtimeModule.RelayRegionalMarketRuntime({
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
        health: () => ({ connected: true, applied: true }),
      };
    },
    currentStateRepository: {
      read: () => null,
      nextGeneration: () => writes.length + 1,
      commitGeneration: (batch) => writes.push(batch),
    },
    poolOptions: {
      maxSessions: 2,
      staggerMs: 0,
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

  const changed = await runtime.reconcile({
    relayBaseUrl: "https://relay.example",
    claimId: "1369094286777412591",
    primaryRegionId: "7",
    activeRegionIds: ["7"],
  });
  assert.equal(changed, true);
  assert.deepEqual(runtime.health().activeRegionIds, ["7"]);
  assert.equal(runtime.health().primaryRegionId, "7");
  assert.equal(stopped.includes("19"), true);

  await handlers.get("7")({
    data: { orders: [order("7", "71")] },
    warnings: [],
    database: "relay-region-7",
    regionId: "7",
    schemaFingerprint: "regional-v1",
    generation: 1,
    receivedAt: "2026-07-30T12:10:00.000Z",
  });
  assert.equal(writes.at(-1).claimId, "1369094286777412591");
  await runtime.stop();
});

test("regional market runtime owns bounded region rotation independently of HTTP refresh jobs", async () => {
  assert.ok(runtimeModule, "regional market runtime module must exist");
  const rotations = [];
  const startedRegions = [];
  const runtime = new runtimeModule.RelayRegionalMarketRuntime({
    manifest: { schemas: { regional: { fingerprint: "regional-v1", bindingsGenerated: true } } },
    discoverTopology: async () => topology(),
    createSession: () => ({
      start: async (config) => { startedRegions.push(config.regionId); },
      stop: async () => {},
      health: () => ({ connected: true, applied: true }),
    }),
    currentStateRepository: {
      read: () => null,
      nextGeneration: () => 1,
      commitGeneration: () => {},
    },
    poolOptions: {
      maxSessions: 2,
      staggerMs: 0,
      sleep: async () => {},
      scheduleSweep: () => () => {},
    },
    rotationMs: 12_000,
    scheduleRotation: (callback, intervalMs) => {
      const rotation = { callback, intervalMs, cancelled: false };
      rotations.push(rotation);
      return () => { rotation.cancelled = true; };
    },
  });
  await runtime.start({
    relayBaseUrl: "https://relay.example",
    claimId: "1369094286777412590",
    primaryRegionId: "19",
    activeRegionIds: ["7", "9", "19"],
  });
  assert.equal(rotations.length, 1);
  assert.equal(rotations[0].intervalMs, 12_000);
  await runtime.warmActiveRegions();
  assert.equal(startedRegions.includes("7"), true);
  assert.equal(startedRegions.includes("9"), true);
  await rotations[0].callback();
  await runtime.stop();
  assert.equal(rotations[0].cancelled, true);
});

test("regional market rotation does not evict an unapplied session before its timeout", async () => {
  assert.ok(runtimeModule, "regional market runtime module must exist");
  let nowMs = 1_785_412_800_000;
  const startedRegions = [];
  const runtime = new runtimeModule.RelayRegionalMarketRuntime({
    manifest: { schemas: { regional: { fingerprint: "regional-v1", bindingsGenerated: true } } },
    discoverTopology: async () => topology(),
    createSession: () => ({
      start: async (config) => { startedRegions.push(config.regionId); },
      stop: async () => {},
      health: () => ({ connected: true, applied: false }),
    }),
    currentStateRepository: {
      read: () => null,
      nextGeneration: () => 1,
      commitGeneration: () => {},
    },
    applyTimeoutMs: 30_000,
    now: () => nowMs,
    scheduleRotation: () => () => {},
    poolOptions: {
      maxSessions: 2,
      staggerMs: 0,
      idleCloseMs: 60_000,
      now: () => nowMs,
      sleep: async () => {},
      scheduleSweep: () => () => {},
    },
  });
  await runtime.start({
    relayBaseUrl: "https://relay.example",
    claimId: "1369094286777412590",
    primaryRegionId: "19",
    activeRegionIds: ["7", "9", "19"],
  });
  await runtime.warmActiveRegions();
  assert.deepEqual(startedRegions, ["19", "7"]);

  await runtime.warmActiveRegions();
  assert.deepEqual(startedRegions, ["19", "7"]);
  nowMs += 30_001;
  await runtime.warmActiveRegions();
  assert.deepEqual(startedRegions, ["19", "7", "9"]);
  await runtime.stop();
});

test("regional market runtime does not publish a rejected region in a later generation", async () => {
  assert.ok(runtimeModule, "regional market runtime module must exist");
  const handlers = new Map();
  const committed = [];
  let rejectRegion7 = true;
  const runtime = new runtimeModule.RelayRegionalMarketRuntime({
    manifest: { schemas: { regional: { fingerprint: "regional-v1", bindingsGenerated: true } } },
    discoverTopology: async () => topology(),
    createSession: (options) => ({
      start: async (config) => { handlers.set(config.regionId, options.onSnapshot); },
      stop: async () => {},
      health: () => ({ connected: true, applied: true }),
    }),
    currentStateRepository: {
      read: () => null,
      nextGeneration: () => committed.length + 1,
      commitGeneration: (batch) => {
        if (
          rejectRegion7
          && batch.domains["regional-market"].data.orders.some((row) => row.regionId === "7")
        ) throw new Error("simulated repository rejection");
        committed.push(batch);
      },
    },
    poolOptions: {
      maxSessions: 2,
      staggerMs: 0,
      sleep: async () => {},
      scheduleSweep: () => () => {},
    },
  });
  await runtime.start({
    relayBaseUrl: "https://relay.example",
    claimId: "1369094286777412590",
    primaryRegionId: "19",
    activeRegionIds: ["7", "19"],
  });
  await runtime.warmActiveRegions();
  await handlers.get("19")({
    data: { orders: [order("19", "190")] },
    warnings: [],
    database: "relay-region-19",
    regionId: "19",
    schemaFingerprint: "regional-v1",
    generation: 1,
    receivedAt: "2026-07-30T12:00:00.000Z",
  });
  await assert.rejects(handlers.get("7")({
    data: { orders: [order("7", "70")] },
    warnings: [],
    database: "relay-region-7",
    regionId: "7",
    schemaFingerprint: "regional-v1",
    generation: 1,
    receivedAt: "2026-07-30T12:01:00.000Z",
  }), /simulated repository rejection/);

  rejectRegion7 = false;
  await handlers.get("19")({
    data: { orders: [order("19", "191")] },
    warnings: [],
    database: "relay-region-19",
    regionId: "19",
    schemaFingerprint: "regional-v1",
    generation: 2,
    receivedAt: "2026-07-30T12:02:00.000Z",
  });
  assert.deepEqual(
    committed.at(-1).domains["regional-market"].data.orders.map((row) => row.entityId),
    ["191"],
  );
  await runtime.stop();
});

test("regional market runtime preserves exact decimal region provenance", async () => {
  assert.ok(runtimeModule, "regional market runtime module must exist");
  const regionId = "9007199254740993";
  let handler;
  const committed = [];
  const runtime = new runtimeModule.RelayRegionalMarketRuntime({
    manifest: { schemas: { regional: { fingerprint: "regional-v1", bindingsGenerated: true } } },
    discoverTopology: async () => ({
      ...topology(),
      regions: new Map([[regionId, {
        sourceKey: `region:${regionId}`,
        database: "relay-region-exact",
        port: 4019,
        schemaFingerprint: "regional-v1",
        ready: true,
      }]]),
    }),
    createSession: (options) => ({
      start: async () => { handler = options.onSnapshot; },
      stop: async () => {},
      health: () => ({ connected: true, applied: true }),
    }),
    currentStateRepository: {
      read: () => null,
      nextGeneration: () => 1,
      commitGeneration: (batch) => { committed.push(batch); },
    },
    poolOptions: {
      maxSessions: 1,
      staggerMs: 0,
      sleep: async () => {},
      scheduleSweep: () => () => {},
    },
  });
  await runtime.start({
    relayBaseUrl: "https://relay.example",
    claimId: "1369094286777412590",
    primaryRegionId: regionId,
    activeRegionIds: [regionId],
  });
  await handler({
    data: { orders: [order(regionId, "990")] },
    warnings: [],
    database: "relay-region-exact",
    regionId,
    schemaFingerprint: "regional-v1",
    generation: 1,
    receivedAt: "2026-07-30T12:00:00.000Z",
  });
  assert.equal(
    committed[0].domains["regional-market"].provenance.sourceKey,
    `region:${regionId}`,
  );
  await runtime.stop();
});

test("regional market runtime never retries settlement transition writers", async () => {
  let handler;
  let retryTransition;
  let attempts = 0;
  const runtime = new runtimeModule.RelayRegionalMarketRuntime({
    manifest: { schemas: { regional: { fingerprint: "regional-v1", bindingsGenerated: true } } },
    discoverTopology: async () => topology(),
    createSession: (options) => ({
      start: async () => { handler = options.onSnapshot; },
      stop: async () => {},
      health: () => ({ connected: true, applied: true }),
    }),
    currentStateRepository: {
      read: () => null,
      nextGeneration: () => 1,
      commitGeneration: () => {},
    },
    onSnapshotCommitted: (input) => {
      if (input.isRegionBaseline) return;
      attempts += 1;
      if (attempts === 1) throw new Error("history disk temporarily unavailable");
    },
    transitionRetryMs: 1_000,
    scheduleTransitionRetry: (callback) => {
      retryTransition = callback;
      return () => { retryTransition = null; };
    },
    poolOptions: {
      maxSessions: 1,
      staggerMs: 0,
      sleep: async () => {},
      scheduleSweep: () => () => {},
    },
  });
  await runtime.start({
    relayBaseUrl: "https://relay.example",
    claimId: "1369094286777412590",
    primaryRegionId: "19",
    activeRegionIds: ["19"],
  });
  await handler({
    data: { orders: [order("19", "190")] },
    warnings: [],
    database: "relay-region-19",
    regionId: "19",
    schemaFingerprint: "regional-v1",
    generation: 1,
    receivedAt: "2026-07-30T12:00:00.000Z",
  });
  await handler({
    data: { orders: [order("19", "191")] },
    warnings: [],
    database: "relay-region-19",
    regionId: "19",
    schemaFingerprint: "regional-v1",
    generation: 2,
    receivedAt: "2026-07-30T12:01:00.000Z",
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(attempts, 0);
  assert.equal(retryTransition, undefined);
  await runtime.stop();
});

test("regional market runtime never persists or recovers settlement transition edges", async () => {
  let handler;
  let generation = 0;
  let pending = [];
  let firstAttempts = 0;
  let recoveredAttempts = 0;
  const repository = {
    read: () => null,
    nextGeneration: () => {
      generation += 1;
      return generation;
    },
    commitGeneration: () => {},
    commitGenerationWithTransition: (_batch, transition) => {
      pending.push(transition);
    },
    listPendingTransitions: () => pending.map((transition) => ({
      transitionKey: transition.transitionKey,
      payload: transition.payload,
    })),
    recordTransitionError: () => {},
    ackTransition: (transitionKey) => {
      pending = pending.filter((transition) => transition.transitionKey !== transitionKey);
    },
  };
  const common = {
    manifest: { schemas: { regional: { fingerprint: "regional-v1", bindingsGenerated: true } } },
    discoverTopology: async () => topology(),
    createSession: (options) => ({
      start: async () => { handler = options.onSnapshot; },
      stop: async () => {},
      health: () => ({ connected: true, applied: true }),
    }),
    currentStateRepository: repository,
    scheduleTransitionRetry: () => () => {},
    poolOptions: {
      maxSessions: 1,
      staggerMs: 0,
      sleep: async () => {},
      scheduleSweep: () => () => {},
    },
  };
  const config = {
    relayBaseUrl: "https://relay.example",
    claimId: "1369094286777412590",
    primaryRegionId: "19",
    activeRegionIds: ["19"],
  };
  const firstRuntime = new runtimeModule.RelayRegionalMarketRuntime({
    ...common,
    onSnapshotCommitted: () => {
      firstAttempts += 1;
      throw new Error("history writer unavailable");
    },
  });
  await firstRuntime.start(config);
  await handler({
    data: { orders: [order("19", "190"), order("19", "192")] },
    warnings: [],
    database: "relay-region-19",
    regionId: "19",
    schemaFingerprint: "regional-v1",
    generation: 1,
    receivedAt: "2026-07-30T12:00:00.000Z",
  });
  await handler({
    data: { orders: [order("19", "191"), order("19", "192")] },
    warnings: [],
    database: "relay-region-19",
    regionId: "19",
    schemaFingerprint: "regional-v1",
    generation: 2,
    receivedAt: "2026-07-30T12:01:00.000Z",
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(firstAttempts, 0);
  assert.equal(pending.length, 0);
  await firstRuntime.stop();

  const restartedRuntime = new runtimeModule.RelayRegionalMarketRuntime({
    ...common,
    onSnapshotCommitted: () => {
      recoveredAttempts += 1;
    },
  });
  await restartedRuntime.start(config);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(recoveredAttempts, 0);
  assert.deepEqual(pending, []);
  await restartedRuntime.stop();
});

test("regional market runtime ignores legacy durable settlement transition rows", async () => {
  let recordedError = null;
  const runtime = new runtimeModule.RelayRegionalMarketRuntime({
    manifest: { schemas: { regional: { fingerprint: "regional-v1", bindingsGenerated: true } } },
    discoverTopology: async () => topology(),
    createSession: () => ({
      start: async () => {},
      stop: async () => {},
      health: () => ({ connected: true, applied: true }),
    }),
    currentStateRepository: {
      read: () => null,
      nextGeneration: () => 1,
      commitGeneration: () => {},
      listPendingTransitions: () => [{
        transitionKey: "regional-market:1369094286777412590:poison",
        payload: { claimId: "1369094286777412590" },
      }],
      recordTransitionError: (_key, error) => {
        recordedError = error;
      },
    },
    onSnapshotCommitted: () => {},
    poolOptions: {
      maxSessions: 1,
      staggerMs: 0,
      sleep: async () => {},
      scheduleSweep: () => () => {},
    },
  });
  await runtime.start({
    relayBaseUrl: "https://relay.example",
    claimId: "1369094286777412590",
    primaryRegionId: "19",
    activeRegionIds: ["19"],
  });
  await Promise.resolve();
  assert.equal(recordedError, null);
  await runtime.stop();
});

test("regional market publishes Deal Watch data without writing settlement history", async () => {
  let handler;
  let historyWrites = 0;
  const runtime = new runtimeModule.RelayRegionalMarketRuntime({
    manifest: { schemas: { regional: { fingerprint: "regional-v1", bindingsGenerated: true } } },
    discoverTopology: async () => topology(),
    createSession: (options) => ({
      start: async () => { handler = options.onSnapshot; },
      stop: async () => {},
      health: () => ({ connected: true, applied: true }),
    }),
    currentStateRepository: {
      read: () => null,
      nextGeneration: () => 1,
      commitGeneration: () => {},
    },
    onSnapshotCommitted: () => {
      historyWrites += 1;
    },
    onCurrentPublished: () => {
      throw new Error("Deal Watch unavailable");
    },
    poolOptions: {
      maxSessions: 1,
      staggerMs: 0,
      sleep: async () => {},
      scheduleSweep: () => () => {},
    },
  });
  await runtime.start({
    relayBaseUrl: "https://relay.example",
    claimId: "1369094286777412590",
    primaryRegionId: "19",
    activeRegionIds: ["19"],
  });
  await handler({
    data: { orders: [order("19", "190")] },
    warnings: [],
    database: "relay-region-19",
    regionId: "19",
    schemaFingerprint: "regional-v1",
    generation: 1,
    receivedAt: "2026-07-30T12:00:00.000Z",
  });
  await handler({
    data: { orders: [order("19", "191")] },
    warnings: [],
    database: "relay-region-19",
    regionId: "19",
    schemaFingerprint: "regional-v1",
    generation: 2,
    receivedAt: "2026-07-30T12:01:00.000Z",
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(historyWrites, 0);
  assert.equal(runtime.health().currentPublished.lastError, "Deal Watch unavailable");
  await runtime.stop();
});
