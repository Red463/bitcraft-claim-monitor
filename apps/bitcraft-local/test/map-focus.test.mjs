import assert from "node:assert/strict";
import test from "node:test";

import { urlMapFocus } from "../src/utils/mapFocus.ts";

test("map focus reads canonical global-market handoff parameters", () => {
  const previousWindow = globalThis.window;
  try {
    globalThis.window = { location: { search: "?page=map&regionId=19&x=123&z=-456&label=Trade+Hub" } };
    assert.deepEqual(urlMapFocus(), {
      name: "Trade Hub",
      locationX: 123,
      locationZ: -456,
      regionId: "19",
    });
  } finally {
    globalThis.window = previousWindow;
  }
});

test("map focus retains backward compatibility with legacy marker parameters", () => {
  const previousWindow = globalThis.window;
  try {
    globalThis.window = { location: { search: "?page=map&mapName=Old+Marker&mapX=10&mapZ=20" } };
    assert.deepEqual(urlMapFocus(), {
      name: "Old Marker",
      locationX: 10,
      locationZ: 20,
      regionId: undefined,
    });
  } finally {
    globalThis.window = previousWindow;
  }
});
