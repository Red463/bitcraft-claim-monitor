import { relayWebSocketUri } from "./globalCatalogRuntime.ts";
import {
  RelayMapResourceRegionSession,
  type MapResourceSnapshot,
} from "./mapResourceRegionSession.ts";
import { discoverRelayTopology, type RelayTopology } from "./topology.ts";

type BindingManifest = Parameters<RelayMapResourceRegionSession["start"]>[0]["manifest"];
type RegionSession = Pick<RelayMapResourceRegionSession, "start" | "subscribe" | "unsubscribe" | "health" | "stop">;
type RegionSessionFactory = (options: ConstructorParameters<typeof RelayMapResourceRegionSession>[0]) => RegionSession;
type SnapshotWaiter = { timer: unknown; resolve: (snapshot: MapResourceSnapshot | null) => void };
type ResourceEntry = {
  resourceId: string;
  leases: number;
  snapshot: MapResourceSnapshot | null;
  nextGeneration: number;
  idleTimer: unknown | null;
  waiters: Set<SnapshotWaiter>;
  failure: string | null;
};
type RegionEntry = {
  regionId: string;
  pinned: boolean;
  configured: boolean;
  session: RegionSession | null;
  resources: Map<string, ResourceEntry>;
  idleTimer: unknown | null;
  reconnectTimer: unknown | null;
  reconnectAttempts: number;
  failure: string | null;
  schemaUnavailable: boolean;
};

export type MapResourceLeaseState = "loading" | "live" | "stale" | "unavailable";

export type MapResourceLease = {
  key: string;
  state(): { status: MapResourceLeaseState; snapshot: MapResourceSnapshot | null; warning: string | null };
  waitForSnapshot(timeoutMs: number): Promise<MapResourceSnapshot | null>;
  release(): Promise<void>;
};

export type MapResourceRuntimeHealth = {
  configuredRegionIds: string[];
  pinnedRegionIds: string[];
  coldStartsInWindow: number;
  regions: Array<{
    regionId: string;
    pinned: boolean;
    resourceCount: number;
    leaseCount: number;
    failure: string | null;
    subscription: {
      connected: boolean;
      applied: boolean;
      stage: "idle" | "connecting" | "subscribed" | "applied" | "partial" | "error" | "stopped";
      rowCount: number;
      firstGenerationLatencyMs: number | null;
      lastAppliedAt: string | null;
      lastError: string | null;
    } | null;
  }>;
};

type Dependencies = {
  manifest: BindingManifest;
  onGeneration?: (snapshot: MapResourceSnapshot) => void;
  discoverTopology?: (baseUrl: string) => Promise<RelayTopology>;
  createSession?: RegionSessionFactory;
  now?: () => number;
  setTimer?: (callback: () => void, delayMs: number) => unknown;
  clearTimer?: (timer: unknown) => void;
  resourceIdleMs?: number;
  regionIdleMs?: number;
  maxRegions?: number;
  maxResourceTypesPerRegion?: number;
  coldStartWindowMs?: number;
  maxColdStartsPerWindow?: number;
  reconnectDelayMs?: (attempt: number) => number;
};

function decimal(value: unknown, label: string): string {
  const normalized = String(value ?? "").trim();
  if (!/^\d+$/.test(normalized)) throw new TypeError(`${label} must be a decimal integer`);
  return BigInt(normalized).toString();
}

