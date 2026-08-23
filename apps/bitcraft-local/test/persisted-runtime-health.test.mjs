import assert from "node:assert/strict";
import test from "node:test";

let healthModule = null;
try {
  healthModule = await import("../src/server/game-data/persistedRuntimeHealth.ts");
} catch {
  // The first TDD run proves the persisted runtime health adapter is absent.
}

test("web-process health reports a worker-owned subscription from persisted domain state", () => {
  assert.ok(healthModule, "persisted runtime health module must exist");
  const result = healthModule.runtimeHealthWithPersistedSnapshot({
    runtimeHealth: {
      running: false,
      source: null,
      subscription: { connected: false, applied: false, lastAppliedAt: null, lastError: null },
      lastError: null,
    },
    snapshot: {
      data: [],
      confidence: "authoritative",
      generation: 8,
      lastError: null,
      provenance: {
        provider: "relay",
        sourceKey: "region:19",
        regionId: "19",
        database: "relay-region-19",
        schemaFingerprint: "regional-v1",
        sourceObservedAt: null,
        receivedAt: "2026-07-29T20:45:00.000Z",
      },
      warnings: [],
    },
    subscriptionHealth: {
      runtimeState: "connected",
      connected: true,
      updatedAt: "2026-07-29T20:45:30.000Z",
    },
    now: new Date("2026-07-29T20:46:00.000Z"),
  });
  assert.equal(result.persisted, true);
  assert.equal(result.subscription.applied, true);
  assert.equal(result.subscription.connected, true);
  assert.equal(result.subscription.typedState, "connected");
  assert.equal(result.subscription.lastAppliedAt, "2026-07-29T20:45:00.000Z");
  assert.equal(result.source.sourceKey, "region:19");
});

test("recent Relay HTTP polling cannot make a disconnected typed subscription appear connected", () => {
  assert.ok(healthModule, "persisted runtime health module must exist");
  const result = healthModule.runtimeHealthWithPersistedSnapshot({
    runtimeHealth: {
      running: false,
      source: null,
      subscription: { connected: false, applied: false, lastAppliedAt: null, lastError: null },
      lastError: null,
    },
    snapshot: {
      generation: 1,
      lastError: "regional reconnecting",
      provenance: {
        sourceKey: "region:19",
        regionId: "19",
        database: "relay-region-19",
        schemaFingerprint: "regional-v1",
        receivedAt: "2026-07-29T20:40:00.000Z",
      },
    },
    providerHealth: {
      running: true,
      lastRefreshAt: "2026-07-29T20:45:59.000Z",
    },
    subscriptionHealth: {
      runtimeState: "disconnected",
      connected: false,
      updatedAt: "2026-07-29T20:45:59.000Z",
    },
    now: new Date("2026-07-29T20:46:00.000Z"),
    workerFreshForMs: 180_000,
  });
  assert.equal(result.subscription.applied, true);
  assert.equal(result.subscription.connected, false);
  assert.equal(result.subscription.typedState, "disconnected");
  assert.equal(result.lastError, "regional reconnecting");
});
