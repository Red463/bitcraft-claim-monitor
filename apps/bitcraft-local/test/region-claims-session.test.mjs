import assert from "node:assert/strict";
import test from "node:test";

let sessionModule = null;
try {
  sessionModule = await import("../src/server/game-data/regionClaimsSession.ts");
} catch {
  // The first TDD run proves the live regional-claims session is absent.
}

function table(rows) {
  const listeners = { insert: [], update: [], delete: [] };
  return {
    iter: () => rows.values(),
    onInsert: (callback) => listeners.insert.push(callback),
    onUpdate: (callback) => listeners.update.push(callback),
    onDelete: (callback) => listeners.delete.push(callback),
    removeOnInsert: () => {},
    removeOnUpdate: () => {},
    removeOnDelete: () => {},
    emit(kind) {
      for (const callback of listeners[kind]) callback();
    },
  };
}

test("regional claims session subscribes to region-bounded parents then exact owner usernames", async () => {
  assert.ok(sessionModule, "regional claims session module must exist");
  const subscriptions = [];
  const claimRows = [{
    entityId: 1369094286777412590n,
    ownerPlayerEntityId: 1224979098736429551n,
    ownerBuildingEntityId: 1369094286778488967n,
    name: "Timbersteel Trade",
    neutral: false,
  }];
  const localRows = [{
    entityId: 1369094286777412590n,
    supplies: 100,
    numTiles: 25,
    treasury: 200,
    buildingDescriptionId: 6020,
    location: { x: 10, z: 20, dimension: 0n },
  }];
  const db = {
    claimState: table(claimRows),
    claimLocalState: table(localRows),
    buildingClaimDesc: table([{ buildingId: 6020, tier: 6 }]),
    playerUsernameState: table([{
      entityId: 1224979098736429551n,
      username: "Red463",
    }]),
  };
  const connection = {
    db,
    subscriptionBuilder() {
      let applied = () => {};
      return {
        onApplied(callback) {
          applied = callback;
          return this;
        },
        onError() {
          return this;
        },
        subscribe(queries) {
          subscriptions.push([...queries]);
          queueMicrotask(applied);
          return { unsubscribe() {} };
        },
      };
    },
    disconnect() {},
  };
  const loadBindings = async () => ({
    DbConnection: {
      builder() {
        let connected = () => {};
        return {
          withUri() { return this; },
          withDatabaseName() { return this; },
          onConnect(callback) { connected = callback; return this; },
          onConnectError() { return this; },
          onDisconnect() { return this; },
          build() {
            queueMicrotask(() => connected(connection, {}, "token"));
            return connection;
          },
        };
      },
    },
  });
  const snapshotWaiters = [];
  const waitForSnapshot = () => new Promise((resolve) => snapshotWaiters.push(resolve));
  const session = new sessionModule.RelayRegionClaimsSession({
    loadBindings,
    onSnapshot: (snapshot) => snapshotWaiters.shift()?.(snapshot),
    now: () => new Date("2026-07-30T12:00:00.000Z"),
  });

  const snapshotPromise = waitForSnapshot();
  await session.start({
    uri: "wss://relay.example:4019",
    database: "relay-region-19",
    schemaFingerprint: "regional-v1",
    manifest: { schemas: { regional: { fingerprint: "regional-v1", bindingsGenerated: true } } },
    generation: 1,
    regionId: "19",
  });
  const snapshot = await snapshotPromise;

  assert.deepEqual(subscriptions[0], [
    "SELECT * FROM claim_state",
    "SELECT * FROM claim_local_state",
    "SELECT * FROM building_claim_desc",
  ]);
  assert.deepEqual(subscriptions[1], [
    "SELECT * FROM player_username_state WHERE entity_id = 1224979098736429551",
  ]);
  assert.equal(subscriptions.flat().includes("SELECT * FROM player_username_state"), false);
  assert.equal(snapshot.data.claims[0].ownerPlayerUsername, "Red463");
  assert.equal(snapshot.data.claims[0].tier, 6);
  assert.equal(snapshot.regionId, "19");

  const updatedSnapshotPromise = waitForSnapshot();
  localRows[0].supplies = 101;
  db.claimLocalState.emit("update");
  const updatedSnapshot = await updatedSnapshotPromise;
  assert.equal(updatedSnapshot.data.claims[0].supplies, 101);
  assert.ok(updatedSnapshot.generation > snapshot.generation);

  const deletedSnapshotPromise = waitForSnapshot();
  const removedClaim = claimRows.pop();
  db.claimState.emit("delete");
  const deletedSnapshot = await deletedSnapshotPromise;
  assert.deepEqual(deletedSnapshot.data.claims, []);

  const insertedSnapshotPromise = waitForSnapshot();
  claimRows.push(removedClaim);
  db.claimState.emit("insert");
  const insertedSnapshot = await insertedSnapshotPromise;
  assert.equal(insertedSnapshot.data.claims[0].entityId, "1369094286777412590");

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(session.health().applied, true);
  await session.stop();
});
