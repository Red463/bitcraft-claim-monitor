function toNumber(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function createOperationalHistoryRetentionDryRunJob({
  db,
  readSettings,
  buildRollups,
  runRetention,
  now = () => new Date(),
}) {
  return function runOperationalHistoryRetentionDryRunJob() {
    const current = now();
    const settings = readSettings();
    const rollups = buildRollups(db, { beforeDay: current.toISOString().slice(0, 10), now: current });
    const result = runRetention(db, {
      now: current,
      days: settings.days,
      tables: settings.tables,
      enabled: false,
      dryRun: true,
    });
    return {
      ...result,
      rollups: {
        completedDays: rollups.completedDays.length,
        failedDays: rollups.failedDays.length,
      },
    };
  };
}

export function validScheduleTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value ?? ""));
}

export function parseScheduledJobSchedule(schedule) {
  const raw = String(schedule ?? "").trim();
  if (!raw || raw === "daily_midnight") return { frequency: "daily", time: "00:00", dayOfWeek: 1, dayOfMonth: 1 };
  if (raw.startsWith("interval@")) {
    return { frequency: "interval", intervalSeconds: Math.min(Math.max(Math.floor(toNumber(raw.split("@")[1]) || 1800), 60), 86400), time: "00:00", dayOfWeek: 1, dayOfMonth: 1 };
  }
  const parts = raw.split("@");
  const frequency = ["daily", "weekly", "monthly"].includes(parts[0]) ? parts[0] : "daily";
  if (frequency === "weekly") {
    return { frequency, dayOfWeek: Math.min(6, Math.max(0, Math.floor(toNumber(parts[1]) || 1))), time: validScheduleTime(parts[2]) ? parts[2] : "00:00", dayOfMonth: 1 };
  }
  if (frequency === "monthly") {
    return { frequency, dayOfMonth: Math.min(28, Math.max(1, Math.floor(toNumber(parts[1]) || 1))), time: validScheduleTime(parts[2]) ? parts[2] : "00:00", dayOfWeek: 1 };
  }
  return { frequency: "daily", time: validScheduleTime(parts[1]) ? parts[1] : "00:00", dayOfWeek: 1, dayOfMonth: 1 };
}

export function serializeScheduledJobSchedule(input = {}) {
  const frequency = ["daily", "weekly", "monthly", "interval"].includes(String(input.frequency)) ? String(input.frequency) : "daily";
  const time = validScheduleTime(input.time) ? String(input.time) : "00:00";
  if (frequency === "interval") return `interval@${Math.min(Math.max(Math.floor(toNumber(input.intervalSeconds) || 1800), 60), 86400)}`;
  if (frequency === "weekly") {
    const dayOfWeek = Math.min(6, Math.max(0, Math.floor(toNumber(input.dayOfWeek) || 1)));
    return `weekly@${dayOfWeek}@${time}`;
  }
  if (frequency === "monthly") {
    const dayOfMonth = Math.min(28, Math.max(1, Math.floor(toNumber(input.dayOfMonth) || 1)));
    return `monthly@${dayOfMonth}@${time}`;
  }
  return `daily@${time}`;
}

const ADMIN_SCHEDULER_TIMEZONE = "Europe/London";
const adminSchedulerFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: ADMIN_SCHEDULER_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function adminSchedulerParts(at) {
  return Object.fromEntries(adminSchedulerFormatter.formatToParts(at)
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, Number(part.value)]));
}

function firstAdminSchedulerInstant(year, month, day, hours, minutes) {
  const approximate = Date.UTC(year, month - 1, day, hours, minutes);
  const cursor = new Date(approximate - 2 * 60 * 60 * 1000);
  const limit = approximate + 2 * 60 * 60 * 1000;
  while (cursor.getTime() <= limit) {
    const parts = adminSchedulerParts(cursor);
    if (parts.year === year && parts.month === month && parts.day === day && parts.hour === hours && parts.minute === minutes) {
      return new Date(cursor);
    }
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }
  return null;
}

