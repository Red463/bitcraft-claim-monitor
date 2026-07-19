import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  HEXITE_CAPSULE_CARGO_ID,
  HEXITE_CAPSULE_WATCHTOWER_ENERGY_VALUE,
  HEXITE_ENERGY_ITEM_ID,
  aggregateEmpireHexite,
  normalizePublishedEmpireHexite,
  dedupeEmpireHexiteSources,
  summarizeClaimHexite,
  summarizePlayerHexite,
  createEmpireHexiteRepository,
  createRequestPacer,
  createEmpireHexiteRefreshJob,
  runWithRetry,
} from "../src/server/empireHexite.mjs";
import { applySchemaBootstrap } from "../src/server/schemaBootstrap.mjs";

test("player Hexite summary counts exact energy and capsule identities across owned inventories", () => {
  const payload = {
    inventories: [
      {
        entityId: "wallet-1",
        inventoryName: "Wallet",
        pockets: [
          { contents: { itemId: HEXITE_ENERGY_ITEM_ID, itemType: 0, quantity: 89 } },
          { contents: { itemId: 1309866291, itemType: 0, quantity: 500 } },
        ],
      },
      {
        entityId: "cargo-1",
        inventoryName: "Player inventory",
        pockets: [
          { contents: { itemId: HEXITE_CAPSULE_CARGO_ID, itemType: 1, quantity: 3 } },
          { contents: { itemId: HEXITE_CAPSULE_CARGO_ID, itemType: 0, quantity: 40 } },
        ],
      },
      {
        entityId: "wallet-1",
        inventoryName: "Duplicate wallet",
        pockets: [{ contents: { itemId: HEXITE_ENERGY_ITEM_ID, itemType: 0, quantity: 89 } }],
      },
    ],
  };

  assert.deepEqual(summarizePlayerHexite(payload), {
    energy: 89,
    capsules: 3,
    reserveCapsules: 0,
    inventoryIds: ["wallet-1", "cargo-1"],
    inventories: [
      { entityId: "wallet-1", energy: 89, capsules: 0, reserveCapsules: 0 },
      { entityId: "cargo-1", energy: 0, capsules: 3, reserveCapsules: 0 },
    ],
  });
});

test("id-less inventories remain countable without creating cross-source dedupe collisions", () => {
  const summary = summarizePlayerHexite({
    inventories: [
      { pockets: [{ contents: { itemId: HEXITE_ENERGY_ITEM_ID, itemType: 0, quantity: 2 } }] },
      { pockets: [{ contents: { itemId: HEXITE_ENERGY_ITEM_ID, itemType: 0, quantity: 3 } }] },
    ],
  });

  assert.equal(summary.energy, 5);
  assert.deepEqual(summary.inventoryIds, []);
});

test("claim Hexite summary supports live snake-case contents and treats Reserve capsules as a subset", () => {
  const payload = {
    buildings: [
      {
        entityId: "reserve-1",
        buildingDescriptionId: 90001,
        buildingName: "Hexite Reserve",
        inventory: [
          { contents: { item_id: HEXITE_CAPSULE_CARGO_ID, item_type: "cargo", quantity: 37 } },
          { contents: { item_id: HEXITE_ENERGY_ITEM_ID, item_type: "item", quantity: 5 } },
        ],
      },
      {
        entityId: "chest-1",
        buildingDescriptionId: 2006,
        buildingName: "Simple Chest",
        inventory: [
          { contents: { item_id: HEXITE_CAPSULE_CARGO_ID, item_type: "cargo", quantity: 2 } },
          { contents: { item_id: HEXITE_ENERGY_ITEM_ID, item_type: "item", quantity: 11 } },
          { contents: { item_id: 1755998153, item_type: "item", quantity: 999 } },
        ],
      },
    ],
  };

  assert.deepEqual(summarizeClaimHexite(payload), {
    energy: 16,
    capsules: 39,
    reserveCapsules: 37,
    inventoryIds: ["reserve-1", "chest-1"],
    inventories: [
      { entityId: "reserve-1", energy: 5, capsules: 37, reserveCapsules: 37 },
      { entityId: "chest-1", energy: 11, capsules: 2, reserveCapsules: 0 },
    ],
  });
});

