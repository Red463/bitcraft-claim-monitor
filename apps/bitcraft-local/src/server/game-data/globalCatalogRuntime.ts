import type { DomainSnapshotBatch } from "./contracts.ts";
import {
  RelayGlobalCatalogSession,
  type GlobalCatalogSnapshot,
} from "./globalCatalogSession.ts";
import { discoverRelayTopology, type RelayTopology } from "./topology.ts";

type BindingManifest = Parameters<RelayGlobalCatalogSession["start"]>[0]["manifest"];

type CatalogSourceState = {
  generation: number;
} | null;

type CatalogRepository = {
  getSourceState(): CatalogSourceState;
  replaceCatalogSnapshot(
    snapshot: Pick<GlobalCatalogSnapshot, "entities" | "descriptions">,
    metadata: {
      provider: "relay";
      database: string;
      schemaFingerprint: string;
      generation: number;
      receivedAt: string;
    },
  ): unknown;
};

type CurrentStateRepository = {
  nextGeneration(claimId: string): number;
  commitGeneration(batch: DomainSnapshotBatch): Promise<void> | void;
  recordSubscriptionHealth?(health: {
    sourceKey: string;
    domain: "region";
    generation: number;
    connected: boolean;
    lastError: string | null;
  }, observedAt: string): Promise<void> | void;
};

type CatalogSession = {
  start(config: Parameters<RelayGlobalCatalogSession["start"]>[0]): Promise<void>;
  health(): ReturnType<RelayGlobalCatalogSession["health"]>;
  stop(): Promise<void>;
};

type CatalogSessionFactory = (
  options: ConstructorParameters<typeof RelayGlobalCatalogSession>[0],
) => CatalogSession;

type RuntimeDependencies = {
  manifest: BindingManifest;
  catalogRepository: CatalogRepository;
  currentStateRepository: CurrentStateRepository;
  discoverTopology?: (baseUrl: string) => Promise<RelayTopology>;
  createSession?: CatalogSessionFactory;
};

function relayWebSocketUri(baseUrl: string, port: number): string {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.port = String(port);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.href.replace(/\/$/, "");
}

