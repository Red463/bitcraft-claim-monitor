type WireRecord = Record<string, unknown>;

export type TerrainSurface = "ground" | "lake" | "river" | "ocean" | "ocean-biome" | "swamp";

export type TerrainLayoutEvidence = {
  verified: boolean;
  side: number;
  cellSize: number;
  indexOrder: "z-major" | "x-major";
  zDirection: 1 | -1;
  chunkOriginX: number;
  chunkOriginZ: number;
  surfaceTypes: Readonly<Record<number, TerrainSurface>>;
  evidenceHash: string;
};

export type TerrainOrientationCandidate = Pick<TerrainLayoutEvidence, "side" | "cellSize" | "indexOrder" | "zDirection">;

export type TerrainOrientationScore = TerrainOrientationCandidate & {
  meanOriginalElevationDelta: number;
  waterMismatchRate: number;
};

export type NormalizedTerrainChunk = {
  chunkIndex: string;
  chunkX: number;
  chunkZ: number;
  dimension: "1";
  side: number;
  biomes: Uint32Array;
  biomeDensity: Uint32Array;
  elevations: Int16Array;
  waterLevels: Int16Array;
  waterBodyTypes: Uint8Array;
  zoningTypes: Uint8Array;
  originalElevations: Int16Array;
};

export type NormalizedTerrainGeneration = {
  regionId: string;
  worldRegionStateId: string;
  dimension: "1";
  observedAt: string;
  regionBounds: { minChunkX: number; minChunkZ: number; maxChunkX: number; maxChunkZ: number };
  biomes: Array<{ biomeType: number; name: string; description: string; hazardLevel: string; iconAddress: string; disallowPlayerBuild: boolean }>;
  chunks: NormalizedTerrainChunk[];
  cellCount: number;
  normalizedBytes: number;
};

const DEFAULT_MAX_CHUNKS = 20_000;
const DEFAULT_MAX_BYTES = 128 * 1024 * 1024;
const BYTES_PER_CELL = 16;
const MIN_ORIENTATION_MARGIN = 2;

function orientationKey(value: TerrainOrientationCandidate): string {
  return `${value.side}:${value.cellSize}:${value.indexOrder}:${value.zDirection}`;
}

export function selectTerrainOrientation(
  candidates: TerrainOrientationCandidate[],
  scores: TerrainOrientationScore[],
): TerrainOrientationCandidate {
  if (!candidates.length) throw new TypeError("Terrain orientation has no evidence candidates");
  const scales = new Set(candidates.map(({ side, cellSize }) => `${side}:${cellSize}`));
  if (scales.size !== 1) throw new TypeError("Terrain orientation scale is not uniquely verified");
  const candidateKeys = new Set(candidates.map(orientationKey));
  const ranked = scores
    .filter((score) => candidateKeys.has(orientationKey(score)))
    .map((score) => {
      if (!Number.isFinite(score.meanOriginalElevationDelta) || score.meanOriginalElevationDelta < 0 || !Number.isFinite(score.waterMismatchRate) || score.waterMismatchRate < 0) {
        throw new TypeError("Terrain orientation continuity scores must be finite and non-negative");
      }
      return score;
    })
    .sort((left, right) => left.meanOriginalElevationDelta - right.meanOriginalElevationDelta);
  if (ranked.length !== candidates.length || ranked.length < 2) throw new TypeError("Terrain orientation continuity evidence is incomplete");
  const best = ranked[0];
  const runnerUpElevation = ranked[1].meanOriginalElevationDelta;
  const runnerUpWater = [...ranked].sort((left, right) => left.waterMismatchRate - right.waterMismatchRate)[1].waterMismatchRate;
  const elevationMargin = best.meanOriginalElevationDelta === 0 ? Infinity : runnerUpElevation / best.meanOriginalElevationDelta;
  const waterMargin = best.waterMismatchRate === 0 ? Infinity : runnerUpWater / best.waterMismatchRate;
  const bestWater = Math.min(...ranked.map(({ waterMismatchRate }) => waterMismatchRate));
  if (best.waterMismatchRate !== bestWater || elevationMargin < MIN_ORIENTATION_MARGIN || waterMargin < MIN_ORIENTATION_MARGIN) {
    throw new TypeError("Terrain orientation continuity evidence is not decisive");
  }
  return candidates.find((candidate) => orientationKey(candidate) === orientationKey(best))!;
}

function record(value: unknown, label: string): WireRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value as WireRecord;
}

