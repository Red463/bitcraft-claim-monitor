import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultMapPlayerSelection,
  filterMapPlayerRows,
  mapPlayerTrackingSummary,
  replaceSettlementPlayerSelection,
  sortedMapPlayerRows,
} from "../src/pages/map/playerTracking.ts";

const roster = [
  { entityId: "a", username: "Aster", signedIn: true, sessionSeconds: 120 },
  { entityId: "b", username: "Bram", signedIn: false },
  { entityId: "c", username: "Cyra", signedIn: true, sessionSeconds: 30 },
  { entityId: "d", username: "Demi", signedIn: false },
];

test("defaultMapPlayerSelection tracks online players only", () => {
  assert.deepEqual(defaultMapPlayerSelection(roster), ["a", "c"]);
  assert.deepEqual(defaultMapPlayerSelection(roster.map((player) => ({ ...player, signedIn: false }))), []);
});

test("mapPlayerTrackingSummary describes auto and manual tracking", () => {
  assert.equal(mapPlayerTrackingSummary(null, roster), "Auto: 2 online tracked");
  assert.equal(mapPlayerTrackingSummary(["a", "d"], roster), "Manual: 2 of 4 tracked");
});

test("sortedMapPlayerRows puts tracked players first, then online players, then name", () => {
  assert.deepEqual(sortedMapPlayerRows(roster, new Set(["d"])).map((row) => row.id), ["d", "a", "c", "b"]);
});

test("filterMapPlayerRows supports manager tabs and search", () => {
  const rows = sortedMapPlayerRows(roster, new Set(["a", "d"]));
  assert.deepEqual(filterMapPlayerRows(rows, "tracked", "").map((row) => row.id), ["a", "d"]);
  assert.deepEqual(filterMapPlayerRows(rows, "online", "").map((row) => row.id), ["a", "c"]);
  assert.deepEqual(filterMapPlayerRows(rows, "untracked", "").map((row) => row.id), ["c", "b"]);
  assert.deepEqual(filterMapPlayerRows(rows, "all", "br").map((row) => row.id), ["b"]);
});

test("settlement presets never alter explicitly tracked external players", () => {
  const externalPlayers = [{ playerId: "504403158356601750", username: "Outside" }];
  assert.deepEqual(replaceSettlementPlayerSelection({ settlementIds: ["1"], externalPlayers }, ["2", "3"]), {
    settlementIds: ["2", "3"],
    externalPlayers,
  });
});
