import assert from "node:assert/strict";
import test from "node:test";

import { publicNotificationActivityEvent, redactNotificationMetadata } from "../src/server/notificationActivity.mjs";

test("redactNotificationMetadata removes sensitive keys recursively and preserves public metadata", () => {
  const metadata = {
    itemName: "Secret Sentinel",
    itemId: 9001,
    tier: 1,
    discordBotToken: "test-discord-bot-token",
    adminSetupKey: "test-setup-key",
    nested: {
      client_secret: "test-discord-oauth-secret",
      publicLabel: "Visible",
    },
    contributors: [
      { playerName: "Tester", sessionToken: "hidden-session" },
      { playerName: "Builder", quantity: 3 },
    ],
  };

  assert.deepEqual(redactNotificationMetadata(metadata), {
    itemName: "Secret Sentinel",
    itemId: 9001,
    tier: 1,
    nested: { publicLabel: "Visible" },
    contributors: [
      { playerName: "Tester" },
      { playerName: "Builder", quantity: 3 },
    ],
  });
});

test("publicNotificationActivityEvent rewrites metadata_json without mutating the source row", () => {
  const row = {
    id: 1,
    event_type: "market_new_listing",
    summary: "New market listing: Secret Sentinel",
    metadata_json: JSON.stringify({ itemName: "Secret Sentinel", botToken: "test-discord-bot-token" }),
  };

  const result = publicNotificationActivityEvent(row);

  assert.equal(result.id, 1);
  assert.deepEqual(JSON.parse(result.metadata_json), { itemName: "Secret Sentinel" });
  assert.equal(JSON.parse(row.metadata_json).botToken, "test-discord-bot-token");
});
