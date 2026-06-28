import assert from "node:assert/strict";
import test from "node:test";

import {
  nextScheduledRunIso,
  parseScheduledJobSchedule,
  scheduledJobScheduleLabel,
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
