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
    worldRegionState: table([{
      id: 0,
      regionIndex: 19,
      regionMinChunkX: 0,
      regionMinChunkZ: 0,
      regionWidthChunks: 80,
      regionHeightChunks: 80,
      regionCount: 25,
      regionCountSqrt: 5,
    }]),
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
    claimMemberState: table([{
      entityId: 70n,
      claimEntityId: 40n,
      playerEntityId: 20n,
      userName: "Owner",
      inventoryPermission: true,
      buildPermission: true,
      officerPermission: true,
      coOwnerPermission: false,
    }]),
    playerUsernameState: table([{ entityId: 20n, username: "Owner" }]),
    playerState: table([{
      entityId: 20n,
      signedIn: true,
      signInTimestamp: 1785430800,
      timePlayed: 3600,
    }]),
    buildingNicknameState: table([{ entityId: 60n, nickname: "North Watch" }]),
    buildingState: table([{
      entityId: 5001n,
      claimEntityId: 40n,
      buildingDescriptionId: 90001,
    }]),
    inventoryState: table([{
      entityId: 7001n,
      ownerEntityId: 5001n,
      playerOwnerEntityId: 20n,
      pockets: [
        { contents: { itemId: 828972621, itemType: { tag: "Item" }, quantity: 12 } },
        { contents: { itemId: 2000000, itemType: { tag: "Cargo" }, quantity: 3 } },
      ],
    }]),
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

  const basePromise = waitForSnapshot();
  const initialPromise = waitForSnapshot();
  await session.start({
    uri: "wss://relay.example:4019",
    database: "relay-region-19",
    schemaFingerprint: "regional-v1",
    manifest: { schemas: { regional: { fingerprint: "regional-v1", bindingsGenerated: true } } },
    generation: 1,
    regionId: "19",
    includeHexiteInventories: true,
  });
  const baseSnapshot = await basePromise;
  const initial = await initialPromise;
  assert.equal(baseSnapshot.data.hexite, null);

  assert.deepEqual(subscriptions[0], [
    "SELECT * FROM world_region_state",
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
    "SELECT * FROM claim_member_state WHERE claim_entity_id = 40",
    "SELECT * FROM player_state WHERE entity_id = 20",
    "SELECT * FROM building_nickname_state WHERE entity_id = 60 OR entity_id = 100",
  ]);
  assert.deepEqual(subscriptions[2], [
    "SELECT * FROM building_state WHERE claim_entity_id = 40",
  ]);
  assert.deepEqual(subscriptions[3], [
    "SELECT * FROM inventory_state WHERE player_owner_entity_id = 20",
    "SELECT * FROM inventory_state WHERE owner_entity_id = 5001",
  ]);
  assert.equal(subscriptions.flat().includes("SELECT * FROM player_username_state"), false);
  assert.equal(subscriptions.flat().includes("SELECT * FROM claim_state"), false);
  assert.equal(subscriptions.flat().includes("SELECT * FROM claim_member_state"), false);
  assert.equal(subscriptions.flat().includes("SELECT * FROM player_state"), false);
  assert.equal(subscriptions.flat().includes("SELECT * FROM building_nickname_state"), false);
  assert.equal(initial.data.empires[0].memberCount, 1);
  assert.equal(initial.data.settlements[0].claimName, "Settlement");
  assert.equal(initial.data.nodes[0].nickname, "North Watch");
  assert.equal(initial.data.members[0].signedIn, true);
  assert.equal(initial.data.claimMembers[0].inventoryPermission, true);
  assert.deepEqual(initial.data.hexite, {
    inventories: [{
      entityId: "7001",
      empireEntityId: "10",
      regionId: "19",
      sourceType: "player",
      energy: "12",
      capsules: "3",
      reserveBuilding: true,
    }],
    coverage: [{
      empireEntityId: "10",
      regionId: "19",
      playerCount: 1,
      claimCount: 1,
    }],
  });

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
  assert.equal(subscriptions.some(
    (queries) => queries.includes("SELECT * FROM claim_state WHERE entity_id = 41"),
  ), true);
  assert.equal(foreignKeyUpdate.data.settlements[0].claimName, "New Settlement");

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(session.health().stage, "live");
  await session.stop();
  assert.deepEqual(failures, []);
});

