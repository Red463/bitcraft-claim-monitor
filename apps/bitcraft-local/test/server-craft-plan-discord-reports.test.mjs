import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCraftPlanDiscordReport,
  buildCraftPlanDiscordEmbed,
  buildUnavailableCraftPlanDiscordReport,
  craftPlanReportOccurrence,
  dueCraftPlanReportOccurrence,
  discordCraftPlanCommandAllowed,
  validateCraftPlanReportSettings,
  normalizeCraftPlanReportRule,
  nextCraftPlanReportOccurrenceIso,
} from "../src/server/craftPlanDiscordReports.mjs";

const materials = [
  { name: "Rough Wood Log", section: "Forestry", required: 100, available: 40, inProgress: 10, plannedOutput: 0, missing: 50 },
  { name: "Fine Wood Log", section: "Forestry", required: 20, available: 20, inProgress: 0, plannedOutput: 0, missing: 0, hasRecipeUsages: true },
  { name: "Simple Plank", section: "Carpentry", required: 50, available: 10, inProgress: 5, plannedOutput: 0, missing: 35 },
  { name: "Thread", section: "Tailor", sectionOverride: "Tailoring", required: 10, available: 0, inProgress: 0, plannedOutput: 0, missing: 10 },
];

test("craft planner Discord overview reports weighted progress and largest shortages", () => {
  const report = buildCraftPlanDiscordReport({ enabled: true, materials, targets: [{ name: "Township" }], totals: { calculatedAt: "2026-07-13T12:00:00.000Z" } });

  assert.equal(report.state, "ready");
  assert.deepEqual(report.overall, { required: 180, covered: 85, completion: 47.2 });
  assert.deepEqual(report.professions.map(({ name, completion }) => [name, completion]), [
    ["Carpentry", 30],
    ["Forestry", 58.3],
    ["Tailoring", 0],
  ]);
  assert.deepEqual(report.shortages.map(({ name, missing }) => [name, missing]), [
    ["Rough Wood Log", 50],
    ["Simple Plank", 35],
    ["Thread", 10],
  ]);
});

test("craft planner Discord profession reports use canonical taxonomy and ten-item limit", () => {
  const extra = Array.from({ length: 12 }, (_, index) => ({
    name: `Cloth ${index + 1}`,
    section: "Tailor",
    required: index + 1,
    available: 0,
    missing: index + 1,
  }));
  const report = buildCraftPlanDiscordReport({ enabled: true, materials: extra, targets: [{}] }, "tailoring");

  assert.equal(report.title, "Tailoring Progress");
  assert.equal(report.shortages.length, 10);
  assert.equal(report.shortages[0].name, "Cloth 12");
  assert.equal(report.shortages[9].name, "Cloth 3");
});

test("craft planner Discord reports use the same gathered-input taxonomy as the Needs Board", () => {
  const report = buildCraftPlanDiscordReport({
    enabled: true,
    targets: [{}],
    materials: [{ name: "Rough Wood Log", tag: "Wood Log", section: "Carpentry", required: 100, available: 25, missing: 75, recipeUsages: [{}] }],
  }, "forestry");

  assert.equal(report.profession, "Forestry");
  assert.deepEqual(report.overall, { required: 100, covered: 25, completion: 25 });
  assert.equal(report.shortages[0].name, "Rough Wood Log");
});

test("craft planner Discord reports expose disabled, empty, complete, and unknown profession states", () => {
  assert.equal(buildCraftPlanDiscordReport({ enabled: false }).state, "disabled");
  assert.equal(buildCraftPlanDiscordReport({ enabled: true, materials: [], targets: [] }).state, "empty");
  assert.equal(buildCraftPlanDiscordReport({ enabled: true, materials: [{ name: "Log", section: "Forestry", required: 10, available: 10, missing: 0, hasRecipeUsages: true }], targets: [{}] }).state, "complete");
  assert.equal(buildCraftPlanDiscordReport({ enabled: true, materials, targets: [{}] }, "alchemy").state, "unknown_profession");
});

test("craft planner report rules normalize safe daily and weekly schedules", () => {
  assert.deepEqual(normalizeCraftPlanReportRule({
    id: " morning ", enabled: true, reportType: "PROFESSION", profession: "Tailor", channelId: " 123 ", frequency: "weekly", time: "08:30", dayOfWeek: 8,
  }), {
    id: "morning",
    enabled: true,
    reportType: "profession",
    profession: "tailoring",
    channelId: "123",
    frequency: "weekly",
    time: "08:30",
    dayOfWeek: 6,
  });
});