function sortedRegions(values: unknown[]): string[] {
  return [...new Set(values.map((value) => decimal(value, "Map resource region id")))]
    .sort((left, right) => BigInt(left) < BigInt(right) ? -1 : BigInt(left) > BigInt(right) ? 1 : 0);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function mapResourceScopeKey(regionId: string, resourceId: string): string {
  return `${decimal(regionId, "Map resource region id")}|resource:${decimal(resourceId, "Map resource id")}`;
}

export class RelayMapResourceRuntime {
  readonly #manifest: BindingManifest;
  readonly #onGeneration: (snapshot: MapResourceSnapshot) => void;
  readonly #discoverTopology: (baseUrl: string) => Promise<RelayTopology>;
  readonly #createSession: RegionSessionFactory;
  readonly #now: () => number;
  readonly #setTimer: (callback: () => void, delayMs: number) => unknown;
  readonly #clearTimer: (timer: unknown) => void;
  readonly #resourceIdleMs: number;
  readonly #regionIdleMs: number;
  readonly #maxRegions: number;
  readonly #maxResourceTypesPerRegion: number;
  readonly #coldStartWindowMs: number;
  readonly #maxColdStartsPerWindow: number;
  readonly #reconnectDelayMs: (attempt: number) => number;
  #config: { relayBaseUrl: string; activeRegionIds: string[]; primaryRegionId: string } | null = null;
  #regions = new Map<string, RegionEntry>();
  #opening = new Map<string, Promise<RegionEntry>>();
  #coldStarts: number[] = [];
  #stopped = false;

  constructor(dependencies: Dependencies) {
    this.#manifest = dependencies.manifest;
    this.#onGeneration = dependencies.onGeneration ?? (() => {});
    this.#discoverTopology = dependencies.discoverTopology ?? discoverRelayTopology;
    this.#createSession = dependencies.createSession ?? ((options) => new RelayMapResourceRegionSession(options));
    this.#now = dependencies.now ?? Date.now;
    this.#setTimer = dependencies.setTimer ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.#clearTimer = dependencies.clearTimer ?? ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>));
    this.#resourceIdleMs = dependencies.resourceIdleMs ?? 60_000;
    this.#regionIdleMs = dependencies.regionIdleMs ?? 60_000;
    this.#maxRegions = dependencies.maxRegions ?? 4;
    this.#maxResourceTypesPerRegion = dependencies.maxResourceTypesPerRegion ?? 16;
    this.#coldStartWindowMs = dependencies.coldStartWindowMs ?? 60_000;
    this.#maxColdStartsPerWindow = dependencies.maxColdStartsPerWindow ?? 64;
    this.#reconnectDelayMs = dependencies.reconnectDelayMs
      ?? ((attempt) => Math.min(30_000, 1_000 * 2 ** Math.max(0, attempt - 1)));
  }

  async reconcile(input: { relayBaseUrl: string; primaryRegionId: string; activeRegionIds: string[] }): Promise<void> {
    const primaryRegionId = decimal(input.primaryRegionId, "Map resource primary region id");
    const activeRegionIds = sortedRegions([...input.activeRegionIds, primaryRegionId]);
    this.#stopped = false;
    this.#config = { relayBaseUrl: String(input.relayBaseUrl).replace(/\/+$/, ""), primaryRegionId, activeRegionIds };
    for (const entry of this.#regions.values()) {
      const wasPinned = entry.pinned;
      entry.configured = activeRegionIds.includes(entry.regionId);
      entry.pinned = entry.regionId === primaryRegionId;
      if (!wasPinned && entry.pinned) this.#cancelRegionIdleClose(entry);
      if (!entry.configured && this.#leaseCount(entry) === 0) await this.#closeRegion(entry);
      else if (wasPinned && !entry.pinned && entry.resources.size === 0 && this.#leaseCount(entry) === 0) this.#scheduleRegionIdleClose(entry);
    }
    const primary = await this.#ensureRegion(primaryRegionId);
    primary.pinned = true;
  }

  async acquire(input: { regionId: string; resourceId: string }): Promise<MapResourceLease> {
    const config = this.#config;
    if (!config) throw new Error("Relay map resource runtime is not configured");
    const regionId = decimal(input.regionId, "Map resource region id");
    const resourceId = decimal(input.resourceId, "Map resource id");
    if (!config.activeRegionIds.includes(regionId)) throw new Error(`Relay map resource region ${regionId} is not configured`);
    const region = await this.#ensureRegion(regionId);
    if (region.idleTimer != null) {
      this.#clearTimer(region.idleTimer);
      region.idleTimer = null;
    }
    let resource = region.resources.get(resourceId);
    if (!resource) {
      if (region.resources.size >= this.#maxResourceTypesPerRegion) {
        throw new Error(`Relay map resource capacity ${this.#maxResourceTypesPerRegion} is exhausted for region ${regionId}`);
      }
      this.#recordColdStart();
      resource = { resourceId, leases: 0, snapshot: null, nextGeneration: 1, idleTimer: null, waiters: new Set(), failure: region.failure };
      region.resources.set(resourceId, resource);
      await this.#subscribe(region, resource);
      if (!region.session && !region.schemaUnavailable) this.#scheduleRestart(region);
    }
    if (resource.idleTimer != null) {
      this.#clearTimer(resource.idleTimer);
      resource.idleTimer = null;
    }
    resource.leases += 1;
    return this.#lease(region, resource);
  }

  #lease(region: RegionEntry, resource: ResourceEntry): MapResourceLease {
    let released = false;
    return {
      key: mapResourceScopeKey(region.regionId, resource.resourceId),
      state: () => {
        const warning = resource.failure ?? region.failure;
        if (resource.snapshot) return { status: warning ? "stale" : "live", snapshot: resource.snapshot, warning };
        return { status: warning ? "unavailable" : "loading", snapshot: null, warning };
      },
      waitForSnapshot: (timeoutMs) => {
        if (resource.snapshot) return Promise.resolve(resource.snapshot);
        const delay = Number.isFinite(timeoutMs) && timeoutMs >= 0 ? timeoutMs : 0;
        return new Promise((resolve) => {
          const waiter: SnapshotWaiter = { timer: null, resolve };
          waiter.timer = this.#setTimer(() => {
            resource.waiters.delete(waiter);
            resolve(null);
          }, delay);
          resource.waiters.add(waiter);
        });
      },
      release: async () => {
        if (released) return;
        released = true;
        resource.leases = Math.max(0, resource.leases - 1);
        if (resource.leases === 0) {
          resource.idleTimer = this.#setTimer(() => { void this.#expireResource(region, resource); }, this.#resourceIdleMs);
        }
      },
    };
  }

  async #ensureRegion(regionId: string): Promise<RegionEntry> {
    const existing = this.#regions.get(regionId);
    if (existing) return existing;
    const opening = this.#opening.get(regionId);
    if (opening) return opening;
    const open = this.#openRegion(regionId);
    this.#opening.set(regionId, open);
    try { return await open; } finally { this.#opening.delete(regionId); }
  }

  async #openRegion(regionId: string): Promise<RegionEntry> {
    if (this.#regions.size >= this.#maxRegions) throw new Error(`Relay map resource region capacity ${this.#maxRegions} is exhausted`);
    const entry: RegionEntry = {
      regionId, pinned: this.#config?.primaryRegionId === regionId,
      configured: this.#config?.activeRegionIds.includes(regionId) ?? false,
      session: null, resources: new Map(), idleTimer: null, reconnectTimer: null,
      reconnectAttempts: 0, failure: null, schemaUnavailable: false,
    };
    this.#regions.set(regionId, entry);
    await this.#startSession(entry);
    return entry;
  }

  async #startSession(entry: RegionEntry): Promise<void> {
    const config = this.#config;
    if (!config || this.#stopped || entry.schemaUnavailable) return;
    let session: RegionSession | null = null;
    try {
      const topology = await this.#discoverTopology(config.relayBaseUrl);
      const source = topology.regions.get(entry.regionId);
      if (!source?.ready || !source.schemaFingerprint) throw new Error(`Relay map resource region ${entry.regionId} source is unavailable`);
      session = this.#createSession({
        onSnapshot: (snapshot) => this.#acceptSnapshot(entry, session!, snapshot),
        onFailure: (error) => this.#failRegion(entry, session!, error),
      });
      entry.session = session;
      await session.start({
        uri: relayWebSocketUri(config.relayBaseUrl, source.port), database: source.database,
        schemaFingerprint: source.schemaFingerprint, manifest: this.#manifest,
        generation: this.#nextRegionGeneration(entry), regionId: entry.regionId,
      });
      for (const resource of entry.resources.values()) await this.#subscribe(entry, resource);
    } catch (error) {
      if (entry.session === session) entry.session = null;
      entry.failure = errorMessage(error);
      if (/schema.*mismatch/i.test(entry.failure)) entry.schemaUnavailable = true;
      else this.#scheduleRestart(entry);
    }
  }

  async #subscribe(entry: RegionEntry, resource: ResourceEntry): Promise<void> {
    if (!entry.session || entry.schemaUnavailable) {
      resource.failure = entry.failure;
      return;
    }
    try {
      await entry.session.subscribe(resource.resourceId, resource.nextGeneration);
      resource.failure = null;
    } catch (error) {
      resource.failure = errorMessage(error);
      this.#failRegion(entry, entry.session, resource.failure);
    }
  }

  #acceptSnapshot(entry: RegionEntry, session: RegionSession, snapshot: MapResourceSnapshot) {
    if (this.#stopped || entry.session !== session || snapshot.regionId !== entry.regionId) return;
    const resource = entry.resources.get(snapshot.resourceId);
    if (!resource) return;
    resource.snapshot = snapshot;
    resource.nextGeneration = Math.max(resource.nextGeneration, snapshot.generation + 1);
    resource.failure = null;
    entry.failure = null;
    entry.schemaUnavailable = false;
    entry.reconnectAttempts = 0;
    for (const waiter of resource.waiters) {
      this.#clearTimer(waiter.timer);
      waiter.resolve(snapshot);
    }
    resource.waiters.clear();
    this.#onGeneration(snapshot);
  }

  #failRegion(entry: RegionEntry, session: RegionSession, error: string) {
    if (this.#stopped || entry.session !== session) return;
    entry.failure = error;
    for (const resource of entry.resources.values()) resource.failure = error;
    if (/schema.*mismatch/i.test(error)) {
      entry.schemaUnavailable = true;
      return;
    }
    this.#scheduleRestart(entry);
  }

  #scheduleRestart(entry: RegionEntry) {
    if (entry.reconnectTimer != null || this.#stopped || (!entry.pinned && entry.resources.size === 0)) return;
    entry.reconnectAttempts += 1;
    entry.reconnectTimer = this.#setTimer(async () => {
      entry.reconnectTimer = null;
      await this.#restart(entry);
    }, this.#reconnectDelayMs(entry.reconnectAttempts));
  }

  async #restart(entry: RegionEntry) {
    if (this.#regions.get(entry.regionId) !== entry || this.#stopped) return;
    const previous = entry.session;
    entry.session = null;
    await previous?.stop();
    await this.#startSession(entry);
  }

  async #expireResource(entry: RegionEntry, resource: ResourceEntry) {
    if (entry.resources.get(resource.resourceId) !== resource || resource.leases > 0) return;
    resource.idleTimer = null;
    entry.session?.unsubscribe(resource.resourceId);
    for (const waiter of resource.waiters) {
      this.#clearTimer(waiter.timer);
      waiter.resolve(null);
    }
    resource.waiters.clear();
    entry.resources.delete(resource.resourceId);
    if (!entry.pinned && entry.resources.size === 0) this.#scheduleRegionIdleClose(entry);
  }

  #scheduleRegionIdleClose(entry: RegionEntry) {
    if (entry.idleTimer != null) return;
    let timer: unknown = null;
    timer = this.#setTimer(() => {
      if (entry.idleTimer !== timer) return;
      entry.idleTimer = null;
      void this.#closeRegion(entry);
    }, this.#regionIdleMs);
    entry.idleTimer = timer;
  }

  #cancelRegionIdleClose(entry: RegionEntry) {
    if (entry.idleTimer == null) return;
    this.#clearTimer(entry.idleTimer);
    entry.idleTimer = null;
  }

  async #closeRegion(entry: RegionEntry) {
    if (this.#regions.get(entry.regionId) !== entry || entry.pinned || this.#leaseCount(entry) > 0) return;
    if (entry.idleTimer != null) this.#clearTimer(entry.idleTimer);
    if (entry.reconnectTimer != null) this.#clearTimer(entry.reconnectTimer);
    entry.idleTimer = null;
    entry.reconnectTimer = null;
    this.#regions.delete(entry.regionId);
    await entry.session?.stop();
  }

  #recordColdStart() {
    const minimum = this.#now() - this.#coldStartWindowMs;
    this.#coldStarts = this.#coldStarts.filter((startedAt) => startedAt > minimum);
    if (this.#coldStarts.length >= this.#maxColdStartsPerWindow) throw new Error(`Relay map resource cold-start limit ${this.#maxColdStartsPerWindow} is exhausted`);
    this.#coldStarts.push(this.#now());
  }

  #nextRegionGeneration(entry: RegionEntry): number {
    return Math.max(1, ...[...entry.resources.values()].map((resource) => resource.nextGeneration));
  }

  #leaseCount(entry: RegionEntry): number {
    return [...entry.resources.values()].reduce((total, resource) => total + resource.leases, 0);
  }

  health(): MapResourceRuntimeHealth {
    const minimum = this.#now() - this.#coldStartWindowMs;
    this.#coldStarts = this.#coldStarts.filter((startedAt) => startedAt > minimum);
    const regions = [...this.#regions.values()].sort((left, right) => BigInt(left.regionId) < BigInt(right.regionId) ? -1 : 1);
    return {
      configuredRegionIds: [...(this.#config?.activeRegionIds ?? [])],
      pinnedRegionIds: regions.filter((entry) => entry.pinned).map((entry) => entry.regionId),
      coldStartsInWindow: this.#coldStarts.length,
      regions: regions.map((entry) => ({
        regionId: entry.regionId, pinned: entry.pinned, resourceCount: entry.resources.size,
        leaseCount: this.#leaseCount(entry), failure: entry.failure,
        subscription: entry.session ? this.#healthSummary(entry.session.health()) : null,
      })),
    };
  }

  #healthSummary(health: ReturnType<RegionSession["health"]>) {
    return {
      connected: health.connected,
      applied: health.applied,
      stage: health.stage,
      rowCount: health.rowCount,
      firstGenerationLatencyMs: health.firstGenerationLatencyMs,
      lastAppliedAt: health.lastAppliedAt,
      lastError: health.lastError,
    };
  }

  async stop(): Promise<void> {
    this.#stopped = true;
    const entries = [...this.#regions.values()];
    this.#regions.clear();
    this.#config = null;
    for (const entry of entries) {
      if (entry.idleTimer != null) this.#clearTimer(entry.idleTimer);
      if (entry.reconnectTimer != null) this.#clearTimer(entry.reconnectTimer);
      for (const resource of entry.resources.values()) {
        if (resource.idleTimer != null) this.#clearTimer(resource.idleTimer);
        for (const waiter of resource.waiters) {
          this.#clearTimer(waiter.timer);
          waiter.resolve(null);
        }
        resource.waiters.clear();
      }
      await entry.session?.stop();
    }
    await Promise.allSettled(this.#opening.values());
    this.#opening.clear();
  }
}
