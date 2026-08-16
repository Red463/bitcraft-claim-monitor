import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  discoverRelayTopology,
  RelayTerrainRegionSession,
  relayWebSocketUri,
  selectTerrainOrientation,
} from "../dist-server/game-data/index.js";

const appDir = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const relayBaseUrl = String(process.env.BITCRAFT_RELAY_ORIGIN ?? "https://relay.bitcraftsync.app").replace(/\/+$/, "");
const manifest = JSON.parse(await readFile(new URL("../src/server/game-data/bindings/schema-manifest.json", import.meta.url), "utf8"));
const SURFACE_TYPES = Object.freeze({ 0: "ground", 1: "lake", 2: "river", 3: "ocean", 4: "ocean-biome", 5: "swamp" });
const WATER_SURFACES = new Set(["lake", "river", "ocean", "ocean-biome", "swamp"]);
const MIN_EVIDENCE_CELL_SIZE_TENTHS = 1;
const MAX_EVIDENCE_CELL_SIZE_TENTHS = 120;

function parseArguments(argv) {
  const parsed = { regionId: "19", points: [], writeFixture: null };
  for (const argument of argv) {
    if (argument.startsWith("--region=")) parsed.regionId = argument.slice(9);
    else if (argument.startsWith("--write-fixture=")) parsed.writeFixture = argument.slice(16);
    else if (argument.startsWith("--point=")) {
      const [category, rawX, rawZ, expected] = argument.slice(8).split(":");
      const x = Number(rawX);
      const z = Number(rawZ);
      if (!category || !Number.isInteger(x) || !Number.isInteger(z) || !["ground", "water", "mixed-neighbourhood"].includes(expected)) {
        throw new TypeError(`Invalid terrain evidence point: ${argument}`);
      }
      parsed.points.push({ category, x, z, expected });
    } else throw new TypeError(`Unknown terrain verifier argument: ${argument}`);
  }
  if (!/^\d+$/.test(parsed.regionId)) throw new TypeError("Terrain verifier region must be a decimal integer");
  const categories = parsed.points.map((point) => point.category).sort();
  if (parsed.points.length && JSON.stringify(categories) !== JSON.stringify(["coastline", "inland", "open-water"])) {
    throw new TypeError("Terrain verifier requires exactly inland, coastline, and open-water evidence points");
  }
  return parsed;
}

function hashTypedArrays(chunks) {
  const hash = createHash("sha256");
  for (const chunk of chunks) {
    hash.update(chunk.chunkIndex);
    for (const key of ["biomes", "biomeDensity", "elevations", "waterLevels", "waterBodyTypes", "zoningTypes", "originalElevations"]) {
      const values = chunk[key];
      hash.update(Buffer.from(values.buffer, values.byteOffset, values.byteLength));
    }
  }
  return hash.digest("hex");
}

function cellForPoint(generation, point, layout) {
  const chunkX = Math.floor(point.x / layout.chunkSpan);
  const chunkZ = Math.floor(point.z / layout.chunkSpan);
  const chunk = generation.chunks.find((candidate) => candidate.chunkX === chunkX && candidate.chunkZ === chunkZ);
  if (!chunk) return null;
  const localX = Math.min(layout.side - 1, Math.floor((point.x - chunkX * layout.chunkSpan) / layout.cellSize));
  const sourceLocalZ = Math.min(layout.side - 1, Math.floor((point.z - chunkZ * layout.chunkSpan) / layout.cellSize));
  const localZ = layout.zDirection === 1 ? sourceLocalZ : layout.side - 1 - sourceLocalZ;
  const index = layout.indexOrder === "z-major" ? localZ * layout.side + localX : localX * layout.side + localZ;
  const surfaceValue = chunk.waterBodyTypes[index];
  return { chunk, localX, localZ: sourceLocalZ, index, surfaceValue, surface: SURFACE_TYPES[surfaceValue] ?? `unknown:${surfaceValue}` };
}

function pointMatches(generation, point, layout) {
  const cell = cellForPoint(generation, point, layout);
  if (!cell) return { matches: false, reason: "chunk is unavailable", cell: null };
  if (point.expected !== "mixed-neighbourhood") {
    const water = WATER_SURFACES.has(cell.surface);
    return { matches: point.expected === "water" ? water : !water, reason: cell.surface, cell };
  }
  const surfaces = new Set();
  const radius = Math.max(layout.cellSize * 8, 256);
  const step = radius / 4;
  for (let deltaX = -radius; deltaX <= radius; deltaX += step) {
    for (let deltaZ = -radius; deltaZ <= radius; deltaZ += step) {
      const nearby = cellForPoint(generation, { x: point.x + deltaX, z: point.z + deltaZ }, layout);
      if (nearby) surfaces.add(WATER_SURFACES.has(nearby.surface) ? "water" : "ground");
    }
  }
  return { matches: surfaces.has("water") && surfaces.has("ground"), reason: [...surfaces].sort().join("+"), cell };
}

