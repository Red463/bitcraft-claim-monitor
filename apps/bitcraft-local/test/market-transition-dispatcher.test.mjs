import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { createMarketTransitionDispatcher } from "../src/server/marketTransitionDispatcher.mjs";
import {
  compactRelayMarketTransitionEvents,
  createRelayMarketTransitionWriter,
  deriveRelayMarketTransitions,
} from "../src/server/relayMarketTransitions.mjs";
import { createCurrentStateRepository } from "../src/server/game-data/currentStateRepository.ts";
import { applySchemaBootstrap } from "../src/server/schemaBootstrap.mjs";
import {
  applyAdditiveColumnMigrations,
  applyProviderTransitionLeaseMigration,
} from "../src/server/schemaMigrations.mjs";

const claimId = "90071992547409931234";
const observedAt = "2026-08-22T10:00:00.000Z";

function marketSnapshot({ listings, closedListings = [] }) {
  return { claimId, regionId: "19", marketplaces: [], listings, closedListings };
}

const listing = {
  entityId: "90071992547409930001",
  claimEntityId: claimId,
  regionId: "19",
  itemId: "42",
  itemType: "item",
  itemName: "Timber",
  ownerEntityId: "90071992547409930002",
  ownerUsername: "Builder",
  side: "sell",
  quantity: "3",
  price: "9007199254740993",
  timestamp: "2026-08-22T09:55:00.000Z",
};

const previous = marketSnapshot({ listings: [listing] });
const current = marketSnapshot({
  listings: [],
  closedListings: [{
    entityId: "90071992547409930003",
    claimEntityId: claimId,
    regionId: "19",
    ownerEntityId: listing.ownerEntityId,
    itemId: "1",
    itemType: "item",
    quantity: "27021597764222979",
    closureKind: "sale_proceeds",
    timestamp: "2026-08-22T09:59:00.000Z",
  }],
});

function openDatabase(filename) {
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA busy_timeout = 1000");
  applySchemaBootstrap(db);
  applyAdditiveColumnMigrations(db);
  applyProviderTransitionLeaseMigration(db);
  return db;
}

function transitionPayload(generation = 2) {
  const events = compactRelayMarketTransitionEvents(deriveRelayMarketTransitions({
    previous,
    current,
    observedAt,
  }));
  return { version: 1, claimId, generation, observedAt, events };
}

function marketBatch(generation, data) {
  return {
    claimId,
    generation,
    domains: {
      market: {
        data,
        confidence: "authoritative",
        provenance: {
          provider: "relay",
          sourceKey: "region:19",
          regionId: "19",
          database: "relay-region-19",
          schemaFingerprint: "regional-v1",
          sourceObservedAt: null,
          receivedAt: observedAt,
        },
        warnings: [],
      },
    },
  };
}

