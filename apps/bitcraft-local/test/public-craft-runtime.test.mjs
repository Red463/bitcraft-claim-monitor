import assert from "node:assert/strict";
import test from "node:test";

import { DOMAIN_KEYS } from "../src/server/game-data/contracts.ts";

let runtimeModule = null;
try {
  runtimeModule = await import("../src/server/game-data/publicCraftRuntime.ts");
} catch {
  // The first TDD run proves the cross-region public-craft runtime is absent.
}

function topology() {
  return {
    cacheReady: true,
    global: null,
    regions: new Map([
      ["7", {
        sourceKey: "region:7",
        database: "relay-region-7",
        port: 4007,
        schemaFingerprint: "regional-v1",
        ready: true,
      }],
      ["19", {
        sourceKey: "region:19",
        database: "relay-region-19",
        port: 4019,
        schemaFingerprint: "regional-v1",
        ready: true,
      }],
    ]),
    discoveredAt: "2026-07-30T12:00:00.000Z",
  };
}

function publicJob(regionId, entityId) {
  return {
    entityId,
    buildingEntityId: `${entityId}1`,
    buildingDescriptionId: "1000",
    buildingNickname: null,
    buildingLocationX: 20,
    buildingLocationZ: 30,
    claimEntityId: `${entityId}2`,
    claimName: `Claim ${regionId}`,
    claimLocationX: 10,
    claimLocationZ: 15,
    claimDimension: "1",
    ownerEntityId: `${entityId}3`,
    ownerUsername: `Owner ${regionId}`,
    recipeId: "800",
    progress: "10",
    craftCount: "2",
    preparation: false,
    completed: false,
    isPublic: true,
    regionId,
  };
}

test("public craft runtime merges independently arriving regions into one durable domain", async () => {
  assert.ok(runtimeModule, "public craft runtime module must exist");
  assert.equal(DOMAIN_KEYS.includes("public-crafts"), true);
  const starts = [];
  const stops = [];
  const handlers = new Map();
  const writes = [];
  const runtime = new runtimeModule.RelayPublicCraftRuntime({
    manifest: { schemas: { regional: { fingerprint: "regional-v1", bindingsGenerated: true } } },
    discoverTopology: async () => topology(),
    createSession: (options) => {
      let regionId = null;
      return {
        start: async (config) => {
          regionId = config.regionId;
          starts.push(config);
          handlers.set(regionId, options.onSnapshot);
        },
        stop: async () => stops.push(regionId),
        health: () => ({ connected: true, applied: true }),
      };
    },
    currentStateRepository: {
      read: () => null,
      nextGeneration: () => writes.length + 1,
      commitGeneration: (batch) => writes.push(batch),
    },
    poolOptions: {
      maxSessions: 2,
      staggerMs: 0,
      idleCloseMs: 60_000,
      sleep: async () => {},
      scheduleSweep: () => () => {},
    },
  });

  await runtime.start({
    relayBaseUrl: "https://relay.example/",
    claimId: "1369094286777412590",
    primaryRegionId: "19",
    activeRegionIds: ["19", "7"],
  });
  await runtime.warmActiveRegions();
  assert.deepEqual(starts.map((config) => ({
    uri: config.uri,
    database: config.database,
    regionId: config.regionId,
  })), [
    {
      uri: "wss://relay.example:4019",
      database: "relay-region-19",
      regionId: "19",
    },
    {
      uri: "wss://relay.example:4007",
      database: "relay-region-7",
      regionId: "7",
    },
  ]);

  await handlers.get("19")({
    data: { craftResults: [publicJob("19", "190")] },
    warnings: [],
    database: "relay-region-19",
    regionId: "19",
    schemaFingerprint: "regional-v1",
    generation: 1,
    receivedAt: "2026-07-30T12:01:00.000Z",
  });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].domains["public-crafts"].confidence, "partial");
  assert.deepEqual(writes[0].domains["public-crafts"].warnings, [
    "Relay public crafts have not loaded region 7 yet.",
  ]);
  assert.deepEqual(
    writes[0].domains["public-crafts"].data.craftResults.map((job) => job.entityId),
    ["190"],
  );

  await handlers.get("7")({
    data: { craftResults: [publicJob("7", "70")] },
    warnings: [],
    database: "relay-region-7",
    regionId: "7",
    schemaFingerprint: "regional-v1",
    generation: 1,
    receivedAt: "2026-07-30T12:02:00.000Z",
  });
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[1], {
    claimId: "1369094286777412590",
    generation: 2,
    domains: {
      "public-crafts": {
        data: {
          craftResults: [
            publicJob("7", "70"),
            publicJob("19", "190"),
          ],
          regions: [
            {
              regionId: "7",
              count: 1,
              database: "relay-region-7",
              schemaFingerprint: "regional-v1",
              receivedAt: "2026-07-30T12:02:00.000Z",
              warnings: [],
            },
            {
              regionId: "19",
              count: 1,
              database: "relay-region-19",
              schemaFingerprint: "regional-v1",
              receivedAt: "2026-07-30T12:01:00.000Z",
              warnings: [],
            },
          ],
        },
        confidence: "authoritative",
        provenance: {
          provider: "relay",
          sourceKey: "region:7",
          regionId: "7",
          database: "relay-region-7",
          schemaFingerprint: "regional-v1",
          sourceObservedAt: null,
          receivedAt: "2026-07-30T12:02:00.000Z",
        },
        warnings: [],
      },
    },
  });

  await runtime.stop();
  assert.deepEqual(stops.sort(), ["19", "7"]);
});

