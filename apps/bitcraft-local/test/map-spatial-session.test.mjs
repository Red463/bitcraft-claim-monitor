import assert from "node:assert/strict";
import test from "node:test";

import { RelayMapSpatialSession } from "../src/server/game-data/mapSpatialSession.ts";

function table(rows) {
  const listeners = { insert: [], update: [], delete: [] };
  return {
    iter: () => rows.values(),
    onInsert: (callback) => listeners.insert.push(callback),
    onUpdate: (callback) => listeners.update.push(callback),
    onDelete: (callback) => listeners.delete.push(callback),
    removeOnInsert() {}, removeOnUpdate() {}, removeOnDelete() {},
    emit(kind) { for (const callback of listeners[kind]) callback(); },
  };
}

test("map spatial session applies selected-enemy position generation without resource subscriptions", async () => {
  const enemyRows = [{ entityId: 200n, enemyType: 8 }];
  const mobileRows = [{ entityId: 200n, locationX: 70_000, locationZ: 80_000, dimension: 1 }, { entityId: 101n, locationX: 90_000, locationZ: 100_000, dimension: 1 }];
  const db = {
    waystoneState: table([]),
    enemyState: table(enemyRows),
    mobileEntityState: table(mobileRows),
  };
  const subscriptions = [];
  const snapshots = [];
  const connection = {
    db,
    subscriptionBuilder() {
      let applied = () => {};
      return {
        onApplied(callback) { applied = callback; return this; },
        onError() { return this; },
        subscribe(queries) { subscriptions.push([...queries]); queueMicrotask(applied); return { unsubscribe() {} }; },
      };
    },
    disconnect() {},
  };
  const loadBindings = async () => ({ DbConnection: { builder() {
    let connected = () => {};
    return { withUri() { return this; }, withDatabaseName() { return this; }, onConnect(callback) { connected = callback; return this; }, onConnectError() { return this; }, onDisconnect() { return this; }, build() { queueMicrotask(() => connected(connection)); return connection; } };
  } } });
  const session = new RelayMapSpatialSession({ loadBindings, onSnapshot: (snapshot) => snapshots.push(snapshot), now: () => new Date("2026-08-11T12:00:00.000Z") });
  await session.start({
    uri: "wss://relay.example:4019",
    database: "relay-region-19",
    schemaFingerprint: "regional-v1",
    manifest: { schemas: { regional: { fingerprint: "regional-v1", bindingsGenerated: true } } },
    generation: 1,
    scope: { claimId: "99999999", regionId: "19", playerIds: ["101"], resourceIds: ["2"], enemyTypes: ["8"] },
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(subscriptions[0], [
    "SELECT * FROM enemy_state",
    "SELECT * FROM mobile_entity_state WHERE (entity_id = 101) AND dimension = 1",
  ]);
  assert.deepEqual(subscriptions[1], [
    "SELECT * FROM mobile_entity_state WHERE (entity_id = 200) AND dimension = 1",
  ]);
  assert.equal(subscriptions.length, 2);
  assert.equal(snapshots[0].data.players[0].playerEntityId, "101");
  assert.deepEqual(snapshots[0].data.resources, []);
  assert.equal(snapshots[0].data.enemies[0].entityId, "200");
  assert.deepEqual(session.health(), {
    connected: true,
    applied: true,
    stage: "applied",
    rowCount: 3,
    enemyRowCount: 1,
    queryCount: 3,
    lastAppliedAt: "2026-08-11T12:00:00.000Z",
    lastError: null,
  });

  enemyRows.splice(0);
  db.enemyState.emit("delete");
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(snapshots.at(-1).data.enemies, []);

  mobileRows.splice(0);
  db.mobileEntityState.emit("delete");
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(snapshots.at(-1).data.players, []);
  await session.stop();
});

test("map spatial session serializes enemy subscription rebuilds", async () => {
  const enemyRows = [{ entityId: 200n, enemyType: 8 }];
  const db = {
    waystoneState: table([]),
    enemyState: table(enemyRows),
    mobileEntityState: table([{ entityId: 200n, locationX: 70_000, locationZ: 80_000, dimension: 1 }, { entityId: 201n, locationX: 90_000, locationZ: 100_000, dimension: 1 }]),
  };
  const applied = [];
  const handles = [];
  const connection = {
    db,
    subscriptionBuilder() {
      let onApplied = () => {};
      return {
        onApplied(callback) { onApplied = callback; return this; },
        onError() { return this; },
        subscribe() {
          applied.push(onApplied);
          const handle = { unsubscribeCount: 0, unsubscribe() { this.unsubscribeCount += 1; } };
          handles.push(handle);
          return handle;
        },
      };
    },
    disconnect() {},
  };
  const loadBindings = async () => ({ DbConnection: { builder() {
    let connected = () => {};
    return { withUri() { return this; }, withDatabaseName() { return this; }, onConnect(callback) { connected = callback; return this; }, onConnectError() { return this; }, onDisconnect() { return this; }, build() { queueMicrotask(() => connected(connection)); return connection; } };
  } } });
  const session = new RelayMapSpatialSession({ loadBindings, onSnapshot() {} });
  await session.start({
    uri: "wss://relay.example:4019", database: "relay-region-19", schemaFingerprint: "regional-v1",
    manifest: { schemas: { regional: { fingerprint: "regional-v1", bindingsGenerated: true } } }, generation: 1,
    scope: { claimId: "99999999", regionId: "19", playerIds: [], resourceIds: [], enemyTypes: ["8"] },
  });
  await new Promise((resolve) => setImmediate(resolve));
  applied[0]();
  assert.equal(applied.length, 2);

  enemyRows.splice(0, 1, { entityId: 201n, enemyType: 8 });
  db.enemyState.emit("update");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(applied.length, 2, "a pending enemy subscription must finish before its replacement starts");

  applied[1]();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(applied.length, 3);
  applied[2]();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(handles[1].unsubscribeCount, 1);
  await session.stop();
});
