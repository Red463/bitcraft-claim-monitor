import test from "node:test";
import assert from "node:assert/strict";

import {
  RESOURCE_NODE_FALLBACK_COLOUR,
  resourceFeatureColour,
  resourceNodeColour,
  selectedResourceTierMap,
} from "../src/pages/map/resourceNodeColours.mjs";

test("resource node colours stay stable within the selected tier family", () => {
  assert.equal(resourceNodeColour("28", 3), "rgba(38, 207, 70, 0.92)");
  assert.equal(resourceNodeColour("028", 3), "rgba(38, 207, 70, 0.92)");
  assert.equal(resourceNodeColour("54", 3), "rgba(62, 231, 94, 0.92)");
  assert.equal(resourceNodeColour("28", 4), "rgba(74, 113, 207, 0.92)");
  assert.notEqual(resourceNodeColour("28", 3), resourceNodeColour("1000028", 3));
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

test("selected resource tiers come from catalog metadata independent of selection order", () => {
  const catalog = new Map([
    ["resource:28", { tier: "3" }],
    ["resource:54", { tier: 3 }],
    ["resource:99", { tier: "unknown" }],
  ]);

  assert.deepEqual(selectedResourceTierMap(["54", "28", "99"], catalog), {
    "28": 3,
    "54": 3,
    "99": null,
  });
  assert.deepEqual(selectedResourceTierMap(["028", "54"], catalog), {
    "28": 3,
    "54": 3,
  });
});
