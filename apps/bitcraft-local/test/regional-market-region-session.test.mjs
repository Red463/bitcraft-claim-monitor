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

function fakeBindings({ includeStall = false, stallActive = true } = {}) {
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
    closedListingState: [{
      entityId: 600n,
      ownerEntityId: 700n,
      claimEntityId: 100n,
      itemStack: {
        itemId: 1,
        itemType: { tag: "Item", value: undefined },
        quantity: 124,
      },
      timestamp: { __timestamp_micros_since_unix_epoch__: 1785408180000000n },
    }],
    marketplaceState: [{
      buildingEntityId: 9001n,
      claimEntityId: 100n,
      coordinates: { x: 10, z: 20, dimension: 19n },
    }, {
      buildingEntityId: 9002n,
      claimEntityId: 101n,
      coordinates: { x: 40, z: 55, dimension: 19n },
    }],
    claimState: [
      { entityId: 100n, name: "Timbersteel Trade" },
      { entityId: 101n, name: "Other Market" },
    ],
    playerUsernameState: [
      { entityId: 701n, username: "Buyer One" },
      { entityId: 702n, username: "Buyer Two" },
      ...(includeStall ? [{ entityId: 703n, username: "Stall Keeper" }] : []),
    ],
    barterStallState: includeStall
      ? [{ entityId: 9007199254740993n, marketModeEnabled: stallActive }]
      : [],
    tradeOrderState: includeStall
      ? [{
          entityId: 9007199254740995n,
          shopEntityId: 9007199254740993n,
          remainingStock: 2147483647,
          offerItems: [{
            itemId: 44,
            quantity: 2,
            itemType: { tag: "Item", value: {} },
          }],
          offerCargoId: [43],
          requiredItems: [{
            itemId: 45,
            quantity: 900719925,
            itemType: { tag: "Cargo", value: {} },
          }],
          requiredCargoId: [46, 46],
          travelerTradeOrderId: null,
        }]
      : [],
    buildingState: includeStall
      ? [{
          entityId: 9007199254740993n,
          claimEntityId: 102n,
          constructedByPlayerEntityId: 703n,
          buildingDescriptionId: 55,
        }]
      : [],
    buildingNicknameState: includeStall
      ? [{ entityId: 9007199254740993n, nickname: "Exact Exchange" }]
      : [],
    locationState: includeStall
      ? [{ entityId: 9007199254740993n, x: -123, z: 456, dimension: 19n }]
      : [],
  };
  if (includeStall) rows.claimState.push({ entityId: 102n, name: "Barter Town" });
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
    "SELECT * FROM closed_listing_state",
    "SELECT * FROM barter_stall_state",
    "SELECT * FROM marketplace_state",
  ]);

  fake.state.subscriptions[0].onApplied({});
  assert.deepEqual(fake.state.subscriptions[1].queries, [
    "SELECT * FROM claim_state WHERE entity_id = 100 OR entity_id = 101",
    "SELECT * FROM player_username_state WHERE entity_id = 700 OR entity_id = 701 OR entity_id = 702",
  ]);
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].generation, 4);
  assert.equal(snapshots[0].data.orders[0].claimName, "");
  assert.equal(snapshots[0].data.orders[0].locationX, 10);
  assert.equal(snapshots[0].data.orders[0].locationZ, 20);
  assert.equal(snapshots[0].data.orders[0].dimension, "19");
  assert.deepEqual(snapshots[0].data.stalls, []);

  fake.state.subscriptions[1].onApplied({});
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(snapshots.length, 2);
  assert.deepEqual(snapshots[1].data.orders.map((order) => ({
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
  assert.equal(snapshots[1].generation, 5);
  assert.deepEqual(snapshots[1].data.closedListings, [{
    entityId: "600",
    claimEntityId: "100",
    claimName: "Timbersteel Trade",
    regionId: "19",
    ownerEntityId: "700",
    ownerUsername: "",
    itemId: "1",
    itemType: "item",
    quantity: "124",
    closureKind: "sale_proceeds",
    timestamp: "2026-07-30T10:43:00.000Z",
  }]);

  fake.rows.buyOrderState[0].quantity = 7;
  fake.state.callbacks.get("buyOrderState:update")({}, {}, {});
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    snapshots[2].data.orders.find((order) => order.entityId === "501").quantity,
    "7",
  );
  assert.equal(snapshots[2].data.orders[0].claimName, "Timbersteel Trade");
  assert.match(snapshots[2].warnings.join(" "), /enrichment is refreshing/i);
  assert.equal(snapshots[2].generation, 6);

  fake.state.subscriptions[2].onApplied({});
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    snapshots[3].data.orders.find((order) => order.entityId === "501").quantity,
    "7",
  );
  assert.equal(snapshots[3].data.orders[0].claimName, "Timbersteel Trade");
  assert.equal(snapshots[3].generation, 7);

  await session.stop();
  assert.equal(fake.state.subscriptions.every((request) => request.unsubscribed), true);
  assert.equal(fake.state.callbacks.size, 0);
  assert.equal(fake.state.disconnected, true);
});

