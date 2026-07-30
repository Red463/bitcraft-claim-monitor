import assert from "node:assert/strict";
import test from "node:test";

let sessionModule = null;
try {
  sessionModule = await import("../src/server/game-data/publicCraftRegionSession.ts");
} catch {
  // The first TDD run proves the typed regional public-craft session is absent.
}

function fakeBindings() {
  const state = {
    connectConfig: {},
    onConnect: null,
    subscriptions: [],
    callbacks: new Map(),
    disconnected: false,
  };
  const rows = {
    publicProgressiveActionState: [{
      entityId: 500n,
      buildingEntityId: 600n,
      ownerEntityId: 700n,
    }],
    progressiveActionState: [{
      entityId: 500n,
      buildingEntityId: 600n,
      progress: 10,
      recipeId: 800,
      craftCount: 2,
      ownerEntityId: 700n,
      preparation: false,
    }],
    buildingState: [{
      entityId: 600n,
      claimEntityId: 900n,
      directionIndex: 1,
      buildingDescriptionId: 1000,
      constructedByPlayerEntityId: 700n,
    }],
    buildingNicknameState: [{ entityId: 600n, nickname: "Forge" }],
    claimState: [{
      entityId: 900n,
      ownerPlayerEntityId: 700n,
      ownerBuildingEntityId: 901n,
      name: "Test Claim",
      neutral: false,
    }],
    playerUsernameState: [{ entityId: 700n, username: "Ada" }],
    locationState: [
      { entityId: 600n, chunkIndex: 1n, x: 20, z: 30, dimension: 1 },
      { entityId: 901n, chunkIndex: 1n, x: 10, z: 15, dimension: 1 },
    ],
  };
  const db = {};
  for (const [name, tableRows] of Object.entries(rows)) {
    db[name] = {
      iter: () => tableRows[Symbol.iterator](),
      onInsert: (callback) => state.callbacks.set(`${name}:insert`, callback),
      onUpdate: (callback) => state.callbacks.set(`${name}:update`, callback),
      onDelete: (callback) => state.callbacks.set(`${name}:delete`, callback),
      removeOnInsert: () => state.callbacks.delete(`${name}:insert`),
      removeOnUpdate: () => state.callbacks.delete(`${name}:update`),
      removeOnDelete: () => state.callbacks.delete(`${name}:delete`),
    };
  }
  const connection = {
    db,
    subscriptionBuilder() {
      const request = {
        queries: null,
        onApplied: null,
        onError: null,
        unsubscribed: false,
      };
      const builder = {
        onApplied(callback) {
          request.onApplied = callback;
          return builder;
        },
        onError(callback) {
          request.onError = callback;
          return builder;
        },
        subscribe(queries) {
          request.queries = queries;
          state.subscriptions.push(request);
          return {
            unsubscribe() {
              request.unsubscribed = true;
            },
          };
        },
      };
      return builder;
    },
    disconnect() {
      state.disconnected = true;
    },
  };
  const builder = {
    withUri(value) {
      state.connectConfig.uri = value;
      return builder;
    },
    withDatabaseName(value) {
      state.connectConfig.database = value;
      return builder;
    },
    onConnect(callback) {
      state.onConnect = callback;
      return builder;
    },
    onConnectError() {
      return builder;
    },
    onDisconnect() {
      return builder;
    },
    build() {
      return connection;
    },
  };
  return {
    module: { DbConnection: { builder: () => builder } },
    connection,
    rows,
    state,
  };
}

const manifest = {
  schemas: {
    regional: { fingerprint: "regional-v1", bindingsGenerated: true },
  },
};

test("public craft equality queries are deduplicated, sorted, and chunked", () => {
  assert.ok(sessionModule, "public craft region session module must exist");
  assert.deepEqual(
    sessionModule.equalitySubscriptionQueries(
      "progressive_action_state",
      "entity_id",
      ["12", "2", "12", "9"],
      2,
    ),
    [
      "SELECT * FROM progressive_action_state WHERE entity_id = 2 OR entity_id = 9",
      "SELECT * FROM progressive_action_state WHERE entity_id = 12",
    ],
  );
  assert.throws(
    () => sessionModule.equalitySubscriptionQueries("location_state", "entity_id", ["1 OR 1=1"], 10),
    /decimal integer/i,
  );
});

