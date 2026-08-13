import assert from "node:assert/strict";
import test from "node:test";

import { assignPlayerMarkerColours } from "../src/pages/map/playerMarkerColours.mjs";

test("player colours are stable and unique within the visible palette", () => {
  const ids = ["1369094286756659093", "576460752388321942", "1224979098660030450"];
  const first = assignPlayerMarkerColours(ids);
  const reordered = assignPlayerMarkerColours(ids.toReversed());
  assert.deepEqual(first, reordered);
  assert.equal(new Set(Object.values(first)).size, ids.length);
});

test("player colour allocation hashes the full lossless decimal identity", () => {
  const id = "9007199254740993";
  assert.equal(assignPlayerMarkerColours([id])[id], assignPlayerMarkerColours([id])[id]);
  assert.notEqual(assignPlayerMarkerColours([id])[id], assignPlayerMarkerColours(["9007199254740994"])["9007199254740994"]);
});

test("player colour allocation rejects invalid identities and spreads a typical visible range", () => {
  assert.throws(() => assignPlayerMarkerColours([""]), /decimal/i);
  assert.throws(() => assignPlayerMarkerColours(["player-1"]), /decimal/i);
  const ids = Array.from({ length: 12 }, (_, index) => String(10_000 + index));
  assert.equal(new Set(Object.values(assignPlayerMarkerColours(ids))).size, ids.length);
});

test("player colours do not change when a colliding identity is omitted from a returned subset", () => {
  const complete = assignPlayerMarkerColours(["1", "14"]);
  const subset = assignPlayerMarkerColours(["14"]);

  assert.equal(complete["14"], subset["14"]);
  assert.notEqual(complete["1"], complete["14"]);
});

test("player colours keep distinct identities apart beyond the former coarse HSL range", () => {
  const colours = assignPlayerMarkerColours(["216172782115000006", "216172782115000190", "40189", "797186"]);

  assert.notEqual(colours["216172782115000006"], colours["216172782115000190"]);
  assert.notEqual(colours["40189"], colours["797186"], "distinct 64-bit identities must survive a 32-bit hash collision");
});

test("player hues remain distinct after CSS normalizes angles modulo 360", () => {
  const ids = ["7046029254386353131", "8423405970448732829"];
  const colours = assignPlayerMarkerColours(ids);
  const normalizedHue = (colour) => Number(/^hsl\(([^,]+)/.exec(colour)?.[1]) % 360;

  assert.notEqual(normalizedHue(colours[ids[0]]), normalizedHue(colours[ids[1]]));
  assert.ok(Object.values(colours).every((colour) => normalizedHue(colour) >= 0 && normalizedHue(colour) < 360));
});
