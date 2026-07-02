import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
const embeds = readFileSync(new URL("../src/server/discordEmbeds.mjs", import.meta.url), "utf8");

test("youtube_video Discord events route to announcements with video embeds", () => {
  assert.match(server, /eventType === "youtube_video"/);
  assert.match(server, /settings\.notify\.youtubeVideos/);
  assert.match(server, /settings\.notificationChannels\?\.youtubeVideos \?\? "announcements"/);
  assert.match(server, /resolveDiscordChannelSelection\(settings\.notificationChannels\?\.youtubeVideos \?\? "announcements", settings, settings\.channelId\)/);
  assert.match(server, /youtubeChannelSelection/);
  assert.match(server, /metadata\.discordChannelId/);
  assert.match(server, /discordChannelId: channel\.discord_channel_id/);
  assert.match(embeds, /New YouTube Video/);
  assert.match(embeds, /thumbnailUrl/);
  assert.match(server, /recordDiscordDeliverySafe\(\{ status: "skipped"/);
});

test("saving Discord YouTube settings updates the scheduled poll interval", () => {
  assert.match(server, /youtubePollSeconds/);
  assert.match(server, /updateScheduledJobSettings\.run\(youtubeSchedule/);
});
