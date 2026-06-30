import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

test("youtube_video Discord events route to announcements with video embeds", () => {
  assert.match(server, /eventType === "youtube_video"/);
  assert.match(server, /settings\.notify\.youtubeVideos/);
  assert.match(server, /settings\.notificationChannels\?\.youtubeVideos \?\? "announcements"/);
  assert.match(server, /validDiscordId\(selection\) \? selection : settings\.channelId/);
  assert.match(server, /youtubeChannelSelection/);
  assert.match(server, /New YouTube Video/);
  assert.match(server, /thumbnailUrl/);
  assert.match(server, /recordDiscordDeliverySafe\(\{ status: "skipped"/);
});

test("saving Discord YouTube settings updates the scheduled poll interval", () => {
  assert.match(server, /youtubePollSeconds/);
  assert.match(server, /updateScheduledJobSettings\.run\(youtubeSchedule/);
});

