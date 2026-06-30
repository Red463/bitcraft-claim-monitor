import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

test("event-driven Discord notifications are enqueued and delivered by the worker outbox", () => {
  assert.match(server, /enqueueDiscordActivity/);
  assert.match(server, /processDiscordNotificationOutbox/);
  assert.match(server, /setInterval\(processDiscordNotificationOutbox/);
  assert.match(server, /sourceKey: `production_started:/);
  assert.match(server, /sourceKey: `production_completed:/);
  assert.match(server, /sourceKey: `youtube_video:/);
  assert.match(server, /sourceKey: `app_update:/);
});

test("Discord notification tests use the same sender gate as real notifications", () => {
  assert.match(server, /sendDiscordActivity\(sample\.eventType/);
  assert.doesNotMatch(server, /sendDiscordMessage\(\{\s*embeds: \[discordEmbedForActivity\(sample\.eventType/);
});
