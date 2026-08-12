import {
  TERRAIN_BIOME_COLOURS,
  TERRAIN_PALETTE_VERSION,
  TERRAIN_UNKNOWN_GROUND_COLOUR,
  TERRAIN_WATER_COLOURS,
} from "../shared/terrainPaletteDefinition.mjs";

export { TERRAIN_PALETTE_VERSION };

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function biomeBase(name) {
  const normalized = String(name ?? "").trim().toLowerCase();
  if (TERRAIN_BIOME_COLOURS[normalized]) return TERRAIN_BIOME_COLOURS[normalized];
  for (const [token, rgba] of Object.entries(TERRAIN_BIOME_COLOURS)) if (normalized.includes(token)) return rgba;
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
  const water = TERRAIN_WATER_COLOURS[surface];
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
  const base = known ?? TERRAIN_UNKNOWN_GROUND_COLOUR;
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
