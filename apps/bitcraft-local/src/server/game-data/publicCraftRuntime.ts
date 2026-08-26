import type {
  DomainSnapshotBatch,
  StoredDomainSnapshot,
} from "./contracts.ts";
import { relayWebSocketUri } from "./globalCatalogRuntime.ts";
import {
  RelayPublicCraftRegionSession,
  type RegionalPublicCraftSnapshot,
} from "./publicCraftRegionSession.ts";
import { AdaptiveRegionSessionPool } from "./regionSessionPool.ts";
import { discoverRelayTopology, type RelayTopology } from "./topology.ts";
import { RelayHttpClient } from "./http.ts";
import { RelayPlayerPresenceService } from "./playerPresenceService.ts";

type BindingManifest = Parameters<RelayPublicCraftRegionSession["start"]>[0]["manifest"];

type CurrentStateRepository = {
  read?(claimId: string, domain: "public-crafts"): StoredDomainSnapshot | null;
  nextGeneration(claimId: string): number;
  commitGeneration(batch: DomainSnapshotBatch): Promise<void> | void;
  markError?(claimId: string, domain: "public-crafts", error: string, attemptedAt: string): Promise<void> | void;
  recordSubscriptionHealth?(health: {
    sourceKey: `region:${string}`;
    domain: "public-crafts";
    generation: number;
    connected: boolean;
    applyDurationMs?: number | null;
    reconnects?: number;
    malformedRows?: number;
    lastError?: string | null;
  }, observedAt: string): Promise<void> | void;
};

type PublicCraftSession = {
  start(config: Parameters<RelayPublicCraftRegionSession["start"]>[0]): Promise<void>;
  health(): ReturnType<RelayPublicCraftRegionSession["health"]>;
  stop(): Promise<void>;
};

type PublicCraftSessionFactory = (
  options: ConstructorParameters<typeof RelayPublicCraftRegionSession>[0],
) => PublicCraftSession;

type PoolOptions = Omit<
  ConstructorParameters<typeof AdaptiveRegionSessionPool>[0],
  "createSession"
>;

type RuntimeDependencies = {
  manifest: BindingManifest;
  currentStateRepository: CurrentStateRepository;
  discoverTopology?: (baseUrl: string) => Promise<RelayTopology>;
  createSession?: PublicCraftSessionFactory;
  poolOptions?: PoolOptions;
  createPlayerResolver?: (baseUrl: string) => Pick<RelayPlayerPresenceService, "resolveExactPlayerName">;
  now?: () => Date;
};

type PublicCraftJob = Record<string, unknown> & {
  entityId: string;
  regionId: string;
};

