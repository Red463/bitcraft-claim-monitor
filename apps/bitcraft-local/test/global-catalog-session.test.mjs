import assert from "node:assert/strict";
import test from "node:test";

let sessionModule = null;
try {
  sessionModule = await import("../src/server/game-data/globalCatalogSession.ts");
} catch {
  // The first TDD run proves the typed global session is absent.
}

function fakeBindings() {
  const state = {
    connectConfig: {},
    queries: null,
    onApplied: null,
    onSubscriptionError: null,
    subscriptions: [],
    disconnected: false,
    unsubscribed: false,
    tableCallbacks: new Map(),
    subscriptionBuilderError: null,
    subscribeError: null,
  };
  const cachedTable = (rows) => {
    const callbacks = {
      insert: new Set(),
      update: new Set(),
      delete: new Set(),
    };
    const callbackHistory = {
      insert: [],
      update: [],
      delete: [],
    };
    return {
    rows,
    iter: () => rows[Symbol.iterator](),
    onInsert: (callback) => {
      callbacks.insert.add(callback);
      callbackHistory.insert.push(callback);
      state.tableCallbacks.set("insert", callback);
    },
    onUpdate: (callback) => {
      callbacks.update.add(callback);
      callbackHistory.update.push(callback);
      state.tableCallbacks.set("update", callback);
    },
    onDelete: (callback) => {
      callbacks.delete.add(callback);
      callbackHistory.delete.push(callback);
      state.tableCallbacks.set("delete", callback);
    },
    removeOnInsert: (callback) => {
      callbacks.insert.delete(callback);
      state.tableCallbacks.delete("insert");
    },
    removeOnUpdate: (callback) => {
      callbacks.update.delete(callback);
      state.tableCallbacks.delete("update");
    },
    removeOnDelete: (callback) => {
      callbacks.delete.delete(callback);
      state.tableCallbacks.delete("delete");
    },
    triggerInsert: () => {
      for (const callback of callbacks.insert) callback({}, {});
    },
    triggerUpdate: () => {
      for (const callback of callbacks.update) callback({}, {}, {});
    },
    triggerDelete: () => {
      for (const callback of callbacks.delete) callback({}, {});
    },
    callbackHistory,
    };
  };
  const connection = {
    db: {
      itemDesc: cachedTable([{
          id: 42,
          name: "Timber",
          tag: "Wood",
          tier: 2,
          rarity: { tag: "Common" },
          iconAssetName: "Items/Timber",
          itemListId: 17,
        }]),
      cargoDesc: cachedTable([{
          id: 42,
          name: "Timber Crate",
          tag: "Packaged",
          tier: 2,
          rarity: { tag: "Common" },
          iconAssetName: "GeneratedIcons/Cargo/Timber Crate",
          itemListId: 0,
        }]),
      craftingRecipeDesc: cachedTable([]),
      extractionRecipeDesc: cachedTable([{
        id: 88,
        resourceId: 9,
        cargoId: 0,
        extractedItemStacks: [{
          itemStack: {
            itemId: 42,
            itemType: { tag: "Item" },
            quantity: 2,
            durability: null,
          },
          probability: 0.5,
        }],
        consumedItemStacks: [],
        timeRequirement: 1,
        staminaRequirement: 2,
        toolDurabilityLost: 0,
        toolRequirements: [],
        allowUseHands: true,
        levelRequirements: [],
        experiencePerProgress: [],
        verbPhrase: "Chop",
      }]),
      itemListDesc: cachedTable([{
        id: 17,
        name: "Timber yield",
        possibilities: [{
          probability: 3,
          items: [{
            itemId: 42,
            itemType: { tag: "Item" },
            quantity: 2,
            durability: null,
          }],
        }],
      }]),
      constructionRecipeDesc: cachedTable([]),
      buildingDesc: cachedTable([]),
      buildingTypeDesc: cachedTable([{
        id: 6,
        name: "Carpentry Station",
        category: { tag: "Crafting" },
        actions: ["Craft"],
      }]),
      skillDesc: cachedTable([]),
      resourceDesc: cachedTable([]),
      enemyDesc: cachedTable([{
        enemyType: 42,
        name: "Sagi Bird",
        description: "A huntable bird.",
        maxHealth: 250,
        minDamage: 3,
        maxDamage: 7,
        attackLevel: 2,
        defenseLevel: 1,
        iconAddress: "Enemies/SagiBird",
        tier: 2,
        tag: "Animal",
        rarity: { tag: "Common" },
        huntable: true,
      }]),
      equipmentDesc: cachedTable([]),
      toolDesc: cachedTable([{
        id: 1,
        itemId: 42,
        toolType: 4,
        level: 3,
        power: 25,
      }]),
      buffDesc: cachedTable([]),
      claimTechDesc: cachedTable([]),
      empireFoundryState: cachedTable([{
        entityId: 7001n,
        empireEntityId: 501n,
        hexiteCapsules: 12,
        queued: 2,
        started: { microsSinceUnixEpoch: 1780595757807377n },
      }]),
      regionPopulationInfo: cachedTable([{
        regionId: 19,
        signedInPlayers: 42,
        playersInQueue: 3,
      }]),
      regionControlInfo: cachedTable([{
        regionId: 19,
        initialized: true,
        allowPlayers: true,
        allowPlayerSpawns: false,
      }]),
      worldRegionNameState: cachedTable([{
        id: 19,
        playerFacingName: "Zephra",
        moduleNamePrefix: "bitcraft-live-",
      }]),
      empireNotificationDesc: cachedTable([
        { id: 1, notificationType: { tag: "SuccessfulSiege" } },
        { id: 2, notificationType: { tag: "FailedDefense" } },
      ]),
      empireNotificationState: cachedTable([
        {
          entityId: 1001n,
          empireEntityId: 3n,
          notificationType: { tag: "SuccessfulSiege" },
          timestamp: 1_767_225_600,
          textReplacement: ["Northwatch", "19:4:5"],
        },
        {
          entityId: 1002n,
          empireEntityId: 20n,
          notificationType: { tag: "FailedDefense" },
          timestamp: 1_767_225_600,
          textReplacement: ["Northwatch", "19:4:5"],
        },
        {
          entityId: 1003n,
          empireEntityId: 30n,
          notificationType: { tag: "SuccessfulSiege" },
          timestamp: 1_767_312_000,
          textReplacement: ["Southwatch", "19:6:7"],
        },
        {
          entityId: 1004n,
          empireEntityId: 40n,
          notificationType: { tag: "FailedDefense" },
          timestamp: 1_767_312_000,
          textReplacement: ["Southwatch", "19:6:7"],
        },
      ]),
    },
    subscriptionBuilder() {
      if (state.subscriptionBuilderError) {
        const error = state.subscriptionBuilderError;
        state.subscriptionBuilderError = null;
        throw error;
      }
      const subscription = {
        queries: null,
        onApplied: null,
        onError: null,
        unsubscribed: false,
      };
      const subscriptionBuilder = {
        onApplied(callback) {
          subscription.onApplied = callback;
          return subscriptionBuilder;
        },
        onError(callback) {
          subscription.onError = callback;
          return subscriptionBuilder;
        },
        subscribe(queries) {
          if (state.subscribeError) {
            const error = state.subscribeError;
            state.subscribeError = null;
            throw error;
          }
          subscription.queries = queries;
          state.subscriptions.push(subscription);
          if (state.subscriptions.length === 1) {
            state.onApplied = subscription.onApplied;
            state.onSubscriptionError = subscription.onError;
          }
          state.queries = queries;
          return {
            unsubscribe: () => {
              subscription.unsubscribed = true;
              state.unsubscribed = true;
            },
          };
        },
      };
      return subscriptionBuilder;
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
    onConnectError(callback) {
      state.onConnectError = callback;
      return builder;
    },
    onDisconnect(callback) {
      state.onDisconnect = callback;
      return builder;
    },
    build() {
      return connection;
    },
  };
  return {
    module: { DbConnection: { builder: () => builder } },
    connection,
    state,
  };
}

const readyManifest = {
  schemas: {
    global: { fingerprint: "global-v1", bindingsGenerated: true },
  },
};

test("typed global catalog session subscribes narrowly and emits normalized item/cargo snapshot", async () => {
  assert.ok(sessionModule, "global catalog session module must exist");
  const fake = fakeBindings();
  const snapshots = [];
  const session = new sessionModule.RelayGlobalCatalogSession({
    loadBindings: async () => fake.module,
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    now: () => new Date("2026-07-29T20:15:00.000Z"),
  });

  await session.start({
    uri: "wss://relay.bitcraftsync.app:3000",
    database: "relay-mirror-bc-global",
    schemaFingerprint: "global-v1",
    manifest: readyManifest,
    generation: 9,
  });
  assert.equal(session.health().state, "connecting");
  fake.state.onConnect(fake.connection, {}, "secret-token");
  assert.equal(session.health().state, "connected");

  assert.deepEqual(fake.state.connectConfig, {
    uri: "wss://relay.bitcraftsync.app:3000",
    database: "relay-mirror-bc-global",
  });
  assert.deepEqual(fake.state.queries, [
    "SELECT * FROM item_desc",
    "SELECT * FROM cargo_desc",
    "SELECT * FROM crafting_recipe_desc",
    "SELECT * FROM extraction_recipe_desc",
    "SELECT * FROM item_list_desc",
    "SELECT * FROM construction_recipe_desc",
    "SELECT * FROM building_desc",
    "SELECT * FROM building_type_desc",
    "SELECT * FROM skill_desc",
    "SELECT * FROM resource_desc",
    "SELECT * FROM enemy_desc",
    "SELECT * FROM equipment_desc",
    "SELECT * FROM tool_desc",
    "SELECT * FROM buff_desc",
    "SELECT * FROM claim_tech_desc",
    "SELECT * FROM empire_foundry_state",
    "SELECT * FROM region_population_info",
    "SELECT * FROM region_control_info",
    "SELECT * FROM world_region_name_state",
    "SELECT * FROM empire_notification_desc",
  ]);

  fake.state.onApplied({});
  await Promise.resolve();
  assert.deepEqual(snapshots, [{
    entities: [
      {
        kind: "item",
        id: "42",
        name: "Timber",
        tag: "Wood",
        tier: 2,
        rarity: "Common",
        iconAssetName: "Items/Timber",
        itemListId: "17",
      },
      {
        kind: "cargo",
        id: "42",
        name: "Timber Crate",
        tag: "Packaged",
        tier: 2,
        rarity: "Common",
        iconAssetName: "GeneratedIcons/Cargo/Timber Crate",
      },
    ],
    descriptions: {
      crafting_recipe: [],
      extraction_recipe: [{
        kind: "extraction_recipe",
        id: "88",
        resourceId: "9",
        cargoId: null,
        name: "Chop",
        timeRequirement: 1,
        staminaRequirement: 2,
        allowUseHands: true,
        levelRequirements: [],
        toolRequirements: [],
        experiencePerProgress: [],
        inputs: [],
        outputs: [{
          kind: "item",
          id: "42",
          quantity: "2",
          probability: 0.5,
        }],
      }],
      item_list: [{
        kind: "item_list",
        id: "17",
        name: "Timber yield",
        possibilities: [{
          probability: 3,
          items: [{
            kind: "item",
            id: "42",
            quantity: "2",
          }],
        }],
      }],
      construction_recipe: [],
      building: [],
      building_type: [{
        kind: "building_type",
        id: "6",
        name: "Carpentry Station",
        category: "Crafting",
        actions: ["Craft"],
      }],
      skill: [],
      resource: [],
      enemy: [{
        kind: "enemy",
        id: "42",
        enemyType: "42",
        name: "Sagi Bird",
        description: "A huntable bird.",
        maxHealth: 250,
        minDamage: 3,
        maxDamage: 7,
        attackLevel: 2,
        defenseLevel: 1,
        iconAssetName: "Enemies/SagiBird",
        tier: 2,
        tag: "Animal",
        rarity: "Common",
        huntable: true,
      }],
      equipment: [],
      tool: [{
        kind: "tool",
        id: "1",
        itemId: "42",
        toolType: 4,
        level: 3,
        power: 25,
      }],
      buff: [],
      claim_tech: [],
    },
    regions: [{
      regionId: "19",
      regionName: "Zephra",
      active: true,
      syncing: false,
      allowPlayerSpawns: false,
      signedInPlayers: 42,
      playersInQueue: 3,
    }],
    foundries: [{
      entityId: "7001",
      empireEntityId: "501",
      hexiteCapsules: "12",
      queued: "2",
      startedAt: "2026-06-04T17:55:57.807Z",
    }],
    foundryWarnings: [],
    siegeNotifications: {
      notifications: [],
      outcomes: [],
      warnings: [],
    },
    changed: ["catalogs", "region", "empire-foundries"],
    database: "relay-mirror-bc-global",
    schemaFingerprint: "global-v1",
    generation: 9,
    receivedAt: "2026-07-29T20:15:00.000Z",
  }]);
  assert.equal(session.health().applied, true);

  fake.connection.db.regionPopulationInfo.triggerUpdate();
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(snapshots.length, 2);
  assert.equal(snapshots[1].generation, 10);
  assert.deepEqual(snapshots[1].changed, ["region"]);
  assert.deepEqual(snapshots[1].entities, []);
  assert.deepEqual(snapshots[1].descriptions, {});
  assert.deepEqual(snapshots[1].foundries, []);
  assert.deepEqual(snapshots[1].siegeNotifications, {
    notifications: [],
    outcomes: [],
    warnings: [],
  });

  fake.connection.db.empireFoundryState.triggerUpdate();
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(snapshots.length, 3);
  assert.deepEqual(snapshots[2].changed, ["empire-foundries"]);
  assert.equal(snapshots[2].foundries[0].hexiteCapsules, "12");

  fake.state.onDisconnect({}, undefined);
  assert.equal(session.health().state, "disconnected");
  await session.stop();
  assert.equal(session.health().state, "stopped");
  assert.equal(fake.state.unsubscribed, true);
  assert.equal(fake.state.disconnected, true);
  assert.equal(fake.state.tableCallbacks.size, 0);
});

test("typed global catalog session replaces exact Empire notification scopes without publishing stale callbacks", async () => {
  assert.ok(sessionModule, "global catalog session module must exist");
  const fake = fakeBindings();
  const snapshots = [];
  let currentTime = "2026-08-01T12:00:00.000Z";
  const session = new sessionModule.RelayGlobalCatalogSession({
    loadBindings: async () => fake.module,
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    now: () => new Date(currentTime),
  });
  await session.start({
    uri: "wss://relay.example:3000",
    database: "relay-global",
    schemaFingerprint: "global-v1",
    manifest: readyManifest,
    generation: 30,
  });
  fake.state.onConnect(fake.connection);
  fake.state.subscriptions[0].onApplied({});
  await new Promise((resolve) => setImmediate(resolve));
  snapshots.length = 0;

  await assert.rejects(
    session.setEmpireNotificationScope(["3 OR 1 = 1"]),
    /decimal/i,
  );
  fake.connection.db.empireNotificationState.rows.push({
    entityId: 9999n,
    empireEntityId: "malformed",
    notificationType: { tag: "SuccessfulSiege" },
    timestamp: 1_767_225_600,
    textReplacement: ["Must be filtered", "19:0:0"],
  });
  const firstApply = session.setEmpireNotificationScope(["20", "3", "20"]);
  assert.deepEqual(fake.state.subscriptions[1].queries, [
    "SELECT * FROM empire_notification_state WHERE empire_entity_id = 3 OR empire_entity_id = 20",
  ]);
  const notificationQueries = fake.state.subscriptions
    .flatMap(({ queries }) => queries ?? [])
    .filter((query) => query.includes("empire_notification_state"));
  assert.ok(
    notificationQueries.every((query) => (
      /^SELECT \* FROM empire_notification_state WHERE empire_entity_id = \d+(?: OR empire_entity_id = \d+)*$/.test(query)
    )),
    "every notification-state query must contain only exact indexed Empire-ID equalities",
  );
  assert.equal(snapshots.length, 0, "replacement data must wait for onApplied");
  fake.state.subscriptions[1].onApplied({});
  assert.equal(await firstApply, true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(snapshots.length, 1);
  assert.deepEqual(snapshots[0].changed, ["empire-notifications"]);
  assert.deepEqual(
    snapshots[0].siegeNotifications.outcomes,
    [{
      eventKey: "2026-01-01T00:00:00.000Z\u0000Northwatch\u000019:4:5",
      occurredAt: "2026-01-01T00:00:00.000Z",
      watchtowerLabel: "Northwatch",
      encodedLocation: "19:4:5",
      attackerEmpireEntityId: "3",
      defenderEmpireEntityId: "20",
      outcome: "attacker_won",
    }],
  );
  assert.deepEqual(snapshots[0].siegeNotifications.warnings, []);
  assert.equal(await session.setEmpireNotificationScope(["20", "3"]), false);
  assert.equal(fake.state.subscriptions.length, 2, "identical normalized scope is a no-op");

  const staleCallback = fake.connection.db.empireNotificationState.callbackHistory.update.at(-1);
  fake.connection.db.regionPopulationInfo.triggerUpdate();
  fake.connection.db.empireNotificationState.triggerUpdate();
  const replacementApply = session.setEmpireNotificationScope(["30"]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(snapshots.length, 2, "the active last-good scope continues while replacement applies");
  assert.deepEqual(snapshots[1].changed, ["region", "empire-notifications"]);
  fake.state.subscriptions[2].onApplied({});
  assert.equal(await replacementApply, true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fake.state.subscriptions[1].unsubscribed, true);
  assert.deepEqual(
    snapshots[2].siegeNotifications.notifications.map(({ empireEntityId }) => empireEntityId),
    ["30"],
  );

  staleCallback({}, {}, {});
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(snapshots.length, 3, "an unsubscribed scope callback cannot publish");

  currentTime = "2026-08-01T12:05:00.000Z";
  fake.connection.db.regionPopulationInfo.triggerUpdate();
  fake.connection.db.empireNotificationState.triggerInsert();
  fake.connection.db.empireNotificationState.triggerUpdate();
  fake.connection.db.empireNotificationState.triggerDelete();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(snapshots.length, 4, "insert/update/delete are coalesced into one snapshot");
  assert.deepEqual(snapshots[3].changed, ["region", "empire-notifications"]);
  assert.equal(session.health().lastAppliedAt, currentTime);
  assert.equal(session.health().notifications.lastAppliedAt, currentTime);

  fake.connection.db.empireNotificationDesc.triggerUpdate();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(snapshots.length, 5, "description changes refresh the normalized notification projection");

  assert.equal(await session.setEmpireNotificationScope([]), true);
  assert.equal(fake.state.subscriptions[2].unsubscribed, true);
  assert.equal(fake.state.subscriptions[0].unsubscribed, false);
  assert.deepEqual(session.health().notifications.appliedEmpireIds, []);
  await session.stop();
  assert.equal(fake.state.subscriptions[0].unsubscribed, true);
});

test("typed global catalog session keeps catalog health independent when a replacement notification scope fails", async () => {
  const fake = fakeBindings();
  const snapshots = [];
  const session = new sessionModule.RelayGlobalCatalogSession({
    loadBindings: async () => fake.module,
    onSnapshot: (snapshot) => snapshots.push(snapshot),
  });
  await session.start({
    uri: "wss://relay.example:3000",
    database: "relay-global",
    schemaFingerprint: "global-v1",
    manifest: readyManifest,
    generation: 40,
  });
  fake.state.onConnect(fake.connection);
  fake.state.subscriptions[0].onApplied({});
  await new Promise((resolve) => setImmediate(resolve));
  const firstApply = session.setEmpireNotificationScope(["3", "20"]);
  fake.state.subscriptions[1].onApplied({});
  await firstApply;
  await new Promise((resolve) => setImmediate(resolve));
  const snapshotCount = snapshots.length;

  const failedApply = session.setEmpireNotificationScope(["30"]);
  fake.state.subscriptions[2].onError({}, new Error("scope rejected"));
  assert.equal(await failedApply, false);
  assert.equal(snapshots.length, snapshotCount);
  assert.equal(session.health().applied, true);
  assert.equal(session.health().lastError, null);
  assert.match(session.health().notifications.lastError, /scope rejected/i);
  assert.deepEqual(session.health().notifications.requestedEmpireIds, ["30"]);
  assert.deepEqual(session.health().notifications.appliedEmpireIds, ["3", "20"]);

  fake.connection.db.empireNotificationState.triggerUpdate();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(snapshots.length, snapshotCount + 1, "failed replacement keeps the active listener live");
  assert.deepEqual(
    snapshots.at(-1).siegeNotifications.outcomes.map(({ attackerEmpireEntityId }) => attackerEmpireEntityId),
    ["3"],
  );

  const retry = session.setEmpireNotificationScope(["30"]);
  assert.equal(fake.state.subscriptions.length, 4, "the same desired scope retries after failure");
  fake.state.subscriptions[3].onApplied({});
  assert.equal(await retry, true);
  await session.stop();
  assert.equal(fake.state.subscriptions[1].unsubscribed, true);
  assert.equal(fake.connection.db.empireNotificationState.callbackHistory.update.length > 0, true);
});

test("typed global catalog session batches large exact Empire scopes into bounded equality queries", async () => {
  const fake = fakeBindings();
  const session = new sessionModule.RelayGlobalCatalogSession({
    loadBindings: async () => fake.module,
    onSnapshot: () => {},
  });
  await session.start({
    uri: "wss://relay.example:3000",
    database: "relay-global",
    schemaFingerprint: "global-v1",
    manifest: readyManifest,
    generation: 50,
  });
  fake.state.onConnect(fake.connection);
  fake.state.subscriptions[0].onApplied({});
  await new Promise((resolve) => setImmediate(resolve));

  const ids = Array.from({ length: 205 }, (_, index) => String(index + 1)).reverse();
  const apply = session.setEmpireNotificationScope(ids);
  const queries = fake.state.subscriptions[1].queries;
  assert.equal(queries.length, 3);
  assert.deepEqual(
    queries.map((query) => (query.match(/empire_entity_id =/g) ?? []).length),
    [100, 100, 5],
  );
  assert.match(queries[0], /empire_entity_id = 1 OR empire_entity_id = 2/);
  assert.match(queries[2], /empire_entity_id = 205$/);
  fake.state.subscriptions[1].onError({}, new Error("fixture cleanup"));
  assert.equal(await apply, false);
  await session.stop();
});

test("typed global catalog session records synchronous scoped-subscription failures without rejecting", async () => {
  const fake = fakeBindings();
  const session = new sessionModule.RelayGlobalCatalogSession({
    loadBindings: async () => fake.module,
    onSnapshot: () => {},
  });
  await session.start({
    uri: "wss://relay.example:3000",
    database: "relay-global",
    schemaFingerprint: "global-v1",
    manifest: readyManifest,
    generation: 60,
  });
  fake.state.onConnect(fake.connection);
  fake.state.subscriptions[0].onApplied({});
  await new Promise((resolve) => setImmediate(resolve));

  fake.state.subscriptionBuilderError = new Error("builder failed synchronously");
  assert.equal(await session.setEmpireNotificationScope(["3"]), false);
  assert.match(session.health().notifications.lastError, /builder failed synchronously/i);
  assert.deepEqual(session.health().notifications.requestedEmpireIds, ["3"]);

  fake.state.subscribeError = new Error("subscribe failed synchronously");
  assert.equal(await session.setEmpireNotificationScope(["3"]), false);
  assert.match(session.health().notifications.lastError, /subscribe failed synchronously/i);
  await session.stop();
});

test("typed global catalog session records auto-scope subscribe throws without an unhandled rejection", async () => {
  const fake = fakeBindings();
  const session = new sessionModule.RelayGlobalCatalogSession({
    loadBindings: async () => fake.module,
    onSnapshot: () => {},
  });
  assert.equal(await session.setEmpireNotificationScope(["3"]), true);
  await session.start({
    uri: "wss://relay.example:3000",
    database: "relay-global",
    schemaFingerprint: "global-v1",
    manifest: readyManifest,
    generation: 70,
  });
  fake.state.onConnect(fake.connection);
  fake.state.subscribeError = new Error("auto scope failed synchronously");
  fake.state.subscriptions[0].onApplied({});
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(session.health().notifications.lastError, /auto scope failed synchronously/i);
  assert.equal(session.health().lastError, null);
  await session.stop();
});

test("typed global catalog session fences late scope callbacks after disconnect and stop", async () => {
  const fake = fakeBindings();
  const snapshots = [];
  const session = new sessionModule.RelayGlobalCatalogSession({
    loadBindings: async () => fake.module,
    onSnapshot: (snapshot) => snapshots.push(snapshot),
  });
  await session.start({
    uri: "wss://relay.example:3000",
    database: "relay-global",
    schemaFingerprint: "global-v1",
    manifest: readyManifest,
    generation: 80,
  });
  fake.state.onConnect(fake.connection);
  fake.state.subscriptions[0].onApplied({});
  await new Promise((resolve) => setImmediate(resolve));
  snapshots.length = 0;

  const disconnectedApply = session.setEmpireNotificationScope(["3"]);
  fake.state.onDisconnect({}, new Error("socket closed"));
  fake.state.subscriptions[1].onApplied({});
  assert.equal(await disconnectedApply, false);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(snapshots.length, 0);
  await session.stop();

  const stoppedFake = fakeBindings();
  const stoppedSession = new sessionModule.RelayGlobalCatalogSession({
    loadBindings: async () => stoppedFake.module,
    onSnapshot: (snapshot) => snapshots.push(snapshot),
  });
  await stoppedSession.start({
    uri: "wss://relay.example:3000",
    database: "relay-global",
    schemaFingerprint: "global-v1",
    manifest: readyManifest,
    generation: 81,
  });
  stoppedFake.state.onConnect(stoppedFake.connection);
  stoppedFake.state.subscriptions[0].onApplied({});
  await new Promise((resolve) => setImmediate(resolve));
  const stoppedApply = stoppedSession.setEmpireNotificationScope(["20"]);
  const lateSubscription = stoppedFake.state.subscriptions[1];
  await stoppedSession.stop();
  assert.equal(await stoppedApply, false);
  const stoppedHealth = stoppedSession.health();
  lateSubscription.onError({}, new Error("late error after stop"));
  lateSubscription.onApplied({});
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(stoppedSession.health(), stoppedHealth);
});

test("typed global catalog session invalidates a deferred notification publication when disconnected", async () => {
  const fake = fakeBindings();
  let rejectNotification;
  const deferredNotification = new Promise((_resolve, reject) => {
    rejectNotification = reject;
  });
  const publishedSnapshots = [];
  const session = new sessionModule.RelayGlobalCatalogSession({
    loadBindings: async () => fake.module,
    onSnapshot: (snapshot) => {
      publishedSnapshots.push(snapshot);
      return snapshot.changed.includes("empire-notifications") ? deferredNotification : undefined;
    },
  });
  await session.start({
    uri: "wss://relay.example:3000",
    database: "relay-global",
    schemaFingerprint: "global-v1",
    manifest: readyManifest,
    generation: 90,
  });
  fake.state.onConnect(fake.connection);
  fake.state.subscriptions[0].onApplied({});
  await new Promise((resolve) => setImmediate(resolve));
  const apply = session.setEmpireNotificationScope(["3", "20"]);
  fake.state.subscriptions[1].onApplied({});
  assert.equal(await apply, true);
  fake.state.onDisconnect({}, new Error("socket closed"));
  const disconnectedHealth = session.health();
  rejectNotification(new Error("late snapshot failure"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(session.health(), disconnectedHealth);

  fake.state.onConnect(fake.connection);
  fake.state.subscriptions[2].onApplied({});
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(publishedSnapshots.length, 3, "a reconnect can apply after invalidating deferred work");
  await session.stop();
});

test("typed global catalog session refuses schema mismatch before opening a connection", async () => {
  assert.ok(sessionModule, "global catalog session module must exist");
  let loaded = false;
  const session = new sessionModule.RelayGlobalCatalogSession({
    loadBindings: async () => {
      loaded = true;
      return fakeBindings().module;
    },
    onSnapshot: () => assert.fail("schema mismatch must not emit a snapshot"),
  });

  await assert.rejects(session.start({
    uri: "wss://relay.example:3000",
    database: "relay-global",
    schemaFingerprint: "unexpected",
    manifest: readyManifest,
    generation: 1,
  }), /schema fingerprint mismatch/i);
  assert.equal(loaded, false);
});

test("typed global catalog session serializes rapid changes behind an unfinished snapshot apply", async () => {
  assert.ok(sessionModule, "global catalog session module must exist");
  const fake = fakeBindings();
  const snapshots = [];
  let releaseFirst;
  const firstApply = new Promise((resolve) => { releaseFirst = resolve; });
  const session = new sessionModule.RelayGlobalCatalogSession({
    loadBindings: async () => fake.module,
    onSnapshot: (snapshot) => {
      snapshots.push(snapshot);
      return snapshots.length === 1 ? firstApply : undefined;
    },
  });
  await session.start({
    uri: "wss://relay.example:3000",
    database: "relay-global",
    schemaFingerprint: "global-v1",
    manifest: readyManifest,
    generation: 20,
  });
  fake.state.onConnect(fake.connection);
  fake.state.onApplied({});
  fake.state.tableCallbacks.get("update")({}, {}, {});
  fake.state.tableCallbacks.get("insert")({}, {});
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(snapshots.length, 1);

  releaseFirst();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(snapshots.map(({ generation }) => generation), [20, 21]);
  await session.stop();
});