test("typed public craft session stages bounded joins before publishing a snapshot", async () => {
  assert.ok(sessionModule, "public craft region session module must exist");
  const fake = fakeBindings();
  const snapshots = [];
  const session = new sessionModule.RelayPublicCraftRegionSession({
    loadBindings: async () => fake.module,
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    now: () => new Date("2026-07-30T12:00:00.000Z"),
  });

  await session.start({
    uri: "wss://relay.example:4019",
    database: "relay-region-19",
    schemaFingerprint: "regional-v1",
    manifest,
    generation: 4,
    regionId: "19",
    maxPublicRows: 1000,
    maxIdsPerQuery: 100,
    maxApplyRows: 5000,
  });
  fake.state.onConnect(fake.connection);
  assert.deepEqual(fake.state.subscriptions[0].queries, [
    "SELECT * FROM public_progressive_action_state",
  ]);

  fake.state.subscriptions[0].onApplied({});
  assert.deepEqual(fake.state.subscriptions[1].queries, [
    "SELECT * FROM progressive_action_state WHERE entity_id = 500",
    "SELECT * FROM building_state WHERE entity_id = 600",
    "SELECT * FROM building_nickname_state WHERE entity_id = 600",
    "SELECT * FROM player_username_state WHERE entity_id = 700",
  ]);

  fake.state.subscriptions[1].onApplied({});
  assert.deepEqual(fake.state.subscriptions[2].queries, [
    "SELECT * FROM claim_state WHERE entity_id = 900",
  ]);

  fake.state.subscriptions[2].onApplied({});
  assert.deepEqual(fake.state.subscriptions[3].queries, [
    "SELECT * FROM location_state WHERE entity_id = 600 OR entity_id = 901",
  ]);

  fake.state.subscriptions[3].onApplied({});
  await Promise.resolve();
  assert.equal(snapshots.length, 1);
  assert.deepEqual(snapshots[0], {
    data: {
      craftResults: [{
        entityId: "500",
        buildingEntityId: "600",
        buildingDescriptionId: "1000",
        buildingNickname: "Forge",
        buildingLocationX: 20,
        buildingLocationZ: 30,
        claimEntityId: "900",
        claimName: "Test Claim",
        claimLocationX: 10,
        claimLocationZ: 15,
        claimDimension: "1",
        ownerEntityId: "700",
        ownerUsername: "Ada",
        recipeId: "800",
        progress: "10",
        craftCount: "2",
        preparation: false,
        completed: false,
        isPublic: true,
        regionId: "19",
      }],
    },
    warnings: [],
    database: "relay-region-19",
    regionId: "19",
    schemaFingerprint: "regional-v1",
    generation: 4,
    receivedAt: "2026-07-30T12:00:00.000Z",
  });

  fake.rows.progressiveActionState[0].progress = 11;
  fake.state.callbacks.get("progressiveActionState:update")({}, {}, {});
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(
    snapshots.map((snapshot) => [snapshot.generation, snapshot.data.craftResults[0].progress]),
    [[4, "10"], [5, "11"]],
  );

  fake.rows.progressiveActionState[0].buildingEntityId = 601n;
  fake.state.callbacks.get("progressiveActionState:update")({}, {}, {});
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(snapshots.length, 2, "a mixed marker/detail generation must preserve last-good");
  assert.match(session.health().lastError, /join generation is incomplete/i);

  await session.stop();
  assert.equal(fake.state.subscriptions.every((request) => request.unsubscribed), true);
  assert.equal(fake.state.disconnected, true);
  assert.equal(fake.state.callbacks.size, 0);
});

test("typed public craft session stops enrichment when the public-row budget is exceeded", async () => {
  assert.ok(sessionModule, "public craft region session module must exist");
  const fake = fakeBindings();
  fake.rows.publicProgressiveActionState.push({
    entityId: 501n,
    buildingEntityId: 601n,
    ownerEntityId: 701n,
  });
  const session = new sessionModule.RelayPublicCraftRegionSession({
    loadBindings: async () => fake.module,
    onSnapshot: () => assert.fail("over-budget public rows must not publish"),
  });
  await session.start({
    uri: "wss://relay.example:4019",
    database: "relay-region-19",
    schemaFingerprint: "regional-v1",
    manifest,
    generation: 1,
    regionId: "19",
    maxPublicRows: 1,
  });
  fake.state.onConnect(fake.connection);
  fake.state.subscriptions[0].onApplied({});

  assert.equal(fake.state.subscriptions.length, 1);
  assert.match(session.health().lastError, /public row budget.*1/i);
  assert.equal(session.health().applied, false);
  assert.equal(
    typeof fake.state.callbacks.get("publicProgressiveActionState:update"),
    "function",
    "the public marker listener must remain able to recover when the row count drops",
  );
  fake.rows.publicProgressiveActionState.pop();
  fake.state.callbacks.get("publicProgressiveActionState:update")({}, {}, {});
  await Promise.resolve();
  assert.equal(fake.state.subscriptions.length, 2);
  await session.stop();
});

test("typed public craft session rejects a schema mismatch before opening a connection", async () => {
  assert.ok(sessionModule, "public craft region session module must exist");
  let loaded = false;
  const session = new sessionModule.RelayPublicCraftRegionSession({
    loadBindings: async () => {
      loaded = true;
      return fakeBindings().module;
    },
    onSnapshot: () => assert.fail("schema mismatch must not publish"),
  });
  await assert.rejects(session.start({
    uri: "wss://relay.example:4019",
    database: "relay-region-19",
    schemaFingerprint: "unexpected",
    manifest,
    generation: 1,
    regionId: "19",
  }), /schema fingerprint mismatch/i);
  assert.equal(loaded, false);
});
