export type TerrainTileStatus = {
  provider: "relay";
  available: boolean;
  generation: string | null;
  generatedAt: string | null;
  observedAt: string | null;
  freshness: "live" | "stale" | "unavailable";
  ageMs: number | null;
  regionIds: string[];
  dimension: "1";
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number } | null;
  zoomRange: { min: number; max: number };
  paletteVersion: number | null;
  tileCount: number;
  totalBytes: number;
  buildStage: string;
  warnings: string[];
};

export function loadTerrainTileStatus(signal?: AbortSignal): Promise<TerrainTileStatus>;
export function terrainTileUrl(generation: string): string;
