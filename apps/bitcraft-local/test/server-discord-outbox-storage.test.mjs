import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { createDiscordOutboxLeaser } from "../src/server/discordOutboxLease.mjs";
import { createPreparedStatements } from "../src/server/preparedStatements.mjs";
import {
  applyAdditiveColumnMigrations,
  applyDiscordOutboxLeaseMigration,
  applySchemaIndexStatements,
  schemaIndexStatements,
} from "../src/server/schemaMigrations.mjs";
import { applySchemaBootstrap } from "../src/server/schemaBootstrap.mjs";

test("Discord notification outbox stores, leases, retries, and dedupes events", () => {
  const db = new DatabaseSync(":memory:");
  applySchemaBootstrap(db);
  applyAdditiveColumnMigrations(db);
  applyDiscordOutboxLeaseMigration(db);
  applySchemaIndexStatements(db);
  const statements = createPreparedStatements(db);
  let clock = "2026-06-30T12:00:00.000Z";
  const leaser = createDiscordOutboxLeaser(db, {
    workerId: "storage-test",
    leaseMs: 15_000,
    now: () => new Date(clock),
  });
  const later = "2026-06-30T12:00:05.000Z";

  statements.enqueueDiscordNotification.run("production_started:job-1", "production_started", "Craft started", clock, JSON.stringify({ jobKey: "job-1" }), clock, clock, clock);
  let row = leaser.claimNext({ maxAttempts: 8 });
  assert.equal(row.attempts, 1);
  assert.equal(leaser.markFailed({ id: row.id, leaseToken: row.leaseToken, error: "Discord 500", retryAt: later, finishedAt: later }), true);
  clock = later;
  row = leaser.claimNext({ maxAttempts: 8 });
  assert.equal(row.attempts, 2);
  assert.equal(row.status, "sending");
  assert.equal(leaser.markSent({ id: row.id, leaseToken: row.leaseToken, response: { id: "message-1" }, finishedAt: later }), true);
  assert.deepEqual(statements.discordNotificationOutboxCounts.all().map((row) => ({ ...row })), [{ status: "sent", count: 1 }]);

  statements.enqueueDiscordNotification.run("production_started:job-2", "production_started", "Craft started again", clock, JSON.stringify({ jobKey: "job-2" }), clock, clock, clock);
  row = leaser.claimNext({ maxAttempts: 1 });
  leaser.markFailed({ id: row.id, leaseToken: row.leaseToken, error: "Discord 500", retryAt: later, finishedAt: later });
  assert.deepEqual({ ...db.prepare("SELECT attempts, status FROM discord_notification_outbox WHERE source_key = ?").get("production_started:job-2") }, { attempts: 1, status: "failed" });

  statements.enqueueDiscordNotification.run("production_started:job-2", "production_started", "Craft started again", later, JSON.stringify({ jobKey: "job-2", retry: true }), later, later, later);
  const retried = db.prepare("SELECT attempts, status, last_error FROM discord_notification_outbox WHERE source_key = ?").get("production_started:job-2");
  assert.deepEqual({ ...retried }, { attempts: 0, status: "pending", last_error: null });

  row = leaser.claimNext({ maxAttempts: 8 });
  statements.enqueueDiscordNotification.run("production_started:job-2", "production_started", "Updated while leased", later, "{}", later, later, later);
  assert.deepEqual({ ...db.prepare(`
    SELECT status, attempts, lease_token, locked_by
    FROM discord_notification_outbox
    WHERE source_key = 'production_started:job-2'
  `).get() }, {
    status: "sending",
    attempts: 1,
    lease_token: row.leaseToken,
    locked_by: "storage-test",
  });
  db.close();
});

