import assert from "node:assert/strict";
import test from "node:test";

let loaderModule = null;
try {
  loaderModule = await import("../src/pages/map/mapSnapshotLoader.mjs");
} catch {
  // RED: the coalescing map loader does not exist yet.
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
  assert.deepEqual(values.map(({ generation }) => generation), ["1", "2"]);
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
