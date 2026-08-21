import assert from "node:assert/strict";
import test from "node:test";

import { unavailableDiscordDiscovery } from "../src/server/discordDiscoveryAvailability.mjs";

test("disabled Discord discovery is a complete non-error envelope", () => {
  assert.deepEqual(unavailableDiscordDiscovery("token_missing", "Add a bot token in Setup."), {
    available: false,
    reason: "token_missing",
    message: "Add a bot token in Setup.",
    guild: null,
    bot: null,
    channels: [],
    roles: [],
    emojis: [],
    members: [],
    memberCount: 0,
    memberCountAvailable: false,
    memberCountError: "Add a bot token in Setup.",
  });
});
