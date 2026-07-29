import assert from "node:assert/strict";
import test from "node:test";
import {
  discordDeliveryMode,
  recordedDiscordResponse,
  requireLiveDiscord,
} from "../src/server/discordDeliveryMode.mjs";

test("Discord delivery defaults to record mode", () => {
  assert.equal(discordDeliveryMode({}), "record");
  assert.equal(discordDeliveryMode({ DISCORD_DELIVERY_MODE: "record" }), "record");
  assert.equal(discordDeliveryMode({ DISCORD_DELIVERY_MODE: "live" }), "live");
  assert.equal(discordDeliveryMode({ DISCORD_DELIVERY_MODE: "unexpected" }), "record");
});

test("record mode returns auditable synthetic delivery metadata", () => {
  assert.deepEqual(recordedDiscordResponse("123", { content: "preview" }), {
    id: null,
    channel_id: "123",
    recorded: true,
    payload: { content: "preview" },
  });
});

test("Discord mutations are rejected outside live mode", () => {
  assert.throws(
    () => requireLiveDiscord("record", "register commands"),
    /disabled while Discord delivery mode is record/,
  );
  assert.doesNotThrow(() => requireLiveDiscord("live", "register commands"));
});
