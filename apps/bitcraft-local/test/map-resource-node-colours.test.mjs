import test from "node:test";
import assert from "node:assert/strict";

import {
  RESOURCE_NODE_FALLBACK_COLOUR,
  resourceFeatureColour,
  resourceNodeColour,
  selectedResourceColourMap,
} from "../src/pages/map/resourceNodeColours.mjs";

test("resource node colours stay stable within the selected tier family", () => {
  assert.equal(resourceNodeColour("28", 3), "rgba(38, 207, 70, 0.92)");
  assert.equal(resourceNodeColour("028", 3), "rgba(38, 207, 70, 0.92)");
  assert.equal(resourceNodeColour("54", 3), "rgba(62, 231, 94, 0.92)");
  assert.equal(resourceNodeColour("28", 4), "rgba(74, 113, 207, 0.92)");
  assert.notEqual(resourceNodeColour("28", 3), resourceNodeColour("1000028", 3));
});

test("resource feature colours resolve from the final colour map by typed identity", () => {
  const colours = {
    "28": resourceNodeColour("28", 3),
    "54": resourceNodeColour("54", 3),
  };
  const firstOrder = [
    resourceFeatureColour({ identity: "resource:28" }, colours),
    resourceFeatureColour({ identity: "resource:54" }, colours),
  ];
  const reverseOrder = [
    resourceFeatureColour({ identity: "resource:54" }, colours),
    resourceFeatureColour({ identity: "resource:28" }, colours),
  ].reverse();

  assert.deepEqual(firstOrder, reverseOrder);
  assert.notEqual(firstOrder[0], firstOrder[1]);
});

test("resource node colours fall back when identity or tier metadata is unavailable", () => {
  assert.equal(resourceNodeColour("28", null), RESOURCE_NODE_FALLBACK_COLOUR);
  assert.equal(resourceNodeColour("28", 11), RESOURCE_NODE_FALLBACK_COLOUR);
  assert.equal(resourceNodeColour("not-an-id", 3), RESOURCE_NODE_FALLBACK_COLOUR);
  assert.equal(resourceFeatureColour({ identity: "enemy:28" }, { "28": "red" }), RESOURCE_NODE_FALLBACK_COLOUR);
  assert.equal(resourceFeatureColour({ identity: "resource:99" }, { "28": "red" }), RESOURCE_NODE_FALLBACK_COLOUR);
});

test("selected resource colours distinguish catalogued tierless resources independent of selection order", () => {
  const catalog = new Map([
    ["resource:700", { name: "Lost Shipment", tier: 0 }],
    ["resource:701", { name: "Lost Wreckage", tier: null }],
    ["resource:702", { name: "Lost Treasure", tier: "unknown" }],
    ["resource:28", { name: "Fallen Tree", tier: 3 }],
  ]);

  const forward = selectedResourceColourMap(["700", "701", "702", "28"], catalog);
  const reverse = selectedResourceColourMap(["28", "702", "701", "700"], catalog);

  assert.deepEqual(forward, reverse);
  assert.equal(new Set([forward["700"], forward["701"], forward["702"]]).size, 3);
  assert.equal(forward["28"], resourceNodeColour("28", 3));
  assert.equal(selectedResourceColourMap(["999"], catalog)["999"], RESOURCE_NODE_FALLBACK_COLOUR);
  assert.deepEqual(selectedResourceColourMap(["0700", "702"], catalog), {
    "700": forward["700"],
    "702": forward["702"],
  });
});
