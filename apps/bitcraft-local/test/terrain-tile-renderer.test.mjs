import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import sharp from "sharp";

let paletteModule = null;
let rendererModule = null;
try {
  paletteModule = await import("../src/server/terrainPalette.mjs");
  rendererModule = await import("../src/server/terrainTileRenderer.mjs");
} catch {
  // RED: renderer modules do not exist yet.
}

function fixtureRequest() {
  const side = 32;
  const length = side * side;
  const waterBodyTypes = new Uint8Array(length);
  waterBodyTypes.fill(0);
  waterBodyTypes.fill(3, side * 16);
  return {
    generation: {
      regionId: "19",
      dimension: "1",
      regionBounds: { minChunkX: 0, minChunkZ: 0, maxChunkX: 0, maxChunkZ: 0 },
      biomes: [{ biomeType: 7, name: "Grasslands" }],
      chunks: [{
        chunkIndex: "0", chunkX: 0, chunkZ: 0, dimension: "1", side,
        biomes: new Uint32Array(length).fill(7),
        biomeDensity: new Uint32Array(length).fill(100),
        elevations: Int16Array.from({ length }, (_, index) => (index % side) - 16),
        waterLevels: new Int16Array(length).fill(-1),
        waterBodyTypes,
        zoningTypes: new Uint8Array(length),
        originalElevations: new Int16Array(length),
      }],
    },
    evidence: {
      verified: true, side, cellSize: 3, indexOrder: "z-major", zDirection: 1,
      chunkOriginX: 0, chunkOriginZ: 0,
      surfaceTypes: { 0: "ground", 1: "lake", 2: "river", 3: "ocean", 4: "ocean-biome", 5: "swamp" },
      evidenceHash: "fixture",
    },
    zoom: 0,
    x: 0,
    y: -1,
    tileSize: 256,
  };
}

test("terrain render context indexes each immutable generation once", () => {
  assert.ok(rendererModule, "terrain renderer module must exist");
  const request = fixtureRequest();
  const first = rendererModule.prepareTerrainRenderContext(request.generation);
  const second = rendererModule.prepareTerrainRenderContext(request.generation);
  assert.strictEqual(first, second);
  assert.equal(first.chunks.get("0:0"), request.generation.chunks[0]);
  assert.equal(first.biomeNames.get(7), "Grasslands");
});

test("terrain palette gives water semantic priority and deterministic elevation shading", () => {
  assert.ok(paletteModule, "terrain palette module must exist");
  assert.equal(paletteModule.TERRAIN_PALETTE_VERSION, 3);
  const ocean = paletteModule.terrainCellRgba({ surface: "ocean", biomeName: "Uncharted Ocean", elevation: -20, mapX: 10, mapZ: 20 });
  const river = paletteModule.terrainCellRgba({ surface: "river", biomeName: "Grasslands", elevation: 0, mapX: 10, mapZ: 20 });
  assert.ok(ocean[2] > ocean[1] && ocean[1] > ocean[0], "ocean must read as deep navy blue");
  assert.ok(river[1] > ocean[1], "rivers must remain lighter than open ocean");
  assert.deepEqual(
    paletteModule.terrainCellRgba({ surface: "ocean", biomeName: "Grasslands", elevation: 50, mapX: 10, mapZ: 20 }),
    paletteModule.terrainCellRgba({ surface: "ocean", biomeName: "Uncharted Ocean", elevation: -20, mapX: 10, mapZ: 20 }),
  );
  assert.notDeepEqual(
    paletteModule.terrainCellRgba({ surface: "ground", biomeName: "Grasslands", elevation: -10 }),
    paletteModule.terrainCellRgba({ surface: "ground", biomeName: "Grasslands", elevation: 10 }),
  );
  const warnings = [];
  assert.equal(paletteModule.terrainCellRgba({ surface: "ground", biomeName: "Unknown Future Biome", elevation: 0, mapX: 0, mapZ: 0, warnings })[3], 255);
  assert.deepEqual(warnings, ["Unknown terrain biome: Unknown Future Biome"]);

  const flat = paletteModule.terrainCellRgba({ surface: "ground", biomeName: "Grasslands", elevation: 0, originalElevation: 0, biomeDensity: 50, relief: 0, depth: 0, shoreline: false });
  const raised = paletteModule.terrainCellRgba({ surface: "ground", biomeName: "Grasslands", elevation: 8, originalElevation: 8, biomeDensity: 80, relief: 12, depth: 0, shoreline: false });
  assert.notDeepEqual(raised, flat);
  const deepOcean = paletteModule.terrainCellRgba({ surface: "ocean", biomeName: "Grasslands", elevation: -10, originalElevation: -10, biomeDensity: 50, relief: 0, depth: 12, shoreline: false });
  const coastOcean = paletteModule.terrainCellRgba({ surface: "ocean", biomeName: "Grasslands", elevation: -2, originalElevation: -2, biomeDensity: 50, relief: 0, depth: 2, shoreline: true });
  assert.notDeepEqual(deepOcean, coastOcean);
  assert.ok(coastOcean[0] - deepOcean[0] >= 10, "shoreline water must be visibly brighter than deep water");
  assert.equal(deepOcean[2] > deepOcean[0], true);

  const texturedA = paletteModule.terrainCellRgba({ surface: "ground", biomeName: "Grasslands", elevation: 0, mapX: 310, mapZ: -87 });
  const texturedARepeat = paletteModule.terrainCellRgba({ surface: "ground", biomeName: "Grasslands", elevation: 0, mapX: 310, mapZ: -87 });
  const texturedB = paletteModule.terrainCellRgba({ surface: "ground", biomeName: "Grasslands", elevation: 0, mapX: 311, mapZ: -87 });
  assert.deepEqual(texturedARepeat, texturedA, "texture must be deterministic for the same map cell");
  assert.notDeepEqual(texturedB, texturedA, "adjacent map cells should receive fine deterministic texture variation");
  assert.ok(Math.max(...texturedA.slice(0, 3).map((value, index) => Math.abs(value - texturedB[index]))) <= 6, "texture must remain subtle");
});

