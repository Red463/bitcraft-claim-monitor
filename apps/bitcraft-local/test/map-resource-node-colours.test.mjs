import test from "node:test";
import assert from "node:assert/strict";

import {
  RESOURCE_NODE_FALLBACK_COLOUR,
  resourceFeatureColour,
  resourceNodeColour,
} from "../src/pages/map/resourceNodeColours.mjs";

test("resource node colours stay stable within the selected tier family", () => {
  assert.equal(resourceNodeColour("28", 3), "rgba(98, 255, 130, 0.92)");
  assert.equal(resourceNodeColour("028", 3), "rgba(98, 255, 130, 0.92)");
  assert.equal(resourceNodeColour("54", 3), "rgba(110, 255, 142, 0.92)");
  assert.equal(resourceNodeColour("28", 4), "rgba(134, 173, 255, 0.92)");
});

test("resource feature colours resolve by typed resource identity rather than selection order", () => {
  const tiers = { "28": 3, "54": 3 };
  const firstOrder = [
    resourceFeatureColour({ identity: "resource:28" }, tiers),
    resourceFeatureColour({ identity: "resource:54" }, tiers),
  ];
  const reverseOrder = [
    resourceFeatureColour({ identity: "resource:54" }, tiers),
    resourceFeatureColour({ identity: "resource:28" }, tiers),
  ].reverse();

  assert.deepEqual(firstOrder, reverseOrder);
  assert.notEqual(firstOrder[0], firstOrder[1]);
});

test("resource node colours fall back when identity or tier metadata is unavailable", () => {
  assert.equal(resourceNodeColour("28", null), RESOURCE_NODE_FALLBACK_COLOUR);
  assert.equal(resourceNodeColour("28", 11), RESOURCE_NODE_FALLBACK_COLOUR);
  assert.equal(resourceNodeColour("not-an-id", 3), RESOURCE_NODE_FALLBACK_COLOUR);
  assert.equal(resourceFeatureColour({ identity: "enemy:28" }, { "28": 3 }), RESOURCE_NODE_FALLBACK_COLOUR);
  assert.equal(resourceFeatureColour({ identity: "resource:99" }, { "28": 3 }), RESOURCE_NODE_FALLBACK_COLOUR);
});