test("secondary empire sessions omit replicated identities but add bounded local Hexite joins", async () => {
  const subscriptions = [];
  const db = {
    worldRegionState: table([{
      id: 0,
      regionIndex: 19,
      regionMinChunkX: 0,
      regionMinChunkZ: 0,
      regionWidthChunks: 80,
      regionHeightChunks: 80,
    }]),
    empireState: table([{
      entityId: 10n,
      capitalBuildingEntityId: 100n,
      name: "Replicated Empire",
      shardTreasury: 0,
      nobilityThreshold: 0,
      numClaims: 1,
      location: { x: 1, z: 2, dimension: 1n },
      empireCurrencyTreasury: 0,
      ownerType: { tag: "Player" },
    }]),
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
    empireSettlementState: table([{
      buildingEntityId: 100n,
      claimEntityId: 40n,
      empireEntityId: 10n,
      chunkIndex: 50n,
      canHouseEmpireStorehouse: false,
      membersDonations: 0,
      location: { x: 3, z: 4, dimension: 1n },
    }]),
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
    claimState: table([{
      entityId: 40n,
      ownerPlayerEntityId: 20n,
      ownerBuildingEntityId: 100n,
      name: "Local Settlement",
      neutral: false,
    }]),
    claimMemberState: table([{
      entityId: 70n,
      claimEntityId: 40n,
      playerEntityId: 20n,
      userName: "Local Owner",
      inventoryPermission: true,
      buildPermission: true,
      officerPermission: true,
      coOwnerPermission: false,
    }]),
    playerUsernameState: table([]),
    playerState: table([]),
    buildingNicknameState: table([{ entityId: 60n, nickname: "Local Watch" }]),
    buildingState: table([{
      entityId: 5001n,
      claimEntityId: 40n,
      buildingDescriptionId: 90001,
    }]),
    inventoryState: table([{
      entityId: 7001n,
      ownerEntityId: 5001n,
      playerOwnerEntityId: 20n,
      pockets: [{
        contents: { itemId: 2000000, itemType: { tag: "Cargo" }, quantity: 4 },
      }],
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
  let baseSnapshot = null;
  let resolveSnapshot;
  const snapshotPromise = new Promise((resolve) => {
    resolveSnapshot = resolve;
  });
  const session = new RelayEmpireRegionSession({
    loadBindings,
    onSnapshot: (snapshot) => {
      if (snapshot.data.hexite == null) {
        baseSnapshot = snapshot;
      } else {
        resolveSnapshot(snapshot);
      }
    },
  });

  await session.start({
    uri: "wss://relay.example:4019",
    database: "relay-region-19",
    schemaFingerprint: "regional-v1",
    manifest: { schemas: { regional: { fingerprint: "regional-v1", bindingsGenerated: true } } },
    generation: 1,
    regionId: "19",
    includeIdentities: false,
    includeHexiteInventories: true,
  });
  const snapshot = await snapshotPromise;
  assert.equal(baseSnapshot?.data.hexite, null);

  assert.deepEqual(subscriptions[0], [
    "SELECT * FROM world_region_state",
    "SELECT * FROM empire_settlement_state",
    "SELECT * FROM empire_node_state",
    "SELECT * FROM empire_node_siege_state",
    "SELECT * FROM empire_chunk_state",
  ]);
  assert.deepEqual(subscriptions[1], [
    "SELECT * FROM claim_state WHERE entity_id = 40",
    "SELECT * FROM claim_member_state WHERE claim_entity_id = 40",
    "SELECT * FROM building_nickname_state WHERE entity_id = 60 OR entity_id = 100",
  ]);
  assert.deepEqual(subscriptions[2], [
    "SELECT * FROM empire_player_data_state WHERE empire_entity_id = 10",
    "SELECT * FROM building_state WHERE claim_entity_id = 40",
  ]);
  assert.deepEqual(subscriptions[3], [
    "SELECT * FROM inventory_state WHERE player_owner_entity_id = 20",
    "SELECT * FROM inventory_state WHERE owner_entity_id = 5001",
  ]);
  assert.equal(subscriptions.flat().includes("SELECT * FROM empire_player_data_state"), false);
  assert.deepEqual(snapshot.data.empires, []);
  assert.deepEqual(snapshot.data.members, []);
  assert.equal(snapshot.data.settlements[0].claimOwnerName, "Local Owner");
  assert.equal(snapshot.data.nodes[0].nickname, "Local Watch");
  assert.equal(snapshot.data.hexite.inventories[0].capsules, "4");

  await session.stop();
});

test("empire session reconnects unexpected disconnects with bounded backoff but not intentional stop", async () => {
  const retries = [];
  const disconnectHandlers = [];
  let builds = 0;
  const emptyDb = {
    worldRegionState: table([{
      id: 0,
      regionIndex: 19,
      regionMinChunkX: 0,
      regionMinChunkZ: 0,
      regionWidthChunks: 80,
      regionHeightChunks: 80,
    }]),
    empireState: table([]),
    empirePlayerDataState: table([]),
    empireRankState: table([]),
    empireSettlementState: table([]),
    empireNodeState: table([]),
    empireNodeSiegeState: table([]),
    empireChunkState: table([]),
    claimState: table([]),
    claimMemberState: table([]),
    playerUsernameState: table([]),
    playerState: table([]),
    buildingNicknameState: table([]),
  };
  const loadBindings = async () => ({
    DbConnection: {
      builder() {
        let connected = () => {};
        let disconnected = () => {};
        const connection = {
          db: emptyDb,
          subscriptionBuilder() {
            let applied = () => {};
            return {
              onApplied(callback) { applied = callback; return this; },
              onError() { return this; },
              subscribe() {
                queueMicrotask(applied);
                return { unsubscribe() {} };
              },
            };
          },
          disconnect() {
            disconnected({}, undefined);
          },
        };
        return {
          withUri() { return this; },
          withDatabaseName() { return this; },
          onConnect(callback) { connected = callback; return this; },
          onConnectError() { return this; },
          onDisconnect(callback) { disconnected = callback; return this; },
          build() {
            builds += 1;
            disconnectHandlers.push(disconnected);
            queueMicrotask(() => connected(connection, {}, "token"));
            return connection;
          },
        };
      },
    },
  });
  const failures = [];
  const session = new RelayEmpireRegionSession({
    loadBindings,
    onSnapshot: () => {},
    onFailure: (error) => failures.push(error),
    random: () => 0.5,
    scheduleRetry: (callback, delayMs) => {
      const retry = { callback, delayMs, cancelled: false };
      retries.push(retry);
      return () => { retry.cancelled = true; };
    },
  });
  await session.start({
    uri: "wss://relay.example:4019",
    database: "relay-region-19",
    schemaFingerprint: "regional-v1",
    manifest: { schemas: { regional: { fingerprint: "regional-v1", bindingsGenerated: true } } },
    generation: 1,
    regionId: "19",
  });
  await new Promise((resolve) => setImmediate(resolve));

  disconnectHandlers[0]({}, undefined);
  assert.equal(failures.length, 1);
  assert.equal(retries[0].delayMs, 1_000);
  retries[0].callback();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(builds, 2);
  assert.equal(session.health().connected, true);

  await session.stop();
  assert.equal(retries.length, 1);
});

test("empire session rediscovers its source on the third consecutive connection failure", async () => {
  const retries = [];
  const connectionTargets = [];
  let builds = 0;
  let sourceRefreshes = 0;
  const emptyDb = {
    worldRegionState: table([{
      id: 0,
      regionIndex: 19,
      regionMinChunkX: 0,
      regionMinChunkZ: 0,
      regionWidthChunks: 80,
      regionHeightChunks: 80,
    }]),
    empireState: table([]),
    empirePlayerDataState: table([]),
    empireRankState: table([]),
    empireSettlementState: table([]),
    empireNodeState: table([]),
    empireNodeSiegeState: table([]),
    empireChunkState: table([]),
    claimState: table([]),
    claimMemberState: table([]),
    playerUsernameState: table([]),
    playerState: table([]),
    buildingNicknameState: table([]),
  };
  const loadBindings = async () => ({
    DbConnection: {
      builder() {
        let uri = "";
        let database = "";
        let connected = () => {};
        let connectFailed = () => {};
        const connection = {
          db: emptyDb,
          subscriptionBuilder() {
            let applied = () => {};
            return {
              onApplied(callback) { applied = callback; return this; },
              onError() { return this; },
              subscribe() {
                queueMicrotask(applied);
                return { unsubscribe() {} };
              },
            };
          },
          disconnect() {},
        };
        return {
          withUri(value) { uri = value; return this; },
          withDatabaseName(value) { database = value; return this; },
          onConnect(callback) { connected = callback; return this; },
          onConnectError(callback) { connectFailed = callback; return this; },
          onDisconnect() { return this; },
          build() {
            builds += 1;
            connectionTargets.push({ uri, database });
            if (builds <= 3) {
              queueMicrotask(() => connectFailed({}, new Error(`failure-${builds}`)));
            } else {
              queueMicrotask(() => connected(connection, {}, "token"));
            }
            return connection;
          },
        };
      },
    },
  });
  const session = new RelayEmpireRegionSession({
    loadBindings,
    onSnapshot: () => {},
    refreshSource: async () => {
      sourceRefreshes += 1;
      return {
        uri: "wss://relay.example:5019",
        database: "relay-region-19-new",
        schemaFingerprint: "regional-v1",
      };
    },
    random: () => 0.5,
    scheduleRetry: (callback, delayMs) => {
      const retry = { callback, delayMs };
      retries.push(retry);
      return () => {};
    },
  });
  await session.start({
    uri: "wss://relay.example:4019",
    database: "relay-region-19",
    schemaFingerprint: "regional-v1",
    manifest: { schemas: { regional: { fingerprint: "regional-v1", bindingsGenerated: true } } },
    generation: 1,
    regionId: "19",
  });
  await new Promise((resolve) => setImmediate(resolve));

  for (let index = 0; index < 3; index += 1) {
    retries[index].callback();
    await new Promise((resolve) => setImmediate(resolve));
  }

  assert.deepEqual(retries.map((retry) => retry.delayMs), [1_000, 2_000, 4_000]);
  assert.equal(sourceRefreshes, 1);
  assert.deepEqual(connectionTargets.at(-1), {
    uri: "wss://relay.example:5019",
    database: "relay-region-19-new",
  });
  assert.equal(session.health().connected, true);
  assert.equal(session.health().reconnects, 3);

  await session.stop();
});

test("empire session reconnects when the base subscription fails", async () => {
  const retries = [];
  const baseErrors = [];
  let builds = 0;
  let disconnected = () => {};
  const emptyDb = {
    worldRegionState: table([{
      id: 0,
      regionIndex: 19,
      regionMinChunkX: 0,
      regionMinChunkZ: 0,
      regionWidthChunks: 80,
      regionHeightChunks: 80,
    }]),
    empireState: table([]),
    empirePlayerDataState: table([]),
    empireRankState: table([]),
    empireSettlementState: table([]),
    empireNodeState: table([]),
    empireNodeSiegeState: table([]),
    empireChunkState: table([]),
    claimState: table([]),
    claimMemberState: table([]),
    playerUsernameState: table([]),
    playerState: table([]),
    buildingNicknameState: table([]),
  };
  const connection = {
    db: emptyDb,
    subscriptionBuilder() {
      let applied = () => {};
      let failed = () => {};
      return {
        onApplied(callback) { applied = callback; return this; },
        onError(callback) { failed = callback; return this; },
        subscribe() {
          baseErrors.push(failed);
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
            builds += 1;
            queueMicrotask(() => connected(connection, {}, "token"));
            return connection;
          },
        };
      },
    },
  });
  const session = new RelayEmpireRegionSession({
    loadBindings,
    onSnapshot: () => {},
    random: () => 0.5,
    scheduleRetry: (callback, delayMs) => {
      const retry = { callback, delayMs };
      retries.push(retry);
      return () => {};
    },
  });
  await session.start({
    uri: "wss://relay.example:4019",
    database: "relay-region-19",
    schemaFingerprint: "regional-v1",
    manifest: { schemas: { regional: { fingerprint: "regional-v1", bindingsGenerated: true } } },
    generation: 1,
    regionId: "19",
  });
  await new Promise((resolve) => setImmediate(resolve));

  baseErrors[0]({}, new Error("base subscription reset"));
  assert.equal(session.health().connected, false);
  assert.match(session.health().lastError, /base subscription reset/);
  assert.equal(retries.length, 1);
  assert.equal(retries[0].delayMs, 1_000);

  retries[0].callback();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(builds, 2);
  assert.equal(session.health().connected, true);

  await session.stop();
});
