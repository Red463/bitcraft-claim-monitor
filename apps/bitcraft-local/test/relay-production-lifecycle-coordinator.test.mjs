import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createRelayProductionLifecycleCoordinator } from "../src/server/relayProductionLifecycleCoordinator.mjs";

function flushAsyncWork() {
  return new Promise((resolve) => setImmediate(resolve));
}

function craftSnapshot(generation, craftResults = []) {
  return { generation, data: { craftResults } };
}

test("production lifecycle reacts only to committed crafts for the configured claim", async () => {
  const applied = [];
  const coordinator = createRelayProductionLifecycleCoordinator({
    configuredClaimId: () => "claim-1",
    readCraftSnapshot: () => craftSnapshot(3),
    enrichCrafts: (data) => data,
    applyProductionLifecycle: async (claimId, payload) => applied.push({ claimId, payload }),
  });

  assert.equal(coordinator.onCommit({ claimId: "claim-1", generation: 1, changedDomains: ["members"] }), false);
  assert.equal(coordinator.onCommit({ claimId: "stale-claim", generation: 2, changedDomains: ["crafts"] }), false);
  assert.equal(coordinator.onCommit({ claimId: "claim-1", generation: 3, changedDomains: ["crafts"] }), true);

  await coordinator.whenIdle();
  assert.deepEqual(applied, [{ claimId: "claim-1", payload: { craftResults: [] } }]);
});

test("production lifecycle fences generations by the currently configured claim", async () => {
  let configuredClaimId = "claim-1";
  let snapshot = craftSnapshot(5);
  const applied = [];
  const coordinator = createRelayProductionLifecycleCoordinator({
    configuredClaimId: () => configuredClaimId,
    readCraftSnapshot: () => snapshot,
    enrichCrafts: (data) => data,
    applyProductionLifecycle: async (claimId) => applied.push(claimId),
  });

  coordinator.onCommit({ claimId: "claim-1", generation: 5, changedDomains: ["crafts"] });
  await coordinator.whenIdle();
  configuredClaimId = "claim-2";
  snapshot = craftSnapshot(1);
  coordinator.onCommit({ claimId: "claim-2", generation: 1, changedDomains: ["crafts"] });
  await coordinator.whenIdle();

  assert.deepEqual(applied, ["claim-1", "claim-2"]);
});

test("production lifecycle notifications return before side effects settle", async () => {
  let releaseApply;
  const applyStarted = new Promise((resolve) => { releaseApply = resolve; });
  let applyCalls = 0;
  const coordinator = createRelayProductionLifecycleCoordinator({
    configuredClaimId: () => "claim-1",
    readCraftSnapshot: () => craftSnapshot(1),
    enrichCrafts: (data) => data,
    applyProductionLifecycle: async () => {
      applyCalls += 1;
      await applyStarted;
    },
  });

  assert.equal(coordinator.onCommit({ claimId: "claim-1", generation: 1, changedDomains: ["crafts"] }), true);
  assert.equal(applyCalls, 0);

  await flushAsyncWork();
  assert.equal(applyCalls, 1);
  releaseApply();
  await coordinator.whenIdle();
});

test("production lifecycle coalesces overlapping generations while keeping applications sequential", async () => {
  let current = craftSnapshot(1, [{ entityId: "craft-1" }]);
  let releaseFirst;
  const firstApply = new Promise((resolve) => { releaseFirst = resolve; });
  const appliedGenerations = [];
  let active = 0;
  let maxActive = 0;
  const coordinator = createRelayProductionLifecycleCoordinator({
    configuredClaimId: () => "claim-1",
    readCraftSnapshot: () => current,
    enrichCrafts: (data) => data,
    applyProductionLifecycle: async (_claimId, _payload, context) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      appliedGenerations.push(context.snapshot.generation);
      if (context.snapshot.generation === 1) await firstApply;
      active -= 1;
    },
  });

  coordinator.onCommit({ claimId: "claim-1", generation: 1, changedDomains: ["crafts"] });
  await flushAsyncWork();
  current = craftSnapshot(3, [{ entityId: "craft-3" }]);
  coordinator.onCommit({ claimId: "claim-1", generation: 2, changedDomains: ["crafts"] });
  coordinator.onCommit({ claimId: "claim-1", generation: 3, changedDomains: ["crafts"] });
  releaseFirst();

  await coordinator.whenIdle();
  assert.deepEqual(appliedGenerations, [1, 3]);
  assert.equal(maxActive, 1);
});

test("production lifecycle preserves rows when Relay crafts are missing or malformed", async () => {
  const failures = [];
  let snapshot = null;
  let applications = 0;
  const coordinator = createRelayProductionLifecycleCoordinator({
    configuredClaimId: () => "claim-1",
    readCraftSnapshot: () => snapshot,
    enrichCrafts: (data) => data,
    applyProductionLifecycle: async () => { applications += 1; },
    onFailure: (error) => failures.push(error.message),
  });

  coordinator.onCommit({ claimId: "claim-1", generation: 1, changedDomains: ["crafts"] });
  await coordinator.whenIdle();
  snapshot = { generation: 2, data: { craftResults: {} } };
  coordinator.onCommit({ claimId: "claim-1", generation: 2, changedDomains: ["crafts"] });
  await coordinator.whenIdle();
  snapshot = craftSnapshot(3, [{}]);
  coordinator.onCommit({ claimId: "claim-1", generation: 3, changedDomains: ["crafts"] });
  await coordinator.whenIdle();

  assert.equal(applications, 0);
  assert.deepEqual(failures, [
    "Relay crafts snapshot is unavailable",
    "Relay crafts snapshot is malformed",
    "Relay crafts snapshot is malformed",
  ]);
});

test("production lifecycle records a failed application and recovers for the next craft generation", async () => {
  let current = craftSnapshot(1, [{ entityId: "craft-1" }]);
  const failures = [];
  const applied = [];
  let attempts = 0;
  const coordinator = createRelayProductionLifecycleCoordinator({
    configuredClaimId: () => "claim-1",
    readCraftSnapshot: () => current,
    enrichCrafts: (data) => data,
    applyProductionLifecycle: async (_claimId, _payload, context) => {
      attempts += 1;
      if (attempts === 1) throw new Error("outbox unavailable");
      applied.push(context.snapshot.generation);
    },
    onFailure: (error) => failures.push(error.message),
  });

  coordinator.onCommit({ claimId: "claim-1", generation: 1, changedDomains: ["crafts"] });
  await coordinator.whenIdle();
  current = craftSnapshot(2, [{ entityId: "craft-2" }]);
  coordinator.onCommit({ claimId: "claim-1", generation: 2, changedDomains: ["crafts"] });
  await coordinator.whenIdle();

  assert.deepEqual(failures, ["outbox unavailable"]);
  assert.deepEqual(applied, [2]);
});

test("server gives committed Relay crafts sole ownership of production lifecycle side effects", () => {
  const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  const collectStart = server.indexOf("async function collectServerSnapshot");
  const collectEnd = server.indexOf("function marketHistory", collectStart);
  const collectServerSnapshot = server.slice(collectStart, collectEnd);

  assert.match(server, /createRelayProductionLifecycleCoordinator/);
  assert.match(server, /productionRelayLifecycleCoordinator\?\.onCommit\(event\)/);
  assert.doesNotMatch(collectServerSnapshot, /runProductionActivityCollector/);
});
