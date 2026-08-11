export const TERRAIN_PALETTE_VERSION = 3;

const WATER = Object.freeze({
  lake: [35, 68, 103, 255],
  river: [48, 92, 122, 255],
  ocean: [20, 43, 72, 255],
  "ocean-biome": [20, 43, 72, 255],
  swamp: [43, 72, 65, 255],
});

const BIOMES = Object.freeze({
  grasslands: [67, 83, 53, 255],
  forest: [39, 66, 45, 255],
  desert: [130, 109, 61, 255],
  tundra: [105, 116, 111, 255],
  mountains: [89, 87, 82, 255],
  mountain: [89, 87, 82, 255],
  wetlands: [53, 75, 55, 255],
  swamp: [53, 75, 55, 255],
  volcanic: [78, 62, 57, 255],
});

const UNKNOWN_GROUND = Object.freeze([84, 89, 80, 255]);

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function biomeBase(name) {
  const normalized = String(name ?? "").trim().toLowerCase();
  if (BIOMES[normalized]) return BIOMES[normalized];
  for (const [token, rgba] of Object.entries(BIOMES)) if (normalized.includes(token)) return rgba;
  return null;
}

function textureShade(mapX, mapZ) {
  let hash = Math.imul(Math.trunc(Number(mapX) || 0), 73_856_093) ^ Math.imul(Math.trunc(Number(mapZ) || 0), 19_349_663);
  hash = Math.imul(hash ^ (hash >>> 13), 1_274_126_177);
  return ((hash ^ (hash >>> 16)) >>> 0) % 7 - 3;
}

export function terrainCellRgba({
  surface,
  biomeName,
  elevation,
  originalElevation = elevation,
  biomeDensity = 50,
  relief = 0,
  depth = 0,
  shoreline = false,
  mapX = 0,
  mapZ = 0,
  warnings = null,
}) {
  const texture = textureShade(mapX, mapZ);
  const water = WATER[surface];
  if (water) {
    const boundedDepth = clamp(Number(depth) || 0, 0, 24);
    const depthShade = Math.trunc(boundedDepth / 2);
    const coastShade = shoreline ? 13 : 0;
    return [
      clamp(water[0] - depthShade + coastShade + texture, 0, 255),
      clamp(water[1] - depthShade + coastShade + texture, 0, 255),
      clamp(water[2] + Math.trunc(depthShade / 2) + Math.trunc(coastShade / 2) + texture, 0, 255),
      255,
    ];
  }
  const known = biomeBase(biomeName);
  const base = known ?? UNKNOWN_GROUND;
  if (!known && Array.isArray(warnings)) {
    const warning = `Unknown terrain biome: ${String(biomeName ?? "") || "(empty)"}`;
    if (!warnings.includes(warning)) warnings.push(warning);
  }
  const meanElevation = ((Number(elevation) || 0) + (Number(originalElevation) || 0)) / 2;
  const elevationShade = Math.trunc(clamp(meanElevation, -24, 24) / 2.5);
  const densityShade = Math.trunc((clamp(Number(biomeDensity) || 0, 0, 100) - 50) / 12);
  const reliefShade = Math.trunc(clamp(Number(relief) || 0, -24, 24) / 3);
  return [
    clamp(base[0] + elevationShade + reliefShade + texture, 0, 255),
    clamp(base[1] + elevationShade + reliefShade + densityShade + texture, 0, 255),
    clamp(base[2] + elevationShade + reliefShade - Math.trunc(densityShade / 2) + texture, 0, 255),
    255,
  ];
}
