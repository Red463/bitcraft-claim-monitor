import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
const interactions = readFileSync(new URL("../src/server/discordCraftPlanInteractions.mjs", import.meta.url), "utf8");

test("server registers and handles the Craft Planner Discord command", () => {
  assert.match(server, /name: "craft-plan"/);
  assert.match(interactions, /discordCraftPlanCommandAllowed/);
  assert.match(server, /command === "craft-plan"/);
  assert.match(interactions, /Craft Planner report command/);
  assert.match(interactions, /type: 5/);
  assert.match(interactions, /messages\/@original/);
});

test("Craft Planner commands acknowledge before calculating and run after the response finishes", () => {
  assert.match(server, /preflightCraftPlanInteraction/);
  assert.match(server, /deferredDiscordInteractionResult/);
  assert.match(server, /editDiscordInteractionOriginal/);
  assert.match(server, /runDiscordTaskAfterResponse\(res, result\.afterResponse\)/);
  assert.match(server, /eventType: "craft_plan_command"/);
  assert.doesNotMatch(server, /Promise\.race\(\[command/);
  assert.doesNotMatch(server, /Deferred Craft Planner report command failed/);
});

test("server dispatches deduplicated scheduled Craft Planner reports", () => {
  assert.match(server, /dispatchScheduledCraftPlanReports/);
  assert.match(server, /claimDiscordCraftPlanReportOccurrence/);
  assert.match(server, /craft_plan_report/);
  assert.match(server, /setInterval\(dispatchScheduledCraftPlanReports, 60 \* 1000\)/);
});

test("server exposes a Craft Planner report test-send endpoint", () => {
  assert.match(server, /\/api\/local\/admin\/discord\/craft-plan-report\/test/);
});
