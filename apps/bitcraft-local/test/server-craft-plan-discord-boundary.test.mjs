import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

test("server registers and handles the Craft Planner Discord command", () => {
  assert.match(server, /name: "craft-plan"/);
  assert.match(server, /discordCraftPlanCommandAllowed/);
  assert.match(server, /command === "craft-plan"/);
  assert.match(server, /Craft Planner report command/);
  assert.match(server, /type: 5/);
  assert.match(server, /messages\/@original/);
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