function cellIndex(localX, sourceLocalZ, layout) {
  const localZ = layout.zDirection === 1 ? sourceLocalZ : layout.side - 1 - sourceLocalZ;
  return layout.indexOrder === "z-major" ? localZ * layout.side + localX : localX * layout.side + localZ;
}

function scoreEdgeContinuity(generation, layout) {
  const chunks = new Map(generation.chunks.map((chunk) => [`${chunk.chunkX}:${chunk.chunkZ}`, chunk]));
  let elevationDelta = 0;
  let elevationPairs = 0;
  let waterMismatches = 0;
  for (const chunk of generation.chunks) {
    const east = chunks.get(`${chunk.chunkX + 1}:${chunk.chunkZ}`);
    const north = chunks.get(`${chunk.chunkX}:${chunk.chunkZ + 1}`);
    for (let offset = 0; offset < layout.side; offset += 1) {
      if (east) {
        const leftIndex = cellIndex(layout.side - 1, offset, layout);
        const rightIndex = cellIndex(0, offset, layout);
        elevationDelta += Math.abs(chunk.originalElevations[leftIndex] - east.originalElevations[rightIndex]);
        waterMismatches += Number(WATER_SURFACES.has(SURFACE_TYPES[chunk.waterBodyTypes[leftIndex]]) !== WATER_SURFACES.has(SURFACE_TYPES[east.waterBodyTypes[rightIndex]]));
        elevationPairs += 1;
      }
      if (north) {
        const southIndex = cellIndex(offset, layout.side - 1, layout);
        const northIndex = cellIndex(offset, 0, layout);
        elevationDelta += Math.abs(chunk.originalElevations[southIndex] - north.originalElevations[northIndex]);
        waterMismatches += Number(WATER_SURFACES.has(SURFACE_TYPES[chunk.waterBodyTypes[southIndex]]) !== WATER_SURFACES.has(SURFACE_TYPES[north.waterBodyTypes[northIndex]]));
        elevationPairs += 1;
      }
    }
  }
  return {
    elevationPairs,
    meanOriginalElevationDelta: elevationPairs ? elevationDelta / elevationPairs : null,
    waterMismatchRate: elevationPairs ? waterMismatches / elevationPairs : null,
  };
}

function inferLayout(generation, points) {
  const sides = [...new Set(generation.chunks.map((chunk) => chunk.side))];
  if (sides.length !== 1) throw new TypeError(`Terrain chunks disagree on side length: ${sides.join(",")}`);
  const side = sides[0];
  const candidates = [];
  const evaluated = [];
  for (let tenths = MIN_EVIDENCE_CELL_SIZE_TENTHS; tenths <= MAX_EVIDENCE_CELL_SIZE_TENTHS; tenths += 1) {
    const cellSize = tenths / 10;
    const chunkSpan = side * cellSize;
    for (const indexOrder of ["z-major", "x-major"]) {
      for (const zDirection of [1, -1]) {
        const layout = { side, cellSize, chunkSpan, indexOrder, zDirection, chunkOriginX: 0, chunkOriginZ: 0, surfaceTypes: SURFACE_TYPES };
        const observations = points.map((point) => ({ point, ...pointMatches(generation, point, layout) }));
        evaluated.push({ layout, observations, matchCount: observations.filter((observation) => observation.matches).length });
        if (observations.every((observation) => observation.matches)) candidates.push({ layout, observations });
      }
    }
  }
  return { side, candidates, evaluated };
}

const options = parseArguments(process.argv.slice(2));
const topology = await discoverRelayTopology(relayBaseUrl);
const source = topology.regions.get(options.regionId);
if (!source?.ready || !source.schemaFingerprint) throw new Error(`Relay region ${options.regionId} source is not ready`);