test("regional market session publishes bounded non-traveller stall joins without a scheduled cache", async () => {
  assert.ok(sessionModule, "regional market session module must exist");
  const fake = fakeBindings({ includeStall: true });
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
    generation: 9,
    regionId: "19",
  });
  fake.state.onConnect(fake.connection);
  fake.state.subscriptions[0].onApplied({});
  assert.deepEqual(fake.state.subscriptions[1].queries, [
    "SELECT * FROM trade_order_state WHERE shop_entity_id = 9007199254740993",
    "SELECT * FROM building_state WHERE entity_id = 9007199254740993",
    "SELECT * FROM building_nickname_state WHERE entity_id = 9007199254740993",
    "SELECT * FROM location_state WHERE entity_id = 9007199254740993",
  ]);
  assert.equal(
    fake.state.subscriptions.length,
    2,
    "initial staged rows must not restart the detail subscription before it applies",
  );

  fake.state.subscriptions[1].onApplied({});
  assert.deepEqual(fake.state.subscriptions[2].queries, [
    "SELECT * FROM claim_state WHERE entity_id = 100 OR entity_id = 101 OR entity_id = 102",
    "SELECT * FROM player_username_state WHERE entity_id = 700 OR entity_id = 701 OR entity_id = 702 OR entity_id = 703",
  ]);
  assert.equal(snapshots.length, 1);

  fake.state.subscriptions[2].onApplied({});
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(snapshots.length, 2);
  assert.deepEqual(snapshots[1].data.stalls, [{
    entityId: "9007199254740993",
    regionId: "19",
    claimEntityId: "102",
    claimName: "Barter Town",
    ownerEntityId: "703",
    ownerName: "Stall Keeper",
    nickname: "Exact Exchange",
    marketModeEnabled: true,
    locationX: -123,
    locationZ: 456,
    locationDimension: "19",
    orders: [{
      entityId: "9007199254740995",
      remainingStock: "2147483647",
      offers: [
        { itemId: "44", itemType: "item", quantity: "2" },
        { itemId: "43", itemType: "cargo", quantity: "1" },
      ],
      requires: [
        { itemId: "45", itemType: "cargo", quantity: "900719925" },
        { itemId: "46", itemType: "cargo", quantity: "2" },
      ],
    }],
  }]);

  fake.rows.buyOrderState[0].quantity = 7;
  fake.state.callbacks.get("buyOrderState:update")({}, {}, {});
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(
    snapshots.at(-1).data.stalls.map((stall) => stall.entityId),
    ["9007199254740993"],
  );
  assert.match(snapshots.at(-1).warnings.join(" "), /enrichment is refreshing/i);
  await session.stop();
});

