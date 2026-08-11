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

test("terrain palette gives water semantic priority and deterministic elevation shading", () => {
  assert.ok(paletteModule, "terrain palette module must exist");
  assert.deepEqual(paletteModule.terrainCellRgba({ surface: "ocean", biomeName: "Uncharted Ocean", elevation: -20 }), [24, 59, 86, 255]);
  assert.deepEqual(paletteModule.terrainCellRgba({ surface: "river", biomeName: "Grasslands", elevation: 0 }), [58, 125, 145, 255]);
  assert.deepEqual(
    paletteModule.terrainCellRgba({ surface: "ocean", biomeName: "Grasslands", elevation: 50 }),
    paletteModule.terrainCellRgba({ surface: "ocean", biomeName: "Uncharted Ocean", elevation: -20 }),
  );
  assert.notDeepEqual(
    paletteModule.terrainCellRgba({ surface: "ground", biomeName: "Grasslands", elevation: -10 }),
    paletteModule.terrainCellRgba({ surface: "ground", biomeName: "Grasslands", elevation: 10 }),
  );
  const warnings = [];
  assert.deepEqual(paletteModule.terrainCellRgba({ surface: "ground", biomeName: "Unknown Future Biome", elevation: 0, warnings }), [104, 108, 103, 255]);
  assert.deepEqual(warnings, ["Unknown terrain biome: Unknown Future Biome"]);
});

test("terrain renderer is deterministic, bounded, clips world edges, and accepts negative tile Y", async () => {
  assert.ok(rendererModule, "terrain renderer module must exist");
  const request = fixtureRequest();
  const first = await rendererModule.renderTerrainTile(request);
  const second = await rendererModule.renderTerrainTile(request);
  assert.deepEqual(createHash("sha256").update(first).digest("hex"), createHash("sha256").update(second).digest("hex"));
  assert.ok(first.byteLength <= 2_097_152);

  const decoded = await sharp(first).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgbaAt = (x, y) => [...decoded.data.subarray((y * 256 + x) * 4, (y * 256 + x) * 4 + 4)];
  assert.equal(rgbaAt(10, 10)[3], 0, "outside the only terrain chunk must be transparent");
  assert.equal(rgbaAt(10, 200)[3], 255, "negative tile Y must address positive world Z");
  assert.ok(rgbaAt(10, 200)[2] > rgbaAt(10, 200)[0], "southern half must decode as water");
});
