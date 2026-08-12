import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("map biome key exposes accessible preview and pin controls for the live catalogue", async () => {
  const source = await readFile(new URL("../src/pages/map/MapBiomeKey.tsx", import.meta.url), "utf8");

  assert.match(source, /terrainBiomeColour/);
  assert.match(source, /TERRAIN_LEGEND_GROUPS/);
  assert.match(source, /aria-expanded=\{open\}/);
  assert.match(source, /aria-controls="native-map-biome-key-popover"/);
  assert.match(source, /aria-label="Terrain colour key"/);
  assert.match(source, /biomes\.filter\(\(biome\) => biome\.present\)/);
  assert.match(source, /waterTypes/);
  assert.match(source, /Trees/);
  assert.match(source, /<span>Biomes<\/span>/);
  assert.match(source, /aria-pressed=/);
  assert.match(source, /onPointerEnter=/);
  assert.match(source, /onPointerLeave=/);
  assert.match(source, /onFocus=/);
  assert.match(source, /onBlur=/);
  assert.match(source, /event\.key === "Escape"/);
  assert.doesNotMatch(source, /Not present in this terrain generation/);
  assert.match(source, /Hover or focus to preview; click to pin\./);
  assert.ok(source.indexOf("Hover or focus to preview; click to pin.") < source.indexOf('<section aria-labelledby="native-map-biome-key-biomes">'));
  assert.match(source, /Terrain shading varies with elevation, biome density, relief, texture, water depth, and shorelines\./);
  assert.doesNotMatch(source, /#[0-9a-f]{3,8}|rgb\s*\(/i);
});
