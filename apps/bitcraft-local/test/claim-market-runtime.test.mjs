import assert from "node:assert/strict";
import test from "node:test";

let runtimeModule = null;
try {
  runtimeModule = await import("../src/server/game-data/claimMarketRuntime.ts");
} catch {
  // The first TDD run proves the claim-market runtime is absent.
}

function topology() {
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
}

test("claim-market runtime publishes one generic live market generation", async () => {
  assert.ok(runtimeModule, "claim-market runtime module must exist");
  const starts = [];
  const writes = [];
  let onSnapshot;
  const runtime = new runtimeModule.RelayClaimMarketRuntime({
    manifest: {
      schemas: {
        regional: { fingerprint: "regional-v1", bindingsGenerated: true },
      },
    },
    discoverTopology: async () => topology(),
    createSession: (options) => {
      onSnapshot = options.onSnapshot;
      return {
        start: async (config) => starts.push(config),
        stop: async () => {},
        health: () => ({
          connected: true,
          applied: true,
          lastAppliedAt: "2026-07-30T12:00:00.000Z",
          lastError: null,
        }),
      };
    },
    currentStateRepository: {
      nextGeneration: () => 12,
      commitGeneration: (batch) => writes.push(batch),
    },
  });

  await runtime.start({
    relayBaseUrl: "https://relay.example/",
    claimId: "100",
    regionId: "19",
  });
  assert.deepEqual(starts[0], {
    uri: "wss://relay.example:4019",
    database: "relay-region-19",
    schemaFingerprint: "regional-v1",
    manifest: {
      schemas: {
        regional: { fingerprint: "regional-v1", bindingsGenerated: true },
      },
    },
    generation: 1,
    regionId: "19",
    claimId: "100",
  });

  await onSnapshot({
    data: {
      claimId: "100",
      regionId: "19",
      marketplaces: [],
      listings: [{ entityId: "1", itemId: "42", itemType: "item" }],
    },
    warnings: ["Owner name unavailable."],
    database: "relay-region-19",
    regionId: "19",
    schemaFingerprint: "regional-v1",
    generation: 1,
    receivedAt: "2026-07-30T12:00:00.000Z",
  });

  assert.deepEqual(writes[0], {
    claimId: "100",
    generation: 12,
    domains: {
      market: {
        data: {
          claimId: "100",
          regionId: "19",
          marketplaces: [],
          listings: [{ entityId: "1", itemId: "42", itemType: "item" }],
        },
        confidence: "partial",
        provenance: {
          provider: "relay",
          sourceKey: "region:19",
          regionId: "19",
          database: "relay-region-19",
          schemaFingerprint: "regional-v1",
          sourceObservedAt: null,
          receivedAt: "2026-07-30T12:00:00.000Z",
        },
        warnings: ["Owner name unavailable."],
      },
    },
  });
  assert.equal(runtime.health().running, true);
  await runtime.reconcile({ claimId: "200", regionId: "19" });
  assert.equal(starts[1].claimId, "200");
  await runtime.stop();
});

test("claim-market runtime preserves last-good when its regional source is unavailable", async () => {
  assert.ok(runtimeModule, "claim-market runtime module must exist");
  let constructed = false;
  const runtime = new runtimeModule.RelayClaimMarketRuntime({
    manifest: {
      schemas: {
        regional: { fingerprint: "regional-v1", bindingsGenerated: true },
      },
    },
    discoverTopology: async () => ({ ...topology(), regions: new Map() }),
    createSession: () => {
      constructed = true;
      return {};
    },
    currentStateRepository: {
      nextGeneration: () => 1,
      commitGeneration: () => assert.fail("must preserve last-good market state"),
    },
  });
  await assert.rejects(runtime.start({
    relayBaseUrl: "https://relay.example",
    claimId: "100",
    regionId: "19",
  }), /region 19 source is not ready/i);
  assert.equal(constructed, false);
});

test("claim-market runtime publishes current data without waiting for transition history", async () => {
  assert.ok(runtimeModule, "claim-market runtime module must exist");
  let onSnapshot;
  let resolveTransition;
  let transitionInput = null;
  const transitionGate = new Promise((resolve) => {
    resolveTransition = resolve;
  });
  const previousData = {
    claimId: "100",
    regionId: "19",
    marketplaces: [],
    listings: [{ entityId: "1", quantity: "10" }],
  };
  const currentData = {
    claimId: "100",
    regionId: "19",
    marketplaces: [],
    listings: [{ entityId: "1", quantity: "6" }],
  };
  const writes = [];
  const runtime = new runtimeModule.RelayClaimMarketRuntime({
    manifest: {
      schemas: {
        regional: { fingerprint: "regional-v1", bindingsGenerated: true },
      },
    },
    discoverTopology: async () => topology(),
    createSession: (options) => {
      onSnapshot = options.onSnapshot;
      return {
        start: async () => {},
        stop: async () => {},
        health: () => ({
          connected: true,
          applied: true,
          lastAppliedAt: "2026-07-30T15:00:00.000Z",
          lastError: null,
        }),
      };
    },
    currentStateRepository: {
      nextGeneration: () => 13,
      read: () => ({ data: previousData }),
      commitGeneration: (batch) => writes.push(batch),
    },
    onSnapshotCommitted: async (input) => {
      transitionInput = input;
      await transitionGate;
    },
  });
  await runtime.start({
    relayBaseUrl: "https://relay.example",
    claimId: "100",
    regionId: "19",
  });

  await onSnapshot({
    data: currentData,
    warnings: [],
    database: "relay-region-19",
    regionId: "19",
    schemaFingerprint: "regional-v1",
    generation: 1,
    receivedAt: "2026-07-30T15:00:00.000Z",
  });
  await Promise.resolve();

  assert.equal(writes.length, 1);
  assert.deepEqual(transitionInput, {
    claimId: "100",
    previousData,
    currentData,
    observedAt: "2026-07-30T15:00:00.000Z",
  });
  assert.equal(runtime.health().transition.lastError, null);

  resolveTransition();
  await runtime.stop();
});

