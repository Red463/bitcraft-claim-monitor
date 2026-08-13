import assert from "node:assert/strict";
import test from "node:test";

import { nextMapTool } from "../src/pages/map/mapToolDockState.mjs";

test("requesting a closed map tool opens it", () => {
  assert.equal(nextMapTool(null, "layers"), "layers");
});

test("requesting the active map tool closes it", () => {
  assert.equal(nextMapTool("players", "players"), null);
});

test("requesting another map tool switches directly", () => {
  assert.equal(nextMapTool("biomes", "resources"), "resources");
});

test("map tool state rejects unknown tool identities", () => {
  assert.throws(() => nextMapTool("layers", "unknown"), /Unknown map tool/);
});
