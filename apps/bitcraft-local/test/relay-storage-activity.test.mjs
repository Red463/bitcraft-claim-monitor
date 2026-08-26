import assert from "node:assert/strict";
import test from "node:test";

let storageModule = null;
try {
  storageModule = await import("../src/server/game-data/storageActivity.ts");
} catch {
  // The first TDD run proves the live storage activity service is absent.
}

const claimId = "1369094286777412590";

function log(id, overrides = {}) {
  return {
    action: "deposit",
    building: {
      entity_id: "100",
      name: "Simple Chest",
      nickname: "Ingots",
    },
    claim_entity_id: claimId,
    claim_name: "Timbersteel Trade",
    id,
    item_id: 42,
    item_type: "Item",
    player_entity_id: "200",
    player_username: "Ada",
    quantity: 12,
    region: 19,
    timestamp: "2026-07-30T09:00:00.000Z",
    ...overrides,
  };
}

test("storage activity service copies enriched Relay events through the provider sink", async () => {
  assert.ok(storageModule, "storage activity module must exist");
  const requests = [];
  const appended = [];
  const service = new storageModule.RelayStorageActivityService({
    http: {
      storageLogs: async (request) => {
        requests.push(request);
        return { count: 1, logs: [log("4070526")] };
      },
    },
    appendEvents: async (events) => appended.push(...events),
    getEntity: (key) => key === "items:42" ? { name: "Bronze Ingot" } : null,
    batchSize: 25,
    concurrency: 5,
  });

  const result = await service.sync({
    claimId,
    regionId: "19",
    inventories: {
      buildings: [{
        entityId: "100",
        name: "Simple Chest",
        nickname: "Ingots",
      }],
    },
  });

  assert.deepEqual(requests, [{ storageId: "100", regionId: "19", limit: 5000 }]);
  assert.deepEqual(appended, [{
    claimId,
    domain: "inventories",
    sourceKey: "relay-storage:19:4070526",
    occurredAt: "2026-07-30T09:00:00.000Z",
    data: {
      eventType: "storage",
      summary: "Ada deposited 12 Bronze Ingot to Ingots",
      metadata: {
        action: "deposit",
        actorEntityId: "200",
        actorName: "Ada",
        buildingId: "100",
        containerName: "Ingots",
        itemId: "42",
        itemName: "Bronze Ingot",
        itemType: "item",
        quantity: "12",
        regionId: "19",
        relayLogId: "4070526",
      },
    },
  }]);
  assert.equal(result.insertedCandidates, 1);
  assert.deepEqual(result.failures, []);
});

test("storage activity service rotates bounded containers and switches to a small live tail", async () => {
  assert.ok(storageModule, "storage activity module must exist");
  const requests = [];
  const service = new storageModule.RelayStorageActivityService({
    http: {
      storageLogs: async (request) => {
        requests.push(request);
        return { count: 0, logs: [] };
      },
    },
    appendEvents: async () => {},
    getEntity: () => null,
    batchSize: 2,
    concurrency: 1,
  });
  const inventories = {
    buildings: ["100", "200", "300"].map((entityId) => ({ entityId })),
  };

  await service.sync({ claimId, regionId: "19", inventories });
  await service.sync({ claimId, regionId: "19", inventories });
  await service.sync({ claimId, regionId: "19", inventories });

  assert.deepEqual(requests, [
    { storageId: "100", regionId: "19", limit: 5000 },
    { storageId: "200", regionId: "19", limit: 5000 },
    { storageId: "300", regionId: "19", limit: 5000 },
    { storageId: "100", regionId: "19", limit: 100 },
    { storageId: "200", regionId: "19", limit: 100 },
  ]);
});

test("storage activity service avoids repeated SQLite writes for the same live-tail event", async () => {
  assert.ok(storageModule, "storage activity module must exist");
  const appended = [];
  const service = new storageModule.RelayStorageActivityService({
    http: {
      storageLogs: async () => ({ count: 1, logs: [log("4070526")] }),
    },
    appendEvents: async (events) => appended.push(...events),
    getEntity: () => ({ name: "Bronze Ingot" }),
    batchSize: 1,
    concurrency: 1,
  });
  const request = {
    claimId,
    regionId: "19",
    inventories: { buildings: [{ entityId: "100", nickname: "Ingots" }] },
  };

  const initial = await service.sync(request);
  const tail = await service.sync(request);

  assert.equal(initial.insertedCandidates, 1);
  assert.equal(tail.insertedCandidates, 0);
  assert.equal(appended.length, 1);
});

test("storage activity service retries the retained backfill when durable append fails", async () => {
  assert.ok(storageModule, "storage activity module must exist");
  const limits = [];
  let appendAttempts = 0;
  const service = new storageModule.RelayStorageActivityService({
    http: {
      storageLogs: async ({ limit }) => {
        limits.push(limit);
        return { count: 1, logs: [log("4070526")] };
      },
    },
    appendEvents: async () => {
      appendAttempts += 1;
      if (appendAttempts === 1) throw new Error("SQLite busy");
    },
    getEntity: () => ({ name: "Bronze Ingot" }),
    batchSize: 1,
    concurrency: 1,
  });
  const request = {
    claimId,
    regionId: "19",
    inventories: { buildings: [{ entityId: "100", nickname: "Ingots" }] },
  };

  await assert.rejects(service.sync(request), /SQLite busy/);
  await service.sync(request);

  assert.deepEqual(limits, [5000, 5000]);
  assert.equal(appendAttempts, 2);
});

test("storage activity service rejects a same-claim row from another requested container", async () => {
  assert.ok(storageModule, "storage activity module must exist");
  const appended = [];
  const service = new storageModule.RelayStorageActivityService({
    http: {
      storageLogs: async () => ({
        count: 1,
        logs: [log("4070526", {
          building: { entity_id: "999", name: "Unexpected chest" },
        })],
      }),
    },
    appendEvents: async (events) => appended.push(...events),
    getEntity: () => ({ name: "Bronze Ingot" }),
    batchSize: 1,
    concurrency: 1,
  });

  const result = await service.sync({
    claimId,
    regionId: "19",
    inventories: { buildings: [{ entityId: "100", nickname: "Ingots" }] },
  });

  assert.deepEqual(appended, []);
  assert.deepEqual(result.warnings, [
    "Relay storage-log omitted row 4070526 for unexpected storage 999 while reading 100.",
  ]);
});

test("storage activity service keeps healthy containers when one Relay request fails", async () => {
  assert.ok(storageModule, "storage activity module must exist");
  const appended = [];
  const service = new storageModule.RelayStorageActivityService({
    http: {
      storageLogs: async ({ storageId }) => {
        if (storageId === "100") throw new Error("temporary Relay failure");
        return {
          count: 1,
          logs: [log("2", {
            building: { entity_id: "200", name: "Cargo Yard", nickname: null },
            item_id: 42,
            item_type: "Cargo",
            quantity: 3,
          })],
        };
      },
    },
    appendEvents: async (events) => appended.push(...events),
    getEntity: (key) => key === "cargo:42" ? { name: "Stone Block" } : null,
    batchSize: 2,
    concurrency: 2,
  });

  const result = await service.sync({
    claimId,
    regionId: "19",
    inventories: {
      buildings: [{ entityId: "100" }, { entityId: "200", name: "Cargo Yard" }],
    },
  });

  assert.equal(appended.length, 1);
  assert.equal(appended[0].data.metadata.itemType, "cargo");
  assert.equal(appended[0].data.summary, "Ada deposited 3 Stone Block to Cargo Yard");
  assert.deepEqual(result.failures, ["Storage 100: temporary Relay failure"]);
});
