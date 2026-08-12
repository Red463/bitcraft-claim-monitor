import assert from "node:assert/strict";
import test from "node:test";

import { PLAYER_MARKER_PALETTE, assignPlayerMarkerColours } from "../src/pages/map/playerMarkerColours.mjs";

test("player colours are stable and unique within the visible palette", () => {
  const ids = ["1369094286756659093", "576460752388321942", "1224979098660030450"];
  const first = assignPlayerMarkerColours(ids);
  const reordered = assignPlayerMarkerColours(ids.toReversed());
  assert.deepEqual(first, reordered);
  assert.equal(new Set(Object.values(first)).size, ids.length);
  assert.ok(PLAYER_MARKER_PALETTE.length >= 12);
});

test("player colour allocation hashes the full lossless decimal identity", () => {
  const id = "9007199254740993";
  assert.equal(assignPlayerMarkerColours([id])[id], assignPlayerMarkerColours([id])[id]);
  assert.notEqual(assignPlayerMarkerColours([id])[id], assignPlayerMarkerColours(["9007199254740994"])["9007199254740994"]);
});

test("player colour allocation rejects invalid identities and probes collisions", () => {
  assert.throws(() => assignPlayerMarkerColours([""]), /decimal/i);
  assert.throws(() => assignPlayerMarkerColours(["player-1"]), /decimal/i);
  const ids = Array.from({ length: PLAYER_MARKER_PALETTE.length }, (_, index) => String(10_000 + index));
  assert.equal(new Set(Object.values(assignPlayerMarkerColours(ids))).size, PLAYER_MARKER_PALETTE.length);
});
