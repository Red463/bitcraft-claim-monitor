import assert from "node:assert/strict";
import test from "node:test";

let sessionModule = null;
try {
  sessionModule = await import("../src/server/game-data/claimMarketRegionSession.ts");
} catch {
  // The first TDD run proves the typed claim-market session is absent.
}

function cachedTable(state, name, rows) {
  return {
    iter: () => rows[Symbol.iterator](),
    onInsert: (callback) => state.callbacks.set(`${name}:insert`, callback),
    onUpdate: (callback) => state.callbacks.set(`${name}:update`, callback),
    onDelete: (callback) => state.callbacks.set(`${name}:delete`, callback),
    removeOnInsert: () => state.callbacks.delete(`${name}:insert`),
    removeOnUpdate: () => state.callbacks.delete(`${name}:update`),
    removeOnDelete: () => state.callbacks.delete(`${name}:delete`),
  };
}

function fakeBindings() {
  const state = {
    onConnect: null,
    subscriptions: [],
    callbacks: new Map(),
    disconnected: false,
  };
  const rows = {
    sellOrderState: [{
      entityId: 500n,
      ownerEntityId: 700n,
      claimEntityId: 100n,
      itemId: 42,
      itemType: 0,
      priceThreshold: 30,
      quantity: 4,
      timestamp: { __timestamp_micros_since_unix_epoch__: 1785408000000000n },
      storedCoins: 0,
    }],
    buyOrderState: [{
      entityId: 501n,
      ownerEntityId: 701n,
      claimEntityId: 100n,
      itemId: 43,
      itemType: 1,
      priceThreshold: 25,
      quantity: 8,
      timestamp: { __timestamp_micros_since_unix_epoch__: 1785408060000000n },
      storedCoins: 200,
    }],
    marketplaceState: [{
      buildingEntityId: 900n,
      claimEntityId: 100n,
      coordinates: { x: 10, z: 20, dimension: 1 },
    }],
    closedListingState: [{
      entityId: 600n,
      ownerEntityId: 700n,
      claimEntityId: 100n,
      itemStack: {
        itemId: 1,
        itemType: { tag: "Item", value: undefined },
        quantity: 120,
        durability: null,
      },
      timestamp: { __timestamp_micros_since_unix_epoch__: 1785408120000000n },
    }],
    playerUsernameState: [
      { entityId: 700n, username: "Seller" },
      { entityId: 701n, username: "Buyer" },
    ],
  };
  const connection = {
    db: Object.fromEntries(
      Object.entries(rows).map(([name, values]) => [
        name,
        cachedTable(state, name, values),
      ]),
    ),
    subscriptionBuilder() {
      const request = { queries: null, onApplied: null, unsubscribed: false };
      const builder = {
        onApplied(callback) {
          request.onApplied = callback;
          return builder;
        },
        onError() {
          return builder;
        },
        subscribe(queries) {
          request.queries = queries;
          state.subscriptions.push(request);
          return { unsubscribe: () => { request.unsubscribed = true; } };
        },
      };
      return builder;
    },
    disconnect() {
      state.disconnected = true;
    },
  };
  const builder = {
    withUri() { return builder; },
    withDatabaseName() { return builder; },
    onConnect(callback) {
      state.onConnect = callback;
      return builder;
    },
    onConnectError() { return builder; },
    onDisconnect() { return builder; },
    build() { return connection; },
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

test("claim-market session stages claim orders and exact owner joins before publishing", async () => {
  assert.ok(sessionModule, "claim-market region session module must exist");
  const fake = fakeBindings();
  const snapshots = [];
  const session = new sessionModule.RelayClaimMarketRegionSession({
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
    claimId: "100",
  });
  fake.state.onConnect(fake.connection);
  assert.deepEqual(fake.state.subscriptions[0].queries, [
    "SELECT * FROM sell_order_state WHERE claim_entity_id = 100",
    "SELECT * FROM buy_order_state WHERE claim_entity_id = 100",
    "SELECT * FROM marketplace_state WHERE claim_entity_id = 100",
    "SELECT * FROM closed_listing_state WHERE claim_entity_id = 100",
  ]);

  fake.state.subscriptions[0].onApplied({});
  assert.deepEqual(fake.state.subscriptions[1].queries, [
    "SELECT * FROM player_username_state WHERE entity_id = 700 OR entity_id = 701",
  ]);
  assert.equal(snapshots.length, 0);

  fake.state.subscriptions[1].onApplied({});
  await Promise.resolve();
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].data.listings.length, 2);
  assert.deepEqual(snapshots[0].data.closedListings, [{
    entityId: "600",
    claimEntityId: "100",
    regionId: "19",
    ownerEntityId: "700",
    ownerUsername: "Seller",
    itemId: "1",
    itemType: "item",
    quantity: "120",
    closureKind: "sale_proceeds",
    timestamp: "2026-07-30T10:42:00.000Z",
  }]);
  assert.deepEqual(
    snapshots[0].data.listings.map(({ side, ownerUsername }) => [side, ownerUsername]),
    [["sell", "Seller"], ["buy", "Buyer"]],
  );
  assert.equal(snapshots[0].generation, 4);
  assert.equal(session.health().applied, true);

  fake.rows.sellOrderState[0].priceThreshold = 31;
  fake.state.callbacks.get("sellOrderState:update")({}, {}, {});
  await Promise.resolve();
  assert.equal(fake.state.subscriptions.length, 3);
  fake.state.subscriptions[2].onApplied({});
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(snapshots[1].data.listings[0].price, "31");
  assert.equal(snapshots[1].generation, 5);

  await session.stop();
  assert.equal(fake.state.subscriptions.every((request) => request.unsubscribed), true);
  assert.equal(fake.state.callbacks.size, 0);
  assert.equal(fake.state.disconnected, true);
});

test("claim-market session rejects schema mismatch before opening a connection", async () => {
  assert.ok(sessionModule, "claim-market region session module must exist");
  let loaded = false;
  const session = new sessionModule.RelayClaimMarketRegionSession({
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
    claimId: "100",
  }), /schema fingerprint mismatch/i);
  assert.equal(loaded, false);
});
