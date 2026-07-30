import assert from "node:assert/strict";
import test from "node:test";

let sessionModule = null;
try {
  sessionModule = await import("../src/server/game-data/regionalMarketRegionSession.ts");
} catch {
  // The first TDD run proves the regional market session is absent.
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
    onConnectError: null,
    onDisconnect: null,
    subscriptions: [],
    callbacks: new Map(),
    disconnected: false,
    buildCount: 0,
  };
  const rows = {
    sellOrderState: [{
      entityId: 500n,
      ownerEntityId: 700n,
      claimEntityId: 100n,
      itemId: 43,
      itemType: 1,
      priceThreshold: 31,
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
    }, {
      entityId: 502n,
      ownerEntityId: 702n,
      claimEntityId: 101n,
      itemId: 44,
      itemType: 0,
      priceThreshold: 12,
      quantity: 3,
      timestamp: { __timestamp_micros_since_unix_epoch__: 1785408120000000n },
      storedCoins: 36,
    }],
    claimState: [
      { entityId: 100n, name: "Timbersteel Trade" },
      { entityId: 101n, name: "Other Market" },
    ],
    playerUsernameState: [
      { entityId: 701n, username: "Buyer One" },
      { entityId: 702n, username: "Buyer Two" },
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
      const request = { queries: null, onApplied: null, onError: null, unsubscribed: false };
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
    onConnectError(callback) {
      state.onConnectError = callback;
      return builder;
    },
    onDisconnect(callback) {
      state.onDisconnect = callback;
      return builder;
    },
    build() {
      state.buildCount += 1;
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

test("regional market session publishes all buy and sell orders after bounded claim and owner joins", async () => {
  assert.ok(sessionModule, "regional market session module must exist");
  const fake = fakeBindings();
  const snapshots = [];
  const session = new sessionModule.RelayRegionalMarketRegionSession({
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
  });
  fake.state.onConnect(fake.connection);
  assert.deepEqual(fake.state.subscriptions[0].queries, [
    "SELECT * FROM buy_order_state",
    "SELECT * FROM sell_order_state",
  ]);

  fake.state.subscriptions[0].onApplied({});
  assert.deepEqual(fake.state.subscriptions[1].queries, [
    "SELECT * FROM claim_state WHERE entity_id = 100 OR entity_id = 101",
    "SELECT * FROM player_username_state WHERE entity_id = 700 OR entity_id = 701 OR entity_id = 702",
  ]);
  assert.equal(snapshots.length, 0);

  fake.state.subscriptions[1].onApplied({});
  await Promise.resolve();
  assert.equal(snapshots.length, 1);
  assert.deepEqual(snapshots[0].data.orders.map((order) => ({
    entityId: order.entityId,
    side: order.side,
    claimName: order.claimName,
    ownerUsername: order.ownerUsername,
    itemType: order.itemType,
  })), [{
    entityId: "500",
    side: "sell",
    claimName: "Timbersteel Trade",
    ownerUsername: "",
    itemType: "cargo",
  }, {
    entityId: "501",
    side: "buy",
    claimName: "Timbersteel Trade",
    ownerUsername: "Buyer One",
    itemType: "cargo",
  }, {
    entityId: "502",
    side: "buy",
    claimName: "Other Market",
    ownerUsername: "Buyer Two",
    itemType: "item",
  }]);
  assert.equal(snapshots[0].generation, 4);

  fake.rows.buyOrderState[0].quantity = 7;
  fake.state.callbacks.get("buyOrderState:update")({}, {}, {});
  await Promise.resolve();
  fake.state.subscriptions[2].onApplied({});
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    snapshots[1].data.orders.find((order) => order.entityId === "501").quantity,
    "7",
  );
  assert.equal(snapshots[1].generation, 5);

  await session.stop();
  assert.equal(fake.state.subscriptions.every((request) => request.unsubscribed), true);
  assert.equal(fake.state.callbacks.size, 0);
  assert.equal(fake.state.disconnected, true);
});

test("regional market session rejects an order set above its explicit row budget", async () => {
  assert.ok(sessionModule, "regional market session module must exist");
  const fake = fakeBindings();
  let published = false;
  const session = new sessionModule.RelayRegionalMarketRegionSession({
    loadBindings: async () => fake.module,
    onSnapshot: () => { published = true; },
  });
  await session.start({
    uri: "wss://relay.example:4019",
    database: "relay-region-19",
    schemaFingerprint: "regional-v1",
    manifest,
    generation: 1,
    regionId: "19",
    maxOrders: 2,
  });
  fake.state.onConnect(fake.connection);
  fake.state.subscriptions[0].onApplied({});
  assert.equal(published, false);
  assert.match(session.health().lastError, /order budget 2 exceeded by 3/i);
  await session.stop();
});

test("regional market session reconnects with bounded backoff after disconnect", async () => {
  assert.ok(sessionModule, "regional market session module must exist");
  const fake = fakeBindings();
  const scheduled = [];
  const session = new sessionModule.RelayRegionalMarketRegionSession({
    loadBindings: async () => fake.module,
    onSnapshot: () => {},
    random: () => 0.5,
    scheduleRetry: (callback, delayMs) => {
      const entry = { callback, delayMs, cancelled: false };
      scheduled.push(entry);
      return () => { entry.cancelled = true; };
    },
  });
  await session.start({
    uri: "wss://relay.example:4019",
    database: "relay-region-19",
    schemaFingerprint: "regional-v1",
    manifest,
    generation: 1,
    regionId: "19",
  });
  fake.state.onConnect(fake.connection);
  assert.equal(session.health().connected, true);
  fake.state.onDisconnect({}, new Error("socket lost"));
  assert.equal(session.health().connected, false);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].delayMs, 1000);

  scheduled[0].callback();
  await Promise.resolve();
  assert.equal(fake.state.buildCount, 2);
  fake.state.onConnect(fake.connection);
  assert.equal(session.health().connected, true);
  await session.stop();
});

