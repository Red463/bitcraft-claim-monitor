import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import sharp from "sharp";
import { terrainWaterRgba } from "../src/shared/terrainPaletteDefinition.mjs";

let paletteModule = null;
let rendererModule = null;
try {
  paletteModule = await import("../src/server/terrainPalette.mjs");
  rendererModule = await import("../src/server/terrainTileRenderer.mjs");
} catch {
  // RED: renderer modules do not exist yet.
}

function fixtureRequest({ packedBiomes = 4, packedDensity = 128 } = {}) {
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
      biomes: [
        { biomeType: 1, name: "Calm Forest" },
        { biomeType: 2, name: "Pine Woods" },
        { biomeType: 4, name: "Breezy Grasslands" },
      ],
      chunks: [{
        chunkIndex: "0", chunkX: 0, chunkZ: 0, dimension: "1", side,
        biomes: new Uint32Array(length).fill(packedBiomes),
        biomeDensity: new Uint32Array(length).fill(packedDensity),
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
});

test("terrain palette gives water semantic priority and deterministic elevation shading", () => {
  assert.ok(paletteModule, "terrain palette module must exist");
  assert.equal(paletteModule.TERRAIN_PALETTE_VERSION, 4);
  const ocean = paletteModule.terrainCellRgba({ surface: "ocean", biomeContributions: [{ biomeType: 18, density: 128 }], elevation: -20, mapX: 10, mapZ: 20 });
  const river = paletteModule.terrainCellRgba({ surface: "river", biomeContributions: [{ biomeType: 4, density: 128 }], elevation: 0, mapX: 10, mapZ: 20 });
  assert.ok(ocean[2] > ocean[1] && ocean[1] > ocean[0], "ocean must read as deep navy blue");
  assert.ok(river[1] > ocean[1], "rivers must remain lighter than open ocean");
  assert.deepEqual(
    paletteModule.terrainCellRgba({ surface: "ocean", biomeContributions: [{ biomeType: 4, density: 128 }], elevation: 50, mapX: 10, mapZ: 20 }),
    paletteModule.terrainCellRgba({ surface: "ocean", biomeContributions: [{ biomeType: 18, density: 128 }], elevation: -20, mapX: 10, mapZ: 20 }),
  );
  assert.notDeepEqual(
    paletteModule.terrainCellRgba({ surface: "ground", biomeContributions: [{ biomeType: 4, density: 128 }], elevation: -10 }),
    paletteModule.terrainCellRgba({ surface: "ground", biomeContributions: [{ biomeType: 4, density: 128 }], elevation: 10 }),
  );
  const warnings = [];
  assert.equal(paletteModule.terrainCellRgba({ surface: "ground", biomeContributions: [{ biomeType: 255, density: 128 }], elevation: 0, mapX: 0, mapZ: 0, warnings })[3], 255);
  assert.deepEqual(warnings, ["Unknown terrain biome type: 255"]);

  const flat = paletteModule.terrainCellRgba({ surface: "ground", biomeContributions: [{ biomeType: 4, density: 50 }], elevation: 0, originalElevation: 0, relief: 0, depth: 0, shoreline: false });
  const raised = paletteModule.terrainCellRgba({ surface: "ground", biomeContributions: [{ biomeType: 4, density: 80 }], elevation: 8, originalElevation: 8, relief: 12, depth: 0, shoreline: false });
  assert.notDeepEqual(raised, flat);
  const deepOcean = paletteModule.terrainCellRgba({ surface: "ocean", biomeContributions: [{ biomeType: 4, density: 50 }], elevation: -10, originalElevation: -10, relief: 0, depth: 12, shoreline: false });
  const coastOcean = paletteModule.terrainCellRgba({ surface: "ocean", biomeContributions: [{ biomeType: 4, density: 50 }], elevation: -2, originalElevation: -2, relief: 0, depth: 2, shoreline: true });
  assert.notDeepEqual(deepOcean, coastOcean);
  assert.ok(coastOcean[0] - deepOcean[0] >= 10, "shoreline water must be visibly brighter than deep water");
  assert.equal(deepOcean[2] > deepOcean[0], true);

  assert.deepEqual(
    paletteModule.terrainCellRgba({ surface: "ocean", depth: 24, mapX: 0, mapZ: 0 }),
    terrainWaterRgba({ surface: "ocean", depth: 24, texture: -3 }),
    "the renderer and shared synthetic-ocean path must use the same water shading",
  );

  const texturedA = paletteModule.terrainCellRgba({ surface: "ground", biomeContributions: [{ biomeType: 4, density: 128 }], elevation: 0, mapX: 310, mapZ: -87 });
  const texturedARepeat = paletteModule.terrainCellRgba({ surface: "ground", biomeContributions: [{ biomeType: 4, density: 128 }], elevation: 0, mapX: 310, mapZ: -87 });
  const texturedB = paletteModule.terrainCellRgba({ surface: "ground", biomeContributions: [{ biomeType: 4, density: 128 }], elevation: 0, mapX: 311, mapZ: -87 });
  assert.deepEqual(texturedARepeat, texturedA, "texture must be deterministic for the same map cell");
  assert.notDeepEqual(texturedB, texturedA, "adjacent map cells should receive fine deterministic texture variation");
  assert.ok(Math.max(...texturedA.slice(0, 3).map((value, index) => Math.abs(value - texturedB[index]))) <= 6, "texture must remain subtle");
});

test("terrain renderer is deterministic, bounded, clips world edges, and accepts negative tile Y", async () => {
  assert.ok(rendererModule, "terrain renderer module must exist");
  const request = fixtureRequest();
  const firstChannels = await rendererModule.renderTerrainTileChannels(request);
  const secondChannels = await rendererModule.renderTerrainTileChannels(request);
  const first = firstChannels.terrain;
  const second = secondChannels.terrain;
  const water = firstChannels.water;
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
  const channels = await rendererModule.renderTerrainTileChannels(request);
  const ground = channels.terrain;
  const water = channels.water;
  const groundPixels = await sharp(ground).ensureAlpha().raw().toBuffer();
  const waterPixels = await sharp(water).ensureAlpha().raw().toBuffer();
  const alphaAt = (bytes, x, y) => bytes[(y * 256 + x) * 4 + 3];

  assert.equal(alphaAt(groundPixels, 10, 240), 255, "ground channel keeps ground cells");
  assert.equal(alphaAt(waterPixels, 10, 240), 0, "water channel hides ground cells");
  assert.equal(alphaAt(groundPixels, 10, 200), 0, "ground channel hides water cells");
  assert.equal(alphaAt(waterPixels, 10, 200), 255, "water channel keeps water cells");
  assert.deepEqual(channels.waterTypes, ["ocean"]);
});

test("terrain renderer produces both aligned channels in one paired render", async () => {
  assert.ok(rendererModule, "terrain renderer module must exist");
  assert.equal(typeof rendererModule.renderTerrainTileChannels, "function");
  const request = fixtureRequest();
  const channels = await rendererModule.renderTerrainTileChannels(request);
  assert.ok(channels.terrain.byteLength > 0);
  assert.ok(channels.water.byteLength > 0);
  const terrainPixels = await sharp(channels.terrain).ensureAlpha().raw().toBuffer();
  const waterPixels = await sharp(channels.water).ensureAlpha().raw().toBuffer();
  const alphaAt = (bytes, x, y) => bytes[(y * 256 + x) * 4 + 3];
  assert.equal(alphaAt(terrainPixels, 10, 240), 255);
  assert.equal(alphaAt(waterPixels, 10, 240), 0);
  assert.equal(alphaAt(terrainPixels, 10, 200), 0);
  assert.equal(alphaAt(waterPixels, 10, 200), 255);
});

test("terrain renderer blends packed biomes and emits sparse masks for ground and water", async () => {
  assert.ok(rendererModule, "terrain renderer module must exist");
  const request = fixtureRequest({ packedBiomes: 0x00000201, packedDensity: 0x00004080 });
  const channels = await rendererModule.renderTerrainTileChannels(request);
  assert.ok(channels.terrain.byteLength > 0);
  assert.ok(channels.biomeMasks.get(1)?.byteLength > 0);
  assert.ok(channels.biomeMasks.get(2)?.byteLength > 0);
  assert.equal(channels.biomeMasks.has(3), false);

  const primary = await sharp(channels.biomeMasks.get(1)).ensureAlpha().raw().toBuffer();
  const secondary = await sharp(channels.biomeMasks.get(2)).ensureAlpha().raw().toBuffer();
  const alphaAt = (bytes, x, y) => bytes[(y * 256 + x) * 4 + 3];
  assert.ok(alphaAt(primary, 10, 240) > alphaAt(secondary, 10, 240), "primary biome mask must be stronger than a secondary blend");
  assert.ok(alphaAt(primary, 10, 200) > 0, "water cells must retain their underlying biome mask");
});