test("claim Hexite summary falls back to the normalized Reserve building name", () => {
  const payload = {
    buildings: [{
      entityId: "reserve-by-name",
      buildingName: "  HEXITE   RESERVE ",
      inventory: [{ contents: { item_id: HEXITE_CAPSULE_CARGO_ID, item_type: "cargo", quantity: 4 } }],
    }],
  };

  assert.equal(summarizeClaimHexite(payload).reserveCapsules, 4);
});

test("empire Hexite aggregation converts ready capsules once and reports source freshness", () => {
  const result = aggregateEmpireHexite({
    treasury: 1_059,
    capsuleEnergyCost: 100,
    players: [
      { state: "fresh", energy: 89, capsules: 3, reserveCapsules: 0 },
      { state: "reused", energy: 20, capsules: 1, reserveCapsules: 0 },
      { state: "missing", energy: 0, capsules: 0, reserveCapsules: 0, error: "timeout" },
    ],
    claims: [
      { state: "fresh", energy: 16, capsules: 39, reserveCapsules: 37 },
    ],
    sweepStartedAt: "2026-07-18T10:00:00.000Z",
    calculatedAt: "2026-07-18T10:30:00.000Z",
    refreshing: false,
  });

  assert.equal(result.energy.total, 1_184);
  assert.equal(result.capsules.readyTotal, 43);
  assert.equal(result.capsules.reserveBuildings, 37);
  assert.equal(HEXITE_CAPSULE_WATCHTOWER_ENERGY_VALUE, 1_000);
  assert.equal(result.capsuleEnergyCost, 100);
  assert.equal(result.capsuleWatchtowerEnergyValue, 1_000);
  assert.equal(result.estimatedEnergyEquivalent, 44_184);
  assert.deepEqual(result.coverage.players, { fresh: 1, reused: 1, missing: 1, total: 3 });
  assert.deepEqual(result.coverage.claims, { fresh: 1, reused: 0, missing: 0, total: 1 });
  assert.equal(result.coverage.foundry, "unavailable");
  assert.equal(result.capsules.foundry, null);
  assert.equal(result.status, "partial");
  assert.deepEqual(result.errors, ["timeout"]);
});

test("fresh Empire Hexite sources publish a complete known-inventory status", () => {
  const result = aggregateEmpireHexite({
    treasury: 10,
    capsuleEnergyCost: 100,
    players: [{ state: "fresh", energy: 5, capsules: 1 }],
    claims: [{ state: "fresh", energy: 5, capsules: 2, reserveCapsules: 2 }],
    calculatedAt: "2026-07-19T10:00:00.000Z",
  });

  assert.equal(result.status, "complete");
  assert.equal(result.estimatedEnergyEquivalent, 3_020);
});

test("published Empire Hexite snapshots recompute stale conversion totals on read", () => {
  const normalized = normalizePublishedEmpireHexite({
    status: "partial",
    calculatedAt: "2026-07-19T10:00:00.000Z",
    estimatedEnergyEquivalent: 92_261,
    capsuleEnergyCost: 100,
    capsuleWatchtowerEnergyValue: 0,
    energy: {
      treasury: 16_300,
      playerInventories: 20_000,
      sharedClaimInventories: 1_261,
      total: 37_561,
    },
    capsules: {
      playerInventories: 150,
      sharedClaimInventories: 397,
      reserveBuildings: 397,
      foundry: null,
      readyTotal: 547,
    },
    coverage: {
      players: { fresh: 317, reused: 0, missing: 0, total: 317 },
      claims: { fresh: 12, reused: 0, missing: 0, total: 12 },
      foundry: "unavailable",
    },
    errors: [],
  });

  assert.equal(normalized.estimatedEnergyEquivalent, 584_561);
  assert.equal(normalized.capsuleWatchtowerEnergyValue, 1_000);
  assert.equal(normalized.status, "complete");
});