test("craft planner occurrences honor Europe/London daily time across daylight saving", () => {
  const rule = normalizeCraftPlanReportRule({ id: "daily", enabled: true, reportType: "overview", channelId: "123", frequency: "daily", time: "09:00" });
  assert.deepEqual(craftPlanReportOccurrence(rule, "Europe/London", new Date("2026-01-13T09:00:30.000Z")), { key: "2026-01-13@09:00", due: true });
  assert.deepEqual(craftPlanReportOccurrence(rule, "Europe/London", new Date("2026-07-13T08:00:30.000Z")), { key: "2026-07-13@09:00", due: true });
  assert.equal(craftPlanReportOccurrence(rule, "Europe/London", new Date("2026-07-13T09:00:30.000Z")).due, false);
});

test("weekly craft planner occurrences require the configured local weekday", () => {
  const rule = normalizeCraftPlanReportRule({ id: "weekly", enabled: true, reportType: "overview", channelId: "123", frequency: "weekly", time: "09:00", dayOfWeek: 1 });
  assert.equal(craftPlanReportOccurrence(rule, "Europe/London", new Date("2026-07-13T08:00:10.000Z")).due, true);
  assert.equal(craftPlanReportOccurrence(rule, "Europe/London", new Date("2026-07-14T08:00:10.000Z")).due, false);
});

test("next Craft Planner report occurrence is returned as an absolute instant", () => {
  const rule = normalizeCraftPlanReportRule({ id: "daily", enabled: true, reportType: "overview", channelId: "123", frequency: "daily", time: "09:00" });
  assert.equal(nextCraftPlanReportOccurrenceIso(rule, "Europe/London", new Date("2026-07-13T08:00:30.000Z")), "2026-07-14T08:00:00.000Z");
});

test("due Craft Planner occurrence catches a schedule missed during a worker restart", () => {
  const rule = normalizeCraftPlanReportRule({ id: "daily", enabled: true, reportType: "overview", channelId: "123456789012345678", frequency: "daily", time: "09:00" });
  assert.deepEqual(
    dueCraftPlanReportOccurrence(rule, "Europe/London", new Date("2026-07-13T08:17:00.000Z"), new Date("2026-07-13T07:45:00.000Z")),
    { key: "2026-07-13@09:00", due: true, scheduledAt: "2026-07-13T08:00:00.000Z" },
  );
});

test("unavailable Craft Planner reports expose a bounded non-sensitive state", () => {
  const report = buildUnavailableCraftPlanDiscordReport(new Error("fetch https://api.example.test?token=secret failed"));
  assert.equal(report.state, "unavailable");
  assert.equal(report.message, "Craft Planner data is temporarily unavailable. Please try again shortly.");
  assert.doesNotMatch(JSON.stringify(report), /secret|token=/i);
});

test("craft planner Discord embeds stay bounded and suppress mentions", () => {
  const report = buildCraftPlanDiscordReport({ enabled: true, materials, targets: [{}], calculatedAt: "2026-07-13T12:00:00.000Z" });
  const payload = buildCraftPlanDiscordEmbed(report, { dashboardUrl: "https://app.timbersteeltrade.com/?page=planning" });

  assert.equal(payload.allowed_mentions.parse.length, 0);
  assert.equal(payload.embeds.length, 1);
  assert.match(payload.embeds[0].description, /47\.2%/);
  assert.match(payload.embeds[0].description, /Carpentry/);
  assert.match(payload.embeds[0].fields[0].value, /Rough Wood Log.*50/);
  assert.ok(JSON.stringify(payload).length < 6000);
});

test("craft planner command allows the configured role or Discord administrators", () => {
  assert.equal(discordCraftPlanCommandAllowed({ roles: ["role-1"], permissions: "0" }, "role-1"), true);
  assert.equal(discordCraftPlanCommandAllowed({ roles: [], permissions: "8" }, "role-1"), true);
  assert.equal(discordCraftPlanCommandAllowed({ roles: [], permissions: "0" }, "role-1"), false);
  assert.equal(discordCraftPlanCommandAllowed({ roles: [], permissions: "0" }, ""), false);
});

test("craft planner report validation rejects unsafe enabled rules", () => {
  const errors = validateCraftPlanReportSettings({
    timezone: "Not/AZone",
    rules: [
      { id: "same", enabled: true, reportType: "profession", profession: "Unknown", channelId: "", frequency: "daily", time: "99:00" },
      { id: "same", enabled: true, reportType: "overview", channelId: "not-a-channel", frequency: "monthly", time: "09:00" },
    ],
  });
  assert.deepEqual(errors, [
    "Choose a valid IANA timezone.",
    "Report 1 needs a valid profession.",
    "Report 1 needs a Discord channel.",
    "Report 1 needs a valid time.",
    "Report rule IDs must be unique.",
    "Report 2 needs a valid Discord channel.",
    "Report 2 needs a daily or weekly frequency.",
  ]);
});
