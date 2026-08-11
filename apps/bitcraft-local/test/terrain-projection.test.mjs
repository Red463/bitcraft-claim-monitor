import assert from "node:assert/strict";
import test from "node:test";

let terrainModule = null;
try {
  terrainModule = await import("../src/server/game-data/terrainProjection.ts");
} catch {
  // RED: the terrain projection does not exist yet.
}

function terrainRow({ chunkIndex = 9_007_199_254_740_999n, chunkX = 273, chunkZ = 237, side = 4, dimension = 1 } = {}) {
  const length = side * side;
  return {
    chunkIndex,
    chunkX,
    chunkZ,
    dimension,
    biomes: Array(length).fill(7),
    biomeDensity: Array(length).fill(100),
    elevations: Array(length).fill(12),
    waterLevels: Array(length).fill(-1),
    waterBodyTypes: Uint8Array.from(Array(length).fill(0)),
    zoningTypes: Uint8Array.from(Array(length).fill(0)),
    originalElevations: Array(length).fill(12),
  };
}

function generation(overrides = {}) {
  return {
    regionId: "19",
    dimension: "1",
    worldRegionRows: [{
      id: 19,
      regionMinChunkX: 250,
      regionMinChunkZ: 230,
      regionWidthChunks: 80,
      regionHeightChunks: 80,
      regionIndex: 0,
      regionCount: 1,
      regionCountSqrt: 1,
    }],
    biomeRows: [{ biomeType: 7, name: "Grasslands", description: "", hazardLevel: "", iconAddress: "", disallowPlayerBuild: false }],
    terrainRows: [terrainRow()],
    observedAt: "2026-08-11T12:00:00.000Z",
    ...overrides,
  };
}

test("terrain normalization derives a square side and preserves decimal chunk ids", () => {
  assert.ok(terrainModule, "terrain projection module must exist");
  const result = terrainModule.normalizeTerrainGeneration(generation());
  assert.equal(result.chunks[0].chunkIndex, "9007199254740999");
  assert.equal(result.chunks[0].side, 4);
  assert.equal(result.dimension, "1");
  assert.equal(result.normalizedBytes, 256);
  assert.deepEqual(result.regionBounds, { minChunkX: 250, minChunkZ: 230, maxChunkX: 329, maxChunkZ: 309 });
  assert.equal(result.biomes[0].name, "Grasslands");
});

test("terrain normalization rejects unequal arrays and non-square cells", () => {
  assert.ok(terrainModule, "terrain projection module must exist");
  const unequal = terrainRow();
  unequal.elevations = unequal.elevations.slice(1);
  assert.throws(() => terrainModule.normalizeTerrainGeneration(generation({ terrainRows: [unequal] })), /equal cell counts/);

  const nonSquare = terrainRow({ side: 4 });
  for (const key of ["biomes", "biomeDensity", "elevations", "waterLevels", "waterBodyTypes", "zoningTypes", "originalElevations"]) {
    nonSquare[key] = Array.from(nonSquare[key]).slice(0, 15);
  }
  assert.throws(() => terrainModule.normalizeTerrainGeneration(generation({ terrainRows: [nonSquare] })), /perfect square/);
});

test("terrain normalization rejects DataView values that are not numeric arrays", () => {
  assert.ok(terrainModule, "terrain projection module must exist");
  const row = terrainRow();
  row.waterBodyTypes = new DataView(new ArrayBuffer(16));
  assert.throws(() => terrainModule.normalizeTerrainGeneration(generation({ terrainRows: [row] })), /water body types must be an array/);
});

test("terrain normalization rejects wrong dimensions, region leaks, chunk limits, and byte overflow", () => {
  assert.ok(terrainModule, "terrain projection module must exist");
  assert.throws(() => terrainModule.normalizeTerrainGeneration(generation({ dimension: "0" })), /overworld dimension 1/);
  assert.throws(() => terrainModule.normalizeTerrainGeneration(generation({ terrainRows: [terrainRow({ chunkX: 400 })] })), /region bounds/);
  assert.throws(() => terrainModule.normalizeTerrainGeneration(generation({ terrainRows: [terrainRow(), terrainRow({ chunkIndex: 2n })], maxChunks: 1 })), /1 chunk budget/);
  assert.throws(() => terrainModule.normalizeTerrainGeneration(generation({ maxBytes: 255 })), /255 byte budget/);
});

test("terrain cell conversion refuses unverified evidence and uses explicit order when verified", () => {
  assert.ok(terrainModule, "terrain projection module must exist");
  const chunk = terrainModule.normalizeTerrainGeneration(generation()).chunks[0];
  const evidence = {
    verified: false,
    side: 4,
    cellSize: 3,
    indexOrder: "z-major",
    zDirection: 1,
    chunkOriginX: 0,
    chunkOriginZ: 0,
    surfaceTypes: { 0: "ground" },
    evidenceHash: "fixture",
  };
  assert.throws(() => terrainModule.terrainCellPoint(chunk, 6, evidence), /not verified/);
  assert.deepEqual(terrainModule.terrainCellPoint(chunk, 6, { ...evidence, verified: true }), { x: 3282, z: 2847 });
  assert.throws(() => terrainModule.terrainCellPoint(chunk, 16, { ...evidence, verified: true }), /cell index/);
});
