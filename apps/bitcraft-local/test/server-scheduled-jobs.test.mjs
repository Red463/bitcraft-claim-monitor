import assert from "node:assert/strict";
import test from "node:test";

import {
  nextScheduledRunIso,
  parseScheduledJobSchedule,
  publicScheduledJobRow,
  recoverStaleScheduledJobs,
  scheduledJobsStatus,
  scheduledJobScheduleLabel,
  seedScheduledJobs,
  serializeScheduledJobSchedule,
  validScheduleTime,
} from "../src/server/scheduledJobs.mjs";

test("scheduled job schedules parse legacy, invalid, and clamped inputs", () => {
  assert.deepEqual(parseScheduledJobSchedule("daily_midnight"), {
    frequency: "daily",
    time: "00:00",
    dayOfWeek: 1,
    dayOfMonth: 1,
  });
  assert.deepEqual(parseScheduledJobSchedule("weekly@9@25:99"), {
    frequency: "weekly",
    dayOfWeek: 6,
    time: "00:00",
    dayOfMonth: 1,
  });
  assert.deepEqual(parseScheduledJobSchedule("monthly@40@03:45"), {
    frequency: "monthly",
    dayOfMonth: 28,
    time: "03:45",
    dayOfWeek: 1,
  });
  assert.deepEqual(parseScheduledJobSchedule("interval@5"), {
    frequency: "interval",
    intervalSeconds: 60,
    time: "00:00",
    dayOfWeek: 1,
    dayOfMonth: 1,
  });
});

test("scheduled job schedules serialize safe dashboard updates", () => {
  assert.equal(validScheduleTime("23:59"), true);
  assert.equal(validScheduleTime("24:00"), false);
  assert.equal(serializeScheduledJobSchedule({ frequency: "daily", time: "07:15" }), "daily@07:15");
  assert.equal(serializeScheduledJobSchedule({ frequency: "weekly", dayOfWeek: -3, time: "12:05" }), "weekly@0@12:05");
  assert.equal(serializeScheduledJobSchedule({ frequency: "monthly", dayOfMonth: 99, time: "99:05" }), "monthly@28@00:00");
  assert.equal(serializeScheduledJobSchedule({ frequency: "interval", intervalSeconds: 100000 }), "interval@86400");
});

test("scheduled job next-run and labels preserve admin scheduler behavior", () => {
  const from = new Date("2026-06-28T10:30:00.000Z");

  assert.equal(nextScheduledRunIso("daily@09:00", from), "2026-06-29T08:00:00.000Z");
  assert.equal(nextScheduledRunIso("weekly@1@03:30", from), "2026-06-29T02:30:00.000Z");
  assert.equal(nextScheduledRunIso("monthly@28@10:00", from), "2026-07-28T09:00:00.000Z");
  assert.equal(nextScheduledRunIso("interval@120", from), "2026-06-28T10:32:00.000Z");

  assert.equal(scheduledJobScheduleLabel("daily@07:15"), "Daily at 07:15");
  assert.equal(scheduledJobScheduleLabel("weekly@2@03:30"), "Weekly on Tuesday at 03:30");
  assert.equal(scheduledJobScheduleLabel("monthly@28@10:00"), "Monthly on day 28 at 10:00");
  assert.equal(scheduledJobScheduleLabel("interval@120"), "Every 2 minutes");
});

test("seedScheduledJobs upserts registry jobs with scheduler metadata", () => {
  const calls = [];
  const statements = {
    upsertScheduledJob: { run: (...args) => calls.push(["upsert", ...args]) },
    getScheduledJob: { get: (key) => (calls.push(["get", key]), { job_key: key, schedule: key === "beta" ? "daily@08:00" : "daily@07:00", next_run_at: "queued" }) },
  };
  const db = { prepare: () => ({ run: (...args) => calls.push(["repair", ...args]) }) };
  const registry = {
    alpha: { label: "Alpha", description: "First job", schedule: "daily@07:00", enabled: true },
    beta: { label: "Beta", description: "Second job", schedule: "daily@08:00", enabled: false },
  };

  seedScheduledJobs({
    db,
    statements,
    registry,
    now: () => "seeded-at",
    nextRunIso: (schedule) => `next:${schedule}`,
  });

  assert.deepEqual(calls, [
    ["upsert", "alpha", "Alpha", "First job", "daily@07:00", 1, "next:daily@07:00", "seeded-at"],
    ["get", "alpha"],
    ["upsert", "beta", "Beta", "Second job", "daily@08:00", 0, "next:daily@08:00", "seeded-at"],
    ["get", "beta"],
  ]);
});

