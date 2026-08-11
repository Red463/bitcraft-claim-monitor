import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

let storeModule = null;
try {
  storeModule = await import("../src/server/terrainTileStore.mjs");
} catch {
  // RED: atomic terrain store does not exist yet.
}

function generation(id) {
  return {
    generation: String(id),
    observedAt: "2026-08-11T15:38:41.745Z",
    regionId: "19",
    regionIds: ["19"],
    dimension: "1",
    regionBounds: { minChunkX: 0, minChunkZ: 0, maxChunkX: 0, maxChunkZ: 0 },
    evidence: { side: 32, cellSize: 3, evidenceHash: "fixture" },
  };
}

test("terrain store installs complete bundles and retains last-good on encoder failure", async () => {
  assert.ok(storeModule, "terrain tile store module must exist");
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "bitcraft-terrain-store-"));
  let calls = 0;
  let failAfter = Infinity;
  const encoder = async ({ generation: value, zoom, x, y }) => {
    calls += 1;
    if (calls > failAfter) throw new Error("forced encoder failure");
    return Buffer.from(`${value.generation}:${zoom}:${x}:${y}`);
  };
  const store = storeModule.createTerrainTileStore({
    dataDir,
    encoder,
    now: () => new Date("2026-08-11T16:00:00.000Z"),
    limits: { minZoom: -5, maxZoom: -3, maxTiles: 10, maxBytes: 1024, maxTileBytes: 256, deadlineMs: 10_000 },
  });

  const first = await store.buildAndInstall(generation(1));
  assert.equal(first.generation, "1");
  assert.equal((await store.readManifest()).generation, "1");
  assert.equal((await store.readTile({ style: "terrain", z: -5, x: 0, y: -1 })).bytes.toString(), "1:-5:0:-1");

  calls = 0;
  failAfter = 2;
  await assert.rejects(store.buildAndInstall(generation(2)), /forced encoder failure/);
  assert.equal((await store.readManifest()).generation, "1");
  assert.equal((await store.readTile({ style: "terrain", z: -5, x: 0, y: -1 })).bytes.toString(), "1:-5:0:-1");
  await store.close();
});

test("terrain store rejects budgets and malformed current manifests", async () => {
  assert.ok(storeModule, "terrain tile store module must exist");
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "bitcraft-terrain-budget-"));
  const store = storeModule.createTerrainTileStore({
    dataDir,
    encoder: async () => Buffer.alloc(300),
    limits: { minZoom: -5, maxZoom: -3, maxTiles: 2, maxBytes: 512, maxTileBytes: 256, deadlineMs: 10_000 },
  });
  await assert.rejects(store.buildAndInstall(generation(1)), /tile budget|tile byte budget/);
  assert.equal(await store.readManifest(), null);
  await mkdir(path.join(dataDir, "map-tiles"), { recursive: true });
  await writeFile(path.join(dataDir, "map-tiles", "current.json"), "{malformed", "utf8");
  const reopened = storeModule.createTerrainTileStore({ dataDir, encoder: async () => Buffer.alloc(1) });
  assert.equal(await reopened.readManifest(), null);
  await reopened.close();
  await store.close();
});
