import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(new URL("../src/components/bot/DiscordCraftPlanReportsSection.tsx", import.meta.url), "utf8");
const notifications = readFileSync(new URL("../src/components/bot/DiscordNotificationsSection.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/styles/discord-admin.css", import.meta.url), "utf8");

test("bot notifications expose independent Craft Planner report rules", () => {
  assert.match(notifications, /DiscordCraftPlanReportsSection/);
  assert.match(component, /Scheduled reports/);
  assert.match(component, /Command access role/);
  assert.match(component, /Timezone/);
  assert.match(component, /Overview|Profession/);
  assert.match(component, /Send test/);
  assert.match(component, /Duplicate/);
  assert.match(component, /Delete/);
});

test("Craft Planner report rules have a narrow responsive layout", () => {
  assert.match(css, /\.discord-craft-plan-rule/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*discord-craft-plan-rule/);
});
