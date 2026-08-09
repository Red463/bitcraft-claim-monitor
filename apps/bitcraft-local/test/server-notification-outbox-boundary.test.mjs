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

test("Discord outbox worker delivers canonical cutover rows through the exact no-mentions announcement seam", () => {
  assert.match(server, /canonicalCutoverDiscordDelivery/);
  assert.match(server, /eventType === "canonical_cutover"/);
  assert.match(server, /revision: metadata\.admittedRevision/);
  assert.match(server, /sendDiscordMessage\(delivery\.payload, settings, delivery\.channelId\)/);
  const canonicalBranch = server.slice(
    server.indexOf('if (eventType === "canonical_cutover")'),
    server.indexOf('if (eventType === "craft_plan_report")'),
  );
  assert.doesNotMatch(canonicalBranch, /recordDiscordDeliverySafe/);
  assert.match(server, /eventType !== "canonical_cutover"[^\n]*recordDiscordDeliverySafe/);
  assert.match(server, /claimCanonicalCutoverDelivery\(db, row\.id/);
  assert.match(server, /recoverInterruptedCanonicalCutoverDeliveries\(db/);
  assert.match(server, /canonicalCutoverAttempt[\s\S]*?markDiscordNotificationSkipped/);
});