test("published unavailable snapshots stay unavailable", () => {
  const normalized = normalizePublishedEmpireHexite({
    status: "error",
    estimatedEnergyEquivalent: null,
    energy: { total: 100 },
    capsules: { readyTotal: 2 },
  });

  assert.equal(normalized.estimatedEnergyEquivalent, null);
  assert.equal(normalized.status, "error");
  assert.equal(normalized.capsuleWatchtowerEnergyValue, 1_000);
});

test("published snapshots recompute a missing legacy aggregate when scanned components are valid", () => {
  const normalized = normalizePublishedEmpireHexite({
    status: "partial",
    calculatedAt: "2026-07-19T10:00:00.000Z",
    estimatedEnergyEquivalent: null,
    energy: { total: 20 },
    capsules: { readyTotal: 3 },
    coverage: {
      players: { fresh: 1, reused: 0, missing: 0, total: 1 },
      claims: { fresh: 1, reused: 0, missing: 0, total: 1 },
    },
  });

  assert.equal(normalized.estimatedEnergyEquivalent, 3_020);
  assert.equal(normalized.status, "complete");
});

test("published snapshots without trustworthy coverage are never promoted to complete", () => {
  const normalized = normalizePublishedEmpireHexite({
    status: "partial",
    calculatedAt: "2026-07-19T10:00:00.000Z",
    estimatedEnergyEquivalent: 1_020,
    energy: { total: 20 },
    capsules: { readyTotal: 1 },
  });

  assert.equal(normalized.estimatedEnergyEquivalent, 1_020);
  assert.equal(normalized.status, "partial");
});

test("empire Hexite source deduplication gives player ownership precedence over shared claim payloads", () => {
  const result = dedupeEmpireHexiteSources({
    players: [{
      state: "fresh",
      inventories: [{ entityId: "bank-1", energy: 10, capsules: 2, reserveCapsules: 0 }],
    }],
    claims: [{
      state: "fresh",
      inventories: [
        { entityId: "bank-1", energy: 10, capsules: 2, reserveCapsules: 0 },
        { entityId: "reserve-1", energy: 0, capsules: 5, reserveCapsules: 5 },
      ],
    }],
  });

  assert.deepEqual(result.players[0], { state: "fresh", energy: 10, capsules: 2, reserveCapsules: 0 });
  assert.deepEqual(result.claims[0], { state: "fresh", energy: 0, capsules: 5, reserveCapsules: 5 });
});

test("empire Hexite aggregation returns pending instead of a misleading zero without a scan", () => {
  const result = aggregateEmpireHexite({
    treasury: 0,
    capsuleEnergyCost: null,
    players: [],
    claims: [],
    sweepStartedAt: null,
    calculatedAt: null,
    refreshing: true,
  });

  assert.equal(result.estimatedEnergyEquivalent, null);
  assert.equal(result.capsuleWatchtowerEnergyValue, 1_000);
  assert.equal(result.status, "pending");
  assert.equal(result.refreshing, true);
});

