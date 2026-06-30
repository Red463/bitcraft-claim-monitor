import assert from "node:assert/strict";
import test from "node:test";

import { createPreparedStatements } from "../src/server/preparedStatements.mjs";

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
  assert.match(statements.insertDiscordYouTubeVideo.sql, /INSERT INTO discord_youtube_videos/);
  assert.ok(sqlByKey.length > 70, "expected the server statement bundle to be prepared together");
});