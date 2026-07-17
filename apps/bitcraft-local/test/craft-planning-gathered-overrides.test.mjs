import assert from "node:assert/strict";
import test from "node:test";

import {
  cellItemKeys,
  gatheredCellState,
  setCellGathered,
} from "../src/pages/craftPlanningGatheredOverrides.ts";

test("cellItemKeys returns every unique typed identity in stable order", () => {
  assert.deepEqual(cellItemKeys([
    { id: "600-b", kind: "items" },
    { id: "600-a", kind: "items" },
    { id: "600-b", kind: "items" },
  ]), ["items:600-a", "items:600-b"]);
});

test("gatheredCellState distinguishes none, mixed, and all", () => {
  const cellKeys = ["items:600-a", "items:600-b"];
  assert.equal(gatheredCellState(cellKeys, []), "none");
  assert.equal(gatheredCellState(cellKeys, ["items:600-a"]), "mixed");
  assert.equal(gatheredCellState(cellKeys, ["items:600-a", "items:600-b"]), "all");
});

test("setCellGathered changes only identities in the exact opened cell", () => {
  const current = ["items:stone-carvings-t2"];
  const cell = ["items:stone-carvings-t1-a", "items:stone-carvings-t1-b"];

  const enabled = setCellGathered(current, cell, true);
  assert.deepEqual(enabled, [
    "items:stone-carvings-t1-a",
    "items:stone-carvings-t1-b",
    "items:stone-carvings-t2",
  ]);
  assert.deepEqual(setCellGathered(enabled, cell, false), ["items:stone-carvings-t2"]);
});
