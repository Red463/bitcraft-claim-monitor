export const TERRAIN_PALETTE_VERSION = 1;

const WATER = Object.freeze({
  lake: [42, 91, 119, 255],
  river: [58, 125, 145, 255],
  ocean: [24, 59, 86, 255],
  "ocean-biome": [24, 59, 86, 255],
  swamp: [52, 91, 76, 255],
});

const BIOMES = Object.freeze({
  grasslands: [84, 113, 74, 255],
  forest: [50, 88, 62, 255],
  desert: [151, 128, 75, 255],
  tundra: [125, 135, 134, 255],
  mountains: [105, 101, 101, 255],
  mountain: [105, 101, 101, 255],
  wetlands: [70, 99, 75, 255],
  swamp: [70, 99, 75, 255],
  volcanic: [92, 75, 70, 255],
});

const UNKNOWN_GROUND = Object.freeze([104, 108, 103, 255]);

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function biomeBase(name) {
  const normalized = String(name ?? "").trim().toLowerCase();
  if (BIOMES[normalized]) return BIOMES[normalized];
  for (const [token, rgba] of Object.entries(BIOMES)) if (normalized.includes(token)) return rgba;
  return null;
}

export function terrainCellRgba({ surface, biomeName, elevation, warnings = null }) {
  const water = WATER[surface];
  if (water) return [...water];
  const known = biomeBase(biomeName);
  const base = known ?? UNKNOWN_GROUND;
  if (!known && Array.isArray(warnings)) {
    const warning = `Unknown terrain biome: ${String(biomeName ?? "") || "(empty)"}`;
    if (!warnings.includes(warning)) warnings.push(warning);
  }
  const shade = Math.trunc(clamp(Number(elevation) || 0, -24, 24) / 3);
  return [
    clamp(base[0] + shade, 0, 255),
    clamp(base[1] + shade, 0, 255),
    clamp(base[2] + shade, 0, 255),
    255,
  ];
}
