import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("map biome key renders the shared land and water legend accessibly", async () => {
  const source = await readFile(new URL("../src/pages/map/MapBiomeKey.tsx", import.meta.url), "utf8");

  assert.match(source, /TERRAIN_LEGEND_GROUPS/);
  assert.match(source, /aria-expanded=\{open\}/);
  assert.match(source, /aria-controls="native-map-biome-key-popover"/);
  assert.match(source, /aria-label="Terrain colour key"/);
  assert.match(source, /TERRAIN_LEGEND_GROUPS\.map/);
  assert.match(source, /group\.entries\.map/);
  assert.match(source, /Terrain shading varies with elevation, biome density, relief, texture, water depth, and shorelines\./);
  assert.doesNotMatch(source, /#[0-9a-f]{3,8}|rgb\s*\(/i);
});
