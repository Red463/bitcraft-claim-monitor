import assert from "node:assert/strict";
import test from "node:test";

import {
  createCraftPlanEffortBaselineCache,
  craftPlanBaselineConfig,
  craftPlanBaselineRevision,
  craftPlanEffortBaselineKey,
} from "../src/server/craftPlanEffortCache.mjs";

test("baseline cache shares concurrent work", async () => {
  const cache = createCraftPlanEffortBaselineCache({ maxEntries: 2, maxBytes: 1024 });
  let calls = 0;
  const load = async () => { calls += 1; return { materials: [{ key: "items:1", required: 10 }] }; };
  const [first, second] = await Promise.all([cache.getOrCreate("same", load), cache.getOrCreate("same", load)]);
  assert.strictEqual(first, second);
  assert.equal(calls, 1);
  assert.equal(cache.stats().inflightReuse, 1);
});

test("baseline keys include config, catalog revision, and model version", () => {
  const config = { targets: [{ id: "1", kind: "items", quantity: 1 }], routeOverrides: {} };
  assert.notEqual(craftPlanEffortBaselineKey(config, "catalog-a", 1), craftPlanEffortBaselineKey(config, "catalog-b", 1));
  assert.notEqual(craftPlanEffortBaselineKey(config, "catalog-a", 1), craftPlanEffortBaselineKey({ ...config, routeOverrides: { "items:1": "recipe:2" } }, "catalog-a", 1));
});

test("canonical baseline removes live sources and completed building progress", () => {
  const result = craftPlanBaselineConfig({
    enabled: true,
    targets: [{ id: "1", kind: "building", quantity: 2, name: "Station" }],
    routeOverrides: { "items:2": "recipe:3" },
    gatheredItemKeys: ["items:4"],
    multipliers: { "items:5": { multiplier: 1.2, note: "buffer" } },
    sectionOverrides: { "items:5": "Farming" },
    rowNameOverrides: { "items:5": "Fiber" },
    sourceRules: { storageContainerIds: ["storage-1"] },
    buildingProgress: { "building:1": { baselineEntityIds: ["a"], completedEntityIds: ["a"] } },
  });

  assert.deepEqual(result.buildingProgress, {});
  assert.deepEqual(result.sourceRules, {
    storageContainerIds: [],
    playerIds: [],
    craftPlayerIds: [],
    bankPlayerIds: [],
    deployableContainerIds: [],
  });
  assert.equal(result.sectionOverrides["items:5"], "Farming");
});

test("semantic baseline revisions ignore display and source state but include plan inputs", () => {
  const base = {
    targets: [{ id: "1", kind: "items", quantity: 10 }],
    routeOverrides: {},
    gatheredItemKeys: [],
    multipliers: { "items:1": { multiplier: 1.2, note: "first explanation" } },
    sourceRules: { storageContainerIds: ["a"] },
    sectionOverrides: {},
    rowNameOverrides: {},
    buildingProgress: {},
  };
  const revision = craftPlanBaselineRevision(base, "catalog-a", 3);

  assert.equal(craftPlanBaselineRevision({
    ...base,
    sourceRules: { storageContainerIds: ["b"] },
    sectionOverrides: { "items:1": "Farming" },
    rowNameOverrides: { "items:1": "Renamed" },
    buildingProgress: { "building:2": { completedEntityIds: ["done"] } },
    multipliers: { "items:1": { multiplier: 1.2, note: "rewritten explanation" } },
  }, "catalog-a", 3), revision);
  assert.notEqual(craftPlanBaselineRevision({
    ...base,
    targets: [{ id: "1", kind: "items", quantity: 11 }],
  }, "catalog-a", 3), revision);
  assert.notEqual(craftPlanBaselineRevision({
    ...base,
    multipliers: { "items:1": { multiplier: 1.3, note: "first explanation" } },
  }, "catalog-a", 3), revision);
  assert.notEqual(craftPlanBaselineRevision(base, "catalog-b", 3), revision);
});

test("baseline cache drops rejected and oversized loads and evicts the oldest entry", async () => {
  const cache = createCraftPlanEffortBaselineCache({ maxEntries: 2, maxBytes: 80 });
  await assert.rejects(cache.getOrCreate("bad", async () => { throw new Error("failed"); }), /failed/);
  await cache.getOrCreate("a", async () => ({ value: "a" }));
  await cache.getOrCreate("b", async () => ({ value: "b" }));
  await cache.getOrCreate("c", async () => ({ value: "c" }));
  assert.equal(cache.stats().entries, 2);
  await cache.getOrCreate("oversized", async () => ({ value: "x".repeat(100) }));
  assert.equal(cache.stats().entries, 2);
});
