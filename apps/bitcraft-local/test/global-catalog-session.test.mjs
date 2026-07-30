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
    disconnected: false,
    unsubscribed: false,
    tableCallbacks: new Map(),
  };
  const cachedTable = (rows) => ({
    iter: () => rows[Symbol.iterator](),
    onInsert: (callback) => state.tableCallbacks.set("insert", callback),
    onUpdate: (callback) => state.tableCallbacks.set("update", callback),
    onDelete: (callback) => state.tableCallbacks.set("delete", callback),
    removeOnInsert: () => state.tableCallbacks.delete("insert"),
    removeOnUpdate: () => state.tableCallbacks.delete("update"),
    removeOnDelete: () => state.tableCallbacks.delete("delete"),
  });
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
    },
    subscriptionBuilder() {
      const subscriptionBuilder = {
        onApplied(callback) {
          state.onApplied = callback;
          return subscriptionBuilder;
        },
        onError(callback) {
          state.onSubscriptionError = callback;
          return subscriptionBuilder;
        },
        subscribe(queries) {
          state.queries = queries;
          return { unsubscribe: () => { state.unsubscribed = true; } };
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
  fake.state.onConnect(fake.connection, {}, "secret-token");

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
    "SELECT * FROM equipment_desc",
    "SELECT * FROM tool_desc",
    "SELECT * FROM buff_desc",
    "SELECT * FROM claim_tech_desc",
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
    database: "relay-mirror-bc-global",
    schemaFingerprint: "global-v1",
    generation: 9,
    receivedAt: "2026-07-29T20:15:00.000Z",
  }]);
  assert.equal(session.health().applied, true);

  fake.state.tableCallbacks.get("update")({}, {}, {});
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(snapshots.length, 2);
  assert.equal(snapshots[1].generation, 10);

  await session.stop();
  assert.equal(fake.state.unsubscribed, true);
  assert.equal(fake.state.disconnected, true);
  assert.equal(fake.state.tableCallbacks.size, 0);
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
