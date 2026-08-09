import assert from "node:assert/strict";
import test from "node:test";

let runtimeModule = null;
try {
  runtimeModule = await import("../src/server/game-data/regionClaimsRuntime.ts");
} catch {
  // The first TDD run proves the runtime is absent.
}

test("regional claims runtime publishes one live region-scoped generation and avoids redundant restarts", async () => {
  assert.ok(runtimeModule, "regional claims runtime module must exist");
  const starts = [];
  const stops = [];
  const writes = [];
  const healthWrites = [];
  let publish;
  const runtime = new runtimeModule.RelayRegionClaimsRuntime({
    manifest: { schemas: { regional: { fingerprint: "regional-v1", bindingsGenerated: true } } },
    discoverTopology: async () => ({
      cacheReady: true,
      global: null,
      regions: new Map([["19", {
        sourceKey: "region:19",
        database: "relay-region-19",
        port: 4019,
        schemaFingerprint: "regional-v1",
        ready: true,
      }]]),
      discoveredAt: "2026-07-30T12:00:00.000Z",
    }),
    createSession: (options) => {
      publish = options.onSnapshot;
      return {
        start: async (config) => starts.push(config),
        stop: async () => stops.push(true),
        health: () => ({ connected: true, applied: true, lastAppliedAt: null, lastError: null }),
      };
    },
    currentStateRepository: {
      nextGeneration: () => 7,
      commitGeneration: async (batch) => writes.push(batch),
      recordSubscriptionHealth: async (health) => healthWrites.push(health),
    },
  });

  await runtime.start({
    relayBaseUrl: "https://relay.example/",
    claimId: "1369094286777412590",
    regionId: "19",
  });
  await publish({
    data: {
      regionId: "19",
      claims: [{ entityId: "1369094286777412590", name: "Timbersteel Trade" }],
    },
    warnings: [],
    database: "relay-region-19",
    regionId: "19",
    schemaFingerprint: "regional-v1",
    generation: 1,
    receivedAt: "2026-07-30T12:01:00.000Z",
  });

  assert.equal(starts.length, 1);
  assert.deepEqual(writes[0], {
    claimId: "1369094286777412590",
    generation: 7,
    domains: {
      "region-claims": {
        data: {
          regionId: "19",
          claims: [{ entityId: "1369094286777412590", name: "Timbersteel Trade" }],
        },
        confidence: "authoritative",
        provenance: {
          provider: "relay",
          sourceKey: "region:19",
          regionId: "19",
          database: "relay-region-19",
          schemaFingerprint: "regional-v1",
          sourceObservedAt: null,
          receivedAt: "2026-07-30T12:01:00.000Z",
        },
        warnings: [],
      },
    },
  });
  assert.equal(healthWrites.at(-1).generation, 7);
  assert.equal(healthWrites.at(-1).connected, true);
  assert.equal(healthWrites.at(-1).lastError, null);

  await runtime.reconcile({ claimId: "1369094286777412590", regionId: "19" });
  assert.equal(starts.length, 1);
  assert.equal(stops.length, 0);
  await runtime.stop();
  assert.equal(stops.length, 1);
});

test("regional claims runtime refreshes topology, replaces changed schemas, and records last-good errors", async () => {
  assert.ok(runtimeModule, "regional claims runtime module must exist");
  let nowMs = Date.parse("2026-07-30T12:00:00.000Z");
  let discovery = 0;
  let failDiscovery = false;
  let activeHealth = { connected: true, applied: true, lastAppliedAt: null, lastError: null };
  const starts = [];
  const stops = [];
  const errors = [];
  const runtime = new runtimeModule.RelayRegionClaimsRuntime({
    manifest: {
      schemas: {
        regional: {
          fingerprint: "regional-v1",
          bindingsGenerated: true,
        },
      },
    },
    now: () => new Date(nowMs),
    topologyRefreshMs: 60_000,
    discoverTopology: async () => {
      if (failDiscovery) throw new Error("topology unavailable");
      discovery += 1;
      const changed = discovery > 1;
      return {
        cacheReady: true,
        global: null,
        regions: new Map([["19", {
          sourceKey: "region:19",
          database: changed ? "relay-region-19-v2" : "relay-region-19",
          port: changed ? 5019 : 4019,
          schemaFingerprint: "regional-v1",
          ready: true,
        }]]),
        discoveredAt: new Date(nowMs).toISOString(),
      };
    },
    createSession: () => ({
      start: async (config) => starts.push(config),
      stop: async () => stops.push(true),
      health: () => activeHealth,
    }),
    currentStateRepository: {
      nextGeneration: () => 1,
      commitGeneration: async () => {},
      markError: async (...args) => errors.push(args),
    },
  });

  await runtime.start({
    relayBaseUrl: "https://relay.example",
    claimId: "1369094286777412590",
    regionId: "19",
  });
  await runtime.reconcile({ regionId: "19" });
  assert.equal(discovery, 1, "healthy sessions should reuse topology inside the refresh window");

  nowMs += 60_001;
  await runtime.reconcile({ regionId: "19" });
  assert.equal(discovery, 2);
  assert.equal(starts.length, 2);
  assert.equal(stops.length, 1);
  assert.equal(starts[1].database, "relay-region-19-v2");

  failDiscovery = true;
  await assert.rejects(runtime.reconcile({ regionId: "19", force: true }), /topology unavailable/);
  assert.equal(errors.length, 0, "a healthy live subscription should not be marked stale by topology health");
  failDiscovery = false;

  activeHealth = {
    connected: false,
    applied: true,
    lastAppliedAt: "2026-07-30T12:00:00.000Z",
    lastError: "socket closed",
  };
  await runtime.reconcile({ regionId: "19", force: true });
  assert.deepEqual(errors.at(-1), [
    "1369094286777412590",
    "region-claims",
    "socket closed",
    new Date(nowMs).toISOString(),
  ]);
});

