import test from "node:test";
import assert from "node:assert/strict";

import { applyResourceViewport, resourceViewportDecision } from "../src/pages/map/resourceViewport.mjs";

const point = (x, z) => ({ point: { x, z, dimension: "1", coordinateSpace: "map-xz" } });

test("resource framing waits for the first usable generation", () => {
  assert.equal(resourceViewportDecision({ selectionKey: "54", snapshotSelectionKey: "54", consumedSelectionKey: "", points: [], isVisible: () => false }), "wait");
});

test("resource framing ignores a previous selection's snapshot", () => {
  assert.equal(resourceViewportDecision({ selectionKey: "54,55", snapshotSelectionKey: "54", consumedSelectionKey: "54", points: [point(10, 20)], isVisible: () => true }), "wait");
});

test("resource framing preserves a view that already contains a selected result", () => {
  assert.equal(resourceViewportDecision({ selectionKey: "54", snapshotSelectionKey: "54", consumedSelectionKey: "", points: [point(10, 20)], isVisible: () => true }), "preserve");
});

test("resource framing frames the first off-screen result generation", () => {
  assert.equal(resourceViewportDecision({ selectionKey: "54", snapshotSelectionKey: "54", consumedSelectionKey: "", points: [point(10, 20)], isVisible: () => false }), "frame");
});

test("resource framing never repeats for an unchanged consumed selection", () => {
  assert.equal(resourceViewportDecision({ selectionKey: "54", snapshotSelectionKey: "54", consumedSelectionKey: "54", points: [point(10, 20)], isVisible: () => false }), "preserve");
});

test("resource framing ignores an empty selection", () => {
  assert.equal(resourceViewportDecision({ selectionKey: "", snapshotSelectionKey: "", consumedSelectionKey: "54", points: [point(10, 20)], isVisible: () => false }), "preserve");
});

test("resource framing applies fit exactly once for repeated matching snapshots", () => {
  const frames = [];
  const input = { selectionKey: "54", snapshotSelectionKey: "54", points: [point(10, 20)], isVisible: () => false, frame: (points) => frames.push(points) };
  const consumedSelectionKey = applyResourceViewport({ ...input, consumedSelectionKey: "" });
  assert.equal(consumedSelectionKey, "54");
  assert.equal(applyResourceViewport({ ...input, consumedSelectionKey }), "54");
  assert.equal(frames.length, 1);
  assert.deepEqual(frames[0], input.points);
});
