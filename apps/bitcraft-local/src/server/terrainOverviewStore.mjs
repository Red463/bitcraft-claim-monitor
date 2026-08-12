import { readdir } from "node:fs/promises";
import path from "node:path";

import { createTerrainTileStore } from "./terrainTileStore.mjs";

function unionBounds(manifests) {
  const bounds = manifests.map((manifest) => manifest?.bounds).filter(Boolean);
  return bounds.length ? {
    minX: Math.min(...bounds.map(({ minX }) => minX)),
    minZ: Math.min(...bounds.map(({ minZ }) => minZ)),
    maxX: Math.max(...bounds.map(({ maxX }) => maxX)),
    maxZ: Math.max(...bounds.map(({ maxZ }) => maxZ)),
  } : null;
}

function mergeBiomes(manifests) {
  const merged = new Map();
  for (const manifest of manifests) for (const biome of manifest?.biomes ?? []) {
    const biomeType = Number(biome.biomeType);
    if (!Number.isInteger(biomeType) || biomeType < 0 || biomeType > 255) continue;
    const previous = merged.get(biomeType);
    merged.set(biomeType, { ...(previous ?? {}), ...biome, biomeType, present: Boolean(previous?.present || biome.present) });
  }
  return [...merged.values()].sort((left, right) => left.biomeType - right.biomeType);
}

function mergeChannels(manifests) {
  const result = {};
  for (const key of ["terrain", "water", "biomeMasks"]) result[key] = {
    tileCount: manifests.reduce((total, manifest) => total + Number(manifest?.channels?.[key]?.tileCount ?? 0), 0),
    totalBytes: manifests.reduce((total, manifest) => total + Number(manifest?.channels?.[key]?.totalBytes ?? 0), 0),
  };
  return result;
}

function mergeWaterTypes(manifests) {
  return [...new Set(manifests.flatMap((manifest) => manifest?.waterTypes ?? []))].sort();
}

async function compositeTiles(tiles) {
  if (!tiles.length) return null;
  if (tiles.length === 1) return tiles[0];
  const { default: sharp } = await import("sharp");
  const bytes = await sharp({ create: { width: 256, height: 256, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(tiles.map((tile) => ({ input: tile.bytes })))
    .webp({ quality: 86, effort: 3 })
    .toBuffer();
  return { bytes, contentType: "image/webp", generation: tiles.map(({ generation }) => generation).join("-") };
}

function createTileCache(limit = 256) {
  const values = new Map();
  return async (request, load) => {
    const key = `${request.style}:${request.z}:${request.x}:${request.y}`;
    if (values.has(key)) return values.get(key);
    const pending = Promise.resolve().then(load).catch((error) => {
      values.delete(key);
      throw error;
    });
    values.set(key, pending);
    if (values.size > limit) values.delete(values.keys().next().value);
    return pending;
  };
}

export function createTerrainOverviewStore({ dataDir }) {
  const batchesRoot = path.resolve(dataDir, "map-overview");
  const readCachedTile = createTileCache();
  let stores;
  async function loadStores() {
    if (stores) return stores;
    let entries = [];
    try { entries = await readdir(batchesRoot, { withFileTypes: true }); }
    catch (error) { if (error?.code !== "ENOENT") throw error; }
    stores = entries
      .filter((entry) => entry.isDirectory() && /^batch-\d+$/.test(entry.name))
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }))
      .map((entry) => createTerrainTileStore({ dataDir: path.join(batchesRoot, entry.name), encoder: async () => { throw new Error("Overview store is read-only"); } }));
    return stores;
  }
  return {
    async readManifest() {
      const manifests = (await Promise.all((await loadStores()).map((store) => store.readManifest()))).filter(Boolean);
      if (!manifests.length) return null;
      const generatedAt = manifests.map(({ generatedAt }) => generatedAt).sort().at(-1);
      return {
        provider: "relay", generation: String(Date.parse(generatedAt) || 1), generatedAt,
        observedAt: manifests.map(({ observedAt }) => observedAt).filter(Boolean).sort().at(0) ?? null,
        regionIds: [...new Set(manifests.flatMap(({ regionIds }) => regionIds.map(String)))].sort((a, b) => Number(a) - Number(b)),
        dimension: "1", bounds: unionBounds(manifests), zoomRange: { min: -5, max: -2 },
        paletteVersion: manifests[0].paletteVersion ?? null,
        tileCount: manifests.reduce((total, value) => total + Number(value.tileCount ?? 0), 0),
        totalBytes: manifests.reduce((total, value) => total + Number(value.totalBytes ?? 0), 0),
        biomes: mergeBiomes(manifests),
        waterTypes: mergeWaterTypes(manifests),
        channels: mergeChannels(manifests),
      };
    },
    async readTile(request) {
      if (request.z > -2) return null;
      return readCachedTile(request, async () => {
        const tiles = (await Promise.all((await loadStores()).map((store) => store.readTile(request)))).filter(Boolean);
        return compositeTiles(tiles);
      });
    },
  };
}

export function createLayeredTerrainTileStore({ detailStore, overviewStore }) {
  const readCachedTile = createTileCache();
  return {
    async readManifest() {
      const [detail, overview] = await Promise.all([detailStore.readManifest(), overviewStore.readManifest()]);
      if (!detail && !overview) return null;
      const manifests = [detail, overview].filter(Boolean);
      const generatedAt = manifests.map(({ generatedAt: value }) => value).filter(Boolean).sort().at(-1) ?? null;
      const generatedAtMs = Date.parse(generatedAt ?? "");
      return {
        ...(detail ?? overview),
        generation: Number.isFinite(generatedAtMs)
          ? String(generatedAtMs)
          : String(Math.max(...manifests.map(({ generation }) => Number(generation) || 0), 1)),
        generatedAt,
        observedAt: manifests.map(({ observedAt }) => observedAt).filter(Boolean).sort().at(0) ?? null,
        regionIds: [...new Set(manifests.flatMap(({ regionIds }) => regionIds.map(String)))].sort((a, b) => Number(a) - Number(b)),
        bounds: overview?.bounds ?? detail?.bounds ?? null,
        tileCount: manifests.reduce((total, value) => total + Number(value.tileCount ?? 0), 0),
        totalBytes: manifests.reduce((total, value) => total + Number(value.totalBytes ?? 0), 0),
        biomes: mergeBiomes(manifests),
        waterTypes: mergeWaterTypes(manifests),
        channels: mergeChannels(manifests),
        overviewAvailable: Boolean(overview),
      };
    },
    async readTile(request) {
      return readCachedTile(request, async () => {
        const [overview, detail] = await Promise.all([overviewStore.readTile(request), detailStore.readTile(request)]);
        if (!overview) return detail;
        if (!detail) return overview;
        return compositeTiles([overview, detail]);
      });
    },
  };
}
