import assert from "node:assert/strict";
import test from "node:test";

let scopeModule = null;
try {
  scopeModule = await import("../src/server/marketRegionScope.mjs");
} catch {
  // The first TDD run proves the topology-driven market scope is absent.
}

test("global market scope includes every Relay-ready regional source", () => {
  assert.ok(scopeModule, "market region scope module must exist");
  const regionIds = scopeModule.readyMarketRegionIds({
    sources: {
      "region:19": { ready: true },
      "region:3": { ready: true },
      "region:23": { ready: false },
      "region:7": { ready: true },
      global: { ready: true },
    },
  }, ["19"]);

  assert.deepEqual(regionIds, ["3", "7", "19"]);
});

test("global market scope retains its configured fallback while topology is unavailable", () => {
  const regionIds = scopeModule.readyMarketRegionIds({ sources: {} }, ["19", "7"]);

  assert.deepEqual(regionIds, ["7", "19"]);
});
