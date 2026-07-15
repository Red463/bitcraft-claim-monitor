import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const nav = readFileSync(new URL("../src/components/bot/BotSectionNav.tsx", import.meta.url), "utf8");

test("Bot navigation groups settings around stable job labels", () => {
  for (const group of ["Setup", "Automation", "Roles & Onboarding", "Community Content", "Moderation", "Troubleshooting"]) {
    assert.match(nav, new RegExp(`"${group.replace("&", "&")}"`));
  }
  for (const key of ["setup", "notifications", "youtube", "channels", "roleManager", "roles", "colours", "community", "moderation", "safety", "records", "content", "commands", "tools", "tests", "diagnostics"]) {
    assert.match(nav, new RegExp(`\\["${key}"`), `section id ${key} must remain stable`);
  }
});

test("Bot troubleshooting and community tools have distinct job descriptions", () => {
  assert.match(nav, /\["content", "Posts & Events"[^\n]+"Polls, RSVPs and event posts"/);
  assert.match(nav, /\["tools", "Community Tools"[^\n]+"Reports and one-off announcements"/);
  assert.match(nav, /\["tests", "Command Tests"[^\n]+"Preview commands before publishing; compare Diagnostics when delivery fails"/);
  assert.match(nav, /\["diagnostics", "Delivery Diagnostics"[^\n]+"Inspect delivery logs; use Tests to reproduce command issues"/);
});
