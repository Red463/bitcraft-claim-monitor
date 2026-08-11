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

test("map spatial session applies a bounded two-stage joined generation", async () => {
  const resourceRows = [{ entityId: 100n, resourceId: 2 }];
  const db = {
    bankState: table([]),
    waystoneState: table([]),
    resourceState: table(resourceRows),
    enemyState: table([{ entityId: 200n, enemyType: 8 }]),
    locationState: table([{ entityId: 100n, x: 50, z: 60, dimension: 0n }]),
    mobileEntityState: table([{ entityId: 200n, locationX: 70_000, locationZ: 80_000, dimension: 0 }, { entityId: 101n, locationX: 90_000, locationZ: 100_000, dimension: 0 }]),
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
    "SELECT * FROM bank_state WHERE claim_entity_id = 99999999",
    "SELECT * FROM waystone_state WHERE claim_entity_id = 99999999",
    "SELECT * FROM resource_state WHERE resource_id = 2",
  ]);
  assert.deepEqual(subscriptions[1], [
    "SELECT * FROM location_state WHERE entity_id = 100",
    "SELECT * FROM mobile_entity_state WHERE entity_id = 101",
  ]);
  assert.equal(snapshots[0].data.players[0].playerEntityId, "101");
  assert.equal(snapshots[0].data.resources[0].entityId, "100");
  assert.deepEqual(snapshots[0].data.enemies, []);
  assert.match(snapshots[0].warnings.join(" "), /EnemyType.*live-verified/i);

  resourceRows.splice(0);
  db.resourceState.emit("delete");
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(snapshots.at(-1).data.resources, []);
  await session.stop();
});
