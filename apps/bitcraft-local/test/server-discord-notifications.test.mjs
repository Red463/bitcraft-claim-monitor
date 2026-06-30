import assert from "node:assert/strict";
import test from "node:test";

import { discordChannelForEvent, resolveDiscordChannelSelection } from "../src/server/discordNotifications.mjs";

const rawChannelId = "123456789012345678";
const settings = {
  channelId: "111111111111111111",
  channels: {
    notifications: "222222222222222222",
    announcements: "333333333333333333",
    carpentry: "444444444444444444",
  },
  craftChannels: {
    carpentry: "555555555555555555",
  },
  notificationChannels: {
    appUpdates: rawChannelId,
    marketSales: "notifications",
    productionStarted: "profession",
    productionCompleted: rawChannelId,
    youtubeVideos: rawChannelId,
  },
};

test("resolveDiscordChannelSelection accepts named keys and raw Discord channel IDs", () => {
  assert.equal(resolveDiscordChannelSelection("notifications", settings), "222222222222222222");
  assert.equal(resolveDiscordChannelSelection(rawChannelId, settings), rawChannelId);
  assert.equal(resolveDiscordChannelSelection("missing", settings), "111111111111111111");
});

test("discordChannelForEvent resolves raw channel IDs for every notification family", () => {
  assert.equal(discordChannelForEvent("app_update", {}, settings), rawChannelId);
  assert.equal(discordChannelForEvent("youtube_video", {}, settings), rawChannelId);
  assert.equal(discordChannelForEvent("market_sale_confirmed", {}, settings), "222222222222222222");
  assert.equal(discordChannelForEvent("production_completed", { professionKey: "carpentry" }, settings), rawChannelId);
  assert.equal(discordChannelForEvent("production_started", { professionKey: "carpentry" }, settings), "555555555555555555");
});
