type RuntimeHealth = {
  running: boolean;
  source: Record<string, unknown> | null;
  subscription: {
    connected: boolean;
    applied: boolean;
    lastAppliedAt: string | null;
    lastError: string | null;
    typedState?: "connected" | "disconnected" | "blocked_by_schema";
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
  providerHealth?: { running: boolean; lastRefreshAt: string | null } | null;
  subscriptionHealth?: {
    runtimeState: "connected" | "disconnected" | "blocked_by_schema";
    connected: boolean;
    updatedAt: string;
  } | null;
  now?: Date;
  workerFreshForMs?: number;
}): RuntimeHealth & { persisted?: boolean } {
  if (options.runtimeHealth.running || !options.snapshot) return options.runtimeHealth;
  const now = options.now ?? new Date();
  const workerFreshForMs = options.workerFreshForMs ?? 180_000;
  const heartbeatMs = Date.parse(options.subscriptionHealth?.updatedAt ?? "");
  const heartbeatRecent = Number.isFinite(heartbeatMs)
    && now.getTime() - heartbeatMs <= workerFreshForMs;
  const typedState = options.subscriptionHealth?.runtimeState ?? "disconnected";
  const typedConnected = typedState === "connected"
    && options.subscriptionHealth?.connected === true
    && heartbeatRecent;
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
      connected: typedConnected,
      applied: true,
      lastAppliedAt: provenance.receivedAt,
      lastError: options.snapshot.lastError,
      typedState,
    },
    lastError: options.snapshot.lastError,
  };
}
