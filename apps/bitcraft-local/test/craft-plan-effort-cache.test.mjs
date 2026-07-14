import assert from "node:assert/strict";
import test from "node:test";

import {
  createCraftPlanEffortBaselineCache,
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
