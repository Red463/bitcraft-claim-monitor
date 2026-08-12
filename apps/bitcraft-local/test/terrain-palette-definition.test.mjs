import assert from "node:assert/strict";
import test from "node:test";

import {
  TERRAIN_PALETTE_VERSION,
  TERRAIN_LEGEND_GROUPS,
  TERRAIN_WATER_COLOURS,
} from "../src/shared/terrainPaletteDefinition.mjs";
import { TERRAIN_BIOME_DEFINITIONS } from "../src/shared/terrainBiomes.mjs";

test("terrain legend entries reference the canonical renderer colour tuples", () => {
  const entries = TERRAIN_LEGEND_GROUPS.flatMap((group) => group.entries);
  const byKey = new Map(entries.map((entry) => [entry.key, entry]));

  assert.equal(TERRAIN_PALETTE_VERSION, 4);
  for (const biome of TERRAIN_BIOME_DEFINITIONS) assert.equal(byKey.get(`biome-${biome.biomeType}`).rgba, biome.rgba);
  assert.equal(byKey.get("lake").rgba, TERRAIN_WATER_COLOURS.lake);
  assert.equal(byKey.get("river").rgba, TERRAIN_WATER_COLOURS.river);
  assert.equal(byKey.get("ocean").rgba, TERRAIN_WATER_COLOURS.ocean);
  assert.equal(byKey.get("swamp-water").rgba, TERRAIN_WATER_COLOURS.swamp);
  assert.deepEqual(TERRAIN_LEGEND_GROUPS.map((group) => group.label), ["Biomes", "Water types"]);
  assert.deepEqual(entries.slice(0, 19).map((entry) => entry.label), TERRAIN_BIOME_DEFINITIONS.map(({ label }) => label));
});
