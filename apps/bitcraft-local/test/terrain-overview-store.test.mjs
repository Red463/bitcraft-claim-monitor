import assert from "node:assert/strict";
import test from "node:test";

import { createLayeredTerrainTileStore } from "../src/server/terrainOverviewStore.mjs";

test("layered terrain store exposes whole-world overview coverage and detail fallback", async () => {
  let detailReads = 0;
  let overviewReads = 0;
  const detail = {
    readManifest: async () => ({ generation: "2", generatedAt: "2026-08-11T12:00:00.000Z", regionIds: ["19"], bounds: { minX: 23040, minZ: 23040, maxX: 30720, maxZ: 30720 }, tileCount: 10, totalBytes: 100, biomes: [{ biomeType: 1, name: "Calm Forest", present: true }, { biomeType: 2, name: "Pine Woods", present: false }] }),
    readTile: async ({ z }) => {
      detailReads += 1;
      return z === 0 ? { bytes: Buffer.from("detail"), contentType: "image/webp", generation: "2" } : null;
    },
  };
  const overview = {
    readManifest: async () => ({ generation: "100", generatedAt: "2026-08-11T11:00:00.000Z", regionIds: ["3", "19"], bounds: { minX: 0, minZ: 0, maxX: 38400, maxZ: 38400 }, tileCount: 20, totalBytes: 200, biomes: [{ biomeType: 1, name: "Calm Forest", present: false }, { biomeType: 2, name: "Pine Woods", present: true }] }),
    readTile: async ({ z }) => {
      overviewReads += 1;
      return z <= -2 ? { bytes: Buffer.from("overview"), contentType: "image/webp", generation: "100" } : null;
    },
  };
  const store = createLayeredTerrainTileStore({ detailStore: detail, overviewStore: overview });
  const manifest = await store.readManifest();
  assert.deepEqual(manifest.regionIds, ["3", "19"]);
  assert.deepEqual(manifest.bounds, { minX: 0, minZ: 0, maxX: 38400, maxZ: 38400 });
  assert.deepEqual(manifest.biomes.map(({ biomeType, present }) => [biomeType, present]), [[1, true], [2, true]]);
  assert.equal((await store.readTile({ style: "terrain", z: -5, x: 0, y: -1 })).bytes.toString(), "overview");
  assert.equal((await store.readTile({ style: "terrain", z: -5, x: 0, y: -1 })).bytes.toString(), "overview");
  assert.equal((await store.readTile({ style: "terrain", z: 0, x: 1, y: -1 })).bytes.toString(), "detail");
  assert.equal(detailReads, 2);
  assert.equal(overviewReads, 2);
});
