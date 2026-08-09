import type { DomainSnapshotBatch } from "./contracts.ts";
import { relayWebSocketUri } from "./globalCatalogRuntime.ts";
import {
  RelayRegionClaimsSession,
  type RegionalClaimsSnapshot,
} from "./regionClaimsSession.ts";
import { discoverRelayTopology, type RelayTopology } from "./topology.ts";

type BindingManifest = Parameters<RelayRegionClaimsSession["start"]>[0]["manifest"];
type CurrentStateRepository = {
  nextGeneration(claimId: string): number;
  commitGeneration(batch: DomainSnapshotBatch): Promise<void> | void;
  markError?(claimId: string, domain: "region-claims", error: string, attemptedAt: string): Promise<void> | void;
  recordSubscriptionHealth?(health: {
    sourceKey: `region:${number}`;
    domain: "region-claims";
    generation: number;
    connected: boolean;
    applyDurationMs?: number | null;
    reconnects?: number;
    malformedRows?: number;
    lastError?: string | null;
  }, observedAt: string): Promise<void> | void;
};
type RegionClaimsSession = {
  start(config: Parameters<RelayRegionClaimsSession["start"]>[0]): Promise<void>;
  health(): ReturnType<RelayRegionClaimsSession["health"]>;
  stop(): Promise<void>;
};
type SessionFactory = (
  options: ConstructorParameters<typeof RelayRegionClaimsSession>[0],
) => RegionClaimsSession;
type RuntimeDependencies = {
  manifest: BindingManifest;
  currentStateRepository: CurrentStateRepository;
  discoverTopology?: (baseUrl: string) => Promise<RelayTopology>;
  createSession?: SessionFactory;
  now?: () => Date;
  topologyRefreshMs?: number;
  reconnectDelayMs?: (failureCount: number) => number;
  setTimer?: (callback: () => void, delayMs: number) => unknown;
  clearTimer?: (timer: unknown) => void;
};
type RegionSource = {
  sourceKey: `region:${number}`;
  regionId: string;
  database: string;
  schemaFingerprint: string;
  uri: string;
};
const RECONNECT_BASE_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000] as const;

function defaultReconnectDelayMs(failureCount: number): number {
  const attempt = Math.max(1, Math.trunc(failureCount));
  const base = RECONNECT_BASE_DELAYS_MS[Math.min(attempt - 1, RECONNECT_BASE_DELAYS_MS.length - 1)];
  return Math.round(base * (0.8 + (Math.random() * 0.4)));
}

function decimalInteger(value: unknown, label: string): string {
  const normalized = String(value ?? "").trim();
  if (!/^\d+$/.test(normalized)) throw new TypeError(`${label} must be a decimal integer`);
  return normalized;
}

export class RelayRegionClaimsRuntime {
  readonly #manifest: BindingManifest;
  readonly #currentStateRepository: CurrentStateRepository;
  readonly #discoverTopology: (baseUrl: string) => Promise<RelayTopology>;
  readonly #createSession: SessionFactory;
  readonly #now: () => Date;
  readonly #topologyRefreshMs: number;
  readonly #reconnectDelayMs: (failureCount: number) => number;
  readonly #setTimer: (callback: () => void, delayMs: number) => unknown;
  readonly #clearTimer: (timer: unknown) => void;
  #session: RegionClaimsSession | null = null;
  #relayBaseUrl: string | null = null;
  #claimId: string | null = null;
  #regionId: string | null = null;
  #sessionEpoch = 0;
  #commitTail: Promise<void> = Promise.resolve();
  #source: RegionSource | null = null;
  #lastError: string | null = null;
  #lastTopologyCheckAt = 0;
  #reconnects = 0;
  #lastGeneration = 0;
  #connectionFailures = 0;
  #reconnectTimer: unknown = null;
  #reconnecting = false;
  #stopped = false;

  constructor(dependencies: RuntimeDependencies) {
    this.#manifest = dependencies.manifest;
    this.#currentStateRepository = dependencies.currentStateRepository;
    this.#discoverTopology = dependencies.discoverTopology ?? discoverRelayTopology;
    this.#createSession = dependencies.createSession
      ?? ((options) => new RelayRegionClaimsSession(options));
    this.#now = dependencies.now ?? (() => new Date());
    this.#topologyRefreshMs = Math.max(1_000, dependencies.topologyRefreshMs ?? 60_000);
    this.#reconnectDelayMs = dependencies.reconnectDelayMs ?? defaultReconnectDelayMs;
    this.#setTimer = dependencies.setTimer ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.#clearTimer = dependencies.clearTimer ?? ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>));
  }

