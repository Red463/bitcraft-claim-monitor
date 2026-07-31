function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export const domainCollectorDefaults = {
  productionContributions: { label: "Production contribution reconciliation (blocked upstream mapping)", intervalSeconds: 300 },
  marketTrades: { label: "Completed member-sale reconciliation (blocked upstream mapping)", intervalSeconds: 60 },
};

// These are append-only history/deduplication tables owned by the two explicit
// evidence reconcilers. They are deliberately not a current-state cache.
export const reconciliationHistoryTables = {
  productionContributions: ["production_jobs", "production_contributions"],
  marketTrades: ["market_trades"],
};

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

