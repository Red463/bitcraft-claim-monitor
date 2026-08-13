import assert from "node:assert/strict";
import test from "node:test";

import { mapFeatureInRegionScope, mapFeaturesInRegionScope } from "../src/pages/map/mapRegionVisibility.mjs";

test("region scope filters operational features but never tracked players", () => {
  assert.equal(mapFeatureInRegionScope({ kind: "claim", regionId: "19" }, ["19"]), true);
  assert.equal(mapFeatureInRegionScope({ kind: "claim", regionId: "12" }, ["19"]), false);
  assert.equal(mapFeatureInRegionScope({ kind: "player", regionId: "12" }, ["19"]), true);
  assert.equal(mapFeatureInRegionScope({ kind: "watchtower", regionId: "12" }, []), true);
  assert.equal(mapFeatureInRegionScope({ kind: "claim", regionId: "019" }, ["19"]), false);
});

test("visible point projection excludes out-of-region resource and enemy points", () => {
  const visible = mapFeaturesInRegionScope([
    { kind: "resource", entityId: "resource-19", regionId: "19" },
    { kind: "resource", entityId: "resource-12", regionId: "12" },
    { kind: "enemy", entityId: "enemy-19", regionId: "19" },
    { kind: "enemy", entityId: "enemy-12", regionId: "12" },
    { kind: "player", entityId: "player-12", regionId: "12" },
  ], ["19"]);

  assert.deepEqual(visible.map((feature) => feature.entityId), ["resource-19", "enemy-19", "player-12"]);
});

test("visible point projection normalizes the selected region set once", () => {
  const NativeSet = globalThis.Set;
  let constructedSets = 0;
  globalThis.Set = class CountingSet extends NativeSet {
    constructor(values) {
      super(values);
      constructedSets += 1;
    }
  };

  try {
    mapFeaturesInRegionScope([
      { kind: "resource", regionId: "19" },
      { kind: "resource", regionId: "12" },
      { kind: "enemy", regionId: "19" },
      { kind: "player", regionId: "12" },
    ], ["19"]);
  } finally {
    globalThis.Set = NativeSet;
  }

  assert.equal(constructedSets, 1);
});
