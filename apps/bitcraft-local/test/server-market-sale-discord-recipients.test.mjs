import assert from "node:assert/strict";
import test from "node:test";

import { linkedDiscordRecipientsForMarketSale } from "../src/server/marketSaleDiscordRecipients.mjs";

const accounts = [
  { discord_id: "111", character_status: "approved", character_name: "Modular", character_player_id: "player-1" },
  { discord_id: "222", character_status: "pending", character_name: "Mosswick", character_player_id: "player-2" },
  { discord_id: "333", character_status: "approved", character_name: "Other", character_player_id: "player-3" },
  { discord_id: "111", character_status: "approved", character_name: "Modular", character_player_id: "player-1" },
];

test("market sale DM recipients require an approved linked character match", () => {
  assert.deepEqual(linkedDiscordRecipientsForMarketSale({ owner: "modular" }, accounts), ["111"]);
  assert.deepEqual(linkedDiscordRecipientsForMarketSale({ ownerEntityId: "player-2", owner: "Mosswick" }, accounts), []);
  assert.deepEqual(linkedDiscordRecipientsForMarketSale({ ownerEntityId: "player-3" }, accounts), ["333"]);
  assert.deepEqual(linkedDiscordRecipientsForMarketSale({ owner: "Unknown" }, accounts), []);
});