  async start(config: { relayBaseUrl: string; claimId: string; regionId: string }): Promise<void> {
    if (this.#session) throw new Error("Relay regional-claims runtime is already started");
    this.#relayBaseUrl = config.relayBaseUrl.replace(/\/+$/, "");
    this.#claimId = decimalInteger(config.claimId, "Relay regional-claims claim id");
    this.#stopped = false;
    try {
      await this.#startSession(config.regionId);
    } catch (error) {
      await this.#recordError(error);
      throw error;
    }
  }

  async reconcile(config: { claimId?: string; regionId: string; force?: boolean }): Promise<void> {
    const claimId = decimalInteger(config.claimId ?? this.#claimId, "Relay regional-claims claim id");
    const regionId = decimalInteger(config.regionId, "Relay regional-claims region id");
    const sameScope = this.#session && this.#claimId === claimId && this.#regionId === regionId;
    const health = this.#session?.health();
    const healthy = sameScope
      && health?.connected
      && health.applied
      && !health.lastError
      && !this.#lastError;
    const applying = sameScope
      && health?.connected
      && !health.applied
      && !health.lastError;
    const topologyDue = this.#now().getTime() - this.#lastTopologyCheckAt >= this.#topologyRefreshMs;
    if (applying && !config.force) return;
    if (healthy && !config.force && !topologyDue) return;
    if (healthy) {
      try {
        const discovered = await this.#discoverSource(regionId);
        if (this.#sameSource(discovered)) {
          this.#lastError = null;
          await this.#persistSubscriptionHealth();
          return;
        }
        this.#reconnecting = true;
        this.#sessionEpoch += 1;
        try {
          await this.#session?.stop();
          await this.#commitTail;
          this.#session = null;
          this.#claimId = claimId;
          await this.#startSession(regionId, discovered);
        } finally {
          this.#reconnecting = false;
        }
        return;
      } catch (error) {
        await this.#recordOperationalError(error);
        throw error;
      }
    }
    if (sameScope) {
      const failure = health?.lastError ?? "Relay regional-claims subscription disconnected.";
      if (!config.force) {
        this.#scheduleReconnect(failure);
        return;
      }
      this.#cancelReconnect();
      await this.#recordError(failure, claimId);
      this.#connectionFailures += 1;
      this.#reconnects += 1;
    }
    this.#reconnecting = true;
    this.#sessionEpoch += 1;
    try {
      await this.#session?.stop();
      await this.#commitTail;
      this.#session = null;
      this.#claimId = claimId;
      await this.#startSession(regionId);
    } catch (error) {
      await this.#recordError(error, claimId);
      throw error;
    } finally {
      this.#reconnecting = false;
    }
  }

  async #discoverSource(regionId: string) {
    const relayBaseUrl = this.#relayBaseUrl;
    if (!relayBaseUrl) throw new Error("Relay regional-claims runtime is not configured");
    const topology = await this.#discoverTopology(relayBaseUrl);
    this.#lastTopologyCheckAt = this.#now().getTime();
    const region = topology.regions.get(regionId);
    if (!region?.ready || !region.schemaFingerprint) {
      throw new Error(`Relay region ${regionId} source is not ready or has no schema fingerprint`);
    }
    return {
      sourceKey: `region:${regionId}` as `region:${number}`,
      regionId,
      database: region.database,
      schemaFingerprint: region.schemaFingerprint,
      uri: relayWebSocketUri(relayBaseUrl, region.port),
    };
  }

  #sameSource(source: RegionSource): boolean {
    return this.#source?.regionId === source.regionId
      && this.#source.database === source.database
      && this.#source.schemaFingerprint === source.schemaFingerprint
      && this.#source.uri === source.uri;
  }