test("lease columns migrate additively without losing existing pending and failed rows", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE discord_notification_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_key TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL,
      summary TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT NOT NULL,
      locked_at TEXT,
      sent_at TEXT,
      skipped_at TEXT,
      failed_at TEXT,
      last_error TEXT,
      response_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT INTO discord_notification_outbox (
      source_key, event_type, summary, occurred_at, metadata_json, status,
      attempts, next_attempt_at, created_at, updated_at
    ) VALUES
      ('legacy-pending', 'app_update', 'Pending', '2026-06-30T12:00:00.000Z', '{}',
       'pending', 0, '2026-06-30T12:00:00.000Z', '2026-06-30T12:00:00.000Z', '2026-06-30T12:00:00.000Z'),
      ('legacy-failed', 'app_update', 'Failed', '2026-06-30T12:00:01.000Z', '{}',
       'failed', 1, '2026-06-30T12:00:00.000Z', '2026-06-30T12:00:01.000Z', '2026-06-30T12:00:01.000Z');
  `);

  applyDiscordOutboxLeaseMigration(db);
  applySchemaIndexStatements(db, schemaIndexStatements.filter((statement) => statement.includes("discord_notification_outbox")));

  assert.deepEqual(db.prepare(`
    SELECT source_key, status, attempts, locked_at, locked_by, lease_token, lease_expires_at
    FROM discord_notification_outbox
    ORDER BY id
  `).all().map((row) => ({ ...row })), [
    { source_key: "legacy-pending", status: "pending", attempts: 0, locked_at: null, locked_by: null, lease_token: null, lease_expires_at: null },
    { source_key: "legacy-failed", status: "failed", attempts: 1, locked_at: null, locked_by: null, lease_token: null, lease_expires_at: null },
  ]);
  const leaser = createDiscordOutboxLeaser(db, {
    workerId: "migration-test",
    leaseMs: 15_000,
    now: () => new Date("2026-06-30T12:00:02.000Z"),
  });
  assert.equal(leaser.claimNext({ maxAttempts: 8 }).source_key, "legacy-pending");
  assert.equal(leaser.claimNext({ maxAttempts: 8 }).source_key, "legacy-failed");
  assert.equal(db.prepare("PRAGMA index_list(discord_notification_outbox)").all().some((index) => index.name === "idx_discord_notification_outbox_lease"), true);
  db.close();
});

test("duplicate-risk diagnostics include live expiry, recovered expiry, and both canonical interruption messages", () => {
  const db = new DatabaseSync(":memory:");
  applySchemaBootstrap(db);
  applyAdditiveColumnMigrations(db);
  const statements = createPreparedStatements(db);
  const now = "2026-06-30T12:00:00.000Z";
  statements.enqueueDiscordNotification.run("canonical-risk", "canonical_cutover", "Canonical", now, "{}", now, now, now);
  const leaser = createDiscordOutboxLeaser(db, {
    workerId: "diagnostic-test",
    leaseMs: 1_000,
    now: () => new Date(now),
  });
  leaser.claimNext({ maxAttempts: 8 });
  leaser.recoverExpiredLeases("2026-06-30T12:00:01.000Z");
  statements.enqueueDiscordNotification.run("live-expired", "app_update", "Live expired", now, "{}", now, now, now);
  leaser.claimNext({ maxAttempts: 8 });
  db.prepare(`
    INSERT INTO discord_notification_outbox (
      source_key, event_type, summary, occurred_at, metadata_json, status,
      attempts, next_attempt_at, skipped_at, last_error, created_at, updated_at
    ) VALUES
      ('legacy-canonical-risk', 'canonical_cutover', 'Legacy canonical', ?, '{}',
       'skipped', 1, ?, ?,
       'Canonical announcement delivery was interrupted; automatic retry is suppressed', ?, ?),
      ('recovered-expiry-risk', 'app_update', 'Recovered expiry', ?, '{}',
       'failed', 1, ?, NULL,
       'Delivery lease expired before completion; retry may duplicate a Discord request that was already accepted', ?, ?)
  `).run(
    now, now, now, now, now,
    now, now, now, now,
  );

  assert.deepEqual({ ...statements.discordNotificationOutboxDuplicateRisk.get("2026-06-30T12:00:02.000Z") }, {
    potential_duplicate_rows: 4,
    active_leases: 1,
    expired_lease_rows: 2,
    unknown_outcome_rows: 2,
  });
  db.close();
});