test("regional market session omits inactive barter stalls without delaying live orders", async () => {
  const fake = fakeBindings({ includeStall: true, stallActive: false });
  const snapshots = [];
  const session = new sessionModule.RelayRegionalMarketRegionSession({
    loadBindings: async () => fake.module,
    onSnapshot: (snapshot) => snapshots.push(snapshot),
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
  assert.equal(snapshots.length, 1);
  assert.deepEqual(snapshots[0].data.stalls, []);
  assert.deepEqual(fake.state.subscriptions[1].queries, [
    "SELECT * FROM claim_state WHERE entity_id = 100 OR entity_id = 101 OR entity_id = 102",
    "SELECT * FROM player_username_state WHERE entity_id = 700 OR entity_id = 701 OR entity_id = 702 OR entity_id = 703",
  ]);
  fake.state.subscriptions[1].onApplied({});
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(snapshots.at(-1).data.stalls, []);
  await session.stop();
});

test("regional market session defers a stall inserted during staged apply before publishing", async () => {
  assert.ok(sessionModule, "regional market session module must exist");
  const fake = fakeBindings({ includeStall: true });
  const snapshots = [];
  const session = new sessionModule.RelayRegionalMarketRegionSession({
    loadBindings: async () => fake.module,
    onSnapshot: (snapshot) => snapshots.push(snapshot),
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
  fake.rows.barterStallState.push({
    entityId: 9007199254740994n,
    marketModeEnabled: true,
  });
  fake.state.callbacks.get("barterStallState:insert")(
    {},
    fake.rows.barterStallState.at(-1),
  );

  fake.state.subscriptions[1].onApplied({});
  fake.state.subscriptions[2].onApplied({});
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(snapshots.length, 2);
  assert.deepEqual(snapshots.at(-1).data.stalls, []);
  assert.deepEqual(fake.state.subscriptions[3].queries, [
    "SELECT * FROM trade_order_state WHERE shop_entity_id = 9007199254740993 OR shop_entity_id = 9007199254740994",
    "SELECT * FROM building_state WHERE entity_id = 9007199254740993 OR entity_id = 9007199254740994",
    "SELECT * FROM building_nickname_state WHERE entity_id = 9007199254740993 OR entity_id = 9007199254740994",
    "SELECT * FROM location_state WHERE entity_id = 9007199254740993 OR entity_id = 9007199254740994",
  ]);
  fake.state.subscriptions[3].onApplied({});
  fake.state.subscriptions[4].onApplied({});
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(
    snapshots.at(-1).data.stalls.map((stall) => stall.entityId),
    ["9007199254740993", "9007199254740994"],
  );
  await session.stop();
});

test("regional market session redoes staged identities when a building changes during identity apply", async () => {
  assert.ok(sessionModule, "regional market session module must exist");
  const fake = fakeBindings({ includeStall: true });
  const snapshots = [];
  const session = new sessionModule.RelayRegionalMarketRegionSession({
    loadBindings: async () => fake.module,
    onSnapshot: (snapshot) => snapshots.push(snapshot),
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
  fake.state.subscriptions[1].onApplied({});
  fake.rows.buildingState[0].constructedByPlayerEntityId = 704n;
  fake.rows.playerUsernameState.push({ entityId: 704n, username: "New Keeper" });
  fake.state.callbacks.get("buildingState:update")(
    {},
    {},
    fake.rows.buildingState[0],
  );

  fake.state.subscriptions[2].onApplied({});
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(snapshots.length, 2);
  assert.deepEqual(snapshots.at(-1).data.stalls, []);
  assert.deepEqual(fake.state.subscriptions[3].queries, [
    "SELECT * FROM trade_order_state WHERE shop_entity_id = 9007199254740993",
    "SELECT * FROM building_state WHERE entity_id = 9007199254740993",
    "SELECT * FROM building_nickname_state WHERE entity_id = 9007199254740993",
    "SELECT * FROM location_state WHERE entity_id = 9007199254740993",
  ]);
  fake.state.subscriptions[3].onApplied({});
  assert.ok(
    fake.state.subscriptions[4].queries.includes(
      "SELECT * FROM player_username_state WHERE entity_id = 700 OR entity_id = 701 OR entity_id = 702 OR entity_id = 704",
    ),
  );
  fake.state.subscriptions[4].onApplied({});
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(snapshots.at(-1).data.stalls[0].ownerName, "New Keeper");
  await session.stop();
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

test("regional market session rejects closed evidence above its explicit row budget", async () => {
  const fake = fakeBindings();
  fake.rows.closedListingState.push({
    ...fake.rows.closedListingState[0],
    entityId: 601n,
  });
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
    maxClosedListings: 1,
  });
  fake.state.onConnect(fake.connection);
  fake.state.subscriptions[0].onApplied({});
  assert.equal(published, false);
  assert.match(session.health().lastError, /closed-listing budget 1 exceeded by 2/i);
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
  assert.equal(snapshots.length, 1);

  scheduled[0].callback();
  await Promise.resolve();
  assert.equal(fake.state.subscriptions.length, 3);
  fake.state.subscriptions[2].onApplied({});
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(snapshots.length, 2);
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
