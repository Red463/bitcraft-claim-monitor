import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWatchtowerEmpireFilters,
  filterWatchtowerRows,
  mapCoordinateLabel,
  presentWatchtowerRows,
} from "../src/pages/empires/watchtowerPresentation.ts";

const towers = [
  { towerId: "tower-a-2", empireId: "earth", empireName: "The Earth Kingdom", nickname: "Fallen Empire's Watchtower", locationX: 20, locationZ: 5 },
  { towerId: "tower-a-1", empireId: "earth", empireName: "The Earth Kingdom", nickname: "Fallen Empire's Watchtower", locationX: 10, locationZ: 8 },
  { towerId: "tower-b-1", empireId: "flame", empireName: "Flame Empire", nickname: "Western Signal", locationX: 30, locationZ: 2 },
];

const empires = [
  { entityId: "earth", name: "The Earth Kingdom" },
  { entityId: "flame", name: "Flame Empire" },
];

test("presentWatchtowerRows replaces generic BitJita names with stable per-empire labels", () => {
  const rows = presentWatchtowerRows(towers);

  assert.deepEqual(rows.map((row) => [row.towerId, row.displayName, row.rawNickname, row.shortTowerId]), [
    ["tower-a-1", "Watchtower #1", "", "a-1"],
    ["tower-a-2", "Watchtower #2", "", "a-2"],
    ["tower-b-1", "Watchtower #1", "Western Signal", "b-1"],
  ]);
});

test("buildWatchtowerEmpireFilters includes all empires and sorts by tower count", () => {
  const filters = buildWatchtowerEmpireFilters(empires, presentWatchtowerRows(towers));

  assert.deepEqual(filters.map((filter) => [filter.id, filter.label, filter.count]), [
    ["all", "All empires", 3],
    ["earth", "The Earth Kingdom", 2],
    ["flame", "Flame Empire", 1],
  ]);
});

test("filterWatchtowerRows falls back to all rows when an empire selection is stale", () => {
  const rows = presentWatchtowerRows(towers);

  assert.deepEqual(filterWatchtowerRows(rows, "earth").map((row) => row.towerId), ["tower-a-1", "tower-a-2"]);
  assert.deepEqual(filterWatchtowerRows(rows, "missing").map((row) => row.towerId), rows.map((row) => row.towerId));
});

test("mapCoordinateLabel clearly labels BitJita coordinates as map coordinates", () => {
  assert.equal(mapCoordinateLabel({ locationX: 28684, locationZ: 25875 }), "Map coords 28,684, 25,875");
  assert.equal(mapCoordinateLabel({}), "Map coords -");
});
