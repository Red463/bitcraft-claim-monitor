export const TERRAIN_UNKNOWN_GROUND_COLOUR = Object.freeze([84, 89, 80, 255]);

const RAW_BIOME_DEFINITIONS = [
  [0, "Dev", [84, 89, 80, 255]],
  [1, "Calm Forest", [38, 66, 45, 255]],
  [2, "Pine Woods", [29, 58, 47, 255]],
  [3, "Snowy Peaks", [184, 197, 195, 255]],
  [4, "Breezy Grasslands", [75, 91, 54, 255]],
  [5, "Autumn Forest", [102, 78, 42, 255]],
  [6, "Misty Tundra", [119, 132, 130, 255]],
  [7, "Desert Wasteland", [148, 119, 64, 255]],
  [8, "Swamp", [50, 75, 55, 255]],
  [9, "Rocky Garden", [94, 88, 75, 255]],
  [10, "Open Ocean", [20, 43, 72, 255]],
  [11, "Safe Meadows", [91, 111, 67, 255]],
  [12, "Cave", [58, 60, 63, 255]],
  [13, "Jungle", [29, 75, 42, 255]],
  [14, "Sapwoods", [56, 88, 56, 255]],
  [15, "Deserted Beach", [161, 139, 89, 255]],
  [16, "Tropical Canopy", [38, 91, 51, 255]],
  [17, "Volcanic Crag", [84, 55, 50, 255]],
  [18, "Uncharted Ocean", [13, 31, 55, 255]],
];

export const TERRAIN_BIOME_DEFINITIONS = Object.freeze(RAW_BIOME_DEFINITIONS.map(([biomeType, label, rgba]) => Object.freeze({
  biomeType,
  label,
  rgba: Object.freeze(rgba),
})));

const BIOME_COLOUR_BY_TYPE = new Map(TERRAIN_BIOME_DEFINITIONS.map(({ biomeType, rgba }) => [biomeType, rgba]));

export function decodeTerrainBiomeBlend(packedBiomes, packedDensities) {
  const biomes = Number(packedBiomes) >>> 0;
  const hasDensities = packedDensities !== null
    && packedDensities !== undefined
    && Number.isFinite(Number(packedDensities));
  const densities = hasDensities ? Number(packedDensities) >>> 0 : 0;
  if (!biomes && (!hasDensities || (densities & 0xff) === 0)) return [];
  const result = [];
  for (let shift = 0; shift <= 24; shift += 8) {
    const biomeType = (biomes >>> shift) & 0xff;
    if (shift > 0 && biomeType === 0) continue;
    const density = hasDensities ? (densities >>> shift) & 0xff : shift === 0 ? 128 : 0;
    if (density > 0) result.push({ biomeType, density });
  }
  return result;
}

export function terrainBiomeColour(biomeType) {
  return BIOME_COLOUR_BY_TYPE.get(Number(biomeType)) ?? TERRAIN_UNKNOWN_GROUND_COLOUR;
}

export function blendTerrainBiomeColours(contributors, warnings = null) {
  const usable = Array.isArray(contributors)
    ? contributors.filter(({ density }) => Number.isFinite(Number(density)) && Number(density) > 0)
    : [];
  if (!usable.length) return TERRAIN_UNKNOWN_GROUND_COLOUR;
  let totalDensity = 0;
  const totals = [0, 0, 0];
  for (const contributor of usable) {
    const biomeType = Number(contributor.biomeType);
    const density = Number(contributor.density);
    const known = BIOME_COLOUR_BY_TYPE.has(biomeType);
    const colour = terrainBiomeColour(biomeType);
    if (!known && Array.isArray(warnings)) {
      const warning = `Unknown terrain biome type: ${biomeType}`;
      if (!warnings.includes(warning)) warnings.push(warning);
    }
    totalDensity += density;
    for (let channel = 0; channel < 3; channel += 1) totals[channel] += colour[channel] * density;
  }
  if (totalDensity <= 0) return TERRAIN_UNKNOWN_GROUND_COLOUR;
  return Object.freeze(totals.map((value) => Math.round(value / totalDensity)).concat(255));
}

export function terrainBiomeMaskAlpha(density, strongestDensity) {
  const strongest = Math.max(1, Number(strongestDensity) || 0);
  const contribution = Math.max(0, Math.min(strongest, Number(density) || 0));
  return Math.max(115, Math.min(255, Math.round(255 * (0.45 + 0.55 * contribution / strongest))));
}
