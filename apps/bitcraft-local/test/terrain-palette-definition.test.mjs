import assert from "node:assert/strict";
import test from "node:test";

import {
  TERRAIN_BIOME_COLOURS,
  TERRAIN_LEGEND_GROUPS,
  TERRAIN_UNKNOWN_GROUND_COLOUR,
  TERRAIN_WATER_COLOURS,
} from "../src/shared/terrainPaletteDefinition.mjs";

test("terrain legend entries reference the canonical renderer colour tuples", () => {
  const entries = TERRAIN_LEGEND_GROUPS.flatMap((group) => group.entries);
  const byKey = new Map(entries.map((entry) => [entry.key, entry]));

  assert.equal(byKey.get("grasslands").rgba, TERRAIN_BIOME_COLOURS.grasslands);
  assert.equal(byKey.get("mountains").rgba, TERRAIN_BIOME_COLOURS.mountains);
  assert.equal(byKey.get("unknown-ground").rgba, TERRAIN_UNKNOWN_GROUND_COLOUR);
  assert.equal(byKey.get("lake").rgba, TERRAIN_WATER_COLOURS.lake);
  assert.equal(byKey.get("river").rgba, TERRAIN_WATER_COLOURS.river);
  assert.equal(byKey.get("ocean").rgba, TERRAIN_WATER_COLOURS.ocean);
  assert.equal(byKey.get("swamp-water").rgba, TERRAIN_WATER_COLOURS.swamp);
  assert.deepEqual(TERRAIN_LEGEND_GROUPS.map((group) => group.label), ["Land biomes", "Water types"]);
  assert.deepEqual(entries.map((entry) => entry.label), [
    "Grasslands", "Forest", "Desert", "Tundra", "Mountains", "Wetlands", "Volcanic", "Unknown ground",
    "Lake", "River", "Ocean", "Swamp",
  ]);
});
