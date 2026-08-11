import sharp from "sharp";

import { terrainCellRgba } from "./terrainPalette.mjs";

const APOTHEM = 2 / Math.sqrt(3);
const DEFAULT_TILE_SIZE = 256;
const MAX_TILE_SIZE = 512;
const TERRAIN_CONTEXTS = new WeakMap();

function requireInteger(value, label) {
  if (!Number.isSafeInteger(value)) throw new TypeError(`${label} must be a safe integer`);
  return value;
}

export function prepareTerrainRenderContext(generation) {
  const cached = TERRAIN_CONTEXTS.get(generation);
  if (cached) return cached;
  const context = {
    chunks: new Map(generation.chunks.map((chunk) => [`${chunk.chunkX}:${chunk.chunkZ}`, chunk])),
    biomeNames: new Map((generation.biomes ?? []).map((biome) => [biome.biomeType, biome.name])),
  };
  TERRAIN_CONTEXTS.set(generation, context);
  return context;
}

export async function renderTerrainTile({ generation, evidence, zoom, x, y, tileSize = DEFAULT_TILE_SIZE, context = null }) {
  if (!evidence?.verified) throw new TypeError("Terrain layout evidence is not verified");
  requireInteger(zoom, "Terrain tile zoom");
  requireInteger(x, "Terrain tile X");
  requireInteger(y, "Terrain tile Y");
  requireInteger(tileSize, "Terrain tile size");
  if (tileSize <= 0 || tileSize > MAX_TILE_SIZE) throw new RangeError(`Terrain tile size must be between 1 and ${MAX_TILE_SIZE}`);
  const scale = 2 ** zoom;
  if (!Number.isFinite(scale) || scale <= 0) throw new RangeError("Terrain tile zoom is unsupported");

  const chunkSpan = evidence.side * evidence.cellSize;
  const prepared = context ?? prepareTerrainRenderContext(generation);
  const { chunks, biomeNames } = prepared;
  const rgba = Buffer.alloc(tileSize * tileSize * 4);
  const warnings = [];

  for (let pixelY = 0; pixelY < tileSize; pixelY += 1) {
    const projectedY = (y * tileSize + pixelY + 0.5) / scale;
    const mapZ = -projectedY * APOTHEM;
    const chunkZ = Math.floor((mapZ - evidence.chunkOriginZ) / chunkSpan);
    for (let pixelX = 0; pixelX < tileSize; pixelX += 1) {
      const mapX = (x * tileSize + pixelX + 0.5) / scale;
      const chunkX = Math.floor((mapX - evidence.chunkOriginX) / chunkSpan);
      const chunk = chunks.get(`${chunkX}:${chunkZ}`);
      if (!chunk || chunk.side !== evidence.side) continue;
      const localX = Math.floor((mapX - evidence.chunkOriginX - chunkX * chunkSpan) / evidence.cellSize);
      const sourceLocalZ = Math.floor((mapZ - evidence.chunkOriginZ - chunkZ * chunkSpan) / evidence.cellSize);
      if (localX < 0 || localX >= evidence.side || sourceLocalZ < 0 || sourceLocalZ >= evidence.side) continue;
      const localZ = evidence.zDirection === 1 ? sourceLocalZ : evidence.side - 1 - sourceLocalZ;
      const cellIndex = evidence.indexOrder === "z-major" ? localZ * evidence.side + localX : localX * evidence.side + localZ;
      const surface = evidence.surfaceTypes[chunk.waterBodyTypes[cellIndex]] ?? "ground";
      const colour = terrainCellRgba({
        surface,
        biomeName: biomeNames.get(chunk.biomes[cellIndex]) ?? "",
        elevation: chunk.elevations[cellIndex],
        warnings,
      });
      rgba.set(colour, (pixelY * tileSize + pixelX) * 4);
    }
  }

  return sharp(rgba, { raw: { width: tileSize, height: tileSize, channels: 4 } })
    .webp({ quality: 82, alphaQuality: 100, smartSubsample: false, effort: 1 })
    .toBuffer();
}
