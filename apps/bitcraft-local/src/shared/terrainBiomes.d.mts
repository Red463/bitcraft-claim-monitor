export type TerrainRgba = readonly [number, number, number, number];
export type TerrainBiomeContribution = { biomeType: number; density: number };
export type TerrainBiomeDefinition = { biomeType: number; label: string; rgba: TerrainRgba };

export const TERRAIN_UNKNOWN_GROUND_COLOUR: TerrainRgba;
export const TERRAIN_BIOME_DEFINITIONS: readonly TerrainBiomeDefinition[];
export function decodeTerrainBiomeBlend(packedBiomes: unknown, packedDensities: unknown): TerrainBiomeContribution[];
export function terrainBiomeColour(biomeType: unknown): TerrainRgba;
export function blendTerrainBiomeColours(contributors: readonly TerrainBiomeContribution[], warnings?: string[] | null): TerrainRgba;
export function terrainBiomeMaskAlpha(density: unknown, strongestDensity: unknown): number;
