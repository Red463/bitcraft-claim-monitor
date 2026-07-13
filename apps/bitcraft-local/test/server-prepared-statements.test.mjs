import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { createPreparedStatements } from "../src/server/preparedStatements.mjs";
import { schemaBootstrapSql } from "../src/server/schemaBootstrap.mjs";
import { applyAdditiveColumnMigrations } from "../src/server/schemaMigrations.mjs";

test("createPreparedStatements prepares critical server statement keys", () => {
  const sqlByKey = [];
  const db = {
    prepare(sql) {
      sqlByKey.push(sql);
      return { sql };
    },
  };

  const statements = createPreparedStatements(db);

  for (const key of [
    "latestSnapshot",
    "upsertListing",
    "insertActivity",
    "getSetting",
    "upsertSetting",
    "insertDiscordAdmin",
    "listDiscordYouTubeChannels",
    "upsertDiscordYouTubeChannel",
    "insertDiscordYouTubeVideo",
    "enqueueDiscordNotification",
    "pendingDiscordNotifications",
    "markDiscordNotificationSent",
    "markDiscordNotificationFailed",
    "claimDiscordCraftPlanReportOccurrence",
    "getDiscordCraftPlanReportOccurrence",
    "deleteDiscordCraftPlanReportOccurrence",
    "pruneDiscordCraftPlanReportOccurrences",
    "setDiscordYouTubeChannelDiscordChannel",
    "insertUserSession",
    "upsertDiscordCraftWatch",
    "dueDiscordTempBans",
  ]) {
    assert.ok(statements[key], `${key} should be prepared`);
  }
  assert.match(statements.latestSnapshot.sql, /FROM snapshots/);
  assert.match(statements.upsertListing.sql, /INSERT INTO market_listings/);
  assert.match(statements.upsertSetting.sql, /INSERT INTO app_settings/);
  assert.match(statements.insertDiscordAdmin.sql, /INSERT INTO admin_users/);
  assert.match(statements.upsertDiscordYouTubeChannel.sql, /INSERT INTO discord_youtube_channels/);
  assert.match(statements.setDiscordYouTubeChannelDiscordChannel.sql, /discord_channel_id/);
  assert.match(statements.insertDiscordYouTubeVideo.sql, /INSERT INTO discord_youtube_videos/);
  assert.match(statements.enqueueDiscordNotification.sql, /INSERT INTO discord_notification_outbox/);
  assert.ok(sqlByKey.length > 70, "expected the server statement bundle to be prepared together");
});

test("Craft Planner occurrence claims can be released before outbox enqueue and reclaimed", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(schemaBootstrapSql);
  applyAdditiveColumnMigrations(db);
  const statements = createPreparedStatements(db);
  const args = ["daily-overview", "2026-07-13@09:00", "2026-07-13T08:00:00.000Z", "2026-07-13T08:01:00.000Z", "2026-07-13T08:01:00.000Z"];

  assert.equal(statements.claimDiscordCraftPlanReportOccurrence.run(...args).changes, 1);
  assert.equal(statements.claimDiscordCraftPlanReportOccurrence.run(...args).changes, 0);
  assert.equal(statements.deleteDiscordCraftPlanReportOccurrence.run(args[0], args[1]).changes, 1);
  assert.equal(statements.claimDiscordCraftPlanReportOccurrence.run(...args).changes, 1);
  db.close();
});