  async #startSession(
    regionIdValue: string,
    discoveredSource?: RegionSource,
  ): Promise<void> {
    const relayBaseUrl = this.#relayBaseUrl;
    const claimId = this.#claimId;
    if (!relayBaseUrl || !claimId) throw new Error("Relay regional-claims runtime is not configured");
    const regionId = decimalInteger(regionIdValue, "Relay regional-claims region id");
    let openingSession: RegionClaimsSession | null = null;
    try {
      const source = discoveredSource ?? await this.#discoverSource(regionId);
      const sessionEpoch = this.#sessionEpoch + 1;
      this.#sessionEpoch = sessionEpoch;
      openingSession = this.#createSession({
        onSnapshot: (snapshot) => this.#enqueueSnapshot(snapshot, sessionEpoch),
        onFailure: (error) => this.#scheduleReconnect(error),
      });
      await openingSession.start({
        uri: source.uri,
        database: source.database,
        schemaFingerprint: source.schemaFingerprint,
        manifest: this.#manifest,
        generation: 1,
        regionId,
      });
      this.#session = openingSession;
      this.#regionId = regionId;
      this.#source = source;
      await this.#persistSubscriptionHealth();
    } catch (error) {
      this.#lastError = error instanceof Error ? error.message : String(error);
      try {
        await openingSession?.stop();
      } catch {
        // Preserve the actionable startup error.
      }
      this.#session = null;
      throw error;
    }
  }

  #enqueueSnapshot(snapshot: RegionalClaimsSnapshot, sessionEpoch: number): Promise<void> {
    const commit = this.#commitTail.then(async () => {
      if (sessionEpoch !== this.#sessionEpoch) return;
      await this.#commitSnapshot(snapshot);
    });
    this.#commitTail = commit.catch(() => {});
    return commit;
  }

  async #commitSnapshot(snapshot: RegionalClaimsSnapshot): Promise<void> {
    const claimId = this.#claimId;
    if (!claimId) throw new Error("Relay regional-claims runtime has no configured claim");
    if (snapshot.regionId !== this.#regionId || snapshot.data.regionId !== this.#regionId) {
      throw new Error("Relay regional-claims snapshot escaped its configured region");
    }
    const sourceKey = `region:${snapshot.regionId}` as `region:${number}`;
    try {
      const storedGeneration = this.#currentStateRepository.nextGeneration(claimId);
      await this.#currentStateRepository.commitGeneration({
        claimId,
        generation: storedGeneration,
        domains: {
          "region-claims": {
            data: snapshot.data,
            confidence: snapshot.warnings.length ? "partial" : "authoritative",
            provenance: {
              provider: "relay",
              sourceKey,
              regionId: snapshot.regionId,
              database: snapshot.database,
              schemaFingerprint: snapshot.schemaFingerprint,
              sourceObservedAt: null,
              receivedAt: snapshot.receivedAt,
            },
            warnings: snapshot.warnings,
          },
        },
      });
      this.#lastGeneration = storedGeneration;
      this.#connectionFailures = 0;
      this.#cancelReconnect();
      this.#lastError = null;
      await this.#persistSubscriptionHealth(null, snapshot.receivedAt, true);
    } catch (error) {
      this.#lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  async #recordError(error: unknown, claimId = this.#claimId): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    this.#lastError = message;
    const observedAt = this.#now().toISOString();
    if (claimId) {
      await this.#currentStateRepository.markError?.(
        claimId,
        "region-claims",
        message,
        observedAt,
      );
    }
    await this.#persistSubscriptionHealth(message, observedAt);
  }

  async #recordOperationalError(error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    this.#lastError = message;
    await this.#persistSubscriptionHealth(message);
  }

  #scheduleReconnect(error: unknown): void {
    if (
      this.#stopped
      || this.#reconnecting
      || this.#reconnectTimer != null
      || !this.#claimId
      || !this.#regionId
    ) return;
    this.#connectionFailures += 1;
    const attempt = this.#connectionFailures;
    void this.#recordError(error);
    const delayMs = this.#reconnectDelayMs(attempt);
    this.#reconnectTimer = this.#setTimer(() => {
      this.#reconnectTimer = null;
      void this.#reconnect(attempt >= 3).catch((reconnectError) => {
        this.#scheduleReconnect(reconnectError);
      });
    }, delayMs);
  }

  async #reconnect(rediscoverTopology: boolean): Promise<void> {
    const regionId = this.#regionId;
    if (this.#stopped || !regionId) return;
    const cachedSource = rediscoverTopology ? undefined : this.#source ?? undefined;
    this.#reconnecting = true;
    try {
      this.#sessionEpoch += 1;
      await this.#session?.stop();
      await this.#commitTail;
      this.#session = null;
      this.#reconnects += 1;
      await this.#startSession(regionId, cachedSource);
    } finally {
      this.#reconnecting = false;
    }
  }

  #cancelReconnect(): void {
    if (this.#reconnectTimer == null) return;
    this.#clearTimer(this.#reconnectTimer);
    this.#reconnectTimer = null;
  }

  async #persistSubscriptionHealth(
    lastError = this.#lastError,
    observedAt = this.#now().toISOString(),
    snapshotApplied = false,
  ): Promise<void> {
    const source = this.#source;
    if (!source) return;
    const health = this.#session?.health();
    await this.#currentStateRepository.recordSubscriptionHealth?.({
      sourceKey: source.sourceKey,
      domain: "region-claims",
      generation: this.#lastGeneration,
      connected: health?.connected === true
        && (snapshotApplied || health.applied === true)
        && !lastError,
      applyDurationMs: health?.lastApplyDurationMs ?? null,
      reconnects: this.#reconnects,
      malformedRows: 0,
      lastError,
    }, observedAt);
  }

  health() {
    return {
      running: this.#session != null,
      source: this.#source ? { ...this.#source } : null,
      subscription: this.#session?.health() ?? {
        connected: false,
        applied: false,
        lastAppliedAt: null,
        lastError: null,
      },
      lastError: this.#lastError,
    };
  }

  async stop(): Promise<void> {
    this.#stopped = true;
    this.#cancelReconnect();
    this.#sessionEpoch += 1;
    await this.#session?.stop();
    await this.#commitTail;
    this.#session = null;
    this.#relayBaseUrl = null;
    this.#claimId = null;
    this.#regionId = null;
    this.#source = null;
    this.#lastTopologyCheckAt = 0;
    this.#connectionFailures = 0;
    this.#reconnecting = false;
  }
}