test("seedScheduledJobs repairs jobs missing a next run time", () => {
  const calls = [];
  const statements = {
    upsertScheduledJob: { run: (...args) => calls.push(["upsert", ...args]) },
    getScheduledJob: { get: () => (calls.push(["get"]), { schedule: "weekly@1@00:00", next_run_at: "" }) },
  };
  const db = { prepare: (sql) => ({ run: (...args) => calls.push(["repair", sql, ...args]) }) };

  seedScheduledJobs({
    db,
    statements,
    registry: { catalog: { label: "Catalog", description: "Refresh catalog", schedule: "daily@00:00", enabled: true } },
    now: () => "seeded-at",
    nextRunIso: (schedule) => `next:${schedule}`,
  });

  assert.deepEqual(calls, [
    ["upsert", "catalog", "Catalog", "Refresh catalog", "daily@00:00", 1, "next:daily@00:00", "seeded-at"],
    ["get"],
    ["repair", "UPDATE scheduled_jobs SET next_run_at = ?, updated_at = ? WHERE job_key = ?", "next:weekly@1@00:00", "seeded-at", "catalog"],
  ]);
});
test("recoverStaleScheduledJobs resets abandoned running jobs with deterministic metadata", () => {
  const calls = [];
  const statements = {
    resetStaleScheduledJobs: {
      run: (...args) => {
        calls.push(args);
        return { changes: 3 };
      },
    },
  };

  const changes = recoverStaleScheduledJobs({
    statements,
    staleAfterMs: 30 * 60 * 1000,
    now: () => new Date("2026-06-29T12:00:00.000Z"),
  });

  assert.equal(changes, 3);
  assert.deepEqual(calls, [[
    "Recovered abandoned run after server restart or timeout. The previous run was still marked running for more than 30 minutes.",
    "2026-06-29T12:00:00.000Z",
    JSON.stringify({ recoveredAt: "2026-06-29T12:00:00.000Z", staleAfterMinutes: 30 }),
    "2026-06-29T12:00:00.000Z",
    "2026-06-29T11:30:00.000Z",
  ]]);
});
test("publicScheduledJobRow shapes scheduler database rows defensively", () => {
  assert.deepEqual(publicScheduledJobRow({
    job_key: "recipe_catalog",
    label: "Recipe catalog",
    description: null,
    schedule: "daily@07:15",
    enabled: 1,
    running: 0,
    last_run_at: "last-run",
    last_success_at: "last-success",
    last_error: null,
    next_run_at: "next-run",
    metadata_json: "{\"manual\":true}",
    updated_at: "updated",
  }), {
    key: "recipe_catalog",
    label: "Recipe catalog",
    description: "",
    schedule: "daily@07:15",
    scheduleLabel: "Daily at 07:15",
    scheduleConfig: { frequency: "daily", time: "07:15", dayOfWeek: 1, dayOfMonth: 1 },
    enabled: true,
    running: false,
    lastRunAt: "last-run",
    lastSuccessAt: "last-success",
    lastError: null,
    nextRunAt: "next-run",
    metadata: { manual: true },
    updatedAt: "updated",
  });

  assert.deepEqual(publicScheduledJobRow({ schedule: "interval@120", metadata_json: "not-json" }).metadata, {});
});

test("scheduledJobsStatus recovers stale jobs before returning public status", () => {
  const calls = [];
  const status = scheduledJobsStatus({
    enabled: true,
    statements: {
      recipeCatalogCount: { get: () => (calls.push("count"), { count: "42" }) },
      listScheduledJobs: { all: () => (calls.push("list"), [{ job_key: "job", label: "Job", description: "Desc", schedule: "interval@120", enabled: 0, running: 1, metadata_json: "{}" }]) },
    },
    recoverStaleJobs: () => calls.push("recover"),
    now: () => new Date("2026-06-29T12:34:56.000Z"),
  });

  assert.deepEqual(calls, ["recover", "count", "list"]);
  assert.equal(status.enabled, true);
  assert.equal(status.serverTime, "2026-06-29T12:34:56.000Z");
  assert.equal(status.recipeCatalogCount, 42);
  assert.equal(status.jobs.length, 1);
  assert.equal(status.jobs[0].scheduleLabel, "Every 2 minutes");
  assert.equal(status.jobs[0].running, true);
});