test("claim-market runtime reports transition failures without rolling back current data", async () => {
  assert.ok(runtimeModule, "claim-market runtime module must exist");
  let onSnapshot;
  const writes = [];
  const runtime = new runtimeModule.RelayClaimMarketRuntime({
    manifest: {
      schemas: {
        regional: { fingerprint: "regional-v1", bindingsGenerated: true },
      },
    },
    discoverTopology: async () => topology(),
    createSession: (options) => {
      onSnapshot = options.onSnapshot;
      return {
        start: async () => {},
        stop: async () => {},
        health: () => ({
          connected: true,
          applied: true,
          lastAppliedAt: "2026-07-30T15:00:00.000Z",
          lastError: null,
        }),
      };
    },
    currentStateRepository: {
      nextGeneration: () => 13,
      read: () => null,
      commitGeneration: (batch) => writes.push(batch),
    },
    onSnapshotCommitted: async () => {
      throw new Error("history disk unavailable");
    },
  });
  await runtime.start({
    relayBaseUrl: "https://relay.example",
    claimId: "100",
    regionId: "19",
  });

  await onSnapshot({
    data: {
      claimId: "100",
      regionId: "19",
      marketplaces: [],
      listings: [],
    },
    warnings: [],
    database: "relay-region-19",
    regionId: "19",
    schemaFingerprint: "regional-v1",
    generation: 1,
    receivedAt: "2026-07-30T15:00:00.000Z",
  });
  await runtime.stop();

  assert.equal(writes.length, 1);
  assert.equal(runtime.health().transition.lastError, "history disk unavailable");
});

test("claim-market reconnects only for disconnected or errored subscription health", async () => {
  let now = 0;
  const healthStates = [
    { connected: false, applied: true, lastAppliedAt: "2026-08-08T10:00:00.000Z", lastError: null },
    { connected: true, applied: true, lastAppliedAt: "2026-08-08T10:00:00.000Z", lastError: "socket failed" },
    { connected: true, applied: true, lastAppliedAt: "2026-08-08T10:00:00.000Z", lastError: null },
  ];
  const sessions = [];
  const runtime = new runtimeModule.RelayClaimMarketRuntime({
    manifest: { schemas: { regional: { fingerprint: "regional-v1", bindingsGenerated: true } } },
    now: () => now,
    reconnectDelayMs: () => 1_000,
    discoverTopology: async () => topology(),
    createSession: () => {
      const index = sessions.length;
      const session = {
        async start() {},
        health: () => healthStates[index],
        async stop() {},
      };
      sessions.push(session);
      return session;
    },
    currentStateRepository: {
      nextGeneration: () => 1,
      commitGeneration: () => {},
    },
  });
  const config = { claimId: "100", regionId: "19" };

  await runtime.start({ relayBaseUrl: "https://relay.example", ...config });
  await runtime.reconcile(config);
  assert.equal(sessions.length, 2, "disconnected health must restart");

  now = 999;
  await runtime.reconcile(config);
  assert.equal(sessions.length, 2, "reconnect attempts must respect backoff");

  now = 1_000;
  await runtime.reconcile(config);
  assert.equal(sessions.length, 3, "subscription errors must restart after backoff");

  await runtime.reconcile(config);
  assert.equal(sessions.length, 3, "healthy idle subscriptions must not restart");
});

test("claim-market applies escalating backoff after repeated rejected reconnect starts", async () => {
  let now = 0;
  const attempts = [];
  const delays = [];
  const runtime = new runtimeModule.RelayClaimMarketRuntime({
    manifest: { schemas: { regional: { fingerprint: "regional-v1", bindingsGenerated: true } } },
    now: () => now,
    reconnectDelayMs: (failureCount) => {
      delays.push(failureCount);
      return failureCount * 1_000;
    },
    discoverTopology: async () => topology(),
    createSession: () => {
      const attempt = attempts.length;
      const session = {
        async start() {
          attempts.push(attempt);
          if (attempt > 0) throw new Error(`connection rejected ${attempt}`);
        },
        health: () => ({ connected: false, applied: true, lastAppliedAt: null, lastError: null }),
        async stop() {},
      };
      return session;
    },
    currentStateRepository: { nextGeneration: () => 1, commitGeneration: () => {} },
  });
  const config = { claimId: "100", regionId: "19" };

  await runtime.start({ relayBaseUrl: "https://relay.example", ...config });
  await assert.rejects(runtime.reconcile(config), /connection rejected 1/);
  assert.deepEqual(delays, [1]);

  now = 999;
  await runtime.reconcile(config);
  assert.equal(attempts.length, 2, "rejected reconnect must remain inside its first delay");

  now = 1_000;
  await assert.rejects(runtime.reconcile(config), /connection rejected 2/);
  assert.deepEqual(delays, [1, 2]);

  now = 2_999;
  await runtime.reconcile(config);
  assert.equal(attempts.length, 3, "second rejection must receive an escalated delay");

  now = 3_000;
  await assert.rejects(runtime.reconcile(config), /connection rejected 3/);
  assert.deepEqual(delays, [1, 2, 3]);
});
