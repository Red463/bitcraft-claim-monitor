import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { createPreparedStatements } from "../src/server/preparedStatements.mjs";
import { applyAdditiveColumnMigrations, applySchemaIndexStatements } from "../src/server/schemaMigrations.mjs";
import { applySchemaBootstrap } from "../src/server/schemaBootstrap.mjs";

test("Discord notification outbox stores, retries, and dedupes events", () => {
  const db = new DatabaseSync(":memory:");
  applySchemaBootstrap(db);
  applyAdditiveColumnMigrations(db);
  applySchemaIndexStatements(db);
  const statements = createPreparedStatements(db);
  const now = "2026-06-30T12:00:00.000Z";
  const later = "2026-06-30T12:00:05.000Z";

  statements.enqueueDiscordNotification.run("production_started:job-1", "production_started", "Craft started", now, JSON.stringify({ jobKey: "job-1" }), now, now, now);
  let rows = statements.pendingDiscordNotifications.all(8, now, 10);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].attempts, 0);

  statements.markDiscordNotificationFailed.run(8, later, later, "Discord 500", later, rows[0].id);
  rows = statements.pendingDiscordNotifications.all(8, later, 10);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].attempts, 1);
  assert.equal(rows[0].status, "pending");

  statements.markDiscordNotificationSent.run(later, JSON.stringify({ id: "message-1" }), later, rows[0].id);
  assert.deepEqual(statements.discordNotificationOutboxCounts.all().map((row) => ({ ...row })), [{ status: "sent", count: 1 }]);

  statements.enqueueDiscordNotification.run("production_started:job-2", "production_started", "Craft started again", now, JSON.stringify({ jobKey: "job-2" }), now, now, now);
  rows = statements.pendingDiscordNotifications.all(1, now, 10);
  statements.markDiscordNotificationFailed.run(1, later, later, "Discord 500", later, rows[0].id);
  assert.equal(db.prepare("SELECT attempts, status FROM discord_notification_outbox WHERE source_key = ?").get("production_started:job-2").status, "failed");

  statements.enqueueDiscordNotification.run("production_started:job-2", "production_started", "Craft started again", later, JSON.stringify({ jobKey: "job-2", retry: true }), later, later, later);
  const retried = db.prepare("SELECT attempts, status, last_error FROM discord_notification_outbox WHERE source_key = ?").get("production_started:job-2");
  assert.deepEqual({ ...retried }, { attempts: 0, status: "pending", last_error: null });
});
