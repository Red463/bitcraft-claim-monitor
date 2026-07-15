import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { BOT_SECTION_DEFINITIONS, BOT_SECTION_GROUPS } from "../src/components/bot/botSectionState.ts";

const nav = readFileSync(new URL("../src/components/bot/BotSectionNav.tsx", import.meta.url), "utf8");

test("Bot navigation groups settings around stable job labels", () => {
  assert.deepEqual(BOT_SECTION_GROUPS, ["Setup", "Automation", "Roles & Onboarding", "Community Content", "Moderation", "Troubleshooting"]);
  assert.deepEqual(new Set(BOT_SECTION_DEFINITIONS.map(({ group }) => group)), new Set(BOT_SECTION_GROUPS));
  assert.deepEqual(BOT_SECTION_DEFINITIONS.map(({ id }) => id), ["setup", "notifications", "youtube", "channels", "roleManager", "roles", "colours", "community", "moderation", "safety", "records", "content", "commands", "tools", "tests", "diagnostics"]);
  assert.match(nav, /BOT_SECTION_DEFINITIONS\.filter/);
});

test("Bot troubleshooting and community tools have distinct job descriptions", () => {
  const byId = Object.fromEntries(BOT_SECTION_DEFINITIONS.map((section) => [section.id, section]));
  assert.equal(byId.content.description, "Polls, RSVPs and event posts");
  assert.equal(byId.tools.description, "Reports and one-off announcements");
  assert.equal(byId.tests.description, "Preview commands before publishing; compare Diagnostics when delivery fails");
  assert.equal(byId.diagnostics.description, "Inspect delivery logs; use Tests to reproduce command issues");
});
