import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const nav = readFileSync(new URL("../src/components/bot/BotSectionNav.tsx", import.meta.url), "utf8");
const lazy = readFileSync(new URL("../src/components/bot/lazySections.tsx", import.meta.url), "utf8");
const admin = readFileSync(new URL("../src/components/admin/AdminPanel.tsx", import.meta.url), "utf8");
const section = readFileSync(new URL("../src/components/bot/DiscordYouTubeMonitorSection.tsx", import.meta.url), "utf8");

test("bot dashboard exposes YouTube monitor automation section", () => {
  assert.match(nav, /"youtube", "YouTube Monitor"/);
  assert.match(nav, /New videos and announcements/);
  assert.match(lazy, /DiscordYouTubeMonitorSection/);
  assert.match(admin, /botSection === "youtube"/);
  assert.match(admin, /channelIdSelect=\{notificationChannelIdSelect\}/);
  assert.match(section, /channelIdSelect\("youtubeVideos"/);
  assert.match(section, /api\("\/admin\/discord\/youtube"/);
});