test("regional market session retries a failed detail subscription and publishes last-good-safe recovery", async () => {
  assert.ok(sessionModule, "regional market session module must exist");
  const fake = fakeBindings();
  const scheduled = [];
  const snapshots = [];
  const session = new sessionModule.RelayRegionalMarketRegionSession({
    loadBindings: async () => fake.module,
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    random: () => 0.5,
    scheduleRetry: (callback, delayMs) => {
      const entry = { callback, delayMs, cancelled: false };
      scheduled.push(entry);
      return () => { entry.cancelled = true; };
    },
  });
  await session.start({
    uri: "wss://relay.example:4019",
    database: "relay-region-19",
    schemaFingerprint: "regional-v1",
    manifest,
    generation: 1,
    regionId: "19",
  });
  fake.state.onConnect(fake.connection);
  fake.state.subscriptions[0].onApplied({});
  fake.state.subscriptions[1].onError({}, new Error("detail subscription reset"));
  assert.match(session.health().lastError, /detail subscription reset/);
  assert.equal(fake.state.subscriptions[1].unsubscribed, true);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].delayMs, 1000);
  assert.equal(snapshots.length, 0);

  scheduled[0].callback();
  await Promise.resolve();
  assert.equal(fake.state.subscriptions.length, 3);
  fake.state.subscriptions[2].onApplied({});
  await Promise.resolve();
  assert.equal(snapshots.length, 1);
  assert.equal(session.health().lastError, null);
  await session.stop();
});

test("regional market session reconnects when the base subscription fails", async () => {
  assert.ok(sessionModule, "regional market session module must exist");
  const fake = fakeBindings();
  const scheduled = [];
  const session = new sessionModule.RelayRegionalMarketRegionSession({
    loadBindings: async () => fake.module,
    onSnapshot: () => {},
    random: () => 0.5,
    scheduleRetry: (callback, delayMs) => {
      const entry = { callback, delayMs, cancelled: false };
      scheduled.push(entry);
      return () => { entry.cancelled = true; };
    },
  });
  await session.start({
    uri: "wss://relay.example:4019",
    database: "relay-region-19",
    schemaFingerprint: "regional-v1",
    manifest,
    generation: 1,
    regionId: "19",
  });
  fake.state.onConnect(fake.connection);
  fake.state.subscriptions[0].onError({}, new Error("base subscription reset"));
  assert.equal(fake.state.subscriptions[0].unsubscribed, true);
  assert.equal(session.health().connected, false);
  assert.match(session.health().lastError, /base subscription reset/);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].delayMs, 1000);

  scheduled[0].callback();
  await Promise.resolve();
  assert.equal(fake.state.buildCount, 2);
  fake.state.onConnect(fake.connection);
  assert.equal(session.health().connected, true);
  await session.stop();
});
