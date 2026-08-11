import assert from "node:assert/strict";
import test from "node:test";

import { MAP_MARKER_PRESENTATIONS, mapMarkerPresentation } from "../src/pages/map/mapMarkerPresentation.mjs";

test("map markers use fixed local presentation with app-owned fallbacks", () => {
  assert.deepEqual(mapMarkerPresentation("waystone"), {
    mode: "image",
    iconUrl: "/game-icons/GeneratedIcons/Other/GeneratedIcons/Items/WaystoneCrystal.webp",
    glyph: "W",
  });
  assert.deepEqual(mapMarkerPresentation("market"), {
    mode: "image",
    iconUrl: "/game-icons/GeneratedIcons/Items/HexcoinPurse.webp",
    glyph: "M",
  });
  assert.equal(mapMarkerPresentation("claim").mode, "canvas");
  assert.equal(Object.hasOwn(MAP_MARKER_PRESENTATIONS, "bank"), false);
  assert.equal(mapMarkerPresentation("bank").mode, "glyph");
  assert.doesNotMatch(JSON.stringify(mapMarkerPresentation("waystone")), /https?:\/\//);
});