function createWriter(db, { failActivity = false, processOutbox = () => {} } = {}) {
  const insertActivity = db.prepare(`
    INSERT OR IGNORE INTO activity_events (
      claim_id, event_type, summary, occurred_at, metadata_json, source_key
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);
  const enqueueDiscord = db.prepare(`
    INSERT OR IGNORE INTO discord_notification_outbox (
      source_key, event_type, summary, occurred_at, metadata_json,
      status, attempts, next_attempt_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)
  `);
  return createRelayMarketTransitionWriter(db, {
    processOutbox,
    addActivity(activityClaimId, eventType, summary, eventAt, metadata, sourceKey) {
      if (failActivity) throw new Error("forced activity failure");
      const inserted = Number(insertActivity.run(
        activityClaimId,
        eventType,
        summary,
        eventAt,
        JSON.stringify(metadata),
        sourceKey,
      ).changes) > 0;
      if (inserted) {
        const discordSourceKey = `${eventType}:${activityClaimId}:${sourceKey}`;
        enqueueDiscord.run(
          discordSourceKey,
          eventType,
          summary,
          eventAt,
          JSON.stringify(metadata),
          eventAt,
          eventAt,
          eventAt,
        );
      }
      return inserted;
    },
  });
}

async function commitPendingTransition(repository, generation = 2) {
  return repository.commitGenerationWithTransition(
    marketBatch(generation, current),
    {
      transitionKey: `claim-market:${claimId}:market:${generation}`,
      claimId,
      domain: "market",
      observedAt,
      payload: transitionPayload(generation),
    },
  );
}

test("a committed market edge survives a process stop and dispatches exactly once after restart", async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "bitcraft-market-transition-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, "restart.sqlite");

  const committingDb = openDatabase(filename);
  const committingRepository = createCurrentStateRepository(committingDb);
  await committingRepository.commitGeneration(marketBatch(1, previous));
  const publication = await commitPendingTransition(committingRepository);
  assert.deepEqual(publication, {
    published: true,
    changedDomains: ["market"],
    generation: 2,
  });
  assert.equal(
    committingRepository.read(claimId, "market").generation,
    2,
    "current market publication must commit before side effects",
  );
  const storedPayload = committingRepository.listPendingTransitions(claimId, "market")[0].payload;
  const serializedPayload = JSON.stringify(storedPayload);
  assert.equal(storedPayload.version, 1);
  assert.equal(storedPayload.claimId, claimId);
  assert.equal(storedPayload.generation, 2);
  assert.doesNotMatch(serializedPayload, /previousData|currentData|"raw"|botToken|secret/i);
  committingDb.close();

  const restartedDb = openDatabase(filename);
  let clock = new Date(observedAt);
  const restartedRepository = createCurrentStateRepository(restartedDb, { now: () => clock });
  let discordNetworkKicks = 0;
  const dispatcher = createMarketTransitionDispatcher({
    repository: restartedRepository,
    writer: createWriter(restartedDb, {
      processOutbox: () => { discordNetworkKicks += 1; },
    }),
    workerId: "worker-after-restart",
    leaseMs: 30_000,
    now: () => clock,
  });
  assert.deepEqual(await dispatcher.drain({ claimId, limit: 25 }), {
    claimed: 1,
    processed: 1,
    failed: 0,
  });
  assert.equal(restartedDb.prepare("SELECT COUNT(*) AS count FROM market_events").get().count, 1);
  assert.equal(restartedDb.prepare("SELECT COUNT(*) AS count FROM market_trades").get().count, 1);
  assert.equal(restartedDb.prepare("SELECT COUNT(*) AS count FROM activity_events").get().count, 1);
  assert.equal(restartedDb.prepare("SELECT COUNT(*) AS count FROM discord_notification_outbox").get().count, 1);
  assert.equal(discordNetworkKicks, 0, "dispatch must leave Discord delivery to its leased worker loop");
  assert.equal(restartedRepository.listPendingTransitions(claimId, "market").length, 0);

  assert.deepEqual(await dispatcher.drain({ claimId, limit: 25 }), {
    claimed: 0,
    processed: 0,
    failed: 0,
  });
  assert.deepEqual({ ...restartedDb.prepare(`
    SELECT item_id, item_type, quantity, unit_price, total_price,
           purchaser_entity_id, purchaser_username
    FROM market_trades
  `).get() }, {
    item_id: "42",
    item_type: "item",
    quantity: "3",
    unit_price: "9007199254740993",
    total_price: "27021597764222979",
    purchaser_entity_id: null,
    purchaser_username: null,
  });
  restartedDb.close();
});

test("blank owner display survives restart when the stable owner entity id is present", async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "bitcraft-market-owner-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, "blank-owner.sqlite");
  const blankOwnerListing = { ...listing, ownerUsername: "" };
  const blankOwnerPrevious = marketSnapshot({ listings: [blankOwnerListing] });
  const blankOwnerCurrent = marketSnapshot({
    listings: [],
    closedListings: current.closedListings,
  });

  const committingDb = openDatabase(filename);
  const committingRepository = createCurrentStateRepository(committingDb);
  await committingRepository.commitGeneration(marketBatch(1, blankOwnerPrevious));
  const events = compactRelayMarketTransitionEvents(deriveRelayMarketTransitions({
    previous: blankOwnerPrevious,
    current: blankOwnerCurrent,
    observedAt,
  }));
  await committingRepository.commitGenerationWithTransition(
    marketBatch(2, blankOwnerCurrent),
    {
      transitionKey: `claim-market:${claimId}:market:2`,
      claimId,
      domain: "market",
      observedAt,
      payload: { version: 1, claimId, generation: 2, observedAt, events },
    },
  );
  committingDb.close();

  const restartedDb = openDatabase(filename);
  const clock = new Date(observedAt);
  const restartedRepository = createCurrentStateRepository(restartedDb, { now: () => clock });
  const dispatcher = createMarketTransitionDispatcher({
    repository: restartedRepository,
    writer: createWriter(restartedDb),
    workerId: "blank-owner-worker",
    leaseMs: 30_000,
    now: () => clock,
  });
  assert.deepEqual(await dispatcher.drain({ claimId, limit: 25 }), {
    claimed: 1,
    processed: 1,
    failed: 0,
  });
  assert.deepEqual({ ...restartedDb.prepare(`
    SELECT owner, owner_entity_id FROM market_events
  `).get() }, {
    owner: "",
    owner_entity_id: listing.ownerEntityId,
  });
  assert.deepEqual({ ...restartedDb.prepare(`
    SELECT seller_username, seller_entity_id FROM market_trades
  `).get() }, {
    seller_username: "",
    seller_entity_id: listing.ownerEntityId,
  });
  assert.equal(restartedDb.prepare("SELECT COUNT(*) AS count FROM activity_events").get().count, 1);
  assert.equal(restartedDb.prepare("SELECT COUNT(*) AS count FROM discord_notification_outbox").get().count, 1);
  assert.deepEqual(await dispatcher.drain({ claimId, limit: 25 }), {
    claimed: 0,
    processed: 0,
    failed: 0,
  });
  assert.equal(restartedDb.prepare("SELECT COUNT(*) AS count FROM market_events").get().count, 1);
  restartedDb.close();
});

test("transition leases exclude a second dispatcher and recover after expiry without stale-token acknowledgement", async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "bitcraft-market-lease-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, "lease.sqlite");
  const firstDb = openDatabase(filename);
  const secondDb = openDatabase(filename);
  let clock = new Date("2026-08-22T10:00:00.000Z");
  const first = createCurrentStateRepository(firstDb, { now: () => clock });
  const second = createCurrentStateRepository(secondDb, { now: () => clock });
  await commitPendingTransition(first);

  const firstLease = first.claimPendingTransition({
    claimId,
    domain: "market",
    workerId: "worker-one",
    leaseMs: 1_000,
    at: "2026-08-22T10:00:00.000Z",
  });
  assert.ok(firstLease?.leaseToken);
  assert.equal(second.claimPendingTransition({
    claimId,
    domain: "market",
    workerId: "worker-two",
    leaseMs: 1_000,
    at: "2026-08-22T10:00:00.000Z",
  }), null);

  clock = new Date("2026-08-22T10:00:01.001Z");
  assert.equal(second.recoverExpiredTransitionLeases("2026-08-22T10:00:01.001Z"), 1);
  const recoveredLease = second.claimPendingTransition({
    claimId,
    domain: "market",
    workerId: "worker-two",
    leaseMs: 1_000,
    at: "2026-08-22T10:00:01.001Z",
  });
  assert.ok(recoveredLease?.leaseToken);
  assert.notEqual(recoveredLease.leaseToken, firstLease.leaseToken);
  assert.equal(first.recordTransitionError({
    transitionKey: firstLease.transitionKey,
    leaseToken: firstLease.leaseToken,
    error: "stale worker must not overwrite the active lease",
    retryAt: "2026-08-22T10:05:00.000Z",
  }), false);
  assert.equal(
    second.listPendingTransitions(claimId, "market")[0].leaseToken,
    recoveredLease.leaseToken,
  );
  assert.equal(first.ackTransition({
    transitionKey: firstLease.transitionKey,
    leaseToken: firstLease.leaseToken,
  }), false);
  assert.equal(second.ackTransition({
    transitionKey: recoveredLease.transitionKey,
    leaseToken: recoveredLease.leaseToken,
  }), true);

  firstDb.close();
  secondDb.close();
});

test("transition claim and recovery use the post-lock clock instead of a stale caller instant", async () => {
  const db = openDatabase(":memory:");
  let clock = new Date("2026-08-22T10:00:00.500Z");
  const repository = createCurrentStateRepository(db, { now: () => clock });
  await commitPendingTransition(repository);

  const lease = repository.claimPendingTransition({
    claimId,
    domain: "market",
    workerId: "post-lock-worker",
    leaseMs: 1_000,
    at: "2026-08-22T10:00:00.000Z",
  });
  assert.equal(lease.lockedAt, "2026-08-22T10:00:00.500Z");
  assert.equal(lease.leaseExpiresAt, "2026-08-22T10:00:01.500Z");

  clock = new Date("2026-08-22T10:00:01.000Z");
  assert.equal(repository.renewTransitionLease({
    transitionKey: lease.transitionKey,
    leaseToken: "stale-token",
    leaseMs: 1_000,
    at: "2026-08-22T10:00:00.800Z",
  }), false);
  assert.equal(repository.renewTransitionLease({
    transitionKey: lease.transitionKey,
    leaseToken: lease.leaseToken,
    leaseMs: 1_000,
    at: "2026-08-22T10:00:00.800Z",
  }), true);
  assert.equal(
    repository.listPendingTransitions(claimId, "market")[0].leaseExpiresAt,
    "2026-08-22T10:00:02.000Z",
  );

  clock = new Date("2026-08-22T10:00:02.100Z");
  assert.equal(
    repository.recoverExpiredTransitionLeases("2026-08-22T10:00:00.800Z"),
    1,
  );
  assert.equal(repository.ackTransition({
    transitionKey: lease.transitionKey,
    leaseToken: lease.leaseToken,
  }), false);
  db.close();
});

test("default transition retry grows exponentially and caps at five minutes", async () => {
  const db = openDatabase(":memory:");
  let clock = new Date(observedAt);
  const repository = createCurrentStateRepository(db, { now: () => clock });
  await commitPendingTransition(repository);
  const dispatcher = createMarketTransitionDispatcher({
    repository,
    writer: createWriter(db, { failActivity: true }),
    workerId: "retry-worker",
    leaseMs: 30_000,
    now: () => clock,
  });
  const expectedDelays = [5, 10, 20, 40, 80, 160, 300];
  for (const expectedSeconds of expectedDelays) {
    const failedAt = clock.getTime();
    assert.equal((await dispatcher.drain({ claimId, limit: 25 })).failed, 1);
    const retryAt = new Date(repository.listPendingTransitions(claimId, "market")[0].updatedAt);
    assert.equal((retryAt.getTime() - failedAt) / 1_000, expectedSeconds);
    clock = retryAt;
  }
  db.close();
});

test("dispatcher rolls back every derived effect and retries with bounded exponential delay", async () => {
  const db = openDatabase(":memory:");
  let clock = new Date(observedAt);
  const repository = createCurrentStateRepository(db, { now: () => clock });
  await commitPendingTransition(repository);
  const failingDispatcher = createMarketTransitionDispatcher({
    repository,
    writer: createWriter(db, { failActivity: true }),
    workerId: "failing-worker",
    leaseMs: 30_000,
    now: () => clock,
    retryPolicy: (attempt) => Math.min(300_000, 1_000 * (2 ** (attempt - 1))),
  });

  assert.deepEqual(await failingDispatcher.drain({ claimId, limit: 99 }), {
    claimed: 1,
    processed: 0,
    failed: 1,
  });
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM market_events").get().count, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM market_trades").get().count, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM activity_events").get().count, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM discord_notification_outbox").get().count, 0);
  const pending = repository.listPendingTransitions(claimId, "market")[0];
  assert.equal(pending.attempts, 1);
  assert.match(pending.lastError, /forced activity failure/);
  assert.equal(pending.leaseToken, null);

  clock = new Date("2026-08-22T10:00:00.999Z");
  const recoveredDispatcher = createMarketTransitionDispatcher({
    repository,
    writer: createWriter(db),
    workerId: "replacement-worker",
    leaseMs: 30_000,
    now: () => clock,
  });
  assert.equal((await recoveredDispatcher.drain({ claimId, limit: 25 })).claimed, 0);
  clock = new Date("2026-08-22T10:00:01.000Z");
  assert.deepEqual(await recoveredDispatcher.drain({ claimId, limit: 25 }), {
    claimed: 1,
    processed: 1,
    failed: 0,
  });
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM market_events").get().count, 1);
  db.close();
});

test("a final lease-token acknowledgement failure rolls back every inserted effect", async () => {
  const db = openDatabase(":memory:");
  let clock = new Date(observedAt);
  const repository = createCurrentStateRepository(db, { now: () => clock });
  await commitPendingTransition(repository);
  const ackFailingRepository = {
    ...repository,
    ackTransition(input) {
      assert.equal(repository.ackTransition(input), true);
      return false;
    },
  };
  const dispatcher = createMarketTransitionDispatcher({
    repository: ackFailingRepository,
    writer: createWriter(db),
    workerId: "ack-failure-worker",
    leaseMs: 30_000,
    now: () => clock,
  });

  assert.deepEqual(await dispatcher.drain({ claimId, limit: 25 }), {
    claimed: 1,
    processed: 0,
    failed: 1,
  });
  for (const table of [
    "market_events",
    "market_trades",
    "activity_events",
    "discord_notification_outbox",
  ]) {
    assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count, 0);
  }
  const pending = repository.listPendingTransitions(claimId, "market");
  assert.equal(pending.length, 1);
  assert.equal(pending[0].attempts, 1);
  assert.equal(pending[0].leaseToken, null);
  assert.match(pending[0].lastError, /lease was lost before acknowledgement/);
  db.close();
});

test("pre-version-1 snapshot payload is retried without replaying any effects", async () => {
  const db = openDatabase(":memory:");
  let clock = new Date(observedAt);
  const repository = createCurrentStateRepository(db, { now: () => clock });
  await repository.commitGenerationWithTransition(
    marketBatch(2, current),
    {
      transitionKey: `claim-market:${claimId}:market:2`,
      claimId,
      domain: "market",
      observedAt,
      payload: {
        version: 0,
        claimId,
        generation: 2,
        observedAt,
        previousData: previous,
        currentData: current,
      },
    },
  );
  const dispatcher = createMarketTransitionDispatcher({
    repository,
    writer: createWriter(db),
    workerId: "pre-v1-worker",
    leaseMs: 30_000,
    now: () => clock,
  });

  assert.deepEqual(await dispatcher.drain({ claimId, limit: 25 }), {
    claimed: 1,
    processed: 0,
    failed: 1,
  });
  for (const table of [
    "market_events",
    "market_trades",
    "activity_events",
    "discord_notification_outbox",
  ]) {
    assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count, 0);
  }
  let pending = repository.listPendingTransitions(claimId, "market");
  assert.equal(pending.length, 1);
  assert.equal(pending[0].attempts, 1);
  assert.match(pending[0].lastError, /version 1/);

  clock = new Date("2026-08-22T10:00:05.000Z");
  assert.deepEqual(await dispatcher.drain({ claimId, limit: 25 }), {
    claimed: 1,
    processed: 0,
    failed: 1,
  });
  pending = repository.listPendingTransitions(claimId, "market");
  assert.equal(pending[0].attempts, 2);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM market_events").get().count, 0);
  db.close();
});
