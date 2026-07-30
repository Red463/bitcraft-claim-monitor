import assert from "node:assert/strict";
import test from "node:test";

const { RelayEmpireRegionSession } = await import(
  "../src/server/game-data/empireRegionSession.ts"
);

function table(values) {
  const listeners = { insert: [], update: [], delete: [] };
  return {
    iter: () => values.values(),
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

test("empire session stages regional state before exact claim, username, and nickname joins", async () => {
  const subscriptions = [];
  const empireRows = [{
    entityId: 10n,
    capitalBuildingEntityId: 100n,
    name: "Empire",
    shardTreasury: 1,
    nobilityThreshold: 2,
    numClaims: 1,
    location: { x: 1, z: 2, dimension: 1n },
    empireCurrencyTreasury: 3,
    ownerType: { tag: "Player" },
  }];
  const settlementRows = [{
    buildingEntityId: 100n,
    claimEntityId: 40n,
    empireEntityId: 10n,
    chunkIndex: 50n,
    canHouseEmpireStorehouse: false,
    membersDonations: 0,
    location: { x: 3, z: 4, dimension: 1n },
  }];
  const claimRows = [{
    entityId: 40n,
    ownerPlayerEntityId: 20n,
    ownerBuildingEntityId: 100n,
    name: "Settlement",
    neutral: false,
  }];
  const db = {
    empireState: table(empireRows),
    empirePlayerDataState: table([{
      entityId: 20n,
      empireEntityId: 10n,
      rank: 0,
      donatedShards: 0,
      donatedEmpireCurrency: 0,
    }]),
    empireRankState: table([{
      entityId: 30n,
      empireEntityId: 10n,
      rank: 0,
      title: "Emperor",
      permissions: [],
    }]),
    empireSettlementState: table(settlementRows),
    empireNodeState: table([{
      entityId: 60n,
      empireEntityId: 10n,
      chunkIndex: 51n,
      energy: 7,
      active: true,
      upkeep: 1,
      location: { x: 5, z: 6, dimension: 1n },
    }]),
    empireNodeSiegeState: table([]),
    empireChunkState: table([{
      chunkIndex: 51n,
      empireEntityId: 10n,
      watchtowerEntityId: 60n,
    }]),
    claimState: table(claimRows),
    playerUsernameState: table([{ entityId: 20n, username: "Owner" }]),
    buildingNicknameState: table([{ entityId: 60n, nickname: "North Watch" }]),
  };
  let disconnected = () => {};
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
    disconnect() {
      disconnected({}, undefined);
    },
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
          onDisconnect(callback) { disconnected = callback; return this; },
          build() {
            queueMicrotask(() => connected(connection, {}, "token"));
            return connection;
          },
        };
      },
    },
  });
  const waiters = [];
  const failures = [];
  const waitForSnapshot = () => new Promise((resolve) => waiters.push(resolve));
  const session = new RelayEmpireRegionSession({
    loadBindings,
    onSnapshot: (snapshot) => waiters.shift()?.(snapshot),
    onFailure: (error) => failures.push(error),
    now: () => new Date("2026-07-30T18:00:00.000Z"),
  });

  const initialPromise = waitForSnapshot();
  await session.start({
    uri: "wss://relay.example:4019",
    database: "relay-region-19",
    schemaFingerprint: "regional-v1",
    manifest: { schemas: { regional: { fingerprint: "regional-v1", bindingsGenerated: true } } },
    generation: 1,
    regionId: "19",
  });
  const initial = await initialPromise;

  assert.deepEqual(subscriptions[0], [
    "SELECT * FROM empire_state",
    "SELECT * FROM empire_player_data_state",
    "SELECT * FROM empire_rank_state",
    "SELECT * FROM empire_settlement_state",
    "SELECT * FROM empire_node_state",
    "SELECT * FROM empire_node_siege_state",
    "SELECT * FROM empire_chunk_state",
  ]);
  assert.deepEqual(subscriptions[1], [
    "SELECT * FROM player_username_state WHERE entity_id = 20",
    "SELECT * FROM claim_state WHERE entity_id = 40",
    "SELECT * FROM building_nickname_state WHERE entity_id = 60 OR entity_id = 100",
  ]);
  assert.equal(subscriptions.flat().includes("SELECT * FROM player_username_state"), false);
  assert.equal(subscriptions.flat().includes("SELECT * FROM claim_state"), false);
  assert.equal(subscriptions.flat().includes("SELECT * FROM building_nickname_state"), false);
  assert.equal(initial.data.empires[0].memberCount, 1);
  assert.equal(initial.data.settlements[0].claimName, "Settlement");
  assert.equal(initial.data.nodes[0].nickname, "North Watch");

  const updatedPromise = waitForSnapshot();
  empireRows[0].empireCurrencyTreasury = 4;
  db.empireState.emit("update");
  const updated = await updatedPromise;
  assert.equal(updated.data.empires[0].empireCurrencyTreasury, "4");
  assert.ok(updated.generation > initial.generation);

  claimRows.push({
    entityId: 41n,
    ownerPlayerEntityId: 20n,
    ownerBuildingEntityId: 100n,
    name: "New Settlement",
    neutral: false,
  });
  settlementRows[0].claimEntityId = 41n;
  const foreignKeyUpdatePromise = waitForSnapshot();
  db.empireSettlementState.emit("update");
  const foreignKeyUpdate = await foreignKeyUpdatePromise;
  assert.equal(
    subscriptions.at(-1).includes("SELECT * FROM claim_state WHERE entity_id = 41"),
    true,
  );
  assert.equal(foreignKeyUpdate.data.settlements[0].claimName, "New Settlement");

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(session.health().stage, "live");
  await session.stop();
  assert.deepEqual(failures, []);
});