test("regional claims runtime keeps a disconnect error until a replacement snapshot commits", async () => {
  assert.ok(runtimeModule, "regional claims runtime module must exist");
  let failureCallback = () => {};
  const publishCallbacks = [];
  const healthWrites = [];
  const starts = [];
  const stops = [];
  let storedGeneration = 100;
  const timers = [];
  const runtime = new runtimeModule.RelayRegionClaimsRuntime({
    manifest: { schemas: { regional: { fingerprint: "regional-v1", bindingsGenerated: true } } },
    reconnectDelayMs: () => 1_000,
    setTimer: (callback) => {
      const timer = { callback };
      timers.push(timer);
      return timer;
    },
    clearTimer: () => {},
    discoverTopology: async () => ({
      cacheReady: true,
      global: null,
      regions: new Map([["19", {
        sourceKey: "region:19",
        database: "relay-region-19",
        port: 4019,
        schemaFingerprint: "regional-v1",
        ready: true,
      }]]),
      discoveredAt: "2026-07-30T12:00:00.000Z",
    }),
    createSession: (options) => {
      failureCallback = options.onFailure;
      publishCallbacks.push(options.onSnapshot);
      return {
        start: async () => starts.push(true),
        stop: async () => stops.push(true),
        health: () => ({
          connected: true,
          applied: false,
          lastAppliedAt: null,
          lastApplyDurationMs: null,
          rowCount: 0,
          lastError: null,
        }),
      };
    },
    currentStateRepository: {
      nextGeneration: () => storedGeneration++,
      commitGeneration: async () => {},
      markError: async () => {},
      recordSubscriptionHealth: async (health) => healthWrites.push(health),
    },
  });
  const flush = () => new Promise((resolve) => setImmediate(resolve));

  await runtime.start({
    relayBaseUrl: "https://relay.example",
    claimId: "1369094286777412590",
    regionId: "19",
  });

  failureCallback("socket failure 1");
  timers.shift().callback();
  await flush();
  assert.equal(starts.length, 2, "reconnect must start a replacement session");
  assert.equal(stops.length, 1, "reconnect must stop the failed session");
  assert.equal(publishCallbacks.length, 2, "replacement session must install a new snapshot callback");
  assert.equal(healthWrites.at(-1).connected, false);
  assert.equal(healthWrites.at(-1).lastError, "socket failure 1");

  await publishCallbacks.at(-1)({
    data: { regionId: "19", claims: [] },
    warnings: [],
    database: "relay-region-19",
    regionId: "19",
    schemaFingerprint: "regional-v1",
    generation: 1,
    receivedAt: "2026-07-30T12:00:01.000Z",
  });
  assert.equal(healthWrites.at(-1).generation, 100);
  assert.equal(healthWrites.at(-1).connected, true);
  assert.equal(healthWrites.at(-1).lastError, null);

  await runtime.stop();
});