function decimal(value: unknown, label: string): string {
  const normalized = typeof value === "bigint" ? value.toString() : String(value ?? "").trim();
  if (!/^\d+$/.test(normalized)) throw new TypeError(`${label} must be a decimal integer`);
  return normalized;
}

function integer(value: unknown, label: string): number {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized)) throw new TypeError(`${label} must be a safe integer`);
  return normalized;
}

function positiveInteger(value: unknown, label: string): number {
  const normalized = integer(value, label);
  if (normalized <= 0) throw new TypeError(`${label} must be positive`);
  return normalized;
}

function numericArray(value: unknown, label: string): number[] {
  if (Array.isArray(value)) return value.map((entry, index) => integer(entry, `${label} ${index}`));
  if (ArrayBuffer.isView(value) && !(value instanceof DataView) && "length" in value) {
    return Array.from(value as unknown as ArrayLike<number>, (entry, index) => integer(entry, `${label} ${index}`));
  }
  throw new TypeError(`${label} must be an array`);
}

function aliasedInteger(row: WireRecord, keys: string[], label: string): number {
  for (const key of keys) if (row[key] != null) return integer(row[key], label);
  throw new TypeError(`${label} is missing`);
}

export function normalizeTerrainGeneration(input: {
  regionId: unknown;
  dimension: unknown;
  worldRegionRows: unknown[];
  biomeRows?: unknown[];
  terrainRows: unknown[];
  observedAt?: string;
  maxChunks?: number;
  maxBytes?: number;
}): NormalizedTerrainGeneration {
  const regionId = decimal(input.regionId, "Terrain region id");
  const dimension = decimal(input.dimension, "Terrain dimension");
  if (dimension !== "1") throw new TypeError("Terrain requires overworld dimension 1");
  if (input.worldRegionRows.length !== 1) throw new TypeError(`Terrain region ${regionId} requires exactly one world_region_state row`);
  const world = record(input.worldRegionRows[0], "Terrain world region");
  const worldRegionStateId = decimal(world.id, "Terrain world region id");
  const minChunkX = aliasedInteger(world, ["regionMinChunkX", "region_min_chunk_x", "minX"], "Terrain minimum chunk X");
  const minChunkZ = aliasedInteger(world, ["regionMinChunkZ", "region_min_chunk_z", "minZ"], "Terrain minimum chunk Z");
  const width = positiveInteger(world.regionWidthChunks ?? world.region_width_chunks ?? world.width, "Terrain region width");
  const height = positiveInteger(world.regionHeightChunks ?? world.region_height_chunks ?? world.height, "Terrain region height");
  const regionBounds = { minChunkX, minChunkZ, maxChunkX: minChunkX + width - 1, maxChunkZ: minChunkZ + height - 1 };
  const maxChunks = positiveInteger(input.maxChunks ?? DEFAULT_MAX_CHUNKS, "Terrain chunk budget");
  const maxBytes = positiveInteger(input.maxBytes ?? DEFAULT_MAX_BYTES, "Terrain byte budget");
  if (input.terrainRows.length > maxChunks) throw new TypeError(`Terrain exceeded ${maxChunks} chunk budget`);

  const chunks: NormalizedTerrainChunk[] = [];
  const seenChunkIds = new Set<string>();
  let cellCount = 0;
  let normalizedBytes = 0;
  for (const [rowIndex, value] of input.terrainRows.entries()) {
    const row = record(value, `Terrain chunk row ${rowIndex}`);
    const chunkIndex = decimal(row.chunkIndex ?? row.chunk_index, `Terrain chunk ${rowIndex} id`);
    if (seenChunkIds.has(chunkIndex)) throw new TypeError(`Terrain chunk id ${chunkIndex} is duplicated`);
    seenChunkIds.add(chunkIndex);
    const chunkX = integer(row.chunkX ?? row.chunk_x, `Terrain chunk ${chunkIndex} X`);
    const chunkZ = integer(row.chunkZ ?? row.chunk_z, `Terrain chunk ${chunkIndex} Z`);
    if (chunkX < regionBounds.minChunkX || chunkX > regionBounds.maxChunkX || chunkZ < regionBounds.minChunkZ || chunkZ > regionBounds.maxChunkZ) {
      throw new TypeError(`Terrain chunk ${chunkIndex} is outside region bounds`);
    }
    if (decimal(row.dimension, `Terrain chunk ${chunkIndex} dimension`) !== dimension) throw new TypeError(`Terrain chunk ${chunkIndex} is not in overworld dimension 1`);
    const arrays = {
      biomes: numericArray(row.biomes, `Terrain chunk ${chunkIndex} biomes`),
      biomeDensity: numericArray(row.biomeDensity ?? row.biome_density, `Terrain chunk ${chunkIndex} biome density`),
      elevations: numericArray(row.elevations, `Terrain chunk ${chunkIndex} elevations`),
      waterLevels: numericArray(row.waterLevels ?? row.water_levels, `Terrain chunk ${chunkIndex} water levels`),
      waterBodyTypes: numericArray(row.waterBodyTypes ?? row.water_body_types, `Terrain chunk ${chunkIndex} water body types`),
      zoningTypes: numericArray(row.zoningTypes ?? row.zoning_types, `Terrain chunk ${chunkIndex} zoning types`),
      originalElevations: numericArray(row.originalElevations ?? row.original_elevations, `Terrain chunk ${chunkIndex} original elevations`),
    };
    const lengths = Object.values(arrays).map((entries) => entries.length);
    if (!lengths[0] || lengths.some((length) => length !== lengths[0])) throw new TypeError(`Terrain chunk ${chunkIndex} arrays must have equal cell counts`);
    const side = Math.sqrt(lengths[0]);
    if (!Number.isInteger(side)) throw new TypeError(`Terrain chunk ${chunkIndex} cell count must be a perfect square`);
    cellCount += lengths[0];
    normalizedBytes += lengths[0] * BYTES_PER_CELL;
    if (normalizedBytes > maxBytes) throw new TypeError(`Terrain exceeded ${maxBytes} byte budget`);
    chunks.push({
      chunkIndex,
      chunkX,
      chunkZ,
      dimension: "1",
      side,
      biomes: Uint32Array.from(arrays.biomes),
      biomeDensity: Uint32Array.from(arrays.biomeDensity),
      elevations: Int16Array.from(arrays.elevations),
      waterLevels: Int16Array.from(arrays.waterLevels),
      waterBodyTypes: Uint8Array.from(arrays.waterBodyTypes),
      zoningTypes: Uint8Array.from(arrays.zoningTypes),
      originalElevations: Int16Array.from(arrays.originalElevations),
    });
  }
  chunks.sort((left, right) => left.chunkX - right.chunkX || left.chunkZ - right.chunkZ || (BigInt(left.chunkIndex) < BigInt(right.chunkIndex) ? -1 : 1));

  const biomes = (input.biomeRows ?? []).map((value, index) => {
    const row = record(value, `Terrain biome row ${index}`);
    return {
      biomeType: integer(row.biomeType ?? row.biome_type, `Terrain biome ${index} type`),
      name: String(row.name ?? "").trim(),
      description: String(row.description ?? ""),
      hazardLevel: String(row.hazardLevel ?? row.hazard_level ?? ""),
      iconAddress: String(row.iconAddress ?? row.icon_address ?? ""),
      disallowPlayerBuild: row.disallowPlayerBuild === true || row.disallow_player_build === true,
    };
  }).sort((left, right) => left.biomeType - right.biomeType);

  return {
    regionId,
    worldRegionStateId,
    dimension: "1",
    observedAt: input.observedAt ?? new Date().toISOString(),
    regionBounds,
    biomes,
    chunks,
    cellCount,
    normalizedBytes,
  };
}

export function terrainCellPoint(chunk: NormalizedTerrainChunk, index: number, evidence: TerrainLayoutEvidence): { x: number; z: number } {
  if (!evidence.verified) throw new TypeError("Terrain layout evidence is not verified");
  if (evidence.side !== chunk.side) throw new TypeError("Terrain evidence side does not match chunk side");
  if (!Number.isSafeInteger(index) || index < 0 || index >= chunk.side * chunk.side) throw new RangeError("Terrain cell index is out of range");
  const localX = evidence.indexOrder === "z-major" ? index % evidence.side : Math.floor(index / evidence.side);
  const localZ = evidence.indexOrder === "z-major" ? Math.floor(index / evidence.side) : index % evidence.side;
  return {
    x: evidence.chunkOriginX + chunk.chunkX * evidence.side * evidence.cellSize + localX * evidence.cellSize,
    z: evidence.chunkOriginZ + chunk.chunkZ * evidence.side * evidence.cellSize + evidence.zDirection * localZ * evidence.cellSize,
  };
}
