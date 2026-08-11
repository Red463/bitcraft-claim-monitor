import assert from "node:assert/strict";
import test from "node:test";

import { MAP_MARKER_PRESENTATIONS, claimMarkerPresentation, mapMarkerPresentation } from "../src/pages/map/mapMarkerPresentation.mjs";

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

test("claim marker tiers select only the matching same-origin badge", () => {
  assert.deepEqual(claimMarkerPresentation(1), {
    mode: "image",
    iconUrl: "/map-icons/claims/claim_t1.png",
    glyph: "I",
    badgeCrop: true,
  });
  assert.equal(claimMarkerPresentation(10).iconUrl, "/map-icons/claims/claim_t10.png");
  assert.equal(claimMarkerPresentation(0).mode, "canvas");
  assert.equal(claimMarkerPresentation(11).mode, "canvas");
  assert.equal(claimMarkerPresentation("6").mode, "canvas");
  assert.doesNotMatch(JSON.stringify(claimMarkerPresentation(6)), /https?:\/\//);
});
