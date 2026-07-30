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

type BindingManifest = Parameters<RelayPublicCraftRegionSession["start"]>[0]["manifest"];

type CurrentStateRepository = {
  read?(claimId: string, domain: "public-crafts"): StoredDomainSnapshot | null;
  nextGeneration(claimId: string): number;
  commitGeneration(batch: DomainSnapshotBatch): Promise<void> | void;
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

  constructor(dependencies: RuntimeDependencies) {
    this.#manifest = dependencies.manifest;
    this.#currentStateRepository = dependencies.currentStateRepository;
    this.#discoverTopology = dependencies.discoverTopology ?? discoverRelayTopology;
    this.#createSession = dependencies.createSession
      ?? ((options) => new RelayPublicCraftRegionSession(options));
    this.#poolOptions = dependencies.poolOptions ?? {};
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
    this.#hydrateLastGood();
    this.#pool = new AdaptiveRegionSessionPool({
      ...this.#poolOptions,
      createSession: (regionId) => this.#pooledSession(regionId),
    });
    try {
      await this.#pool.start({ primaryRegionId, activeRegionIds });
      this.#started = true;
      this.#lastError = null;
    } catch (error) {
      this.#lastError = error instanceof Error ? error.message : String(error);
      await this.#pool.stop();
      this.#pool = null;
      throw error;
    }
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
    this.#regions.set(snapshot.regionId, {
      craftResults,
      warnings: [...snapshot.warnings],
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
      await this.#currentStateRepository.commitGeneration({
        claimId,
        generation: this.#currentStateRepository.nextGeneration(claimId),
        domains: {
          "public-crafts": {
            data: { craftResults: combinedJobs, regions },
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
      this.#lastError = null;
    } catch (error) {
      this.#lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
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
  }
}