test("Hexite repository resumes targets, reuses failed current sources, and excludes departed sources", () => {
  const db = new DatabaseSync(":memory:");
  applySchemaBootstrap(db);
  const repository = createEmpireHexiteRepository(db);

  const firstSweep = repository.beginSweep({
    startedAt: "2026-07-18T10:00:00.000Z",
    capsuleEnergyCost: 100,
    empires: [{ entityId: "e1", empireCurrencyTreasury: 100 }],
  });
  assert.deepEqual(repository.pendingTargets(firstSweep.id, 10).map((row) => row.sourceType), ["empire"]);

  repository.completeEmpireDiscovery({
    sweepId: firstSweep.id,
    empireId: "e1",
    treasury: 100,
    playerIds: ["p1"],
    claimIds: ["c1"],
    updatedAt: "2026-07-18T10:01:00.000Z",
  });
  repository.completeInventoryTarget({
    sweepId: firstSweep.id,
    empireId: "e1",
    sourceType: "player",
    sourceId: "p1",
    summary: { energy: 10, capsules: 2, reserveCapsules: 0, inventories: [{ entityId: "wallet", energy: 10, capsules: 2, reserveCapsules: 0 }] },
    updatedAt: "2026-07-18T10:02:00.000Z",
  });
  repository.completeInventoryTarget({
    sweepId: firstSweep.id,
    empireId: "e1",
    sourceType: "claim",
    sourceId: "c1",
    summary: { energy: 20, capsules: 3, reserveCapsules: 3, inventories: [{ entityId: "reserve", energy: 20, capsules: 3, reserveCapsules: 3 }] },
    updatedAt: "2026-07-18T10:03:00.000Z",
  });
  repository.publishReadySnapshots(firstSweep.id, "2026-07-18T10:04:00.000Z");
  assert.equal(repository.snapshotForEmpire("e1").estimatedEnergyEquivalent, 5_130);
  assert.equal(repository.publishReadySnapshots(firstSweep.id, "2026-07-18T10:04:30.000Z"), 0);
  assert.equal(repository.snapshotForEmpire("e1").calculatedAt, "2026-07-18T10:04:00.000Z");
  assert.equal(repository.finishSweepIfComplete(firstSweep.id, "2026-07-18T10:05:00.000Z"), true);

  const secondSweep = repository.beginSweep({
    startedAt: "2026-07-18T16:00:00.000Z",
    capsuleEnergyCost: 100,
    empires: [{ entityId: "e1", empireCurrencyTreasury: 200 }],
  });
  repository.completeEmpireDiscovery({
    sweepId: secondSweep.id,
    empireId: "e1",
    treasury: 200,
    playerIds: ["p1"],
    claimIds: [],
    updatedAt: "2026-07-18T16:01:00.000Z",
  });
  repository.failInventoryTarget({
    sweepId: secondSweep.id,
    empireId: "e1",
    sourceType: "player",
    sourceId: "p1",
    error: "HTTP 503",
    updatedAt: "2026-07-18T16:02:00.000Z",
  });
  repository.publishReadySnapshots(secondSweep.id, "2026-07-18T16:03:00.000Z");

  const refreshed = repository.snapshotForEmpire("e1");
  assert.equal(refreshed.estimatedEnergyEquivalent, 2_210);
  assert.deepEqual(refreshed.coverage.players, { fresh: 0, reused: 1, missing: 0, total: 1 });
  assert.deepEqual(refreshed.coverage.claims, { fresh: 0, reused: 0, missing: 0, total: 0 });
  assert.deepEqual(refreshed.errors, ["HTTP 503"]);
  db.close();
});

