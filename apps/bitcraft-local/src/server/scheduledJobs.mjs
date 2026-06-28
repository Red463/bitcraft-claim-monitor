function toNumber(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
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

export function nextScheduledRunIso(schedule, from = new Date()) {
  const config = parseScheduledJobSchedule(schedule);
  if (config.frequency === "interval") return new Date(from.getTime() + (toNumber(config.intervalSeconds) || 1800) * 1000).toISOString();
  const [hours, minutes] = config.time.split(":").map((part) => Number(part));
  const next = new Date(from);
  next.setSeconds(0, 0);
  if (config.frequency === "weekly") {
    const dayDelta = (config.dayOfWeek - next.getDay() + 7) % 7;
    next.setDate(next.getDate() + dayDelta);
    next.setHours(hours, minutes, 0, 0);
    if (next <= from) next.setDate(next.getDate() + 7);
    return next.toISOString();
  }
  if (config.frequency === "monthly") {
    next.setDate(config.dayOfMonth);
    next.setHours(hours, minutes, 0, 0);
    if (next <= from) {
      next.setMonth(next.getMonth() + 1, config.dayOfMonth);
      next.setHours(hours, minutes, 0, 0);
    }
    return next.toISOString();
  }
  next.setHours(hours, minutes, 0, 0);
  if (next <= from) next.setDate(next.getDate() + 1);
  return next.toISOString();
}

export function scheduledJobScheduleLabel(schedule) {
  const config = parseScheduledJobSchedule(schedule);
  const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  if (config.frequency === "interval") return `Every ${Math.round((toNumber(config.intervalSeconds) || 1800) / 60)} minutes`;
  if (config.frequency === "weekly") return `Weekly on ${weekdays[config.dayOfWeek]} at ${config.time}`;
  if (config.frequency === "monthly") return `Monthly on day ${config.dayOfMonth} at ${config.time}`;
  return `Daily at ${config.time}`;
}
