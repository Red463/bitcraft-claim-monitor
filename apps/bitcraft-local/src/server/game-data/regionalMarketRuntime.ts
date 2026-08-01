import type {
  DomainSnapshotBatch,
  StoredDomainSnapshot,
} from "./contracts.ts";
import { relayWebSocketUri } from "./globalCatalogRuntime.ts";
import {
  RelayRegionalMarketRegionSession,
  type RegionalMarketSnapshot,
} from "./regionalMarketRegionSession.ts";
import { AdaptiveRegionSessionPool } from "./regionSessionPool.ts";
import { discoverRelayTopology, type RelayTopology } from "./topology.ts";

type BindingManifest = Parameters<RelayRegionalMarketRegionSession["start"]>[0]["manifest"];

type CurrentStateRepository = {
  read?(claimId: string, domain: "regional-market"): StoredDomainSnapshot | null;
  nextGeneration(claimId: string): number;
  commitGeneration(batch: DomainSnapshotBatch): Promise<void> | void;
  commitGenerationWithTransition?(
    batch: DomainSnapshotBatch,
    transition: {
      transitionKey: string;
      claimId: string;
      domain: "regional-market";
      observedAt: string;
      payload: TransitionInput;
    },
  ): Promise<void> | void;
  listPendingTransitions?(claimId: string, domain: "regional-market"): Array<{
    transitionKey: string;
    payload: unknown;
  }>;
  recordTransitionError?(
    transitionKey: string,
    error: string,
    updatedAt: string,
  ): Promise<void> | void;
  ackTransition?(transitionKey: string): Promise<void> | void;
};

type RegionalMarketSession = {
  start(config: Parameters<RelayRegionalMarketRegionSession["start"]>[0]): Promise<void>;
  health(): ReturnType<RelayRegionalMarketRegionSession["health"]>;
  stop(): Promise<void>;
};

type RegionalMarketSessionFactory = (
  options: ConstructorParameters<typeof RelayRegionalMarketRegionSession>[0],
) => RegionalMarketSession;

type PoolOptions = Omit<
  ConstructorParameters<typeof AdaptiveRegionSessionPool>[0],
  "createSession"
>;

type RuntimeConfig = {
  relayBaseUrl: string;
  claimId: string;
  primaryRegionId: string;
  activeRegionIds: string[];
};

type TransitionInput = {
  claimId: string;
  previousData: RegionalMarketCombinedData | null;
  currentData: RegionalMarketCombinedData;
  isRegionBaseline: boolean;
  observedAt: string;
};

type QueuedTransition = {
  transitionKey: string | null;
  input: TransitionInput;
};

type RuntimeDependencies = {
  manifest: BindingManifest;
  currentStateRepository: CurrentStateRepository;
  discoverTopology?: (baseUrl: string) => Promise<RelayTopology>;
  createSession?: RegionalMarketSessionFactory;
  poolOptions?: PoolOptions;
  rotationMs?: number;
  applyTimeoutMs?: number;
  now?: () => number;
  scheduleRotation?: (callback: () => void, intervalMs: number) => () => void;
  transitionRetryMs?: number;
  scheduleTransitionRetry?: (callback: () => void, delayMs: number) => () => void;
  onSnapshotCommitted?: (input: TransitionInput) => Promise<void> | void;
  onCurrentPublished?: (input: TransitionInput) => Promise<void> | void;
};

type RegionalOrder = Record<string, unknown> & {
  entityId: string;
  regionId: string;
};

type RegionalStall = Record<string, unknown> & {
  entityId: string;
  regionId: string;
};

type RegionalClosedListing = Record<string, unknown> & {
  entityId: string;
  regionId: string;
};

type RegionSnapshotState = {
  orders: RegionalOrder[];
  closedListings: RegionalClosedListing[];
  stalls: RegionalStall[];
  warnings: string[];
  database: string;
  schemaFingerprint: string;
  receivedAt: string;
};

type RegionalMarketCombinedData = {
  activeRegionIds: string[];
  orders: RegionalOrder[];
  closedListings: RegionalClosedListing[];
  stalls: RegionalStall[];
  regions: Array<{
    regionId: string;
    count: number;
    closedListingCount: number;
    stallCount: number;
    database: string;
    schemaFingerprint: string;
    receivedAt: string;
    warnings: string[];
  }>;
};

