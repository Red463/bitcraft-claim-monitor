import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

const routeModule = await import("../src/server/game-data/gameDataRoute.ts");

function resourceSnapshot(regionId, resourceId, generation, resources = [], warnings = []) {
  return {
    data: { regionId, resourceId, resources }, warnings, regionId, resourceId, generation,
    receivedAt: `2026-08-12T10:00:0${generation}.000Z`,
  };
}

function lease(key, status, snapshot = null, warning = null) {
  return {
    key,
    state: () => ({ status, snapshot, warning }),
    waitForSnapshot: async () => snapshot,
    release: async () => {},
  };
}

test("resource lease inputs are Cartesian and independent of player selections", () => {
  assert.equal(typeof routeModule.mapResourceLeaseInputs, "function");
  const base = { regionIds: ["19", "24"], layers: ["players", "resources"], resourceIds: ["28", "54"], enemyTypes: [], playerIds: ["101"] };
  assert.deepEqual(routeModule.mapResourceLeaseInputs(base), [
    { regionId: "19", resourceId: "28" },
    { regionId: "19", resourceId: "54" },
    { regionId: "24", resourceId: "28" },
    { regionId: "24", resourceId: "54" },
  ]);
  assert.deepEqual(routeModule.mapResourceLeaseInputs({ ...base, playerIds: ["202", "303"] }), routeModule.mapResourceLeaseInputs(base));
});

test("resource lease composition preserves warm rows and loading readiness", () => {
  assert.equal(typeof routeModule.combineMapResourceLeases, "function");
  const warm = resourceSnapshot("19", "28", 7, [{ entityId: "100", resourceId: "28", regionId: "19" }]);
  const combined = routeModule.combineMapResourceLeases([
    lease("19|resource:28", "live", warm),
    lease("24|resource:28", "loading"),
  ]);
  assert.deepEqual(combined.data.resources, warm.data.resources);
  assert.equal(combined.generation, 7);
  assert.equal(combined.provenance.receivedAt, warm.receivedAt);
  assert.equal(combined.freshness, "live");
  assert.deepEqual(combined.readyKeys, ["19|resource:28"]);
  assert.deepEqual(combined.loadingKeys, ["24|resource:28"]);
  assert.deepEqual(combined.unavailableKeys, []);
});

test("resource-only loading snapshots remain successful HTTP responses", () => {
  assert.equal(typeof routeModule.mapSnapshotStatusCode, "function");
  assert.equal(routeModule.mapSnapshotStatusCode({
    regionClaims: null, market: null, empires: null, spatial: null,
    resourceCollection: { requestedKeys: ["19|resource:28"], readyKeys: [], loadingKeys: ["19|resource:28"], unavailableKeys: [] },
  }), 200);
  assert.equal(routeModule.mapSnapshotStatusCode({
    regionClaims: null, market: null, empires: null, spatial: null,
    resourceCollection: { requestedKeys: ["19|resource:28"], readyKeys: [], loadingKeys: [], unavailableKeys: ["19|resource:28"] },
  }), 503);
});

test("map resource SSE changes reach only listeners for the selected keys", () => {
  assert.equal(typeof routeModule.generationDomainsForListener, "function");
  const event = { changedDomains: ["map-resources"], mapResourceScopeKey: "19|resource:28" };
  const listener = { domains: new Set(["map-resources"]), mapResourceScopeKeys: new Set(["19|resource:28"]) };
  assert.deepEqual(routeModule.generationDomainsForListener(event, listener), ["map-resources"]);
  assert.deepEqual(routeModule.generationDomainsForListener(event, { ...listener, mapResourceScopeKeys: new Set(["19|resource:54"]) }), []);
  assert.deepEqual(routeModule.generationDomainsForListener({ ...event, mapResourceScopeKey: "24|resource:28" }, listener), []);
  assert.deepEqual(routeModule.generationDomainsForListener({ changedDomains: ["map-resources"] }, listener), []);
});

test("map leases release once on request close, response completion, or event-stream close", async () => {
  assert.equal(typeof routeModule.bindMapLeaseRelease, "function");
  for (const event of ["request-close", "response-finish", "response-close"]) {
    const request = new EventEmitter();
    const response = new EventEmitter();
    let releases = 0;
    const release = routeModule.bindMapLeaseRelease(request, response, async () => { releases += 1; });
    if (event === "request-close") request.emit("close");
    if (event === "response-finish") response.emit("finish");
    if (event === "response-close") response.emit("close");
    await release();
    request.emit("close");
    response.emit("finish");
    response.emit("close");
    assert.equal(releases, 1, event);
  }
});

test("a lease acquired after request close is released before it can enter the route collection", async () => {
  assert.equal(typeof routeModule.acquireMapLeaseUnlessClosed, "function");
  let resolveAcquire;
  let releases = 0;
  const acquired = routeModule.acquireMapLeaseUnlessClosed(
    () => new Promise((resolve) => { resolveAcquire = resolve; }),
    () => true,
    "Map request closed during resource scope acquisition.",
  );
  resolveAcquire({ release: async () => { releases += 1; } });
  await assert.rejects(acquired, /request closed/i);
  assert.equal(releases, 1);
});

test("public resource health exposes aggregate counts and latency without points or selected IDs", () => {
  assert.equal(typeof routeModule.sanitizedMapResourceHealth, "function");
  const health = routeModule.sanitizedMapResourceHealth({
    configuredRegionIds: ["19", "24"], pinnedRegionIds: ["19"], coldStartsInWindow: 2,
    regions: [{
      regionId: "19", pinned: true, resourceCount: 1, leaseCount: 2, failure: null,
      subscription: { connected: true, applied: true, stage: "applied", rowCount: 42, firstGenerationLatencyMs: 18, lastAppliedAt: "2026-08-12T10:00:00.000Z", lastError: null, appliedResourceIds: ["28"], points: [{ x: 1, z: 2 }] },
    }],
  });
  assert.equal(health.configuredRegionCount, 2);
  assert.equal(health.resourceCount, 1);
  assert.equal(health.leaseCount, 2);
  assert.equal(health.regions[0].subscription.firstGenerationLatencyMs, 18);
  const serialized = JSON.stringify(health);
  assert.equal(serialized.includes("points"), false);
  assert.equal(serialized.includes("appliedResourceIds"), false);
  assert.equal(serialized.includes('\"28\"'), false);
});

test("map request logging omits complete resource and player selections", () => {
  assert.equal(typeof routeModule.mapRequestLogTarget, "function");
  assert.equal(
    routeModule.mapRequestLogTarget(new URL("http://localhost/api/local/map/snapshot?regions=19&resourceIds=28&playerIds=101")),
    "/api/local/map/snapshot",
  );
  assert.equal(
    routeModule.mapRequestLogTarget(new URL("http://localhost/api/local/health?probe=1")),
    "/api/local/health?probe=1",
  );
});
