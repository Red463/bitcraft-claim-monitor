export type TerrainRgba = readonly [number, number, number, number];

export type TerrainLegendEntry = Readonly<{
  key: string;
  label: string;
  rgba: TerrainRgba;
}>;

export type TerrainLegendGroup = Readonly<{
  key: string;
  label: string;
  entries: readonly TerrainLegendEntry[];
}>;

export const TERRAIN_PALETTE_VERSION: number;
export const TERRAIN_WATER_COLOURS: Readonly<Record<string, TerrainRgba>>;
export function terrainWaterRgba(options?: Readonly<{
  surface: string;
  depth?: number;
  shoreline?: boolean;
  texture?: number;
}>): TerrainRgba | null;
export const TERRAIN_BIOME_COLOURS: Readonly<Record<string, TerrainRgba>>;
export const TERRAIN_UNKNOWN_GROUND_COLOUR: TerrainRgba;
export const TERRAIN_LEGEND_GROUPS: readonly TerrainLegendGroup[];
