import assert from "node:assert/strict";
import test from "node:test";

let runtimeModule = null;
try {
  runtimeModule = await import("../src/server/game-data/terrainRuntime.ts");
} catch {
  // RED: terrain runtime does not exist yet.
}

function terrain(regionId, generation = 1) {
  const chunkX = Number(regionId) * 10;
  return {
    data: {
      regionId, worldRegionStateId: regionId, dimension: "1", observedAt: "2026-08-11T16:00:00.000Z",
      regionBounds: { minChunkX: chunkX, minChunkZ: 0, maxChunkX: chunkX, maxChunkZ: 0 },
      biomes: [], chunks: [{
        chunkIndex: String(chunkX), chunkX, chunkZ: 0,
        biomes: Uint8Array.from([1]), biomeDensity: Uint32Array.from([100]),
        elevations: Int16Array.from([1]), originalElevations: Int16Array.from([1]),
        waterLevels: Int16Array.from([-1]), waterBodyTypes: Uint8Array.from([0]),
      }], cellCount: 1024, normalizedBytes: 16384,
    },
    warnings: [], database: `bitcraft-live-${regionId}`, regionId, schemaFingerprint: `fp-${regionId}`, generation,
    receivedAt: "2026-08-11T16:00:00.000Z",
  };
}

test("terrain runtime canonicalizes four regions, coalesces builds, and retains last-good", async () => {
  assert.ok(runtimeModule, "terrain runtime module must exist");
  const sessions = new Map();
  const builds = [];
  const buildFailures = [];
  let releaseFirst;
  const firstBlocked = new Promise((resolve) => { releaseFirst = resolve; });
  const tileStore = {
    async buildAndInstall(value) {
      builds.push(value);
      if (builds.length === 1) await firstBlocked;
      if (value.failBuild) throw new Error("forced build failure");
      return { generation: value.generation, tileCount: 1, totalBytes: 10, generatedAt: "2026-08-11T16:00:00.000Z" };
    },
  };
  const runtime = new runtimeModule.RelayTerrainRuntime({
    manifest: {}, tileStore, evidence: { verified: true, side: 32, cellSize: 3, evidenceHash: "fixture" },
    onBuildFailure: (error) => buildFailures.push(error),
    discoverTopology: async () => ({ regions: new Map(["1", "2", "3", "4"].map((id) => [id, { ready: true, port: 3000 + Number(id), database: `bitcraft-live-${id}`, schemaFingerprint: `fp-${id}` }])) }),
    createSession: ({ onSnapshot }) => {
      const session = { startConfig: null, stopped: false, async start(config) { this.startConfig = config; sessions.set(config.regionId, { session: this, emit: onSnapshot }); }, health: () => ({ connected: true, applied: true }), async stop() { this.stopped = true; } };
      return session;
    },
  });

  await runtime.start({ relayBaseUrl: "https://relay.example", activeRegionIds: ["4", "2", "2", "1", "3"] });
  assert.deepEqual(runtime.health().activeRegionIds, ["1", "2", "3", "4"]);
  await sessions.get("1").emit(terrain("1"));
  await sessions.get("2").emit(terrain("2"));
  await sessions.get("1").emit(terrain("1", 2));
  releaseFirst();
  await runtime.waitForIdle();
  assert.equal(builds.length, 2, "intermediate pending generations must be coalesced");
  assert.deepEqual(builds[1].regionIds, ["1", "2"]);
  assert.equal(runtime.health().lastGoodGeneration, "2");
  await sessions.get("1").emit(terrain("1", 3));
  await runtime.waitForIdle();
  assert.equal(builds.length, 2, "identical render content must not rebuild tiles");

  const densityChanged = terrain("1", 4);
  densityChanged.data.chunks[0].biomeDensity[0] = 101;
  await sessions.get("1").emit(densityChanged);
  await runtime.waitForIdle();
  assert.equal(builds.length, 3, "palette inputs must invalidate rendered tiles");

  tileStore.buildAndInstall = async () => { throw new Error("forced build failure"); };
  await sessions.get("3").emit(terrain("3"));
  await runtime.waitForIdle();
  assert.equal(runtime.health().lastGoodGeneration, "3");
  assert.match(runtime.health().lastError, /forced build failure/);
  assert.deepEqual(buildFailures, ["forced build failure"]);
  await runtime.stop();
  assert.ok([...sessions.values()].every(({ session }) => session.stopped));
});

test("terrain runtime rejects empty and over-cap scopes", async () => {
  assert.ok(runtimeModule, "terrain runtime module must exist");
  const runtime = new runtimeModule.RelayTerrainRuntime({ manifest: {}, tileStore: { buildAndInstall: async () => ({}) }, evidence: { verified: true }, discoverTopology: async () => ({ regions: new Map() }) });
  await assert.rejects(runtime.start({ relayBaseUrl: "https://relay.example", activeRegionIds: [] }), /at least one/);
  await assert.rejects(runtime.start({ relayBaseUrl: "https://relay.example", activeRegionIds: ["1", "2", "3", "4", "5"] }), /four/);
});

test("terrain render hash includes the palette version", () => {
  assert.ok(runtimeModule, "terrain runtime module must exist");
  const data = terrain("1").data;
  assert.notEqual(runtimeModule.terrainRenderHash(data, 2), runtimeModule.terrainRenderHash(data, 3));
});
