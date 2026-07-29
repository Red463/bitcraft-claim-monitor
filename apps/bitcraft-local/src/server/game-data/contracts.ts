export type EntityId = string;
export type DecimalInteger = string;
export type RegionId = string;
export type ItemKind = "item" | "cargo";

export const DOMAIN_KEYS = [
  "claim",
  "members",
  "citizens",
  "players",
  "skills",
  "buildings",
  "inventories",
  "crafts",
  "contributions",
  "construction",
  "research",
  "recruitment",
  "equipment",
  "market",
  "region",
  "empires",
  "layout",
  "deposits",
  "catalogs",
] as const;

export type DomainKey = (typeof DOMAIN_KEYS)[number];
export type Freshness = "live" | "fresh" | "stale" | "unavailable";
export type Confidence = "authoritative" | "joined" | "partial" | "unknown";

export type Provenance = {
  provider: "relay";
  sourceKey: "relay-cache" | "global" | `region:${number}`;
  regionId: RegionId | null;
  database: string | null;
  schemaFingerprint: string | null;
  sourceObservedAt: string | null;
  receivedAt: string;
};

export type DomainEnvelope<T> = {
  data: T | null;
  freshness: Freshness;
  confidence: Confidence;
  ageMs: number | null;
  provenance: Provenance;
  warnings: string[];
};

export type PendingDomainSnapshot<T = unknown> = {
  data: T;
  confidence: Confidence;
  provenance: Provenance;
  warnings: string[];
};

export type DomainSnapshotBatch = {
  claimId: EntityId;
  generation: number;
  domains: Partial<Record<DomainKey, PendingDomainSnapshot>>;
};

export type DomainEvent = {
  claimId: EntityId;
  domain: DomainKey;
  sourceKey: string;
  occurredAt: string;
  data: unknown;
};

export type ProviderConfig = {
  relayBaseUrl: string;
  claimId: EntityId;
  activeRegionIds: RegionId[];
  topologyRefreshMs?: number;
};

export type RefreshRequest = {
  claimId: EntityId;
  domains: DomainKey[];
  reason: "startup" | "scheduled" | "manual";
};

export type RefreshResult = {
  generation: number;
  refreshed: DomainKey[];
  failed: Partial<Record<DomainKey, string>>;
};

export type ProviderHealth = {
  provider: "relay";
  running: boolean;
  topologyReady: boolean;
  cacheReady: boolean;
  generation: number;
  lastRefreshAt: string | null;
  lastError: string | null;
  sources: Record<string, {
    ready: boolean;
    database: string | null;
    schemaFingerprint: string | null;
  }>;
};

export interface ProviderSink {
  commitGeneration(batch: DomainSnapshotBatch): Promise<void>;
  appendEvents(events: DomainEvent[]): Promise<void>;
  markError?(claimId: EntityId, domain: DomainKey, error: string, attemptedAt: string): Promise<void>;
  recordHealth?(health: ProviderHealth, observedAt: string): Promise<void>;
  nextGeneration?(claimId: EntityId): number;
}

export interface GameDataProvider {
  start(config: ProviderConfig, sink: ProviderSink): Promise<void>;
  refresh(request: RefreshRequest): Promise<RefreshResult>;
  health(): ProviderHealth;
  stop(): Promise<void>;
}

export type StoredDomainSnapshot<T = unknown> = PendingDomainSnapshot<T> & {
  generation: number;
  lastError: string | null;
};

export interface CurrentStateReader {
  read(claimId: EntityId, domain: DomainKey): StoredDomainSnapshot | null;
}