test("regional claims runtime cannot let an old in-flight snapshot clear a disconnect", async () => {
  assert.ok(runtimeModule, "regional claims runtime module must exist");
  const failureCallbacks = [];
  const publishCallbacks = [];
  const healthWrites = [];
  const timers = [];
  let releaseFirstCommit;
  let firstCommitStarted;
  const firstCommitStartedPromise = new Promise((resolve) => { firstCommitStarted = resolve; });
  const firstCommitGate = new Promise((resolve) => { releaseFirstCommit = resolve; });
  let commitCount = 0;
  const runtime = new runtimeModule.RelayRegionClaimsRuntime({
    manifest: { schemas: { regional: { fingerprint: "regional-v1", bindingsGenerated: true } } },
    reconnectDelayMs: () => 1_000,
    setTimer: (callback) => {
      const timer = { callback };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => {
      const index = timers.indexOf(timer);
      if (index >= 0) timers.splice(index, 1);
    },
    discoverTopology: async () => ({
      cacheReady: true,
      global: null,
      regions: new Map([["19", {
        sourceKey: "region:19",
        database: "relay-region-19",
        port: 4019,
        schemaFingerprint: "regional-v1",
        ready: true,
      }]]),
      discoveredAt: "2026-07-30T12:00:00.000Z",
    }),
    createSession: (options) => {
      failureCallbacks.push(options.onFailure);
      publishCallbacks.push(options.onSnapshot);
      return {
        start: async () => {},
        stop: async () => {},
        health: () => ({ connected: true, applied: false, lastAppliedAt: null, lastError: null }),
      };
    },
    currentStateRepository: {
      nextGeneration: () => commitCount + 1,
      commitGeneration: async () => {
        commitCount += 1;
        if (commitCount === 1) {
          firstCommitStarted();
          await firstCommitGate;
        }
      },
      markError: async () => {},
      recordSubscriptionHealth: async (health) => healthWrites.push(health),
    },
  });
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  const snapshot = (receivedAt) => ({
    data: { regionId: "19", claims: [] },
    warnings: [],
    database: "relay-region-19",
    regionId: "19",
    schemaFingerprint: "regional-v1",
    generation: 1,
    receivedAt,
  });

  await runtime.start({
    relayBaseUrl: "https://relay.example",
    claimId: "1369094286777412590",
    regionId: "19",
  });
  const oldCommit = publishCallbacks[0](snapshot("2026-07-30T12:00:01.000Z"));
  await firstCommitStartedPromise;

  failureCallbacks[0]("socket dropped during commit");
  await flush();
  assert.equal(healthWrites.at(-1).lastError, "socket dropped during commit");
  assert.equal(timers.length, 1);

  releaseFirstCommit();
  await oldCommit;
  assert.equal(healthWrites.at(-1).lastError, "socket dropped during commit");
  assert.equal(timers.length, 1, "old snapshot must not cancel replacement reconnect");

  timers.shift().callback();
  await flush();
  assert.equal(publishCallbacks.length, 2);
  await publishCallbacks[1](snapshot("2026-07-30T12:00:02.000Z"));
  assert.equal(healthWrites.at(-1).connected, true);
  assert.equal(healthWrites.at(-1).lastError, null);
  await runtime.stop();
});

test("regional claims runtime retries with jitter-ready backoff and rediscovers topology after three failures", async () => {
  assert.ok(runtimeModule, "regional claims runtime module must exist");
  let discoveries = 0;
  let failureCallback = () => {};
  const timers = [];
  const runtime = new runtimeModule.RelayRegionClaimsRuntime({
    manifest: { schemas: { regional: { fingerprint: "regional-v1", bindingsGenerated: true } } },
    reconnectDelayMs: (attempt) => attempt * 1_000,
    setTimer: (callback, delayMs) => {
      const timer = { callback, delayMs };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => {
      const index = timers.indexOf(timer);
      if (index >= 0) timers.splice(index, 1);
    },
    discoverTopology: async () => {
      discoveries += 1;
      return {
        cacheReady: true,
        global: null,
        regions: new Map([["19", {
          sourceKey: "region:19",
          database: "relay-region-19",
          port: 4019,
          schemaFingerprint: "regional-v1",
          ready: true,
        }]]),
        discoveredAt: "2026-07-30T12:00:00.000Z",
      };
    },
    createSession: (options) => {
      failureCallback = options.onFailure;
      return {
        start: async () => {},
        stop: async () => {},
        health: () => ({
          connected: true,
          applied: false,
          lastAppliedAt: null,
          lastApplyDurationMs: null,
          rowCount: 0,
          lastError: null,
        }),
      };
    },
    currentStateRepository: {
      nextGeneration: () => 1,
      commitGeneration: async () => {},
      markError: async () => {},
    },
  });
  const flush = () => new Promise((resolve) => setImmediate(resolve));

  await runtime.start({
    relayBaseUrl: "https://relay.example",
    claimId: "1369094286777412590",
    regionId: "19",
  });
  assert.equal(discoveries, 1);

  failureCallback("socket failure 1");
  assert.equal(timers[0].delayMs, 1_000);
  timers.shift().callback();
  await flush();
  assert.equal(discoveries, 1, "first retry should reuse the discovered source");

  failureCallback("socket failure 2");
  assert.equal(timers[0].delayMs, 2_000);
  timers.shift().callback();
  await flush();
  assert.equal(discoveries, 1, "second retry should reuse the discovered source");

  failureCallback("socket failure 3");
  assert.equal(timers[0].delayMs, 3_000);
  timers.shift().callback();
  await flush();
  assert.equal(discoveries, 2, "third retry should rediscover topology");
  await runtime.stop();
});