type RegionSnapshotState = {
  craftResults: PublicCraftJob[];
  warnings: string[];
  database: string;
  schemaFingerprint: string;
  receivedAt: string;
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

function normalizedJob(value: unknown, regionId: string): PublicCraftJob | null {
  const row = asRecord(value);
  const entityId = String(row.entityId ?? "").trim();
  if (!/^\d+$/.test(entityId) || String(row.regionId ?? "") !== regionId) return null;
  return { ...row, entityId, regionId };
}

export class RelayPublicCraftRuntime {
  readonly #manifest: BindingManifest;
  readonly #currentStateRepository: CurrentStateRepository;
  readonly #discoverTopology: (baseUrl: string) => Promise<RelayTopology>;
  readonly #createSession: PublicCraftSessionFactory;
  readonly #poolOptions: PoolOptions;
  readonly #createPlayerResolver: NonNullable<RuntimeDependencies["createPlayerResolver"]>;
  readonly #now: () => Date;
  readonly #regions = new Map<string, RegionSnapshotState>();
  readonly #activeSessionIds = new Map<string, number>();
  #pool: AdaptiveRegionSessionPool | null = null;
  #relayBaseUrl: string | null = null;
  #claimId: string | null = null;
  #primaryRegionId: string | null = null;
  #activeRegionIds: string[] = [];
  #nextSessionId = 0;
  #commitTail: Promise<void> = Promise.resolve();
  #warmPromise: Promise<void> | null = null;
  #lastError: string | null = null;
  #started = false;
  #playerResolver: Pick<RelayPlayerPresenceService, "resolveExactPlayerName"> | null = null;
  #publishedSourceKey: `region:${string}` | null = null;
  #publishedGeneration = 0;

  constructor(dependencies: RuntimeDependencies) {
    this.#manifest = dependencies.manifest;
    this.#currentStateRepository = dependencies.currentStateRepository;
    this.#discoverTopology = dependencies.discoverTopology ?? discoverRelayTopology;
    this.#createSession = dependencies.createSession
      ?? ((options) => new RelayPublicCraftRegionSession(options));
    this.#poolOptions = dependencies.poolOptions ?? {};
    this.#createPlayerResolver = dependencies.createPlayerResolver
      ?? ((baseUrl) => new RelayPlayerPresenceService({ http: new RelayHttpClient({ baseUrl }) }));
    this.#now = dependencies.now ?? (() => new Date());
  }

  async start(config: {
    relayBaseUrl: string;
    claimId: string;
    primaryRegionId: string;
    activeRegionIds: string[];
  }): Promise<void> {
    if (this.#started || this.#pool) throw new Error("Relay public-craft runtime is already started");
    const primaryRegionId = decimalInteger(
      config.primaryRegionId,
      "Relay public-craft primary region id",
    );
    const activeRegionIds = [...new Set([
      primaryRegionId,
      ...config.activeRegionIds.map((regionId, index) => (
        decimalInteger(regionId, `Relay public-craft active region ${index}`)
      )),
    ])].sort(numericStringOrder);
    this.#relayBaseUrl = config.relayBaseUrl.replace(/\/+$/, "");
    this.#claimId = decimalInteger(config.claimId, "Relay public-craft claim id");
    this.#primaryRegionId = primaryRegionId;
    this.#activeRegionIds = activeRegionIds;
    this.#playerResolver = this.#createPlayerResolver(this.#relayBaseUrl);
    this.#hydrateLastGood();
    this.#pool = new AdaptiveRegionSessionPool({
      ...this.#poolOptions,
      createSession: (regionId) => this.#pooledSession(regionId),
    });
    try {
      await this.#pool.start({ primaryRegionId, activeRegionIds });
      this.#started = true;
    } catch (error) {
      this.#lastError = error instanceof Error ? error.message : String(error);
      await this.#pool.stop();
      this.#pool = null;
      throw error;
    }
  }

  async reconcile(config: {
    relayBaseUrl: string;
    claimId: string;
    primaryRegionId: string;
    activeRegionIds: string[];
  }): Promise<boolean> {
    const relayBaseUrl = config.relayBaseUrl.replace(/\/+$/, "");
    const claimId = decimalInteger(config.claimId, "Relay public-craft claim id");
    const primaryRegionId = decimalInteger(
      config.primaryRegionId,
      "Relay public-craft primary region id",
    );
    const activeRegionIds = [...new Set([
      primaryRegionId,
      ...config.activeRegionIds.map((regionId, index) => (
        decimalInteger(regionId, `Relay public-craft active region ${index}`)
      )),
    ])].sort(numericStringOrder);
    const unchanged = this.#started
      && this.#relayBaseUrl === relayBaseUrl
      && this.#claimId === claimId
      && this.#primaryRegionId === primaryRegionId
      && this.#activeRegionIds.join(",") === activeRegionIds.join(",");
    if (unchanged) {
      const failed = this.#pool?.health().sessions.find((entry) => {
        const health = asRecord(entry.health);
        return health.connected === false || health.lastError != null;
      });
      if (failed) {
        const health = asRecord(failed.health);
        const message = String(health.lastError ?? `Relay public-crafts subscription disconnected for region ${failed.regionId}.`);
        await this.#persistSubscriptionHealth(message);
        await this.stop();
        await this.#currentStateRepository.markError?.(claimId, "public-crafts", message, this.#now().toISOString());
        this.#lastError = message;
        await this.start({ relayBaseUrl, claimId, primaryRegionId, activeRegionIds });
        return true;
      }
      await this.#persistSubscriptionHealth();
      return false;
    }
    await this.stop();
    await this.start({ relayBaseUrl, claimId, primaryRegionId, activeRegionIds });
    return true;
  }

  async warmActiveRegions(): Promise<void> {
    if (!this.#pool || !this.#started) {
      throw new Error("Relay public-craft runtime is not started");
    }
    if (!this.#warmPromise) {
      this.#warmPromise = this.#pool.warmActiveRegions()
        .finally(() => {
          this.#warmPromise = null;
        });
    }
    await this.#warmPromise;
  }

  #pooledSession(regionId: string) {
    let session: PublicCraftSession | null = null;
    let sessionId = 0;
    return {
      start: async () => {
        const relayBaseUrl = this.#relayBaseUrl;
        if (!relayBaseUrl) throw new Error("Relay public-craft runtime has no base URL");
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

  #enqueueSnapshot(snapshot: RegionalPublicCraftSnapshot, sessionId: number): Promise<void> {
    const commit = this.#commitTail.then(async () => {
      if (this.#activeSessionIds.get(snapshot.regionId) !== sessionId) return;
      await this.#commitSnapshot(snapshot);
    });
    this.#commitTail = commit.catch(() => {});
    return commit;
  }

  async #commitSnapshot(snapshot: RegionalPublicCraftSnapshot): Promise<void> {
    const claimId = this.#claimId;
    if (!claimId) throw new Error("Relay public-craft runtime has no configured claim");
    if (!this.#activeRegionIds.includes(snapshot.regionId)) {
      throw new Error(`Relay public-craft snapshot leaked unconfigured region ${snapshot.regionId}`);
    }
    const craftResults = snapshot.data.craftResults
      .map((job) => normalizedJob(job, snapshot.regionId))
      .filter((job): job is PublicCraftJob => job != null);
    const unresolvedOwnerIds = [...new Set(craftResults
      .filter((job) => !String(job.ownerUsername ?? "").trim())
      .map((job) => String(job.ownerEntityId ?? "").trim())
      .filter((id) => /^\d+$/.test(id)))];
    const resolvedNames = new Map<string, string>();
    await Promise.all(unresolvedOwnerIds.map(async (ownerEntityId) => {
      const name = await this.#playerResolver?.resolveExactPlayerName(ownerEntityId);
      if (name) resolvedNames.set(ownerEntityId, name);
    }));
    for (const job of craftResults) {
      const resolved = resolvedNames.get(String(job.ownerEntityId ?? ""));
      if (resolved) job.ownerUsername = resolved;
    }
    const regionWarnings = snapshot.warnings.filter((warning) => (
      !/^Regional public crafts missing crafter usernames: \d+\.$/.test(warning)
    ));
    this.#regions.set(snapshot.regionId, {
      craftResults,
      warnings: regionWarnings,
      database: snapshot.database,
      schemaFingerprint: snapshot.schemaFingerprint,
      receivedAt: snapshot.receivedAt,
    });

    const missingRegions = this.#activeRegionIds.filter((regionId) => !this.#regions.has(regionId));
    const warnings = [
      ...missingRegions.map((regionId) => (
        `Relay public crafts have not loaded region ${regionId} yet.`
      )),
      ...this.#activeRegionIds.flatMap((regionId) => (
        (this.#regions.get(regionId)?.warnings ?? []).map((warning) => `Region ${regionId}: ${warning}`)
      )),
    ];
    const combinedJobs = this.#activeRegionIds.flatMap((regionId) => (
      this.#regions.get(regionId)?.craftResults ?? []
    )).sort((left, right) => (
      numericStringOrder(left.regionId, right.regionId)
      || numericStringOrder(left.entityId, right.entityId)
    ));
    const missingCrafterUsernameCount = combinedJobs.filter((job) => (
      !String(job.ownerUsername ?? "").trim()
    )).length;
    const regions = this.#activeRegionIds.flatMap((regionId) => {
      const region = this.#regions.get(regionId);
      return region ? [{
        regionId,
        count: region.craftResults.length,
        database: region.database,
        schemaFingerprint: region.schemaFingerprint,
        receivedAt: region.receivedAt,
        warnings: region.warnings,
      }] : [];
    });
    try {
      const storedGeneration = this.#currentStateRepository.nextGeneration(claimId);
      await this.#currentStateRepository.commitGeneration({
        claimId,
        generation: storedGeneration,
        domains: {
          "public-crafts": {
            data: {
              craftResults: combinedJobs,
              regions,
              coverage: { missingCrafterUsernameCount },
            },
            confidence: warnings.length ? "partial" : "authoritative",
            provenance: {
              provider: "relay",
              sourceKey: `region:${Number(snapshot.regionId)}`,
              regionId: snapshot.regionId,
              database: snapshot.database,
              schemaFingerprint: snapshot.schemaFingerprint,
              sourceObservedAt: null,
              receivedAt: snapshot.receivedAt,
            },
            warnings,
          },
        },
      });
      this.#publishedSourceKey = `region:${snapshot.regionId}`;
      this.#publishedGeneration = storedGeneration;
      this.#lastError = null;
      await this.#persistSubscriptionHealth();
    } catch (error) {
      this.#lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  async #persistSubscriptionHealth(lastError = this.#lastError): Promise<void> {
    const sourceKey = this.#publishedSourceKey;
    if (!sourceKey || !this.#publishedGeneration) return;
    const regionId = sourceKey.slice("region:".length);
    const session = this.#pool?.health().sessions.find((entry) => entry.regionId === regionId);
    const health = asRecord(session?.health);
    const sessions = this.#pool?.health().sessions ?? [];
    const allConnected = sessions.length > 0 && sessions.every((entry) => {
      const entryHealth = asRecord(entry.health);
      return entryHealth.connected === true && entryHealth.applied === true && entryHealth.lastError == null;
    });
    await this.#currentStateRepository.recordSubscriptionHealth?.({
      sourceKey,
      domain: "public-crafts",
      generation: this.#publishedGeneration,
      connected: allConnected && !lastError,
      applyDurationMs: typeof health.lastApplyDurationMs === "number" ? health.lastApplyDurationMs : null,
      reconnects: 0,
      malformedRows: 0,
      lastError: lastError ?? (health.lastError == null ? null : String(health.lastError)),
    }, this.#now().toISOString());
  }

  #hydrateLastGood(): void {
    this.#regions.clear();
    const claimId = this.#claimId;
    if (!claimId || !this.#currentStateRepository.read) return;
    const stored = this.#currentStateRepository.read(claimId, "public-crafts");
    const data = asRecord(stored?.data);
    const jobs = Array.isArray(data.craftResults) ? data.craftResults : [];
    const metadata = Array.isArray(data.regions) ? data.regions : [];
    for (const value of metadata) {
      const row = asRecord(value);
      const regionId = String(row.regionId ?? "").trim();
      if (!this.#activeRegionIds.includes(regionId)) continue;
      const craftResults = jobs
        .map((job) => normalizedJob(job, regionId))
        .filter((job): job is PublicCraftJob => job != null);
      this.#regions.set(regionId, {
        craftResults,
        warnings: Array.isArray(row.warnings) ? row.warnings.map(String) : [],
        database: String(row.database ?? ""),
        schemaFingerprint: String(row.schemaFingerprint ?? ""),
        receivedAt: String(row.receivedAt ?? stored?.provenance.receivedAt ?? ""),
      });
    }
  }

  health() {
    return {
      running: this.#started,
      primaryRegionId: this.#primaryRegionId,
      activeRegionIds: [...this.#activeRegionIds],
      loadedRegionIds: [...this.#regions.keys()].sort(numericStringOrder),
      lastError: this.#lastError,
      pool: this.#pool?.health() ?? null,
    };
  }

  async stop(): Promise<void> {
    this.#started = false;
    this.#warmPromise = null;
    await this.#pool?.stop();
    this.#pool = null;
    this.#activeSessionIds.clear();
    await this.#commitTail;
    this.#relayBaseUrl = null;
    this.#claimId = null;
    this.#primaryRegionId = null;
    this.#activeRegionIds = [];
    this.#regions.clear();
    this.#playerResolver = null;
    this.#publishedSourceKey = null;
    this.#publishedGeneration = 0;
  }
}
