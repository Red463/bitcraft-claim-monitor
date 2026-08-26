import assert from "node:assert/strict";
import test from "node:test";

import {
  TERRAIN_BIOME_DEFINITIONS,
  TERRAIN_UNKNOWN_GROUND_COLOUR,
  blendTerrainBiomeColours,
  decodeTerrainBiomeBlend,
  terrainBiomeColour,
  terrainBiomeMaskAlpha,
} from "../src/shared/terrainBiomes.mjs";

test("packed terrain biomes decode least-significant byte first", () => {
  assert.deepEqual(decodeTerrainBiomeBlend(0x0102040a, 0x0a404a80), [
    { biomeType: 10, density: 128 },
    { biomeType: 4, density: 74 },
    { biomeType: 2, density: 64 },
    { biomeType: 1, density: 10 },
  ]);
});

test("missing density preserves only the primary biome and zero-density cells stay empty", () => {
  assert.deepEqual(decodeTerrainBiomeBlend(0x00000201, null), [{ biomeType: 1, density: 128 }]);
  assert.deepEqual(decodeTerrainBiomeBlend(0, 128), [{ biomeType: 0, density: 128 }]);
  assert.deepEqual(decodeTerrainBiomeBlend(0, 0), []);
});

test("the numeric palette covers every current Relay biome and future IDs use the fallback", () => {
  assert.deepEqual(TERRAIN_BIOME_DEFINITIONS.map(({ biomeType }) => biomeType), Array.from({ length: 19 }, (_, index) => index));
  assert.equal(TERRAIN_BIOME_DEFINITIONS[1].label, "Calm Forest");
  assert.equal(TERRAIN_BIOME_DEFINITIONS[2].label, "Pine Woods");
  assert.deepEqual(terrainBiomeColour(255), TERRAIN_UNKNOWN_GROUND_COLOUR);
});

test("biome colours blend by density and mask alpha preserves weak contributors", () => {
  assert.deepEqual(blendTerrainBiomeColours([
    { biomeType: 1, density: 128 },
    { biomeType: 2, density: 64 },
  ]), [35, 63, 46, 255]);
  assert.equal(terrainBiomeMaskAlpha(128, 128), 255);
  assert.equal(terrainBiomeMaskAlpha(1, 128), 116);
  assert.equal(terrainBiomeMaskAlpha(0, 128), 115);
});

test("unknown contributors render visibly and emit one bounded warning", () => {
  const warnings = [];
  assert.deepEqual(blendTerrainBiomeColours([{ biomeType: 255, density: 128 }], warnings), TERRAIN_UNKNOWN_GROUND_COLOUR);
  assert.deepEqual(blendTerrainBiomeColours([{ biomeType: 255, density: 128 }], warnings), TERRAIN_UNKNOWN_GROUND_COLOUR);
  assert.deepEqual(warnings, ["Unknown terrain biome type: 255"]);
});
