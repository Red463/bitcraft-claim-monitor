import assert from "node:assert/strict";
import test from "node:test";

let loaderModule = null;
try {
  loaderModule = await import("../src/pages/map/mapSnapshotLoader.mjs");
} catch {
  // RED: the coalescing map loader does not exist yet.
}

let snapshotStateModule = null;
try {
  snapshotStateModule = await import("../src/pages/map/mapSnapshotState.mjs");
} catch {
  // RED: request-keyed map snapshot replacement does not exist yet.
}

test("map snapshot loader coalesces concurrent notifications into one follow-up load", async () => {
  assert.ok(loaderModule);
  const resolvers = [];
  const values = [];
  const loader = loaderModule.createMapSnapshotLoader({
    load: () => new Promise((resolve) => resolvers.push(resolve)),
    onValue: (value) => values.push(value),
    minIntervalMs: 0,
  });

  const first = loader.request();
  loader.request();
  loader.request();
  assert.equal(resolvers.length, 1);
  resolvers.shift()({ generation: "1" });
  await first;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(resolvers.length, 1, "notifications received in flight become one follow-up request");
  resolvers.shift()({ generation: "2" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(values.map(({ value }) => value.generation), ["1", "2"]);
});

test("map snapshot loader retains warm values until the matching request completes", async () => {
  assert.ok(loaderModule);
  const resolvers = [];
  const values = [];
  let currentRequestKey = "A";
  const loader = loaderModule.createMapSnapshotLoader({
    currentRequestKey: () => currentRequestKey,
    load: (requestKey) => new Promise((resolve) => resolvers.push({ requestKey, resolve })),
    onValue: (requested) => values.push(requested),
    minIntervalMs: 0,
  });

  const initial = loader.request("A");
  resolvers.shift().resolve({ generation: "A" });
  await initial;
  currentRequestKey = "B";
  const next = loader.request("B");
  assert.deepEqual(values.map(({ value }) => value.generation), ["A"]);
  resolvers.shift().resolve({ generation: "B" });
  await next;
  assert.deepEqual(values.map(({ value }) => value.generation), ["A", "B"]);
});

test("a matching response replaces warm resource points and removes old types", () => {
  assert.ok(snapshotStateModule);
  const warmSnapshot = {
    scope: { resourceIds: ["28", "54"] },
    layers: { resources: [{ resourceId: "28" }, { resourceId: "54" }] },
  };
  const matchingSnapshot = snapshotStateModule.replaceMapSnapshot({
    currentRequestKey: "resourceIds=54",
    requested: {
      requestKey: "resourceIds=54",
      value: {
        scope: { resourceIds: ["54"] },
        layers: { resources: [{ resourceId: "54" }] },
      },
    },
  });

  assert.deepEqual(warmSnapshot.layers.resources.map(({ resourceId }) => resourceId), ["28", "54"]);
  assert.deepEqual(matchingSnapshot.layers.resources.map(({ resourceId }) => resourceId), ["54"]);
});

test("map snapshot loader never commits A after B becomes current", async () => {
  assert.ok(loaderModule);
  const resolvers = [];
  const values = [];
  let currentRequestKey = "A";
  const loader = loaderModule.createMapSnapshotLoader({
    currentRequestKey: () => currentRequestKey,
    load: (requestKey) => new Promise((resolve) => resolvers.push({ requestKey, resolve })),
    onValue: (requested) => values.push(requested),
    minIntervalMs: 0,
  });

  const first = loader.request("A");
  currentRequestKey = "B";
  loader.request("B");
  resolvers.shift().resolve({ generation: "A" });
  await first;
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(values, []);
  assert.equal(resolvers.length, 1);
  resolvers.shift().resolve({ generation: "B" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(values, [{ requestKey: "B", value: { generation: "B" } }]);
});

test("map snapshot loader throttles continuous generation events", async () => {
  let currentTime = 1_000;
  const scheduled = [];
  let loads = 0;
  const loader = loaderModule.createMapSnapshotLoader({
    load: async () => { loads += 1; },
    minIntervalMs: 2_000,
    now: () => currentTime,
    schedule: (callback, delay) => { scheduled.push({ callback, delay }); return scheduled.length; },
  });
  await loader.request();
  loader.request();
  loader.request();
  assert.equal(loads, 1);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].delay, 2_000);
  currentTime += 2_000;
  scheduled[0].callback();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(loads, 2);
});

test("map snapshot loader retains the latest request key through throttling", async () => {
  let currentTime = 1_000;
  let currentRequestKey = "A";
  const scheduled = [];
  const loadKeys = [];
  const loader = loaderModule.createMapSnapshotLoader({
    currentRequestKey: () => currentRequestKey,
    load: async (requestKey) => { loadKeys.push(requestKey); },
    minIntervalMs: 2_000,
    now: () => currentTime,
    schedule: (callback, delay) => { scheduled.push({ callback, delay }); return scheduled.length; },
  });

  await loader.request("A");
  currentRequestKey = "B";
  loader.request("B");
  currentTime += 2_000;
  scheduled[0].callback();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(loadKeys, ["A", "B"]);
});

test("initial stream events do not duplicate the initial snapshot", () => {
  assert.ok(loaderModule);
  assert.equal(loaderModule.mapEventNeedsSnapshot({ initial: true, changedDomains: ["map-spatial"] }), false);
  assert.equal(loaderModule.mapEventNeedsSnapshot({ changedDomains: ["map-spatial"] }), true);
  assert.equal(loaderModule.mapEventNeedsSnapshot({ changedDomains: [] }), false);
});

test("aborted snapshot loads are silent", async () => {
  assert.ok(loaderModule);
  const errors = [];
  const loader = loaderModule.createMapSnapshotLoader({
    load: async () => { throw new DOMException("aborted", "AbortError"); },
    onError: (error) => errors.push(error),
  });
  await loader.request();
  assert.deepEqual(errors, []);
});
