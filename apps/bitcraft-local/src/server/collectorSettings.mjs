function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export const domainCollectorDefaults = {};

export const reconciliationHistoryTables = {};

export function normalizeCollectorSettings(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(Object.entries(domainCollectorDefaults).map(([key, defaults]) => {
    const saved = source[key] && typeof source[key] === "object" ? source[key] : {};
    return [key, {
      label: defaults.label,
      enabled: saved.enabled !== false,
      intervalSeconds: Math.min(Math.max(toNumber(saved.intervalSeconds ?? saved.intervalMs / 1000) || defaults.intervalSeconds, 15), 3600),
    }];
  }));
}

function configuredReconciliationKeys(settings = {}) {
  return Object.keys(domainCollectorDefaults).filter((key) => Object.hasOwn(settings, key));
}

export function reconciliationCollectorStatuses(settings, statuses = {}) {
  return Object.fromEntries(
    configuredReconciliationKeys(settings)
      .filter((key) => Object.hasOwn(statuses, key))
      .map((key) => [key, statuses[key]]),
  );
}

export function applyReconciliationSchedule(settings, statuses = {}, nextRunAt) {
  for (const key of configuredReconciliationKeys(settings)) {
    if (!Object.hasOwn(statuses, key)) continue;
    statuses[key] = { ...statuses[key], nextRunAt };
  }
  return statuses;
}

