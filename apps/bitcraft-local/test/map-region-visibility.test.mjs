import assert from "node:assert/strict";
import test from "node:test";

import { mapFeatureInRegionScope } from "../src/pages/map/mapRegionVisibility.mjs";

test("region scope filters operational features but never tracked players", () => {
  assert.equal(mapFeatureInRegionScope({ kind: "claim", regionId: "19" }, ["19"]), true);
  assert.equal(mapFeatureInRegionScope({ kind: "claim", regionId: "12" }, ["19"]), false);
  assert.equal(mapFeatureInRegionScope({ kind: "player", regionId: "12" }, ["19"]), true);
  assert.equal(mapFeatureInRegionScope({ kind: "watchtower", regionId: "12" }, []), true);
  assert.equal(mapFeatureInRegionScope({ kind: "claim", regionId: "019" }, ["19"]), false);
});
