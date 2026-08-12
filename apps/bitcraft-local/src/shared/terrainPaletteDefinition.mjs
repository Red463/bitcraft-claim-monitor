export const TERRAIN_PALETTE_VERSION = 3;

export const TERRAIN_WATER_COLOURS = Object.freeze({
  lake: Object.freeze([35, 68, 103, 255]),
  river: Object.freeze([48, 92, 122, 255]),
  ocean: Object.freeze([20, 43, 72, 255]),
  "ocean-biome": Object.freeze([20, 43, 72, 255]),
  swamp: Object.freeze([43, 72, 65, 255]),
});

export const TERRAIN_BIOME_COLOURS = Object.freeze({
  grasslands: Object.freeze([67, 83, 53, 255]),
  forest: Object.freeze([39, 66, 45, 255]),
  desert: Object.freeze([130, 109, 61, 255]),
  tundra: Object.freeze([105, 116, 111, 255]),
  mountains: Object.freeze([89, 87, 82, 255]),
  mountain: Object.freeze([89, 87, 82, 255]),
  wetlands: Object.freeze([53, 75, 55, 255]),
  swamp: Object.freeze([53, 75, 55, 255]),
  volcanic: Object.freeze([78, 62, 57, 255]),
});

export const TERRAIN_UNKNOWN_GROUND_COLOUR = Object.freeze([84, 89, 80, 255]);

export const TERRAIN_LEGEND_GROUPS = Object.freeze([
  Object.freeze({
    key: "land",
    label: "Land biomes",
    entries: Object.freeze([
      Object.freeze({ key: "grasslands", label: "Grasslands", rgba: TERRAIN_BIOME_COLOURS.grasslands }),
      Object.freeze({ key: "forest", label: "Forest", rgba: TERRAIN_BIOME_COLOURS.forest }),
      Object.freeze({ key: "desert", label: "Desert", rgba: TERRAIN_BIOME_COLOURS.desert }),
      Object.freeze({ key: "tundra", label: "Tundra", rgba: TERRAIN_BIOME_COLOURS.tundra }),
      Object.freeze({ key: "mountains", label: "Mountains", rgba: TERRAIN_BIOME_COLOURS.mountains }),
      Object.freeze({ key: "wetlands", label: "Wetlands", rgba: TERRAIN_BIOME_COLOURS.wetlands }),
      Object.freeze({ key: "volcanic", label: "Volcanic", rgba: TERRAIN_BIOME_COLOURS.volcanic }),
      Object.freeze({ key: "unknown-ground", label: "Unknown ground", rgba: TERRAIN_UNKNOWN_GROUND_COLOUR }),
    ]),
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
