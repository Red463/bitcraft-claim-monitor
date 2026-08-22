import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { createDiscordOutboxLeaser } from "../src/server/discordOutboxLease.mjs";
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
  return { firstDb, secondDb };
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