let session;
let timeout;
const startedAt = Date.now();
try {
  const snapshot = await new Promise((resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(`Timed out waiting for terrain data: ${JSON.stringify(session?.health() ?? {})}`)), 120_000);
    session = new RelayTerrainRegionSession({ onSnapshot: resolve, onFailure: (error) => reject(new Error(error)) });
    void session.start({
      uri: relayWebSocketUri(relayBaseUrl, source.port),
      database: source.database,
      schemaFingerprint: source.schemaFingerprint,
      manifest,
      generation: 1,
      regionId: options.regionId,
      maxChunks: 20_000,
      maxBytes: 128 * 1024 * 1024,
    }).catch(reject);
  });
  const generation = snapshot.data;
  const terrainHash = hashTypedArrays(generation.chunks);
  const surfaceFrequencies = {};
  for (const chunk of generation.chunks) for (const value of chunk.waterBodyTypes) surfaceFrequencies[value] = (surfaceFrequencies[value] ?? 0) + 1;
  const layoutResult = inferLayout(generation, options.points);
  const orientationScores = layoutResult.evaluated
    .filter(({ layout }) => layoutResult.candidates.some((candidate) => candidate.layout.cellSize === layout.cellSize && candidate.layout.indexOrder === layout.indexOrder && candidate.layout.zDirection === layout.zDirection))
    .map(({ layout }) => ({ ...layout, ...scoreEdgeContinuity(generation, layout) }))
    .sort((left, right) => left.meanOriginalElevationDelta - right.meanOriginalElevationDelta);
  let accepted = null;
  let selectionError = null;
  if (layoutResult.candidates.length) {
    try {
      const selected = selectTerrainOrientation(layoutResult.candidates.map(({ layout }) => layout), orientationScores);
      accepted = layoutResult.candidates.find(({ layout }) => layout.indexOrder === selected.indexOrder && layout.zDirection === selected.zDirection && layout.cellSize === selected.cellSize) ?? null;
    } catch (error) {
      selectionError = error instanceof Error ? error.message : String(error);
    }
  }
  const report = {
    ok: true,
    regionId: options.regionId,
    database: source.database,
    schemaFingerprint: source.schemaFingerprint,
    observedAt: snapshot.receivedAt,
    elapsedMs: Date.now() - startedAt,
    chunkCount: generation.chunks.length,
    cellCount: generation.cellCount,
    normalizedBytes: generation.normalizedBytes,
    regionBounds: generation.regionBounds,
    side: layoutResult.side,
    candidateCellSizes: [...new Set(layoutResult.candidates.map(({ layout }) => layout.cellSize))],
    terrainHash,
    surfaceFrequencies,
    candidateCount: layoutResult.candidates.length,
    candidates: layoutResult.candidates.map(({ layout, observations }) => ({
      indexOrder: layout.indexOrder,
      zDirection: layout.zDirection,
      cellSize: layout.cellSize,
      chunkSpan: layout.chunkSpan,
      observations: observations.map(({ point, matches, reason, cell }) => ({ category: point.category, matches, reason, chunkIndex: cell?.chunk.chunkIndex ?? null, index: cell?.index ?? null, surface: cell?.surface ?? null })),
    })),
    bestDiagnostics: layoutResult.evaluated
      .filter(({ layout }) => layout.cellSize === 3)
      .sort((left, right) => right.matchCount - left.matchCount)
      .map(({ layout, matchCount, observations }) => ({
        indexOrder: layout.indexOrder,
        zDirection: layout.zDirection,
        cellSize: layout.cellSize,
        matchCount,
        observations: observations.map(({ point, matches, reason, cell }) => ({ category: point.category, matches, reason, chunkIndex: cell?.chunk.chunkIndex ?? null, index: cell?.index ?? null, surface: cell?.surface ?? null })),
      })),
    orientationScores: orientationScores.map(({ indexOrder, zDirection, cellSize, elevationPairs, meanOriginalElevationDelta, waterMismatchRate }) => ({ indexOrder, zDirection, cellSize, elevationPairs, meanOriginalElevationDelta, waterMismatchRate })),
    selectedOrientation: accepted ? { indexOrder: accepted.layout.indexOrder, zDirection: accepted.layout.zDirection, cellSize: accepted.layout.cellSize } : null,
    selectionError,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!options.points.length) process.exitCode = 2;
  else if (!accepted) throw new Error(selectionError ?? `Terrain evidence resolved ${layoutResult.candidates.length} layouts without a decisive orientation`);
  else if (options.writeFixture) {
    const evidenceCore = {
      verified: true,
      regionId: options.regionId,
      dimension: "1",
      schemaFingerprint: source.schemaFingerprint,
      observedAt: snapshot.receivedAt,
      side: accepted.layout.side,
      cellSize: accepted.layout.cellSize,
      indexOrder: accepted.layout.indexOrder,
      zDirection: accepted.layout.zDirection,
      chunkOriginX: 0,
      chunkOriginZ: 0,
      surfaceTypes: SURFACE_TYPES,
      chunkCount: generation.chunks.length,
      cellCount: generation.cellCount,
      normalizedBytes: generation.normalizedBytes,
      terrainHash,
      points: accepted.observations.map(({ point, cell }) => ({ category: point.category, x: point.x, z: point.z, expected: point.expected, chunkIndex: cell.chunk.chunkIndex, cellIndex: cell.index, surface: cell.surface })),
    };
    const evidenceHash = createHash("sha256").update(JSON.stringify(evidenceCore)).digest("hex");
    const fixture = { ...evidenceCore, evidenceHash };
    const output = path.resolve(appDir, options.writeFixture);
    const relative = path.relative(appDir, output);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Terrain fixture path must stay inside the app directory");
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
  }
} finally {
  clearTimeout(timeout);
  await session?.stop();
}