export function nextScheduledRunIso(schedule, from = new Date()) {
  const config = parseScheduledJobSchedule(schedule);
  if (config.frequency === "interval") return new Date(from.getTime() + (toNumber(config.intervalSeconds) || 1800) * 1000).toISOString();
  const [hours, minutes] = config.time.split(":").map((part) => Number(part));
  const fromParts = adminSchedulerParts(from);
  const localDay = new Date(Date.UTC(fromParts.year, fromParts.month - 1, fromParts.day));
  const searchDays = config.frequency === "monthly" ? 70 : config.frequency === "weekly" ? 9 : 3;
  for (let dayOffset = 0; dayOffset < searchDays; dayOffset += 1) {
    const dayMatches = config.frequency === "weekly"
      ? localDay.getUTCDay() === config.dayOfWeek
      : config.frequency !== "monthly" || localDay.getUTCDate() === config.dayOfMonth;
    if (dayMatches) {
      const candidate = firstAdminSchedulerInstant(
        localDay.getUTCFullYear(),
        localDay.getUTCMonth() + 1,
        localDay.getUTCDate(),
        hours,
        minutes,
      );
      if (candidate && candidate > from) return candidate.toISOString();
    }
    localDay.setUTCDate(localDay.getUTCDate() + 1);
  }
  throw new Error(`Could not find the next ${ADMIN_SCHEDULER_TIMEZONE} occurrence for ${schedule}.`);
}

export function scheduledJobScheduleLabel(schedule) {
  const config = parseScheduledJobSchedule(schedule);
  const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  if (config.frequency === "interval") return `Every ${Math.round((toNumber(config.intervalSeconds) || 1800) / 60)} minutes`;
  if (config.frequency === "weekly") return `Weekly on ${weekdays[config.dayOfWeek]} at ${config.time}`;
  if (config.frequency === "monthly") return `Monthly on day ${config.dayOfMonth} at ${config.time}`;
  return `Daily at ${config.time}`;
}

export function seedScheduledJobs({
  db,
  statements,
  registry,
  now = () => new Date().toISOString(),
  nextRunIso = nextScheduledRunIso,
}) {
  const seededAt = now();
  for (const [key, job] of Object.entries(registry)) {
    statements.upsertScheduledJob.run(key, job.label, job.description, job.schedule, job.enabled ? 1 : 0, nextRunIso(job.schedule), seededAt);
    const row = statements.getScheduledJob.get(key);
    const legacySchedules = Array.isArray(job.legacySchedules) ? job.legacySchedules : [];
    if (row?.schedule !== job.schedule && legacySchedules.includes(row?.schedule)) {
      db.prepare("UPDATE scheduled_jobs SET schedule = ?, next_run_at = ?, updated_at = ? WHERE job_key = ?")
        .run(job.schedule, nextRunIso(job.schedule), seededAt, key);
    } else if (!row?.next_run_at) {
      db.prepare("UPDATE scheduled_jobs SET next_run_at = ?, updated_at = ? WHERE job_key = ?").run(nextRunIso(row?.schedule ?? job.schedule), seededAt, key);
    }
  }
}

export function recoverStaleScheduledJobs({
  statements,
  staleAfterMs = 15 * 60 * 1000,
  now = () => new Date(),
}) {
  const current = now();
  const cutoff = new Date(current.getTime() - staleAfterMs).toISOString();
  const updatedAt = current.toISOString();
  const nextRunAt = current.toISOString();
  const staleAfterMinutes = Math.round(staleAfterMs / 60000);
  const result = statements.resetStaleScheduledJobs.run(
    `Recovered abandoned run after server restart or timeout. The previous run was still marked running for more than ${staleAfterMinutes} minutes.`,
    nextRunAt,
    JSON.stringify({ recoveredAt: updatedAt, staleAfterMinutes }),
    updatedAt,
    cutoff,
  );
  return result.changes;
}

function safeJson(value, fallback = {}) {
  try {
    return JSON.parse(value ?? "");
  } catch {
    return fallback;
  }
}

export function publicScheduledJobRow(row = {}) {
  return {
    key: row.job_key,
    label: row.label,
    description: row.description ?? "",
    schedule: row.schedule,
    scheduleLabel: scheduledJobScheduleLabel(row.schedule),
    scheduleConfig: parseScheduledJobSchedule(row.schedule),
    enabled: Boolean(row.enabled),
    running: Boolean(row.running),
    lastRunAt: row.last_run_at,
    lastSuccessAt: row.last_success_at,
    lastError: row.last_error,
    nextRunAt: row.next_run_at,
    metadata: safeJson(row.metadata_json, {}),
    updatedAt: row.updated_at,
  };
}

export function scheduledJobsStatus({
  enabled,
  statements,
  recoverStaleJobs,
  now = () => new Date(),
}) {
  recoverStaleJobs();
  return {
    enabled,
    serverTime: now().toISOString(),
    jobs: statements.listScheduledJobs.all().map(publicScheduledJobRow),
  };
}
