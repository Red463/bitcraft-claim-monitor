import assert from "node:assert/strict";
import test from "node:test";

import { mapRendererPolicy } from "../src/pages/map/mapRendererPolicy.mjs";

test("external mode retains the selection-bearing compatibility URL", () => {
  assert.deepEqual(mapRendererPolicy("external", "https://bitcraftmap.com/?playerId=123"), {
    native: false,
    externalHref: "https://bitcraftmap.com/?playerId=123",
    externalLabel: "Open full map",
  });
});

test("native beta exposes only a generic privacy-safe external link", () => {
  assert.deepEqual(mapRendererPolicy("native-beta", "https://bitcraftmap.com/?playerId=123"), {
    native: true,
    externalHref: "https://bitcraftmap.com/",
    externalLabel: "Open external map",
  });
});

test("native mode offers no third-party map action", () => {
  assert.deepEqual(mapRendererPolicy("native", "https://bitcraftmap.com/?playerId=123"), {
    native: true,
    externalHref: null,
    externalLabel: null,
  });
});
