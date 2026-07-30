import assert from "node:assert/strict";
import test from "node:test";

let sessionModule = null;
try {
  sessionModule = await import("../src/server/game-data/primaryRegionPlayerSession.ts");
} catch {
  // The first TDD run proves the regional player session is absent.
}

function fakeBindings() {
  const state = {
    connectConfig: {},
    queries: null,
    onApplied: null,
    callbacks: new Map(),
    disconnected: false,
    unsubscribed: false,
  };
  const rows = [{
    entityId: 101n,
    timePlayed: 7200,
    sessionStartTimestamp: 0,
    timeSignedIn: 3600,
    signInTimestamp: 1785352200,
    signedIn: true,
    travelerTasksExpiration: 0,
  }];
  const cachedTable = (name, tableRows = []) => ({
    iter: () => tableRows[Symbol.iterator](),
    onInsert: (callback) => state.callbacks.set(`${name}:insert`, callback),
    onUpdate: (callback) => state.callbacks.set(`${name}:update`, callback),
    onDelete: (callback) => state.callbacks.set(`${name}:delete`, callback),
    removeOnInsert: () => state.callbacks.delete(`${name}:insert`),
    removeOnUpdate: () => state.callbacks.delete(`${name}:update`),
    removeOnDelete: () => state.callbacks.delete(`${name}:delete`),
  });
  const playerState = cachedTable("player", rows);
  const equipmentState = cachedTable("equipment", [{
    entityId: 101n,
    equipmentSlots: [],
  }]);
  const equipmentPresetState = cachedTable("preset", []);
  const activeBuffState = cachedTable("buff", []);
  const projectSiteState = cachedTable("project", [{
    entityId: 9001n,
    constructionRecipeId: 3023,
    resourcePlacementRecipeId: 0,
    items: [{
      itemId: 3090004,
      quantity: 5,
      itemType: { tag: "Item", value: {} },
    }],
    cargos: [],
    progress: 157,
    lastCritOutcome: 1,
    ownerId: 1369094286777412590n,
    direction: 2,
    lastHitTimestamp: {
      __timestamp_micros_since_unix_epoch__: 1785096910248578n,
    },
  }]);
  const buildingState = cachedTable("building", [{
    entityId: 7001n,
    claimEntityId: 1369094286777412590n,
    directionIndex: 2,
    buildingDescriptionId: 6020,
    constructedByPlayerEntityId: 101n,
  }]);
  const claimTechState = cachedTable("research", [{
    entityId: 1369094286777412590n,
    learned: [1, 200, 748616905],
    researching: 0,
    startTimestamp: {
      __timestamp_micros_since_unix_epoch__: 0n,
    },
    scheduledId: null,
  }]);
  const claimRecruitmentState = cachedTable("recruitment", [{
    entityId: 1369094286821318198n,
    claimEntityId: 1369094286777412590n,
    remainingStock: 19,
    requiredSkillId: 1,
    requiredSkillLevel: 1,
    requiredApproval: false,
  }]);
  const connection = {
    db: {
      playerState,
      equipmentState,
      equipmentPresetState,
      activeBuffState,
      projectSiteState,
      buildingState,
      claimTechState,
      claimRecruitmentState,
    },
    subscriptionBuilder() {
      const builder = {
        onApplied(callback) {
          state.onApplied = callback;
          return builder;
        },
        onError() {
          return builder;
        },
        subscribe(queries) {
          state.queries = queries;
          return { unsubscribe: () => { state.unsubscribed = true; } };
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
    state,
  };
}

const manifest = {
  schemas: {
    regional: { fingerprint: "regional-v1", bindingsGenerated: true },
  },
};

const members = [
  { playerEntityId: "101", userName: "Ada" },
  { playerEntityId: "202", userName: "Grace" },
];

test("primary-region session filters member and settlement state and emits normalized snapshots", async () => {
  assert.ok(sessionModule, "primary-region player session module must exist");
  const fake = fakeBindings();
  const snapshots = [];
  const session = new sessionModule.RelayPrimaryRegionPlayerSession({
    loadBindings: async () => fake.module,
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    now: () => new Date("2026-07-29T20:35:00.000Z"),
  });

  await session.start({
    uri: "wss://relay.example:4000",
    database: "relay-region-19",
    schemaFingerprint: "regional-v1",
    manifest,
    generation: 4,
    regionId: "19",
    claimId: "1369094286777412590",
    members,
  });
  fake.state.onConnect(fake.connection);
  assert.deepEqual(fake.state.queries, [
    "SELECT * FROM player_state WHERE entity_id = 101 OR entity_id = 202",
    "SELECT * FROM equipment_state WHERE entity_id = 101 OR entity_id = 202",
    "SELECT * FROM equipment_preset_state WHERE player_entity_id = 101 OR player_entity_id = 202",
    "SELECT * FROM active_buff_state WHERE entity_id = 101 OR entity_id = 202",
    "SELECT * FROM project_site_state WHERE owner_id = 1369094286777412590",
    "SELECT * FROM building_state WHERE claim_entity_id = 1369094286777412590",
    "SELECT * FROM claim_tech_state WHERE entity_id = 1369094286777412590",
    "SELECT * FROM claim_recruitment_state WHERE claim_entity_id = 1369094286777412590",
  ]);

  fake.state.onApplied({});
  await Promise.resolve();
  assert.deepEqual(snapshots[0], {
    players: [
      {
        entityId: "101",
        playerEntityId: "101",
        username: "Ada",
        signedIn: true,
        sessionSeconds: 5100,
        timePlayedSeconds: 7200,
        timeSignedInSeconds: 3600,
        signInTimestamp: "2026-07-29T19:10:00.000Z",
      },
      {
        entityId: "202",
        playerEntityId: "202",
        username: "Grace",
        signedIn: false,
        sessionSeconds: null,
        timePlayedSeconds: null,
        timeSignedInSeconds: null,
      },
    ],
    warnings: ["Regional player_state omitted member 202."],
    equipment: {
      members: [
        {
          playerEntityId: "101",
          username: "Ada",
          equipment: { equipmentSlots: [] },
          equipmentPresets: { presets: [] },
          buffs: { buffs: [] },
        },
        {
          playerEntityId: "202",
          username: "Grace",
          equipment: { equipmentSlots: [] },
          equipmentPresets: { presets: [] },
          buffs: { buffs: [] },
        },
      ],
    },
    equipmentWarnings: [],
    construction: {
      projects: [{
        entityId: "9001",
        constructionRecipeId: "3023",
        resourcePlacementRecipeId: "0",
        ownerId: "1369094286777412590",
        items: [{ itemId: "3090004", itemType: "item", quantity: "5" }],
        cargos: [],
        progress: "157",
        lastCritOutcome: 1,
        direction: 2,
        lastHitAt: "2026-07-26T20:15:10.248Z",
      }],
      buildings: [{
        entityId: "7001",
        claimEntityId: "1369094286777412590",
        directionIndex: 2,
        buildingDescriptionId: "6020",
        constructedByPlayerEntityId: "101",
      }],
    },
    constructionWarnings: [],
    research: {
      claimId: "1369094286777412590",
      learnedTechIds: ["1", "200", "748616905"],
      researchingTechId: null,
      researchStartedAt: null,
      scheduledId: null,
    },
    researchWarnings: [],
    recruitment: {
      claimId: "1369094286777412590",
      isRecruiting: true,
      recruitment: [{
        entityId: "1369094286821318198",
        claimEntityId: "1369094286777412590",
        remainingStock: "19",
        requiredSkillId: "1",
        requiredSkillLevel: "1",
        requiredApproval: false,
        isRecruiting: true,
      }],
    },
    recruitmentWarnings: [],
    database: "relay-region-19",
    regionId: "19",
    schemaFingerprint: "regional-v1",
    generation: 4,
    receivedAt: "2026-07-29T20:35:00.000Z",
  });

  fake.state.callbacks.get("equipment:update")({}, {}, {});
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(snapshots[1].generation, 5);

  await session.stop();
  assert.equal(fake.state.unsubscribed, true);
  assert.equal(fake.state.disconnected, true);
  assert.equal(fake.state.callbacks.size, 0);
});

test("primary-region player session rejects schema mismatch before loading bindings", async () => {
  assert.ok(sessionModule, "primary-region player session module must exist");
  let loaded = false;
  const session = new sessionModule.RelayPrimaryRegionPlayerSession({
    loadBindings: async () => {
      loaded = true;
      return fakeBindings().module;
    },
    onSnapshot: () => assert.fail("schema mismatch must not emit a snapshot"),
  });
  await assert.rejects(session.start({
    uri: "wss://relay.example:4000",
    database: "relay-region-19",
    schemaFingerprint: "unexpected",
    manifest,
    generation: 1,
    regionId: "19",
    claimId: "1369094286777412590",
    members,
  }), /schema fingerprint mismatch/i);
  assert.equal(loaded, false);
});

test("primary-region player session coalesces rapid changes while a snapshot apply is unfinished", async () => {
  assert.ok(sessionModule, "primary-region player session module must exist");
  const fake = fakeBindings();
  const snapshots = [];
  let releaseFirst;
  const firstApply = new Promise((resolve) => { releaseFirst = resolve; });
  const session = new sessionModule.RelayPrimaryRegionPlayerSession({
    loadBindings: async () => fake.module,
    onSnapshot: (snapshot) => {
      snapshots.push(snapshot);
      return snapshots.length === 1 ? firstApply : undefined;
    },
  });
  await session.start({
    uri: "wss://relay.example:4019",
    database: "relay-region-19",
    schemaFingerprint: "regional-v1",
    manifest,
    generation: 30,
    regionId: "19",
    claimId: "1369094286777412590",
    members,
  });
  fake.state.onConnect(fake.connection);
  fake.state.onApplied({});
  fake.state.callbacks.get("player:update")({}, {}, {});
  fake.state.callbacks.get("buff:insert")({}, {});
  fake.state.callbacks.get("project:update")({}, {}, {});
  fake.state.callbacks.get("research:update")({}, {}, {});
  fake.state.callbacks.get("recruitment:update")({}, {}, {});
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(snapshots.length, 1);

  releaseFirst();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(snapshots.map(({ generation }) => generation), [30, 31]);
  await session.stop();
});