test("Hexite repository publishes a terminal unavailable snapshot when empire discovery fails", () => {
  const db = new DatabaseSync(":memory:");
  applySchemaBootstrap(db);
  const repository = createEmpireHexiteRepository(db);
  const sweep = repository.beginSweep({
    startedAt: "2026-07-18T10:00:00.000Z",
    capsuleEnergyCost: 100,
    empires: [{ entityId: "e1", empireCurrencyTreasury: 100 }],
  });

  repository.failEmpireDiscovery({
    sweepId: sweep.id,
    empireId: "e1",
    error: "HTTP 503",
    updatedAt: "2026-07-18T10:01:00.000Z",
  });

  assert.equal(repository.publishReadySnapshots(sweep.id, "2026-07-18T10:02:00.000Z"), 1);
  assert.deepEqual(repository.snapshotForEmpire("e1"), {
    estimatedEnergyEquivalent: null,
    capsuleEnergyCost: 100,
    capsuleWatchtowerEnergyValue: 1_000,
    energy: { treasury: 100, playerInventories: 0, sharedClaimInventories: 0, total: 100 },
    capsules: { playerInventories: 0, sharedClaimInventories: 0, reserveBuildings: 0, foundry: null, readyTotal: 0 },
    coverage: {
      players: { fresh: 0, reused: 0, missing: 0, total: 0 },
      claims: { fresh: 0, reused: 0, missing: 0, total: 0 },
      foundry: "unavailable",
    },
    status: "error",
    sweepStartedAt: "2026-07-18T10:00:00.000Z",
    calculatedAt: null,
    refreshing: false,
    errors: ["HTTP 503"],
  });
  assert.equal(repository.finishSweepIfComplete(sweep.id, "2026-07-18T10:02:00.000Z"), true);
  db.close();
});

test("Hexite repository rolls back partial manifest and source writes", () => {
  const manifestDb = new DatabaseSync(":memory:");
  applySchemaBootstrap(manifestDb);
  manifestDb.exec(`
    CREATE TRIGGER reject_hexite_target BEFORE INSERT ON empire_hexite_targets
    BEGIN SELECT RAISE(ABORT, 'reject target'); END;
  `);
  const manifestRepository = createEmpireHexiteRepository(manifestDb);
  assert.throws(() => manifestRepository.beginSweep({
    startedAt: "2026-07-18T10:00:00.000Z",
    capsuleEnergyCost: 100,
    empires: [{ entityId: "e1" }],
  }), /reject target/);
  assert.equal(manifestRepository.activeSweep(), null);
  manifestDb.close();

  const sourceDb = new DatabaseSync(":memory:");
  applySchemaBootstrap(sourceDb);
  const sourceRepository = createEmpireHexiteRepository(sourceDb);
  const sweep = sourceRepository.beginSweep({
    startedAt: "2026-07-18T10:00:00.000Z",
    capsuleEnergyCost: 100,
    empires: [{ entityId: "e1" }],
  });
  sourceRepository.completeEmpireDiscovery({
    sweepId: sweep.id,
    empireId: "e1",
    treasury: 0,
    playerIds: ["p1"],
    claimIds: [],
    updatedAt: "2026-07-18T10:01:00.000Z",
  });
  sourceDb.exec(`
    CREATE TRIGGER reject_hexite_source BEFORE INSERT ON empire_hexite_sources
    BEGIN SELECT RAISE(ABORT, 'reject source'); END;
  `);
  assert.throws(() => sourceRepository.completeInventoryTarget({
    sweepId: sweep.id,
    empireId: "e1",
    sourceType: "player",
    sourceId: "p1",
    summary: { energy: 10, capsules: 0, reserveCapsules: 0, inventories: [] },
    updatedAt: "2026-07-18T10:02:00.000Z",
  }), /reject source/);
  assert.equal(sourceRepository.pendingTargets(sweep.id, 10).some((target) => target.sourceId === "p1"), true);
  sourceDb.close();
});

