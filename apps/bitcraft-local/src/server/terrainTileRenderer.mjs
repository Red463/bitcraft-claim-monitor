import sharp from "sharp";

import { decodeTerrainBiomeBlend, terrainBiomeMaskAlpha } from "../shared/terrainBiomes.mjs";
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
  };
  TERRAIN_CONTEXTS.set(generation, context);
  return context;
}

export async function renderTerrainTileChannels({ generation, evidence, zoom, x, y, tileSize = DEFAULT_TILE_SIZE, context = null }) {
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
  const { chunks } = prepared;
  const terrainRgba = Buffer.alloc(tileSize * tileSize * 4);
  const waterRgba = Buffer.alloc(tileSize * tileSize * 4);
  const biomeMaskRgba = new Map();
  const warnings = [];
  const renderedByCell = new Map();

  const sampleCell = (mapX, mapZ) => {
    const chunkX = Math.floor((mapX - evidence.chunkOriginX) / chunkSpan);
    const chunkZ = Math.floor((mapZ - evidence.chunkOriginZ) / chunkSpan);
    const chunk = chunks.get(`${chunkX}:${chunkZ}`);
    if (!chunk || chunk.side !== evidence.side) return null;
    const localX = Math.floor((mapX - evidence.chunkOriginX - chunkX * chunkSpan) / evidence.cellSize);
    const sourceLocalZ = Math.floor((mapZ - evidence.chunkOriginZ - chunkZ * chunkSpan) / evidence.cellSize);
    if (localX < 0 || localX >= evidence.side || sourceLocalZ < 0 || sourceLocalZ >= evidence.side) return null;
    const localZ = evidence.zDirection === 1 ? sourceLocalZ : evidence.side - 1 - sourceLocalZ;
    const cellIndex = evidence.indexOrder === "z-major" ? localZ * evidence.side + localX : localX * evidence.side + localZ;
    const elevation = Number(chunk.elevations[cellIndex]) || 0;
    return {
      key: `${chunkX}:${chunkZ}:${cellIndex}`,
      mapX: chunkX * evidence.side + localX,
      mapZ: chunkZ * evidence.side + sourceLocalZ,
      surface: evidence.surfaceTypes[chunk.waterBodyTypes[cellIndex]] ?? "ground",
      biomeContributions: decodeTerrainBiomeBlend(chunk.biomes[cellIndex], chunk.biomeDensity[cellIndex]),
      elevation,
      originalElevation: Number(chunk.originalElevations?.[cellIndex] ?? elevation) || 0,
      waterLevel: Number(chunk.waterLevels?.[cellIndex] ?? elevation) || 0,
    };
  };

  for (let pixelY = 0; pixelY < tileSize; pixelY += 1) {
    const projectedY = (y * tileSize + pixelY + 0.5) / scale;
    const mapZ = -projectedY * APOTHEM;
    for (let pixelX = 0; pixelX < tileSize; pixelX += 1) {
      const mapX = (x * tileSize + pixelX + 0.5) / scale;
      const cell = sampleCell(mapX, mapZ);
      if (!cell) continue;
      const waterCell = cell.surface !== "ground";
      let rendered = renderedByCell.get(cell.key);
      if (!rendered) {
        const north = sampleCell(mapX, mapZ + evidence.cellSize) ?? cell;
        const east = sampleCell(mapX + evidence.cellSize, mapZ) ?? cell;
        const south = sampleCell(mapX, mapZ - evidence.cellSize) ?? cell;
        const west = sampleCell(mapX - evidence.cellSize, mapZ) ?? cell;
        const neighbors = [north, east, south, west];
        const relief = (west.originalElevation - east.originalElevation) + (north.originalElevation - south.originalElevation);
        const depth = Math.max(0, cell.waterLevel - cell.elevation);
        const shoreline = neighbors.some((neighbor) => neighbor.surface !== cell.surface && (neighbor.surface === "ground" || cell.surface === "ground"));
        rendered = {
          colour: terrainCellRgba({ ...cell, relief, depth, shoreline, warnings }),
          strongestDensity: Math.max(1, ...cell.biomeContributions.map(({ density }) => density)),
        };
        renderedByCell.set(cell.key, rendered);
      }
      const offset = (pixelY * tileSize + pixelX) * 4;
      (waterCell ? waterRgba : terrainRgba).set(rendered.colour, offset);
      for (const contributor of cell.biomeContributions) {
        let mask = biomeMaskRgba.get(contributor.biomeType);
        if (!mask) {
          mask = Buffer.alloc(tileSize * tileSize * 4);
          biomeMaskRgba.set(contributor.biomeType, mask);
        }
        mask[offset] = rendered.colour[0];
        mask[offset + 1] = rendered.colour[1];
        mask[offset + 2] = rendered.colour[2];
        mask[offset + 3] = terrainBiomeMaskAlpha(contributor.density, rendered.strongestDensity);
      }
    }
  }

  const encode = (rgba) => sharp(rgba, { raw: { width: tileSize, height: tileSize, channels: 4 } })
    .webp({ quality: 82, alphaQuality: 100, smartSubsample: false, effort: 1 })
    .toBuffer();
  const [terrain, water, encodedMasks] = await Promise.all([
    encode(terrainRgba),
    encode(waterRgba),
    Promise.all([...biomeMaskRgba].map(async ([biomeType, rgba]) => [biomeType, await encode(rgba)])),
  ]);
  return { terrain, water, biomeMasks: new Map(encodedMasks) };
}
