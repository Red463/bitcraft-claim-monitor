import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { BOT_SECTION_DEFINITIONS } from "../src/components/bot/botSectionState.ts";

const lazy = readFileSync(new URL("../src/components/bot/lazySections.tsx", import.meta.url), "utf8");
const admin = readFileSync(new URL("../src/components/admin/AdminPanel.tsx", import.meta.url), "utf8");
const section = readFileSync(new URL("../src/components/bot/DiscordYouTubeMonitorSection.tsx", import.meta.url), "utf8");
const craftRolesSection = readFileSync(new URL("../src/components/bot/DiscordCraftWatchRolesSection.tsx", import.meta.url), "utf8");

test("bot dashboard exposes YouTube monitor automation section", () => {
  const youtube = BOT_SECTION_DEFINITIONS.find(({ id }) => id === "youtube");
  assert.equal(youtube?.label, "YouTube Monitor");
  assert.equal(youtube?.description, "New videos and announcements");
  assert.match(lazy, /DiscordYouTubeMonitorSection/);
  assert.match(admin, /botSection === "youtube"/);
  assert.match(admin, /channelIdSelect=\{notificationChannelIdSelect\}/);
  assert.match(section, /channelIdSelect\("youtubeVideos"/);
  assert.match(section, /optionalChannelIdSelect/);
  assert.match(section, /Existing videos are marked as seen/);
  assert.match(section, /api\("\/admin\/discord\/youtube"/);
});

test("craft watch role settings expose profession emoji overrides and auto matching", () => {
  assert.match(admin, /updateDiscordCraftEmoji/);
  assert.match(admin, /autoMatchCraftEmojis/);
  assert.match(craftRolesSection, /discoveredEmojis/);
  assert.match(craftRolesSection, /emojiSelect/);
  assert.match(craftRolesSection, /Auto-match/);
});