test("Hexite repository deduplicates an inventory entity globally across empire aggregates", () => {
  const db = new DatabaseSync(":memory:");
  applySchemaBootstrap(db);
  const repository = createEmpireHexiteRepository(db);
  const sweep = repository.beginSweep({
    startedAt: "2026-07-18T10:00:00.000Z",
    capsuleEnergyCost: 100,
    empires: [{ entityId: "e1" }, { entityId: "e2" }],
  });
  for (const empireId of ["e1", "e2"]) {
    repository.completeEmpireDiscovery({
      sweepId: sweep.id,
      empireId,
      treasury: 0,
      playerIds: [`${empireId}-player`],
      claimIds: [],
      updatedAt: "2026-07-18T10:01:00.000Z",
    });
    repository.completeInventoryTarget({
      sweepId: sweep.id,
      empireId,
      sourceType: "player",
      sourceId: `${empireId}-player`,
      summary: {
        energy: 10,
        capsules: 1,
        reserveCapsules: 0,
        inventories: [{ entityId: "duplicated-inventory", energy: 10, capsules: 1, reserveCapsules: 0 }],
      },
      updatedAt: "2026-07-18T10:02:00.000Z",
    });
  }
  repository.publishReadySnapshots(sweep.id, "2026-07-18T10:03:00.000Z");
  assert.equal(repository.snapshotForEmpire("e1").estimatedEnergyEquivalent, 1_010);
  assert.equal(repository.snapshotForEmpire("e1").capsuleWatchtowerEnergyValue, 1_000);
  assert.equal(repository.snapshotForEmpire("e2").estimatedEnergyEquivalent, 0);
  db.close();
});

test("Hexite source cache retains raw values when current-sweep ownership deduplication removes them", () => {
  const db = new DatabaseSync(":memory:");
  applySchemaBootstrap(db);
  const repository = createEmpireHexiteRepository(db);
  const firstSweep = repository.beginSweep({
    startedAt: "2026-07-18T10:00:00.000Z",
    capsuleEnergyCost: 100,
    empires: [{ entityId: "e1" }],
  });
  repository.completeEmpireDiscovery({
    sweepId: firstSweep.id,
    empireId: "e1",
    treasury: 0,
    playerIds: ["p1"],
    claimIds: ["c1"],
    updatedAt: "2026-07-18T10:01:00.000Z",
  });
  const duplicatedSummary = {
    energy: 10,
    capsules: 1,
    reserveCapsules: 0,
    inventories: [{ entityId: "moves-between-owners", energy: 10, capsules: 1, reserveCapsules: 0 }],
  };
  repository.completeInventoryTarget({ sweepId: firstSweep.id, empireId: "e1", sourceType: "player", sourceId: "p1", summary: duplicatedSummary, updatedAt: "2026-07-18T10:02:00.000Z" });
  repository.completeInventoryTarget({ sweepId: firstSweep.id, empireId: "e1", sourceType: "claim", sourceId: "c1", summary: duplicatedSummary, updatedAt: "2026-07-18T10:03:00.000Z" });
  repository.publishReadySnapshots(firstSweep.id, "2026-07-18T10:04:00.000Z");
  repository.finishSweepIfComplete(firstSweep.id, "2026-07-18T10:04:00.000Z");

  const secondSweep = repository.beginSweep({
    startedAt: "2026-07-18T16:00:00.000Z",
    capsuleEnergyCost: 100,
    empires: [{ entityId: "e1" }],
  });
  repository.completeEmpireDiscovery({
    sweepId: secondSweep.id,
    empireId: "e1",
    treasury: 0,
    playerIds: [],
    claimIds: ["c1"],
    updatedAt: "2026-07-18T16:01:00.000Z",
  });
  repository.failInventoryTarget({ sweepId: secondSweep.id, sourceType: "claim", sourceId: "c1", error: "HTTP 503", updatedAt: "2026-07-18T16:02:00.000Z" });
  repository.publishReadySnapshots(secondSweep.id, "2026-07-18T16:03:00.000Z");
  assert.equal(repository.snapshotForEmpire("e1").estimatedEnergyEquivalent, 1_010);
  db.close();
});

test("Hexite refresh persists an initial discovery failure for unavailable API state", async () => {
  const db = new DatabaseSync(":memory:");
  applySchemaBootstrap(db);
  const repository = createEmpireHexiteRepository(db);
  const job = createEmpireHexiteRefreshJob({
    repository,
    fetchJson: async () => { throw new Error("BitJita offline"); },
    sleep: async () => {},
  });

  await assert.rejects(job(), /BitJita offline/);
  assert.equal(repository.activeSweep(), null);
  assert.deepEqual(repository.latestBootstrapFailure(), {
    status: "error",
    startedAt: repository.latestBootstrapFailure().startedAt,
    completedAt: repository.latestBootstrapFailure().completedAt,
    lastError: "BitJita offline",
  });
  db.close();
});

