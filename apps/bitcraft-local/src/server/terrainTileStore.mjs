import { open, mkdir, readFile, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";

import { TERRAIN_PALETTE_VERSION } from "./terrainPalette.mjs";

const APOTHEM = 2 / Math.sqrt(3);
const DEFAULT_LIMITS = Object.freeze({
  minZoom: -5,
  maxZoom: 0,
  tileSize: 256,
  maxTiles: 50_000,
  maxBytes: 512 * 1024 * 1024,
  maxTileBytes: 2 * 1024 * 1024,
  deadlineMs: 120_000,
});
const VERSION_NAME = /^g-\d+-\d+-\d+$/;

function within(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function safeGeneration(value) {
  const generation = String(value ?? "");
  if (!/^\d+$/.test(generation)) throw new TypeError("Terrain bundle generation must be a decimal integer");
  return generation;
}

function enumerateTiles(generation, limits) {
  const { side, cellSize } = generation.evidence ?? {};
  if (!Number.isSafeInteger(side) || side <= 0 || !Number.isFinite(cellSize) || cellSize <= 0) throw new TypeError("Terrain bundle requires verified layout dimensions");
  const bounds = generation.regionBounds;
  if (!bounds) throw new TypeError("Terrain bundle requires region bounds");
  const chunkSpan = side * cellSize;
  const minX = bounds.minChunkX * chunkSpan;
  const maxX = (bounds.maxChunkX + 1) * chunkSpan;
  const minZ = bounds.minChunkZ * chunkSpan;
  const maxZ = (bounds.maxChunkZ + 1) * chunkSpan;
  const tiles = [];
  for (let zoom = limits.minZoom; zoom <= limits.maxZoom; zoom += 1) {
    const scale = 2 ** zoom;
    const minTileX = Math.floor((minX * scale) / limits.tileSize);
    const maxTileX = Math.floor(((maxX * scale) - Number.EPSILON) / limits.tileSize);
    const minProjectedY = -maxZ / APOTHEM;
    const maxProjectedY = -minZ / APOTHEM;
    const minTileY = Math.floor((minProjectedY * scale) / limits.tileSize);
    const maxTileY = Math.floor(((maxProjectedY * scale) - Number.EPSILON) / limits.tileSize);
    for (let x = minTileX; x <= maxTileX; x += 1) for (let y = minTileY; y <= maxTileY; y += 1) {
      tiles.push({ style: "terrain", zoom, x, y });
      tiles.push({ style: "water", zoom, x, y });
    }
  }
  return { tiles, bounds: { minX, minZ, maxX, maxZ } };
}

async function writeDurableJson(filePath, value) {
  const handle = await open(filePath, "w");
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function validPointer(value) {
  return value && typeof value === "object" && VERSION_NAME.test(value.version) && value.manifest && /^\d+$/.test(String(value.manifest.generation ?? ""));
}

export function createTerrainTileStore({ dataDir, encoder, now = () => new Date(), limits: limitOverrides = {} }) {
  if (typeof encoder !== "function") throw new TypeError("Terrain tile store requires an encoder");
  const limits = { ...DEFAULT_LIMITS, ...limitOverrides };
  const root = path.resolve(dataDir, "map-tiles");
  const versionsRoot = path.resolve(root, "versions");
  if (!within(path.resolve(dataDir), root) || !within(root, versionsRoot)) throw new TypeError("Terrain tile store path escapes data directory");
  const currentPath = path.join(root, "current.json");
  let current = null;
  let loaded = false;
  let closed = false;
  let queue = Promise.resolve();
  const leases = new Map();
  const activeStaging = new Set();

  async function loadCurrent() {
    if (loaded) return current;
    loaded = true;
    try {
      const candidate = JSON.parse(await readFile(currentPath, "utf8"));
      current = validPointer(candidate) ? candidate : null;
    } catch (error) {
      if (error?.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
      current = null;
    }
    return current;
  }

  async function pruneVersions() {
    let entries;
    try {
      entries = await readdir(versionsRoot, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if ((entry.name.startsWith(".staging-") && !activeStaging.has(entry.name)) || (VERSION_NAME.test(entry.name) && entry.name !== current?.version && !leases.get(entry.name))) {
        const target = path.resolve(versionsRoot, entry.name);
        if (within(versionsRoot, target)) await rm(target, { recursive: true, force: true });
      }
    }
  }

  async function build(generation) {
    if (closed) throw new Error("Terrain tile store is closed");
    const generationId = safeGeneration(generation.generation);
    const { tiles, bounds } = enumerateTiles(generation, limits);
    if (!tiles.length || tiles.length > limits.maxTiles) throw new RangeError(`Terrain bundle exceeded ${limits.maxTiles} tile budget`);
    await mkdir(versionsRoot, { recursive: true });
    await loadCurrent();
    await pruneVersions();
    const stamp = now().getTime();
    const version = `g-${generationId}-${stamp}-${process.pid}`;
    const stagingName = `.staging-${version}`;
    const staging = path.resolve(versionsRoot, stagingName);
    const installed = path.resolve(versionsRoot, version);
    if (!within(versionsRoot, staging) || !within(versionsRoot, installed)) throw new TypeError("Terrain bundle version path escapes store");
    const started = Date.now();
    let totalBytes = 0;
    const channelBytes = { terrain: 0, water: 0 };
    const channelTileCounts = { terrain: 0, water: 0 };
    activeStaging.add(stagingName);
    try {
      await mkdir(staging, { recursive: false });
      for (const tile of tiles) {
        if (Date.now() - started > limits.deadlineMs) throw new Error(`Terrain bundle exceeded ${limits.deadlineMs}ms deadline`);
        const bytes = Buffer.from(await encoder({ generation, style: tile.style, zoom: tile.zoom, x: tile.x, y: tile.y, tileSize: limits.tileSize }));
        if (bytes.byteLength > limits.maxTileBytes) throw new RangeError(`Terrain tile exceeded ${limits.maxTileBytes} tile byte budget`);
        totalBytes += bytes.byteLength;
        channelBytes[tile.style] += bytes.byteLength;
        channelTileCounts[tile.style] += 1;
        if (totalBytes > limits.maxBytes) throw new RangeError(`Terrain bundle exceeded ${limits.maxBytes} byte budget`);
        const directory = path.join(staging, "tiles", tile.style, String(tile.zoom), String(tile.x));
        await mkdir(directory, { recursive: true });
        const handle = await open(path.join(directory, `${tile.y}.webp`), "wx");
        try { await handle.writeFile(bytes); } finally { await handle.close(); }
      }
      const manifest = {
        provider: "relay",
        generation: generationId,
        generatedAt: now().toISOString(),
        observedAt: generation.observedAt ?? null,
        regionIds: [...new Set(generation.regionIds ?? [generation.regionId])].map(String).sort((a, b) => Number(a) - Number(b)),
        dimension: "1",
        bounds,
        zoomRange: { min: limits.minZoom, max: limits.maxZoom },
        paletteVersion: TERRAIN_PALETTE_VERSION,
        tileCount: tiles.length,
        totalBytes,
        channels: {
          terrain: { tileCount: channelTileCounts.terrain, totalBytes: channelBytes.terrain },
          water: { tileCount: channelTileCounts.water, totalBytes: channelBytes.water },
        },
        evidenceHash: generation.evidence.evidenceHash,
      };
      await writeDurableJson(path.join(staging, "manifest.json"), manifest);
      await rename(staging, installed);
      const pointer = { version, manifest };
      const temporaryPointer = path.join(root, `.current-${process.pid}-${stamp}.tmp`);
      await writeDurableJson(temporaryPointer, pointer);
      await rename(temporaryPointer, currentPath);
      current = pointer;
      loaded = true;
      await pruneVersions();
      return { ...manifest };
    } catch (error) {
      await rm(staging, { recursive: true, force: true });
      throw error;
    } finally {
      activeStaging.delete(stagingName);
    }
  }

  return {
    paletteVersion: TERRAIN_PALETTE_VERSION,
    buildAndInstall(generation) {
      const operation = queue.then(() => build(generation));
      queue = operation.catch(() => undefined);
      return operation;
    },
    async readManifest() {
      const pointer = await loadCurrent();
      return pointer ? { ...pointer.manifest } : null;
    },
    async readTile({ style, z, x, y }) {
      if ((style !== "terrain" && style !== "water") || !Number.isSafeInteger(z) || !Number.isSafeInteger(x) || !Number.isSafeInteger(y)) return null;
      const pointer = await loadCurrent();
      if (!pointer) return null;
      leases.set(pointer.version, (leases.get(pointer.version) ?? 0) + 1);
      try {
        const tilePath = path.resolve(versionsRoot, pointer.version, "tiles", style, String(z), String(x), `${y}.webp`);
        if (!within(path.resolve(versionsRoot, pointer.version), tilePath)) return null;
        const bytes = await readFile(tilePath);
        if (bytes.byteLength > limits.maxTileBytes) throw new RangeError("Installed terrain tile exceeds read budget");
        return { bytes, contentType: "image/webp", generation: pointer.manifest.generation };
      } catch (error) {
        if (error?.code === "ENOENT") return null;
        throw error;
      } finally {
        const remaining = (leases.get(pointer.version) ?? 1) - 1;
        if (remaining > 0) leases.set(pointer.version, remaining);
        else leases.delete(pointer.version);
        await pruneVersions();
      }
    },
    async close() {
      closed = true;
      await queue;
    },
  };
}