test("terrain renderer is deterministic, bounded, clips world edges, and accepts negative tile Y", async () => {
  assert.ok(rendererModule, "terrain renderer module must exist");
  const request = fixtureRequest();
  const first = await rendererModule.renderTerrainTile(request);
  const second = await rendererModule.renderTerrainTile(request);
  const water = await rendererModule.renderTerrainTile({ ...request, style: "water" });
  assert.deepEqual(createHash("sha256").update(first).digest("hex"), createHash("sha256").update(second).digest("hex"));
  assert.ok(first.byteLength <= 2_097_152);

  const decoded = await sharp(first).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const decodedWater = await sharp(water).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgbaAt = (x, y) => [...decoded.data.subarray((y * 256 + x) * 4, (y * 256 + x) * 4 + 4)];
  const waterRgbaAt = (x, y) => [...decodedWater.data.subarray((y * 256 + x) * 4, (y * 256 + x) * 4 + 4)];
  assert.equal(rgbaAt(10, 10)[3], 0, "outside the only terrain chunk must be transparent");
  assert.equal(waterRgbaAt(10, 200)[3], 255, "negative tile Y must address positive world Z");
  assert.ok(waterRgbaAt(10, 200)[2] > waterRgbaAt(10, 200)[0], "southern half must decode as water");
  assert.equal(rgbaAt(10, 240)[3], 255, "covered ground remains opaque");
  assert.ok(rgbaAt(10, 240)[1] > rgbaAt(10, 240)[2], "northern half remains categorized as ground");
});

test("terrain renderer emits aligned ground and water channels", async () => {
  assert.ok(rendererModule, "terrain renderer module must exist");
  const request = fixtureRequest();
  const ground = await rendererModule.renderTerrainTile({ ...request, style: "terrain" });
  const water = await rendererModule.renderTerrainTile({ ...request, style: "water" });
  const groundPixels = await sharp(ground).ensureAlpha().raw().toBuffer();
  const waterPixels = await sharp(water).ensureAlpha().raw().toBuffer();
  const alphaAt = (bytes, x, y) => bytes[(y * 256 + x) * 4 + 3];

  assert.equal(alphaAt(groundPixels, 10, 240), 255, "ground channel keeps ground cells");
  assert.equal(alphaAt(waterPixels, 10, 240), 0, "water channel hides ground cells");
  assert.equal(alphaAt(groundPixels, 10, 200), 0, "ground channel hides water cells");
  assert.equal(alphaAt(waterPixels, 10, 200), 255, "water channel keeps water cells");
});