test("Hexite request pacing leaves BitJita foreground headroom", async () => {
  let now = 1_000;
  const waits = [];
  const pace = createRequestPacer({
    requestsPerMinute: 150,
    now: () => now,
    sleep: async (milliseconds) => {
      waits.push(milliseconds);
      now += milliseconds;
    },
  });

  await pace(async () => "first");
  await pace(async () => "second");
  await pace(async () => "third");

  assert.deepEqual(waits, [400, 400]);
});

test("Hexite retries honour upstream Retry-After before using the default delay", async () => {
  let attempts = 0;
  const waits = [];
  const value = await runWithRetry(async () => {
    attempts += 1;
    if (attempts === 1) {
      const error = new Error("HTTP 429");
      error.retryAfterMs = 750;
      throw error;
    }
    if (attempts === 2) throw new Error("HTTP 503");
    return "ok";
  }, {
    attempts: 3,
    defaultDelayMs: 100,
    sleep: async (milliseconds) => waits.push(milliseconds),
  });

  assert.equal(value, "ok");
  assert.deepEqual(waits, [750, 100]);
});

test("Hexite refresh job discovers global empire sources and publishes after resumable batches", async () => {
  const db = new DatabaseSync(":memory:");
  applySchemaBootstrap(db);
  const repository = createEmpireHexiteRepository(db);
  const requested = [];
  const responses = new Map([
    ["/parameters", { parameters: { hexiteCapsuleCurrencyCost: 100 } }],
    ["/empires", { empires: [{ entityId: "e1", empireCurrencyTreasury: "100" }] }],
    ["/empires/e1", { empire: { entityId: "e1", empireCurrencyTreasury: "100" }, members: [{ entityId: "p1" }] }],
    ["/empires/e1/claims", { claims: [{ entityId: "c1" }] }],
    ["/players/p1/inventories?q=hexite", { inventories: [{ entityId: "wallet", pockets: [{ contents: { itemId: HEXITE_ENERGY_ITEM_ID, itemType: 0, quantity: 10 } }] }] }],
    ["/claims/c1/inventories", { buildings: [{ entityId: "reserve", buildingDescriptionId: 90001, inventory: [{ contents: { item_id: HEXITE_CAPSULE_CARGO_ID, item_type: "cargo", quantity: 3 } }] }] }],
  ]);
  const runRefresh = createEmpireHexiteRefreshJob({
    repository,
    batchSize: 1,
    fetchJson: async (path) => {
      requested.push(path);
      if (!responses.has(path)) throw new Error(`Unexpected path ${path}`);
      return responses.get(path);
    },
    now: () => new Date("2026-07-18T10:00:00.000Z"),
    sleep: async () => {},
  });

  let result;
  for (let iteration = 0; iteration < 5; iteration += 1) {
    result = await runRefresh();
    if (result.complete) break;
  }

  assert.equal(result.complete, true);
  assert.deepEqual(requested, [
    "/parameters",
    "/empires",
    "/empires/e1",
    "/empires/e1/claims",
    "/players/p1/inventories?q=hexite",
    "/claims/c1/inventories",
  ]);
  const snapshot = repository.snapshotForEmpire("e1");
  assert.equal(snapshot.energy.total, 110);
  assert.equal(snapshot.capsules.readyTotal, 3);
  assert.equal(snapshot.capsuleEnergyCost, 100);
  assert.equal(snapshot.capsuleWatchtowerEnergyValue, 1_000);
  assert.equal(snapshot.estimatedEnergyEquivalent, 3_110);
  db.close();
});
