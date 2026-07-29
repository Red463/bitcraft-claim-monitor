type RuntimeHealth = {
  running: boolean;
  source: Record<string, unknown> | null;
  subscription: {
    connected: boolean;
    applied: boolean;
    lastAppliedAt: string | null;
    lastError: string | null;
  };
  lastError: string | null;
  [key: string]: unknown;
};

type PersistedSnapshot = {
  generation: number;
  lastError: string | null;
  provenance: {
    sourceKey: string;
    regionId: string | null;
    database: string | null;
    schemaFingerprint: string | null;
    receivedAt: string;
  };
};

export function runtimeHealthWithPersistedSnapshot(options: {
  runtimeHealth: RuntimeHealth;
  snapshot: PersistedSnapshot | null;
  providerHealth: { running: boolean; lastRefreshAt: string | null } | null;
  now?: Date;
  workerFreshForMs?: number;
}): RuntimeHealth & { persisted?: boolean } {
  if (options.runtimeHealth.running || !options.snapshot) return options.runtimeHealth;
  const now = options.now ?? new Date();
  const workerFreshForMs = options.workerFreshForMs ?? 180_000;
  const lastRefreshMs = Date.parse(options.providerHealth?.lastRefreshAt ?? "");
  const workerRecent = options.providerHealth?.running === true
    && Number.isFinite(lastRefreshMs)
    && now.getTime() - lastRefreshMs <= workerFreshForMs;
  const { provenance } = options.snapshot;
  return {
    ...options.runtimeHealth,
    persisted: true,
    source: {
      sourceKey: provenance.sourceKey,
      regionId: provenance.regionId,
      database: provenance.database,
      schemaFingerprint: provenance.schemaFingerprint,
    },
    subscription: {
      connected: workerRecent,
      applied: true,
      lastAppliedAt: provenance.receivedAt,
      lastError: options.snapshot.lastError,
    },
    lastError: options.snapshot.lastError,
  };
}
