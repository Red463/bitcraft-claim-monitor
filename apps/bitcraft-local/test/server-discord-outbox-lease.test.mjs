import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { Worker } from "node:worker_threads";

import {
  completeDiscordOutboxFailure,
  createDiscordOutboxLeaser,
} from "../src/server/discordOutboxLease.mjs";
import { applySchemaBootstrap } from "../src/server/schemaBootstrap.mjs";
import {
  applyAdditiveColumnMigrations,
  applySchemaIndexStatements,
} from "../src/server/schemaMigrations.mjs";

function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), "discord-outbox-lease-"));
  const databasePath = path.join(directory, "outbox.sqlite");
  const firstDb = new DatabaseSync(databasePath, { timeout: 5_000 });
  applySchemaBootstrap(firstDb);
  applyAdditiveColumnMigrations(firstDb);
  applySchemaIndexStatements(firstDb);
  const secondDb = new DatabaseSync(databasePath, { timeout: 5_000 });
  t.after(() => {
    firstDb.close();
    secondDb.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return { databasePath, firstDb, secondDb };
}

function writerLock(databasePath, clock, postLockClockMs, holdMs = 150) {
  const controlBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  const control = new Int32Array(controlBuffer);
  const worker = new Worker(`
    const { parentPort, workerData } = require("node:worker_threads");
    const { DatabaseSync } = require("node:sqlite");
    const control = new Int32Array(workerData.controlBuffer);
    const clock = new Int32Array(workerData.clockBuffer);
    const db = new DatabaseSync(workerData.databasePath, { timeout: 5000 });
    try {
      db.exec("BEGIN IMMEDIATE");
      Atomics.store(clock, 0, workerData.postLockClockMs);
      Atomics.store(control, 0, 1);
      Atomics.notify(control, 0);
      Atomics.wait(control, 0, 1, workerData.holdMs);
      db.exec("COMMIT");
      db.close();
      parentPort.postMessage({ ok: true });
    } catch (error) {
      try { db.exec("ROLLBACK"); } catch {}
      db.close();
      Atomics.store(control, 0, -1);
      Atomics.notify(control, 0);
      parentPort.postMessage({ ok: false, error: error.message });
    }
  `, {
    eval: true,
    workerData: {
      databasePath,
      controlBuffer,
      clockBuffer: clock.buffer,
      postLockClockMs,
      holdMs,
    },
  });
  const done = new Promise((resolve, reject) => {
    worker.once("message", (message) => message.ok ? resolve() : reject(new Error(message.error)));
    worker.once("error", reject);
  });
  assert.ok(["ok", "not-equal"].includes(Atomics.wait(control, 0, 0, 5_000)));
  assert.equal(Atomics.load(control, 0), 1);
  return done;
}

function enqueue(db, {
  sourceKey,
  eventType = "app_update",
  createdAt = "2026-08-22T09:00:00.000Z",
}) {
  db.prepare(`
    INSERT INTO discord_notification_outbox (
      source_key, event_type, summary, occurred_at, metadata_json, status,
      attempts, next_attempt_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, '{}', 'pending', 0, ?, ?, ?)
  `).run(sourceKey, eventType, sourceKey, createdAt, createdAt, createdAt, createdAt);
}

test("two database workers atomically lease different oldest eligible notifications", (t) => {
  const { firstDb, secondDb } = fixture(t);
  enqueue(firstDb, { sourceKey: "oldest", createdAt: "2026-08-22T09:00:00.000Z" });
  enqueue(firstDb, { sourceKey: "next", createdAt: "2026-08-22T09:00:01.000Z" });
  const now = () => new Date("2026-08-22T09:01:00.000Z");
  const first = createDiscordOutboxLeaser(firstDb, { workerId: "worker-a", leaseMs: 15_000, now });
  const second = createDiscordOutboxLeaser(secondDb, { workerId: "worker-b", leaseMs: 15_000, now });

  const firstClaim = first.claimNext({ maxAttempts: 8 });
  const secondClaim = second.claimNext({ maxAttempts: 8 });

  assert.equal(firstClaim.source_key, "oldest");
  assert.equal(firstClaim.lockedBy, "worker-a");
  assert.equal(firstClaim.lockedAt, "2026-08-22T09:01:00.000Z");
  assert.equal(firstClaim.leaseExpiresAt, "2026-08-22T09:01:15.000Z");
  assert.match(firstClaim.leaseToken, /^[0-9a-f-]{36}$/);
  assert.equal(secondClaim.source_key, "next");
  assert.equal(secondClaim.lockedBy, "worker-b");
  assert.notEqual(secondClaim.leaseToken, firstClaim.leaseToken);
  assert.equal(first.claimNext({ maxAttempts: 8 }), null);
  assert.deepEqual(firstDb.prepare(`
    SELECT source_key, status, attempts
    FROM discord_notification_outbox
    ORDER BY id
  `).all().map((row) => ({ ...row })), [
    { source_key: "oldest", status: "sending", attempts: 1 },
    { source_key: "next", status: "sending", attempts: 1 },
  ]);
});

test("an active lease is not reclaimed, while expiry permits one new attempt and rejects the stale token", (t) => {
  const { firstDb, secondDb } = fixture(t);
  enqueue(firstDb, { sourceKey: "recoverable" });
  let clock = "2026-08-22T09:01:00.000Z";
  const first = createDiscordOutboxLeaser(firstDb, {
    workerId: "worker-a",
    leaseMs: 15_000,
    now: () => new Date(clock),
  });
  const second = createDiscordOutboxLeaser(secondDb, {
    workerId: "worker-b",
    leaseMs: 15_000,
    now: () => new Date(clock),
  });

  const expiredClaim = first.claimNext({ maxAttempts: 8 });
  clock = "2026-08-22T09:01:14.999Z";
  assert.deepEqual(second.recoverExpiredLeases(clock), {
    recovered: 0,
    retryable: 0,
    canonicalSuppressed: 0,
    duplicateRisk: 0,
  });
  assert.equal(second.claimNext({ maxAttempts: 8 }), null);

  clock = "2026-08-22T09:01:15.000Z";
  assert.deepEqual(second.recoverExpiredLeases(clock), {
    recovered: 1,
    retryable: 1,
    canonicalSuppressed: 0,
    duplicateRisk: 1,
  });
  const replacementClaim = second.claimNext({ maxAttempts: 8 });
  assert.equal(replacementClaim.id, expiredClaim.id);
  assert.notEqual(replacementClaim.leaseToken, expiredClaim.leaseToken);
  assert.equal(replacementClaim.attempts, 2);

  assert.equal(first.markSent({
    id: expiredClaim.id,
    leaseToken: expiredClaim.leaseToken,
    response: { id: "stale-message" },
    finishedAt: clock,
  }), false);
  assert.equal(second.markSent({
    id: replacementClaim.id,
    leaseToken: replacementClaim.leaseToken,
    response: { id: "message-2" },
    finishedAt: clock,
  }), true);
  assert.deepEqual({ ...firstDb.prepare(`
    SELECT status, attempts, response_json, lease_token
    FROM discord_notification_outbox
    WHERE id = ?
  `).get(expiredClaim.id) }, {
    status: "sent",
    attempts: 2,
    response_json: '{"id":"message-2"}',
    lease_token: null,
  });
  assert.deepEqual(second.recoverExpiredLeases("2026-08-22T10:00:00.000Z"), {
    recovered: 0,
    retryable: 0,
    canonicalSuppressed: 0,
    duplicateRisk: 0,
  });
  assert.equal(second.claimNext({ maxAttempts: 8 }), null);
});

test("failure and skip completion require the current sending lease without incrementing attempts", (t) => {
  const { firstDb } = fixture(t);
  enqueue(firstDb, { sourceKey: "failure" });
  enqueue(firstDb, { sourceKey: "skip", createdAt: "2026-08-22T09:00:01.000Z" });
  const leaser = createDiscordOutboxLeaser(firstDb, {
    workerId: "worker-a",
    leaseMs: 15_000,
    now: () => new Date("2026-08-22T09:01:00.000Z"),
  });

  const failed = leaser.claimNext({ maxAttempts: 8 });
  assert.equal(leaser.markFailed({
    id: failed.id,
    leaseToken: failed.leaseToken,
    error: "Discord 503",
    retryAt: "2026-08-22T09:02:00.000Z",
    finishedAt: "2026-08-22T09:01:01.000Z",
  }), true);
  const skipped = leaser.claimNext({ maxAttempts: 8 });
  assert.equal(leaser.markSkipped({
    id: skipped.id,
    leaseToken: skipped.leaseToken,
    reason: "Notification disabled",
    finishedAt: "2026-08-22T09:01:02.000Z",
  }), true);

  assert.deepEqual(firstDb.prepare(`
    SELECT source_key, status, attempts, next_attempt_at, last_error,
           lease_token, locked_by, locked_at, lease_expires_at
    FROM discord_notification_outbox
    ORDER BY id
  `).all().map((row) => ({ ...row })), [
    {
      source_key: "failure",
      status: "failed",
      attempts: 1,
      next_attempt_at: "2026-08-22T09:02:00.000Z",
      last_error: "Discord 503",
      lease_token: null,
      locked_by: null,
      locked_at: null,
      lease_expires_at: null,
    },
    {
      source_key: "skip",
      status: "skipped",
      attempts: 1,
      next_attempt_at: "2026-08-22T09:00:01.000Z",
      last_error: "Notification disabled",
      lease_token: null,
      locked_by: null,
      locked_at: null,
      lease_expires_at: null,
    },
  ]);
});

test("an expired canonical cutover lease is suppressed instead of retried", (t) => {
  const { firstDb, secondDb } = fixture(t);
  enqueue(firstDb, { sourceKey: "canonical", eventType: "canonical_cutover" });
  const first = createDiscordOutboxLeaser(firstDb, {
    workerId: "worker-a",
    leaseMs: 15_000,
    now: () => new Date("2026-08-22T09:01:00.000Z"),
  });
  const second = createDiscordOutboxLeaser(secondDb, {
    workerId: "worker-b",
    leaseMs: 15_000,
    now: () => new Date("2026-08-22T09:01:15.000Z"),
  });

  const claim = first.claimNext({ maxAttempts: 8 });
  assert.equal(claim.event_type, "canonical_cutover");
  assert.deepEqual(second.recoverExpiredLeases("2026-08-22T09:01:15.000Z"), {
    recovered: 1,
    retryable: 0,
    canonicalSuppressed: 1,
    duplicateRisk: 1,
  });
  assert.equal(second.claimNext({ maxAttempts: 8 }), null);
  assert.deepEqual({ ...secondDb.prepare(`
    SELECT status, attempts, skipped_at, last_error, lease_token
    FROM discord_notification_outbox
    WHERE id = ?
  `).get(claim.id) }, {
    status: "skipped",
    attempts: 1,
    skipped_at: "2026-08-22T09:01:15.000Z",
    last_error: "Canonical announcement delivery outcome is unknown; automatic retry is suppressed",
    lease_token: null,
  });
});

test("a pre-migration canonical sending row is treated as an interrupted unknown outcome", (t) => {
  const { firstDb } = fixture(t);
  enqueue(firstDb, { sourceKey: "legacy-canonical", eventType: "canonical_cutover" });
  firstDb.prepare(`
    UPDATE discord_notification_outbox
    SET status = 'sending', attempts = 1, locked_at = '2026-08-22T08:59:00.000Z'
    WHERE source_key = 'legacy-canonical'
  `).run();
  const leaser = createDiscordOutboxLeaser(firstDb, {
    workerId: "worker-a",
    leaseMs: 15_000,
    now: () => new Date("2026-08-22T09:01:00.000Z"),
  });

  assert.deepEqual(leaser.recoverExpiredLeases("2026-08-22T09:01:00.000Z"), {
    recovered: 1,
    retryable: 0,
    canonicalSuppressed: 1,
    duplicateRisk: 1,
  });
  assert.deepEqual({ ...firstDb.prepare(`
    SELECT status, attempts, last_error
    FROM discord_notification_outbox
    WHERE source_key = 'legacy-canonical'
  `).get() }, {
    status: "skipped",
    attempts: 1,
    last_error: "Canonical announcement delivery outcome is unknown; automatic retry is suppressed",
  });
});

test("the leased interval covers the configured request timeout and completion margin", (t) => {
  const { firstDb } = fixture(t);
  enqueue(firstDb, { sourceKey: "bounded-request" });
  const requestTimeoutMs = 10_000;
  const completionWriteMarginMs = 5_000;
  const leaser = createDiscordOutboxLeaser(firstDb, {
    workerId: "worker-a",
    leaseMs: requestTimeoutMs + completionWriteMarginMs + 1,
    now: () => new Date("2026-08-22T09:01:00.000Z"),
  });

  const claim = leaser.claimNext({ maxAttempts: 8 });
  assert.ok(
    Date.parse(claim.leaseExpiresAt) - Date.parse(claim.lockedAt)
      > requestTimeoutMs + completionWriteMarginMs,
  );
});

test("a slow multi-recipient delivery renews before every network step and cannot be recovered", (t) => {
  const { firstDb, secondDb } = fixture(t);
  enqueue(firstDb, { sourceKey: "multi-recipient" });
  let clock = "2026-08-22T09:01:00.000Z";
  const owner = createDiscordOutboxLeaser(firstDb, {
    workerId: "worker-a",
    leaseMs: 1_000,
    now: () => new Date(clock),
  });
  const competitor = createDiscordOutboxLeaser(secondDb, {
    workerId: "worker-b",
    leaseMs: 1_000,
    now: () => new Date(clock),
  });
  const claim = owner.claimNext({ maxAttempts: 8 });

  for (const at of [
    "2026-08-22T09:01:00.900Z",
    "2026-08-22T09:01:01.800Z",
    "2026-08-22T09:01:02.700Z",
    "2026-08-22T09:01:03.600Z",
  ]) {
    clock = at;
    assert.equal(owner.renewLease({
      id: claim.id,
      leaseToken: claim.leaseToken,
      leaseMs: 1_000,
      at,
    }), true);
    assert.equal(competitor.recoverExpiredLeases(at).recovered, 0);
    assert.equal(competitor.claimNext({ maxAttempts: 8 }), null);
  }
  assert.equal(owner.renewLease({
    id: claim.id,
    leaseToken: "stale-token",
    leaseMs: 1_000,
    at: clock,
  }), false);
  assert.equal(firstDb.prepare("SELECT lease_expires_at FROM discord_notification_outbox WHERE id = ?").get(claim.id).lease_expires_at, "2026-08-22T09:01:04.600Z");
});

test("renewal samples time only after acquiring the writer lock and installs a full lease", async (t) => {
  const { databasePath, firstDb, secondDb } = fixture(t);
  enqueue(firstDb, { sourceKey: "writer-lock-success" });
  const epoch = Date.parse("2026-08-22T09:01:00.000Z");
  const clock = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
  const now = () => new Date(epoch + Atomics.load(clock, 0));
  const owner = createDiscordOutboxLeaser(firstDb, { workerId: "worker-a", leaseMs: 1_000, now });
  const competitor = createDiscordOutboxLeaser(secondDb, { workerId: "worker-b", leaseMs: 1_000, now });
  const claim = owner.claimNext({ maxAttempts: 8 });
  Atomics.store(clock, 0, 100);
  const lockReleased = writerLock(databasePath, clock, 900);

  assert.equal(owner.renewLease({
    id: claim.id,
    leaseToken: claim.leaseToken,
    leaseMs: 1_000,
    at: "2026-08-22T09:01:00.100Z",
  }), true);
  await lockReleased;
  assert.equal(firstDb.prepare("SELECT lease_expires_at FROM discord_notification_outbox WHERE id = ?").get(claim.id).lease_expires_at, "2026-08-22T09:01:01.900Z");
  assert.equal(competitor.recoverExpiredLeases("2026-08-22T09:01:01.100Z").recovered, 0);
});

test("renewal rejects ownership expired while waiting for the writer lock", async (t) => {
  const { databasePath, firstDb } = fixture(t);
  enqueue(firstDb, { sourceKey: "writer-lock-expired" });
  const epoch = Date.parse("2026-08-22T09:01:00.000Z");
  const clock = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
  const owner = createDiscordOutboxLeaser(firstDb, {
    workerId: "worker-a",
    leaseMs: 1_000,
    now: () => new Date(epoch + Atomics.load(clock, 0)),
  });
  const claim = owner.claimNext({ maxAttempts: 8 });
  Atomics.store(clock, 0, 100);
  const lockReleased = writerLock(databasePath, clock, 1_100);

  assert.equal(owner.renewLease({
    id: claim.id,
    leaseToken: claim.leaseToken,
    leaseMs: 1_000,
    at: "2026-08-22T09:01:00.100Z",
  }), false);
  await lockReleased;
  assert.equal(firstDb.prepare("SELECT lease_expires_at FROM discord_notification_outbox WHERE id = ?").get(claim.id).lease_expires_at, "2026-08-22T09:01:01.000Z");
});

test("renewal rolls back its writer transaction when the post-lock clock fails", (t) => {
  const { firstDb, secondDb } = fixture(t);
  enqueue(firstDb, { sourceKey: "renewal-clock-error" });
  let failClock = false;
  const owner = createDiscordOutboxLeaser(firstDb, {
    workerId: "worker-a",
    leaseMs: 1_000,
    now() {
      if (failClock) throw new Error("clock failed");
      return new Date("2026-08-22T09:01:00.000Z");
    },
  });
  const claim = owner.claimNext({ maxAttempts: 8 });
  failClock = true;
  assert.throws(() => owner.renewLease({
    id: claim.id,
    leaseToken: claim.leaseToken,
    leaseMs: 1_000,
  }), /clock failed/);
  assert.doesNotThrow(() => {
    secondDb.exec("BEGIN IMMEDIATE");
    secondDb.exec("ROLLBACK");
  });
});

test("a stale failure cannot overwrite a craft occurrence completed by the replacement owner", (t) => {
  const { firstDb, secondDb } = fixture(t);
  enqueue(firstDb, { sourceKey: "craft-report" });
  firstDb.prepare(`
    INSERT INTO discord_craft_plan_report_occurrences (
      rule_id, occurrence_key, scheduled_at, status, created_at, updated_at
    ) VALUES ('daily', 'occurrence-1', '2026-08-22T09:00:00.000Z', 'claimed',
              '2026-08-22T09:00:00.000Z', '2026-08-22T09:00:00.000Z')
  `).run();
  let clock = "2026-08-22T09:01:00.000Z";
  const staleWorker = createDiscordOutboxLeaser(firstDb, {
    workerId: "worker-a",
    leaseMs: 1_000,
    now: () => new Date(clock),
  });
  const replacementWorker = createDiscordOutboxLeaser(secondDb, {
    workerId: "worker-b",
    leaseMs: 1_000,
    now: () => new Date(clock),
  });
  const staleClaim = staleWorker.claimNext({ maxAttempts: 8 });
  clock = "2026-08-22T09:01:01.000Z";
  replacementWorker.recoverExpiredLeases(clock);
  const replacementClaim = replacementWorker.claimNext({ maxAttempts: 8 });
  assert.equal(replacementWorker.markSent({
    id: replacementClaim.id,
    leaseToken: replacementClaim.leaseToken,
    response: { id: "replacement-message" },
    finishedAt: clock,
  }), true);
  secondDb.prepare(`
    UPDATE discord_craft_plan_report_occurrences
    SET status = 'sent', discord_message_id = 'replacement-message', updated_at = ?
    WHERE rule_id = 'daily' AND occurrence_key = 'occurrence-1'
  `).run(clock);

  let dependentWrites = 0;
  const completed = completeDiscordOutboxFailure({
    leaser: staleWorker,
    row: staleClaim,
    error: "stale request failed",
    retryAt: "2026-08-22T09:02:00.000Z",
    finishedAt: clock,
    afterCompletion() {
      dependentWrites += 1;
      firstDb.prepare(`
        UPDATE discord_craft_plan_report_occurrences
        SET status = 'failed', last_error = 'stale request failed', updated_at = ?
        WHERE rule_id = 'daily' AND occurrence_key = 'occurrence-1'
      `).run(clock);
    },
  });

  assert.equal(completed, false);
  assert.equal(dependentWrites, 0);
  assert.deepEqual({ ...firstDb.prepare(`
    SELECT status, discord_message_id, last_error
    FROM discord_craft_plan_report_occurrences
    WHERE rule_id = 'daily' AND occurrence_key = 'occurrence-1'
  `).get() }, {
    status: "sent",
    discord_message_id: "replacement-message",
    last_error: null,
  });
});