function decimalInteger(value: unknown, label: string): string {
  const normalized = String(value ?? "").trim();
  if (!/^\d+$/.test(normalized)) throw new TypeError(`${label} must be a decimal integer`);
  return normalized;
}

function numericStringOrder(left: string, right: string): number {
  const leftValue = BigInt(left);
  const rightValue = BigInt(right);
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizedOrder(value: unknown, regionId: string): RegionalOrder | null {
  const row = asRecord(value);
  const entityId = String(row.entityId ?? "").trim();
  if (!/^\d+$/.test(entityId) || String(row.regionId ?? "") !== regionId) return null;
  return { ...row, entityId, regionId };
}

function normalizedStall(value: unknown, regionId: string): RegionalStall | null {
  const row = asRecord(value);
  const entityId = String(row.entityId ?? "").trim();
  if (!/^\d+$/.test(entityId) || String(row.regionId ?? "") !== regionId) return null;
  return { ...row, entityId, regionId };
}

function normalizedClosedListing(
  value: unknown,
  regionId: string,
): RegionalClosedListing | null {
  const row = asRecord(value);
  const entityId = String(row.entityId ?? "").trim();
  if (!/^\d+$/.test(entityId) || String(row.regionId ?? "") !== regionId) return null;
  return { ...row, entityId, regionId };
}

export class RelayRegionalMarketRuntime {
  readonly #manifest: BindingManifest;
  readonly #currentStateRepository: CurrentStateRepository;
  readonly #discoverTopology: (baseUrl: string) => Promise<RelayTopology>;
  readonly #createSession: RegionalMarketSessionFactory;
  readonly #poolOptions: PoolOptions;
  readonly #rotationMs: number;
  readonly #applyTimeoutMs: number;
  readonly #now: () => number;
  readonly #scheduleRotation: NonNullable<RuntimeDependencies["scheduleRotation"]>;
  readonly #transitionRetryMs: number;
  readonly #scheduleTransitionRetry: NonNullable<RuntimeDependencies["scheduleTransitionRetry"]>;
  readonly #onSnapshotCommitted: RuntimeDependencies["onSnapshotCommitted"];
  readonly #onCurrentPublished: RuntimeDependencies["onCurrentPublished"];
  readonly #regions = new Map<string, RegionSnapshotState>();
  readonly #activeSessionIds = new Map<string, number>();
  #pool: AdaptiveRegionSessionPool | null = null;
  #relayBaseUrl: string | null = null;
  #claimId: string | null = null;
  #primaryRegionId: string | null = null;
  #activeRegionIds: string[] = [];
  #nextSessionId = 0;
  #rotationCursor = 0;
  #commitTail: Promise<void> = Promise.resolve();
  #transitionTail: Promise<void> = Promise.resolve();
  #transitionQueue: QueuedTransition[] = [];
  #transitionDrainInFlight = false;
  #warmPromise: Promise<void> | null = null;
  #cancelRotation: (() => void) | null = null;
  #cancelTransitionRetry: (() => void) | null = null;
  #lastError: string | null = null;
  #transitionLastError: string | null = null;
  #poisonedTransitionCount = 0;
  #currentPublishedLastError: string | null = null;
  #started = false;

  constructor(dependencies: RuntimeDependencies) {
    this.#manifest = dependencies.manifest;
    this.#currentStateRepository = dependencies.currentStateRepository;
    this.#discoverTopology = dependencies.discoverTopology ?? discoverRelayTopology;
    this.#createSession = dependencies.createSession
      ?? ((options) => new RelayRegionalMarketRegionSession(options));
    this.#poolOptions = dependencies.poolOptions ?? {};
    const rotationMs = dependencies.rotationMs ?? 15_000;
    if (!Number.isSafeInteger(rotationMs) || rotationMs < 1_000) {
      throw new TypeError("Relay regional market rotation interval must be at least 1000ms");
    }
    this.#rotationMs = rotationMs;
    const applyTimeoutMs = dependencies.applyTimeoutMs ?? 30_000;
    if (!Number.isSafeInteger(applyTimeoutMs) || applyTimeoutMs < 1_000) {
      throw new TypeError("Relay regional market apply timeout must be at least 1000ms");
    }
    this.#applyTimeoutMs = applyTimeoutMs;
    this.#now = dependencies.now ?? Date.now;
    this.#scheduleRotation = dependencies.scheduleRotation ?? ((callback, intervalMs) => {
      const timer = setInterval(callback, intervalMs);
      timer.unref?.();
      return () => clearInterval(timer);
    });
    const transitionRetryMs = dependencies.transitionRetryMs ?? 1_000;
    if (!Number.isSafeInteger(transitionRetryMs) || transitionRetryMs < 100) {
      throw new TypeError("Relay regional market transition retry must be at least 100ms");
    }
    this.#transitionRetryMs = transitionRetryMs;
    this.#scheduleTransitionRetry = dependencies.scheduleTransitionRetry
      ?? ((callback, delayMs) => {
        const timer = setTimeout(callback, delayMs);
        timer.unref?.();
        return () => clearTimeout(timer);
    });
    this.#onSnapshotCommitted = dependencies.onSnapshotCommitted;
    this.#onCurrentPublished = dependencies.onCurrentPublished;
  }

  #normalizeConfig(config: RuntimeConfig): RuntimeConfig {
    const primaryRegionId = decimalInteger(
      config.primaryRegionId,
      "Relay regional market primary region id",
    );
    const activeRegionIds = [...new Set([
      primaryRegionId,
      ...config.activeRegionIds.map((regionId, index) => (
        decimalInteger(regionId, `Relay regional market active region ${index}`)
      )),
    ])].sort(numericStringOrder);
    return {
      relayBaseUrl: config.relayBaseUrl.replace(/\/+$/, ""),
      claimId: decimalInteger(config.claimId, "Relay regional market claim id"),
      primaryRegionId,
      activeRegionIds,
    };
  }

  async start(config: RuntimeConfig): Promise<void> {
    if (this.#started || this.#pool) throw new Error("Relay regional market runtime is already started");
    const normalized = this.#normalizeConfig(config);
    this.#relayBaseUrl = normalized.relayBaseUrl;
    this.#claimId = normalized.claimId;
    this.#primaryRegionId = normalized.primaryRegionId;
    this.#activeRegionIds = normalized.activeRegionIds;
    this.#rotationCursor = 0;
    this.#hydrateLastGood();
    this.#hydratePendingTransitions();
    this.#pool = new AdaptiveRegionSessionPool({
      ...this.#poolOptions,
      createSession: (regionId) => this.#pooledSession(regionId),
    });
    try {
      await this.#pool.start({
        primaryRegionId: normalized.primaryRegionId,
        activeRegionIds: normalized.activeRegionIds,
      });
      this.#started = true;
      this.#lastError = null;
      this.#cancelRotation = this.#scheduleRotation(() => {
        void this.warmActiveRegions().catch((error) => {
          this.#lastError = error instanceof Error ? error.message : String(error);
        });
      }, this.#rotationMs);
      void this.warmActiveRegions().catch((error) => {
        this.#lastError = error instanceof Error ? error.message : String(error);
      });
    } catch (error) {
      this.#lastError = error instanceof Error ? error.message : String(error);
      await this.#pool.stop();
      this.#pool = null;
      throw error;
    }
  }

  async reconcile(config: RuntimeConfig): Promise<boolean> {
    const normalized = this.#normalizeConfig(config);
    const unchanged = this.#started
      && this.#relayBaseUrl === normalized.relayBaseUrl
      && this.#claimId === normalized.claimId
      && this.#primaryRegionId === normalized.primaryRegionId
      && this.#activeRegionIds.length === normalized.activeRegionIds.length
      && this.#activeRegionIds.every((regionId, index) => (
        regionId === normalized.activeRegionIds[index]
      ));
    if (unchanged) return false;
    if (this.#pool || this.#started) await this.stop();
    await this.start(normalized);
    return true;
  }

  async warmActiveRegions(): Promise<void> {
    if (!this.#pool || !this.#started) {
      throw new Error("Relay regional market runtime is not started");
    }
    const previous = this.#warmPromise ?? Promise.resolve();
    const operation = previous.then(() => this.#rotateOneRegion());
    const tracked = operation.finally(() => {
      if (this.#warmPromise === tracked) this.#warmPromise = null;
    });
    this.#warmPromise = tracked;
    await tracked;
  }

  async #rotateOneRegion(): Promise<void> {
    const pool = this.#pool;
    const primaryRegionId = this.#primaryRegionId;
    if (!pool || !this.#started || !primaryRegionId) return;
    const candidates = this.#activeRegionIds.filter((regionId) => (
      regionId !== primaryRegionId
    ));
    if (!candidates.length) return;
    const poolHealth = pool.health();
    const openRegionIds = new Set(poolHealth.sessions.map((entry) => entry.regionId));
    let targetRegionId: string | null = null;
    for (let offset = 0; offset < candidates.length; offset += 1) {
      const index = (this.#rotationCursor + offset) % candidates.length;
      const regionId = candidates[index];
      if (openRegionIds.has(regionId)) continue;
      targetRegionId = regionId;
      this.#rotationCursor = (index + 1) % candidates.length;
      break;
    }
    if (!targetRegionId) return;

    if (poolHealth.sessions.length >= poolHealth.maxSessions) {
      const evictable = poolHealth.sessions
        .filter((entry) => !entry.pinned && entry.leases === 0)
        .sort((left, right) => (
          left.lastUsedAt - right.lastUsedAt
          || numericStringOrder(left.regionId, right.regionId)
        ))[0];
      if (!evictable) return;
      const sessionHealth = asRecord(evictable.health);
      const timedOut = this.#now() - evictable.openedAt >= this.#applyTimeoutMs;
      if (sessionHealth.applied !== true && !timedOut) return;
    }

    let lease: Awaited<ReturnType<AdaptiveRegionSessionPool["acquire"]>> | null = null;
    try {
      lease = await pool.acquire(targetRegionId);
      this.#lastError = null;
    } catch (error) {
      this.#lastError = error instanceof Error ? error.message : String(error);
    } finally {
      await lease?.release();
    }
  }

  #pooledSession(regionId: string) {
    let session: RegionalMarketSession | null = null;
    let sessionId = 0;
    return {
      start: async () => {
        const relayBaseUrl = this.#relayBaseUrl;
        if (!relayBaseUrl) throw new Error("Relay regional market runtime has no base URL");
        const topology = await this.#discoverTopology(relayBaseUrl);
        const source = topology.regions.get(regionId);
        if (!source?.ready || !source.schemaFingerprint) {
          throw new Error(
            `Relay region ${regionId} source is not ready or has no schema fingerprint`,
          );
        }
        sessionId = this.#nextSessionId + 1;
        this.#nextSessionId = sessionId;
        session = this.#createSession({
          onSnapshot: (snapshot) => this.#enqueueSnapshot(snapshot, sessionId),
        });
        this.#activeSessionIds.set(regionId, sessionId);
        try {
          await session.start({
            uri: relayWebSocketUri(relayBaseUrl, source.port),
            database: source.database,
            schemaFingerprint: source.schemaFingerprint,
            manifest: this.#manifest,
            generation: 1,
            regionId,
          });
        } catch (error) {
          if (this.#activeSessionIds.get(regionId) === sessionId) {
            this.#activeSessionIds.delete(regionId);
          }
          throw error;
        }
      },
      stop: async () => {
        if (this.#activeSessionIds.get(regionId) === sessionId) {
          this.#activeSessionIds.delete(regionId);
        }
        await session?.stop();
      },
      health: () => session?.health() ?? {
        connected: false,
        applied: false,
        lastAppliedAt: null,
        lastApplyDurationMs: null,
        rowCount: 0,
        lastError: null,
      },
    };
  }

  #enqueueSnapshot(snapshot: RegionalMarketSnapshot, sessionId: number): Promise<void> {
    const commit = this.#commitTail.then(async () => {
      if (this.#activeSessionIds.get(snapshot.regionId) !== sessionId) return;
      await this.#commitSnapshot(snapshot);
    });
    this.#commitTail = commit.catch(() => {});
    return commit;
  }

  async #commitSnapshot(snapshot: RegionalMarketSnapshot): Promise<void> {
    const claimId = this.#claimId;
    if (!claimId) throw new Error("Relay regional market runtime has no configured claim");
    if (!this.#activeRegionIds.includes(snapshot.regionId)) {
      throw new Error(`Relay regional market snapshot leaked unconfigured region ${snapshot.regionId}`);
    }
    const orders = snapshot.data.orders
      .map((order) => normalizedOrder(order, snapshot.regionId))
      .filter((order): order is RegionalOrder => order != null);
    const stalls = (snapshot.data.stalls ?? [])
      .map((stall) => normalizedStall(stall, snapshot.regionId))
      .filter((stall): stall is RegionalStall => stall != null);
    const closedListings = (snapshot.data.closedListings ?? [])
      .map((listing) => normalizedClosedListing(listing, snapshot.regionId))
      .filter((listing): listing is RegionalClosedListing => listing != null);
    const nextRegion = {
      orders,
      closedListings,
      stalls,
      warnings: [...snapshot.warnings],
      database: snapshot.database,
      schemaFingerprint: snapshot.schemaFingerprint,
      receivedAt: snapshot.receivedAt,
    };
    const previousData = this.#regions.size ? this.#combinedData(this.#regions) : null;
    const isRegionBaseline = !this.#regions.has(snapshot.regionId);
    const nextRegions = new Map(this.#regions);
    nextRegions.set(snapshot.regionId, nextRegion);

    const missingRegions = this.#activeRegionIds.filter((regionId) => !nextRegions.has(regionId));
    const warnings = [
      ...missingRegions.map((regionId) => (
        `Relay regional market has not loaded region ${regionId} yet.`
      )),
      ...this.#activeRegionIds.flatMap((regionId) => (
        (nextRegions.get(regionId)?.warnings ?? []).map((warning) => `Region ${regionId}: ${warning}`)
      )),
    ];
    const currentData = this.#combinedData(nextRegions);
    const generation = this.#currentStateRepository.nextGeneration(claimId);
    const publishedInput = {
      claimId,
      previousData,
      currentData,
      isRegionBaseline,
      observedAt: snapshot.receivedAt,
    };
    const transitionInput = isRegionBaseline
      ? publishedInput
      : this.#transitionDelta(
          claimId,
          snapshot.regionId,
          this.#regions.get(snapshot.regionId) ?? null,
          nextRegion,
          snapshot.receivedAt,
        );
    const hasTransitionDelta = !isRegionBaseline && (
      transitionInput.previousData?.orders.length
      || transitionInput.currentData.orders.length
      || transitionInput.currentData.closedListings.length
    );
    const transitionKey = `regional-market:${claimId}:${generation}`;
    const batch: DomainSnapshotBatch = {
      claimId,
      generation,
      domains: {
        "regional-market": {
          data: currentData,
          confidence: warnings.length ? "partial" : "authoritative",
          provenance: {
            provider: "relay",
            sourceKey: `region:${snapshot.regionId}` as `region:${number}`,
            regionId: snapshot.regionId,
            database: snapshot.database,
            schemaFingerprint: snapshot.schemaFingerprint,
            sourceObservedAt: null,
            receivedAt: snapshot.receivedAt,
          },
          warnings,
        },
      },
    };
    try {
      const durableTransition = hasTransitionDelta
        && this.#onSnapshotCommitted
        && this.#currentStateRepository.commitGenerationWithTransition;
      if (durableTransition) {
        await durableTransition.call(this.#currentStateRepository, batch, {
          transitionKey,
          claimId,
          domain: "regional-market",
          observedAt: snapshot.receivedAt,
          payload: transitionInput,
        });
      } else {
        await this.#currentStateRepository.commitGeneration(batch);
      }
      this.#regions.set(snapshot.regionId, nextRegion);
      this.#lastError = null;
      if (hasTransitionDelta) {
        this.#enqueueTransition(
          transitionInput,
          durableTransition ? transitionKey : null,
        );
      }
      this.#publishCurrent(publishedInput);
    } catch (error) {
      this.#lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  #enqueueTransition(input: TransitionInput, transitionKey: string | null): void {
    if (!this.#onSnapshotCommitted) return;
    if (
      transitionKey
      && this.#transitionQueue.some((entry) => entry.transitionKey === transitionKey)
    ) return;
    this.#transitionQueue.push({ transitionKey, input });
    this.#drainTransitions();
  }

  #publishCurrent(input: TransitionInput): void {
    if (!this.#onCurrentPublished) return;
    void Promise.resolve().then(() => this.#onCurrentPublished?.(input)).then(() => {
      this.#currentPublishedLastError = null;
    }).catch((error) => {
      this.#currentPublishedLastError = error instanceof Error ? error.message : String(error);
    });
  }

  #drainTransitions(): void {
    if (
      this.#transitionDrainInFlight
      || this.#cancelTransitionRetry
      || !this.#transitionQueue.length
      || !this.#onSnapshotCommitted
    ) return;
    this.#transitionDrainInFlight = true;
    const operation = (async () => {
      while (this.#transitionQueue.length) {
        const queued = this.#transitionQueue[0];
        try {
          await this.#onSnapshotCommitted?.(queued.input);
          if (queued.transitionKey) {
            await this.#currentStateRepository.ackTransition?.(queued.transitionKey);
          }
          this.#transitionQueue.shift();
          this.#transitionLastError = null;
        } catch (error) {
          this.#transitionLastError = error instanceof Error ? error.message : String(error);
          if (queued.transitionKey) {
            await Promise.resolve(this.#currentStateRepository.recordTransitionError?.(
              queued.transitionKey,
              this.#transitionLastError,
              new Date(this.#now()).toISOString(),
            )).catch(() => {});
          }
          if (!this.#cancelTransitionRetry) {
            this.#cancelTransitionRetry = this.#scheduleTransitionRetry(() => {
              this.#cancelTransitionRetry = null;
              this.#drainTransitions();
            }, this.#transitionRetryMs);
          }
          return;
        }
      }
    })().finally(() => {
      this.#transitionDrainInFlight = false;
    });
    this.#transitionTail = operation;
  }

  #hydratePendingTransitions(): void {
    this.#transitionQueue = [];
    this.#poisonedTransitionCount = 0;
    const claimId = this.#claimId;
    if (
      !claimId
      || !this.#onSnapshotCommitted
      || !this.#currentStateRepository.listPendingTransitions
    ) return;
    for (const transition of this.#currentStateRepository.listPendingTransitions(
      claimId,
      "regional-market",
    )) {
      const payload = asRecord(transition.payload);
      const currentData = payload.currentData;
      if (
        String(payload.claimId ?? "") !== claimId
        || !currentData
        || typeof currentData !== "object"
        || Array.isArray(currentData)
      ) {
        this.#poisonedTransitionCount += 1;
        const error = `Invalid persisted regional-market transition ${transition.transitionKey}`;
        this.#transitionLastError = error;
        void Promise.resolve(this.#currentStateRepository.recordTransitionError?.(
          transition.transitionKey,
          error,
          new Date(this.#now()).toISOString(),
        )).catch(() => {});
        continue;
      }
      this.#enqueueTransition(
        payload as TransitionInput,
        transition.transitionKey,
      );
    }
  }

  #transitionDelta(
    claimId: string,
    regionId: string,
    previousRegion: RegionSnapshotState | null,
    currentRegion: RegionSnapshotState,
    observedAt: string,
  ): TransitionInput {
    const previousOrders = previousRegion?.orders ?? [];
    const previousOrdersById = new Map(previousOrders.map((order) => [
      order.entityId,
      order,
    ]));
    const currentOrdersById = new Map(currentRegion.orders.map((order) => [
      order.entityId,
      order,
    ]));
    const quantityChanged = (
      previous: RegionalOrder | undefined,
      current: RegionalOrder | undefined,
    ) => (
      !previous
      || !current
      || String(previous.quantity ?? "") !== String(current.quantity ?? "")
    );
    const previousChangedOrders = previousOrders.filter((order) => (
      quantityChanged(order, currentOrdersById.get(order.entityId))
    ));
    const currentChangedOrders = currentRegion.orders.filter((order) => (
      quantityChanged(previousOrdersById.get(order.entityId), order)
    ));
    const previousClosedIds = new Set(
      (previousRegion?.closedListings ?? []).map((listing) => listing.entityId),
    );
    const newClosedListings = currentRegion.closedListings.filter((listing) => (
      !previousClosedIds.has(listing.entityId)
    ));
    const regionalData = (
      orders: RegionalOrder[],
      closedListings: RegionalClosedListing[],
    ): RegionalMarketCombinedData => ({
      activeRegionIds: [regionId],
      orders,
      closedListings,
      stalls: [],
      regions: [{
        regionId,
        count: orders.length,
        closedListingCount: closedListings.length,
        stallCount: 0,
        database: currentRegion.database,
        schemaFingerprint: currentRegion.schemaFingerprint,
        receivedAt: currentRegion.receivedAt,
        warnings: [],
      }],
    });
    return {
      claimId,
      previousData: regionalData(previousChangedOrders, []),
      currentData: regionalData(currentChangedOrders, newClosedListings),
      isRegionBaseline: false,
      observedAt,
    };
  }

  #hydrateLastGood(): void {
    this.#regions.clear();
    const claimId = this.#claimId;
    if (!claimId || !this.#currentStateRepository.read) return;
    const stored = this.#currentStateRepository.read(claimId, "regional-market");
    const data = asRecord(stored?.data);
    const orders = Array.isArray(data.orders) ? data.orders : [];
    const closedListings = Array.isArray(data.closedListings) ? data.closedListings : [];
    const stalls = Array.isArray(data.stalls) ? data.stalls : [];
    const metadata = Array.isArray(data.regions) ? data.regions : [];
    for (const value of metadata) {
      const row = asRecord(value);
      const regionId = String(row.regionId ?? "").trim();
      if (!this.#activeRegionIds.includes(regionId)) continue;
      const regionalOrders = orders
        .map((order) => normalizedOrder(order, regionId))
        .filter((order): order is RegionalOrder => order != null);
      const regionalStalls = stalls
        .map((stall) => normalizedStall(stall, regionId))
        .filter((stall): stall is RegionalStall => stall != null);
      const regionalClosedListings = closedListings
        .map((listing) => normalizedClosedListing(listing, regionId))
        .filter((listing): listing is RegionalClosedListing => listing != null);
      this.#regions.set(regionId, {
        orders: regionalOrders,
        closedListings: regionalClosedListings,
        stalls: regionalStalls,
        warnings: Array.isArray(row.warnings) ? row.warnings.map(String) : [],
        database: String(row.database ?? ""),
        schemaFingerprint: String(row.schemaFingerprint ?? ""),
        receivedAt: String(row.receivedAt ?? stored?.provenance.receivedAt ?? ""),
      });
    }
  }

  #combinedData(regionsById: Map<string, RegionSnapshotState>): RegionalMarketCombinedData {
    const sortRegionalEntities = <
      T extends { regionId: string; entityId: string },
    >(rows: T[]): T[] => rows.sort((left, right) => (
      numericStringOrder(left.regionId, right.regionId)
      || numericStringOrder(left.entityId, right.entityId)
    ));
    return {
      activeRegionIds: [...this.#activeRegionIds],
      orders: sortRegionalEntities(this.#activeRegionIds.flatMap((regionId) => (
        regionsById.get(regionId)?.orders ?? []
      ))),
      closedListings: sortRegionalEntities(this.#activeRegionIds.flatMap((regionId) => (
        regionsById.get(regionId)?.closedListings ?? []
      ))),
      stalls: sortRegionalEntities(this.#activeRegionIds.flatMap((regionId) => (
        regionsById.get(regionId)?.stalls ?? []
      ))),
      regions: this.#activeRegionIds.flatMap((regionId) => {
        const region = regionsById.get(regionId);
        return region ? [{
          regionId,
          count: region.orders.length,
          closedListingCount: region.closedListings.length,
          stallCount: region.stalls.length,
          database: region.database,
          schemaFingerprint: region.schemaFingerprint,
          receivedAt: region.receivedAt,
          warnings: region.warnings,
        }] : [];
      }),
    };
  }

  health() {
    return {
      running: this.#started,
      primaryRegionId: this.#primaryRegionId,
      activeRegionIds: [...this.#activeRegionIds],
      loadedRegionIds: [...this.#regions.keys()].sort(numericStringOrder),
      lastError: this.#lastError,
      transition: {
        lastError: this.#transitionLastError,
        pending: this.#transitionQueue.length + this.#poisonedTransitionCount,
        poisoned: this.#poisonedTransitionCount,
      },
      currentPublished: {
        lastError: this.#currentPublishedLastError,
      },
      pool: this.#pool?.health() ?? null,
    };
  }

  async stop(): Promise<void> {
    this.#started = false;
    this.#cancelRotation?.();
    this.#cancelRotation = null;
    this.#cancelTransitionRetry?.();
    this.#cancelTransitionRetry = null;
    await this.#warmPromise?.catch(() => {});
    this.#warmPromise = null;
    await this.#pool?.stop();
    this.#pool = null;
    this.#activeSessionIds.clear();
    await this.#commitTail;
    await this.#transitionTail;
    this.#relayBaseUrl = null;
    this.#claimId = null;
    this.#primaryRegionId = null;
    this.#activeRegionIds = [];
    this.#rotationCursor = 0;
    this.#regions.clear();
    this.#transitionQueue = [];
    this.#poisonedTransitionCount = 0;
  }
}
