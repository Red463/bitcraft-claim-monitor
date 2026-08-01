import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
const productionLifecycle = readFileSync(
  new URL("../src/server/productionLifecycle.mjs", import.meta.url),
  "utf8",
);

test("event-driven Discord notifications are enqueued and delivered by the worker outbox", () => {
  assert.match(server, /enqueueDiscordActivity/);
  assert.match(server, /processDiscordNotificationOutbox/);
  assert.match(server, /setInterval\(processDiscordNotificationOutbox/);
  assert.match(productionLifecycle, /const sourceKey = `production_started:/);
  assert.match(productionLifecycle, /const sourceKey = `production_completed:/);
  assert.match(server, /sourceKey: `youtube_video:/);
  assert.match(server, /sourceKey: `app_update:/);
});

test("Discord notification tests use only the explicit sandbox sender", () => {
  assert.match(server, /manualDiscordSandboxMessage\(payload, settings, requestedChannelId\)/);
  assert.doesNotMatch(server, /sendDiscordActivity\(sample\.eventType/);
});

test("Discord craft notifications pass settings into embed rendering for profession emojis", () => {
  assert.match(server, /discordEmbedForActivity\(eventType, summary, occurredAt, metadata, settings\)/);
});