test("public craft runtime hydrates last-good regions before replacing one live region", async () => {
  assert.ok(runtimeModule, "public craft runtime module must exist");
  const writes = [];
  let handler;
  const runtime = new runtimeModule.RelayPublicCraftRuntime({
    manifest: { schemas: { regional: { fingerprint: "regional-v1", bindingsGenerated: true } } },
    discoverTopology: async () => topology(),
    createSession: (options) => {
      handler = options.onSnapshot;
      return {
        start: async () => {},
        stop: async () => {},
        health: () => ({}),
      };
    },
    currentStateRepository: {
      read: () => ({
        data: {
          craftResults: [publicJob("7", "70")],
          regions: [{
            regionId: "7",
            count: 1,
            database: "relay-region-7",
            schemaFingerprint: "regional-v1",
            receivedAt: "2026-07-30T11:00:00.000Z",
            warnings: [],
          }],
        },
        confidence: "partial",
        generation: 9,
        lastError: null,
        provenance: {
          provider: "relay",
          sourceKey: "region:7",
          regionId: "7",
          database: "relay-region-7",
          schemaFingerprint: "regional-v1",
          sourceObservedAt: null,
          receivedAt: "2026-07-30T11:00:00.000Z",
        },
        warnings: [],
      }),
      nextGeneration: () => 10,
      commitGeneration: (batch) => writes.push(batch),
    },
    poolOptions: {
      maxSessions: 1,
      staggerMs: 0,
      sleep: async () => {},
      scheduleSweep: () => () => {},
    },
  });
  await runtime.start({
    relayBaseUrl: "https://relay.example",
    claimId: "1369094286777412590",
    primaryRegionId: "19",
    activeRegionIds: ["7", "19"],
  });

  await handler({
    data: { craftResults: [publicJob("19", "191")] },
    warnings: [],
    database: "relay-region-19",
    regionId: "19",
    schemaFingerprint: "regional-v1",
    generation: 1,
    receivedAt: "2026-07-30T12:03:00.000Z",
  });

  assert.deepEqual(
    writes[0].domains["public-crafts"].data.craftResults.map((job) => job.entityId),
    ["70", "191"],
  );
  assert.equal(writes[0].domains["public-crafts"].confidence, "authoritative");
  await runtime.stop();
});

test("public craft runtime preserves last-good data when a configured region is unavailable", async () => {
  assert.ok(runtimeModule, "public craft runtime module must exist");
  let constructed = false;
  const runtime = new runtimeModule.RelayPublicCraftRuntime({
    manifest: { schemas: { regional: { fingerprint: "regional-v1", bindingsGenerated: true } } },
    discoverTopology: async () => ({ ...topology(), regions: new Map() }),
    createSession: () => {
      constructed = true;
      return {};
    },
    currentStateRepository: {
      read: () => null,
      nextGeneration: () => 1,
      commitGeneration: () => assert.fail("unavailable topology must not replace last-good data"),
    },
  });

  await assert.rejects(runtime.start({
    relayBaseUrl: "https://relay.example",
    claimId: "1369094286777412590",
    primaryRegionId: "19",
    activeRegionIds: ["19"],
  }), /region 19 source is not ready/i);
  assert.equal(constructed, false);
});
