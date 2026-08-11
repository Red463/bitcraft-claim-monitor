import assert from "node:assert/strict";
import test from "node:test";

let sessionModule = null;
try {
  sessionModule = await import("../src/server/game-data/terrainRegionSession.ts");
} catch {
  // RED: the terrain session does not exist yet.
}

function table(rows) {
  const listeners = { insert: [], update: [], delete: [] };
  const removed = { insert: 0, update: 0, delete: 0 };
  return {
    iter: () => rows.values(),
    onInsert: (callback) => listeners.insert.push(callback),
    onUpdate: (callback) => listeners.update.push(callback),
    onDelete: (callback) => listeners.delete.push(callback),
    removeOnInsert: () => { removed.insert += 1; },
    removeOnUpdate: () => { removed.update += 1; },
    removeOnDelete: () => { removed.delete += 1; },
    emit(kind) { for (const callback of listeners[kind]) callback(); },
    removed,
  };
}

function terrainRow(chunkIndex, chunkX) {
  return {
    chunkIndex: BigInt(chunkIndex), chunkX, chunkZ: 237, dimension: 1,
    biomes: [7, 7, 7, 7], biomeDensity: [100, 100, 100, 100], elevations: [1, 1, 1, 1],
    waterLevels: [-1, -1, -1, -1], waterBodyTypes: Uint8Array.from([0, 0, 0, 0]),
    zoningTypes: Uint8Array.from([0, 0, 0, 0]), originalElevations: [1, 1, 1, 1],
  };
}

function fakeRuntime() {
  const terrainRows = [terrainRow(1, 273), terrainRow(2, 274)];
  const db = {
    worldRegionState: table([{ id: 19, regionMinChunkX: 250, regionMinChunkZ: 230, regionWidthChunks: 80, regionHeightChunks: 80 }]),
    biomeDesc: table([{ biomeType: 7, name: "Grasslands", description: "", hazardLevel: "", iconAddress: "", disallowPlayerBuild: false }]),
    terrainChunkState: table(terrainRows),
  };
  const queries = [];
  let disconnected = () => {};
  let connectAttempts = 0;
  let unsubscribed = 0;
  const connection = {
    db,
    subscriptionBuilder() {
      let applied = () => {};
      let failed = () => {};
      return {
        onApplied(callback) { applied = callback; return this; },
        onError(callback) { failed = callback; return this; },
        subscribe(sql) { queries.push([...sql]); queueMicrotask(applied); return { unsubscribe() { unsubscribed += 1; } }; },
        fail(error) { failed({}, error); },
      };
    },
    disconnect() { disconnected({}, new Error("closed intentionally")); },
  };
  const loadBindings = async () => ({ DbConnection: { builder() {
    connectAttempts += 1;
    let connected = () => {};
    return {
      withUri() { return this; }, withDatabaseName() { return this; },
      onConnect(callback) { connected = callback; return this; }, onConnectError() { return this; },
      onDisconnect(callback) { disconnected = callback; return this; },
      build() { queueMicrotask(() => connected(connection, {}, "token")); return connection; },
    };
  } } });
  return { db, terrainRows, queries, connection, loadBindings, connectAttempts: () => connectAttempts, unsubscribed: () => unsubscribed };
}

const config = {
  uri: "wss://relay.example:4019",
  database: "relay-region-19",
  schemaFingerprint: "regional-v1",
  manifest: { schemas: { regional: { fingerprint: "regional-v1", bindingsGenerated: true } } },
  generation: 7,
  regionId: "19",
  maxChunks: 2,
  maxBytes: 1024,
};

test("terrain session publishes complete generations and applies updates and deletes", async () => {
  assert.ok(sessionModule, "terrain region session module must exist");
  const runtime = fakeRuntime();
  const snapshots = [];
  const failures = [];
  const session = new sessionModule.RelayTerrainRegionSession({
    loadBindings: runtime.loadBindings,
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    onFailure: (failure) => failures.push(failure),
    now: () => new Date("2026-08-11T12:00:00.000Z"),
  });
  await session.start(config);
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(runtime.queries[0], [
    "SELECT * FROM world_region_state WHERE id = 19",
    "SELECT * FROM biome_desc",
    "SELECT * FROM terrain_chunk_state WHERE dimension = 1",
  ]);
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].generation, 7);
  assert.equal(snapshots[0].data.chunks.length, 2);
  assert.deepEqual(session.health(), {
    connected: true, applied: true, stage: "applied", rowCount: 4, chunkCount: 2,
    normalizedBytes: 128, lastAppliedAt: "2026-08-11T12:00:00.000Z", lastError: null,
  });

  runtime.terrainRows.splice(1, 1);
  runtime.db.terrainChunkState.emit("delete");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(snapshots.at(-1).data.chunks.length, 1);
  assert.ok(snapshots.at(-1).generation > snapshots[0].generation);

  runtime.terrainRows[0].elevations = [1];
  runtime.db.terrainChunkState.emit("update");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(snapshots.at(-1).data.chunks.length, 1, "malformed applies must retain the last complete snapshot");
  assert.match(failures.at(-1), /equal cell counts/);

  await assert.rejects(session.start(config), /already started/);
  runtime.connection.disconnect();
  assert.equal(session.health().connected, false);
  assert.match(failures.at(-1), /closed intentionally/);
  await session.stop();
  assert.equal(runtime.unsubscribed(), 1);
  assert.equal(runtime.db.terrainChunkState.removed.delete, 1);
});

test("terrain session rejects schema mismatch and chunk overflow before publishing", async () => {
  assert.ok(sessionModule, "terrain region session module must exist");
  const mismatchRuntime = fakeRuntime();
  const mismatchSession = new sessionModule.RelayTerrainRegionSession({ loadBindings: mismatchRuntime.loadBindings, onSnapshot() {} });
  await assert.rejects(mismatchSession.start({ ...config, schemaFingerprint: "wrong" }), /fingerprint/i);
  assert.equal(mismatchRuntime.connectAttempts(), 0);

  const overflowRuntime = fakeRuntime();
  const snapshots = [];
  const failures = [];
  const overflowSession = new sessionModule.RelayTerrainRegionSession({
    loadBindings: overflowRuntime.loadBindings,
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    onFailure: (failure) => failures.push(failure),
  });
  await overflowSession.start({ ...config, maxChunks: 1 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(snapshots.length, 0);
  assert.match(failures.at(-1), /1 chunk budget/);
  await overflowSession.stop();
});
