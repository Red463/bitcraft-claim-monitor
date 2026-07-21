import assert from "node:assert/strict";
import test from "node:test";

import {
  acquisitionRouteKind,
  acquisitionRouteLabel,
  acquisitionRouteMetrics,
  formatProbabilityRate,
} from "../src/pages/craftPlanningRoutePresentation.mjs";

const gypsite = { id: "3001", name: "Rough Gypsite", kind: "items" };

test("gathering labels use the source node instead of a generic recipe label", () => {
  const route = {
    id: "mud-route",
    label: "Recipe -> Rough Gypsite",
    routeType: "gathering-byproduct",
    gatheringSource: { label: "Mud Mound" },
    producer: { name: "Rough Clay Output" },
  };

  assert.equal(acquisitionRouteKind(route), "Gathering byproduct");
  assert.equal(acquisitionRouteLabel(route, gypsite), "Gather byproduct from Mud Mound while collecting Rough Clay Output");
});

test("craft and logistics labels expose inputs, station, and transport intent", () => {
  assert.equal(acquisitionRouteLabel({
    routeType: "craft",
    label: "Recipe -> Rough Gypsite",
    buildingName: "Masonry Station",
    inputs: [{ name: "Rough Brick" }, { name: "Water" }],
  }, gypsite), "Rough Brick + Water -> Rough Gypsite at Masonry Station");

  assert.equal(acquisitionRouteKind({ routeType: "craft", isTransportRoute: true }), "Logistics");
  assert.equal(acquisitionRouteLabel({
    routeType: "craft",
    isTransportRoute: true,
    label: "Unpack Rough Gypsite Package",
  }, gypsite), "Unpack Rough Gypsite Package");
});

test("finite gathering metrics lead with whole nodes and preserve exact work", () => {
  assert.deepEqual(acquisitionRouteMetrics({
    routeType: "gathering-byproduct",
    probabilityStatus: "expected",
    expectedPerProgress: 0.0024,
    expectedPerResource: 2.4,
    resourceHealth: 1000,
  }, { missingQuantity: 73, multiplier: 1 }), {
    status: "available",
    basis: "node",
    expectedPerUnit: 2.4,
    exactUnits: 30.416666666666668,
    plannedUnits: 31,
    totalProgress: 30417,
    progressPerExpectedItem: 416.6666666666667,
    totalActions: null,
  });
});

test("zero shortage, prospecting, crafting, and unavailable rates remain honest", () => {
  assert.equal(acquisitionRouteMetrics({
    routeType: "gathering",
    expectedPerResource: 2,
    expectedPerProgress: 0.002,
    resourceHealth: 1000,
  }, { missingQuantity: 0 }).plannedUnits, 0);

  assert.equal(acquisitionRouteMetrics({
    routeType: "gathering",
    gatheringMode: "prospecting",
    expectedPerProgress: 0.04,
  }, { missingQuantity: 8 }).basis, "progress");

  assert.deepEqual(acquisitionRouteMetrics({
    routeType: "craft",
    expectedPerCraft: 3.02,
    actionsRequired: 5,
    probabilityStatus: "expected",
  }, { missingQuantity: 10, multiplier: 1.1 }), {
    status: "available",
    basis: "craft",
    expectedPerUnit: 3.02,
    exactUnits: 3.642384105960265,
    plannedUnits: 4,
    totalProgress: null,
    progressPerExpectedItem: null,
    totalActions: 20,
  });

  assert.deepEqual(acquisitionRouteMetrics({
    routeType: "craft",
    probabilityStatus: "unavailable",
  }, { missingQuantity: 10 }), { status: "unavailable" });
});

test("technical probability rates never round a non-zero value to zero", () => {
  assert.equal(formatProbabilityRate(0.002), "0.002");
  assert.equal(formatProbabilityRate(0.0000000123), "1.23e-8");
  assert.equal(formatProbabilityRate(0), "0");
});