export class RelayGlobalCatalogRuntime {
  readonly #manifest: BindingManifest;
  readonly #catalogRepository: CatalogRepository;
  readonly #currentStateRepository: CurrentStateRepository;
  readonly #discoverTopology: (baseUrl: string) => Promise<RelayTopology>;
  readonly #createSession: CatalogSessionFactory;
  #session: CatalogSession | null = null;
  #relayBaseUrl: string | null = null;
  #claimId: string | null = null;
  #source: {
    database: string;
    schemaFingerprint: string;
    uri: string;
  } | null = null;
  #lastError: string | null = null;
  #reconcileInFlight: Promise<boolean> | null = null;

  constructor(dependencies: RuntimeDependencies) {
    this.#manifest = dependencies.manifest;
    this.#catalogRepository = dependencies.catalogRepository;
    this.#currentStateRepository = dependencies.currentStateRepository;
    this.#discoverTopology = dependencies.discoverTopology ?? discoverRelayTopology;
    this.#createSession = dependencies.createSession
      ?? ((options) => new RelayGlobalCatalogSession(options));
  }

  async start(config: { relayBaseUrl: string; claimId: string }): Promise<void> {
    if (this.#session) throw new Error("Relay global catalog runtime is already started");
    this.#relayBaseUrl = config.relayBaseUrl.replace(/\/+$/, "");
    this.#claimId = String(config.claimId).trim();
    try {
      const topology = await this.#discoverTopology(this.#relayBaseUrl);
      if (!topology.global?.ready || !topology.global.schemaFingerprint) {
        throw new Error("Relay global source is not ready or has no schema fingerprint");
      }
      this.#source = {
        database: topology.global.database,
        schemaFingerprint: topology.global.schemaFingerprint,
        uri: relayWebSocketUri(this.#relayBaseUrl, topology.global.port),
      };
      const generation = Number(this.#catalogRepository.getSourceState()?.generation ?? 0) + 1;
      this.#session = this.#createSession({
        onSnapshot: (snapshot) => this.#commitSnapshot(snapshot),
      });
      await this.#session.start({
        ...this.#source,
        manifest: this.#manifest,
        generation,
      });
      this.#lastError = null;
    } catch (error) {
      this.#lastError = error instanceof Error ? error.message : String(error);
      try {
        await this.#session?.stop();
      } catch {
        // Preserve the startup failure as the actionable error.
      }
      this.#session = null;
      throw error;
    }
  }

  reconcile(config: { relayBaseUrl: string; claimId: string }): Promise<boolean> {
    const normalized = {
      relayBaseUrl: config.relayBaseUrl.replace(/\/+$/, ""),
      claimId: String(config.claimId).trim(),
    };
    const subscription = this.#session?.health();
    const healthy = this.#session != null
      && this.#relayBaseUrl === normalized.relayBaseUrl
      && this.#claimId === normalized.claimId
      && subscription?.connected === true
      && subscription.applied === true
      && !subscription.lastError
      && !this.#lastError;
    if (healthy) return Promise.resolve(false);
    if (this.#reconcileInFlight) return this.#reconcileInFlight;
    const reconcile = (async () => {
      await this.stop();
      await this.start(normalized);
      return true;
    })();
    this.#reconcileInFlight = reconcile;
    return reconcile.finally(() => {
      if (this.#reconcileInFlight === reconcile) this.#reconcileInFlight = null;
    });
  }

  async #commitSnapshot(snapshot: GlobalCatalogSnapshot): Promise<void> {
    const claimId = this.#claimId;
    if (!claimId) throw new Error("Relay global catalog runtime has no configured claim");
    try {
      const provenance = {
        provider: "relay" as const,
        sourceKey: "global" as const,
        regionId: null,
        database: snapshot.database,
        schemaFingerprint: snapshot.schemaFingerprint,
        sourceObservedAt: null,
        receivedAt: snapshot.receivedAt,
      };
      const domains: DomainSnapshotBatch["domains"] = {};
      if (snapshot.changed.includes("catalogs")) {
        this.#catalogRepository.replaceCatalogSnapshot({
          entities: snapshot.entities,
          descriptions: snapshot.descriptions,
        }, {
          provider: "relay",
          database: snapshot.database,
          schemaFingerprint: snapshot.schemaFingerprint,
          generation: snapshot.generation,
          receivedAt: snapshot.receivedAt,
        });
        const itemCount = snapshot.entities.filter(({ kind }) => kind === "item").length;
        const cargoCount = snapshot.entities.length - itemCount;
        const descriptionCounts = Object.fromEntries(
          Object.entries(snapshot.descriptions).map(([kind, rows]) => [kind, rows.length]),
        );
        const descriptionCount = Object.values(descriptionCounts)
          .reduce((total, count) => total + count, 0);
        const skillRows = snapshot.descriptions.skill ?? [];
        const skills = {
          profession: skillRows.filter((row) => "category" in row && row.category === "Profession"),
          adventure: skillRows.filter((row) => "category" in row && row.category === "Adventure"),
        };
        domains.catalogs = {
          data: {
            itemCount,
            cargoCount,
            descriptionCounts,
            rowCount: snapshot.entities.length + descriptionCount,
          },
          confidence: "authoritative",
          provenance,
          warnings: [],
        };
        domains.skills = {
          data: skills,
          confidence: "authoritative",
          provenance,
          warnings: [],
        };
      }
      if (snapshot.changed.includes("region")) {
        domains.region = {
          data: { regions: snapshot.regions },
          confidence: "authoritative",
          provenance,
          warnings: [],
        };
      }
      await this.#currentStateRepository.commitGeneration({
        claimId,
        generation: this.#currentStateRepository.nextGeneration(claimId),
        domains,
      });
      const health = this.#session?.health();
      await this.#currentStateRepository.recordSubscriptionHealth?.({
        sourceKey: "global",
        domain: "region",
        generation: snapshot.generation,
        connected: health?.connected === true && !health.lastError,
        lastError: health?.lastError ?? null,
      }, snapshot.receivedAt);
      this.#lastError = null;
    } catch (error) {
      this.#lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  health() {
    return {
      running: this.#session != null,
      claimId: this.#claimId,
      source: this.#source ? { ...this.#source } : null,
      sourceState: this.#catalogRepository.getSourceState(),
      subscription: this.#session?.health() ?? {
        state: "stopped",
        connected: false,
        applied: false,
        lastAppliedAt: null,
        lastError: null,
      },
      lastError: this.#lastError,
    };
  }

  async stop(): Promise<void> {
    await this.#session?.stop();
    this.#session = null;
    this.#relayBaseUrl = null;
    this.#claimId = null;
    this.#source = null;
  }
}

export { relayWebSocketUri };
