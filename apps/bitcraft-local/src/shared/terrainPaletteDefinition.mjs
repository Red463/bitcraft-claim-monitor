import {
  TERRAIN_BIOME_DEFINITIONS,
  TERRAIN_UNKNOWN_GROUND_COLOUR,
} from "./terrainBiomes.mjs";

export const TERRAIN_PALETTE_VERSION = 4;

export { TERRAIN_UNKNOWN_GROUND_COLOUR };

export const TERRAIN_WATER_COLOURS = Object.freeze({
  lake: Object.freeze([35, 68, 103, 255]),
  river: Object.freeze([48, 92, 122, 255]),
  ocean: Object.freeze([20, 43, 72, 255]),
  "ocean-biome": Object.freeze([20, 43, 72, 255]),
  swamp: Object.freeze([43, 72, 65, 255]),
});

// Compatibility for the current name-based renderer. Task 2 replaces this
// with numeric biome blending while preserving the exported palette boundary.
export const TERRAIN_BIOME_COLOURS = Object.freeze({
  grasslands: TERRAIN_BIOME_DEFINITIONS[4].rgba,
  forest: TERRAIN_BIOME_DEFINITIONS[1].rgba,
  desert: TERRAIN_BIOME_DEFINITIONS[7].rgba,
  tundra: TERRAIN_BIOME_DEFINITIONS[6].rgba,
  mountains: TERRAIN_BIOME_DEFINITIONS[9].rgba,
  mountain: TERRAIN_BIOME_DEFINITIONS[9].rgba,
  wetlands: TERRAIN_BIOME_DEFINITIONS[8].rgba,
  swamp: TERRAIN_BIOME_DEFINITIONS[8].rgba,
  volcanic: TERRAIN_BIOME_DEFINITIONS[17].rgba,
});

export const TERRAIN_LEGEND_GROUPS = Object.freeze([
  Object.freeze({
    key: "biomes",
    label: "Biomes",
    entries: Object.freeze(TERRAIN_BIOME_DEFINITIONS.map((biome) => Object.freeze({
      key: `biome-${biome.biomeType}`,
      label: biome.label,
      rgba: biome.rgba,
    }))),
  }),
  Object.freeze({
    key: "water",
    label: "Water types",
    entries: Object.freeze([
      Object.freeze({ key: "lake", label: "Lake", rgba: TERRAIN_WATER_COLOURS.lake }),
      Object.freeze({ key: "river", label: "River", rgba: TERRAIN_WATER_COLOURS.river }),
      Object.freeze({ key: "ocean", label: "Ocean", rgba: TERRAIN_WATER_COLOURS.ocean }),
      Object.freeze({ key: "swamp-water", label: "Swamp", rgba: TERRAIN_WATER_COLOURS.swamp }),
    ]),
  }),
]);
