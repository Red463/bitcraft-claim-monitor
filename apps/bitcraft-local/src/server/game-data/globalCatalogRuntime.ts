import { AsyncLocalStorage } from "node:async_hooks";
import type { DomainSnapshotBatch } from "./contracts.ts";
import type { SchemaFingerprintDiagnostic } from "./contracts.ts";
import {
  normalizeEmpireNotificationScope,
  RelayGlobalCatalogSession,
  type GlobalCatalogSnapshot,
} from "./globalCatalogSession.ts";
import {
  discoverRelayTopology,
  operationalRelaySchemaUrl,
  sanitizeSchemaFingerprintDiagnostic,
  type RelayTopology,
  type RelayTopologyDiscoveryOptions,
} from "./topology.ts";
import { assertSchemaFingerprint } from "./schemaManifest.ts";

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
    runtimeState?: "connected" | "disconnected" | "blocked_by_schema";
    lastError: string | null;
  }, observedAt: string): Promise<void> | void;
  recordSchemaFingerprintDiagnostic?(value: {
    diagnostic: SchemaFingerprintDiagnostic;
    database: string | null;
    ready: boolean;
  }): Promise<void> | void;
};

type CatalogSession = {
  start(config: Parameters<RelayGlobalCatalogSession["start"]>[0]): Promise<void>;
  setEmpireNotificationScope(empireIds: string[]): Promise<boolean>;
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
  onEmpireFoundries?: (snapshot: Pick<
    GlobalCatalogSnapshot,
    "foundries" | "foundryWarnings" | "database" | "schemaFingerprint" | "generation" | "receivedAt"
  >) => Promise<void> | void;
  onEmpireNotifications?: (snapshot: Pick<
    GlobalCatalogSnapshot,
    "siegeNotifications" | "notificationScopeEmpireIds" | "database" | "schemaFingerprint" | "generation" | "receivedAt"
  >) => Promise<void> | void;
  discoverTopology?: (
    baseUrl: string,
    options?: RelayTopologyDiscoveryOptions,
  ) => Promise<RelayTopology>;
  createSession?: CatalogSessionFactory;
  now?: () => number;
  topologyRefreshMs?: number;
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

function globalSourceFromTopology(
  baseUrl: string,
  topology: RelayTopology,
  manifest: BindingManifest,
) {
  if (!topology.global?.ready || !topology.global.schemaFingerprint) {
    throw new Error("Relay global source is not ready or has no schema fingerprint");
  }
  assertSchemaFingerprint(manifest, "global", topology.global.schemaFingerprint);
  return {
    database: topology.global.database,
    schemaFingerprint: topology.global.schemaFingerprint,
    uri: relayWebSocketUri(baseUrl, topology.global.port),
  };
}

function sameGlobalSource(
  left: ReturnType<typeof globalSourceFromTopology> | null,
  right: ReturnType<typeof globalSourceFromTopology>,
) {
  return left?.database === right.database
    && left.schemaFingerprint === right.schemaFingerprint
    && left.uri === right.uri;
}

export class RelayGlobalCatalogRuntime {
  readonly #manifest: BindingManifest;
  readonly #catalogRepository: CatalogRepository;
  readonly #currentStateRepository: CurrentStateRepository;
  readonly #discoverTopology: (
    baseUrl: string,
    options?: RelayTopologyDiscoveryOptions,
  ) => Promise<RelayTopology>;
  readonly #createSession: CatalogSessionFactory;
  readonly #now: () => number;
  readonly #topologyRefreshMs: number;
  readonly #onEmpireFoundries: RuntimeDependencies["onEmpireFoundries"];
  readonly #onEmpireNotifications: RuntimeDependencies["onEmpireNotifications"];
  #session: CatalogSession | null = null;
  #relayBaseUrl: string | null = null;
  #claimId: string | null = null;
  #source: {
    database: string;
    schemaFingerprint: string;
    uri: string;
  } | null = null;
  #lastError: string | null = null;
  #schemaDiagnostic: SchemaFingerprintDiagnostic | null = null;
  #notificationLastError: string | null = null;
  #empireNotificationScope: string[] = [];
  #reconcileInFlight: Promise<boolean> | null = null;
  #lastTopologyCheckedAt = 0;
  #lifecycleGeneration = 0;
  readonly #notificationPublicationContext = new AsyncLocalStorage<boolean>();
  readonly #inFlightNotificationPublications = new Set<Promise<void>>();

  constructor(dependencies: RuntimeDependencies) {
    this.#manifest = dependencies.manifest;
    this.#catalogRepository = dependencies.catalogRepository;
    this.#currentStateRepository = dependencies.currentStateRepository;
    this.#discoverTopology = dependencies.discoverTopology
      ?? ((baseUrl, options) => discoverRelayTopology(baseUrl, fetch, options));
    this.#createSession = dependencies.createSession
      ?? ((options) => new RelayGlobalCatalogSession(options));
    this.#now = dependencies.now ?? Date.now;
    this.#topologyRefreshMs = dependencies.topologyRefreshMs ?? 60_000;
    this.#onEmpireFoundries = dependencies.onEmpireFoundries;
    this.#onEmpireNotifications = dependencies.onEmpireNotifications;
  }

  async start(config: { relayBaseUrl: string; claimId: string }): Promise<void> {
    if (this.#session) throw new Error("Relay global catalog runtime is already started");
    if (
      this.#notificationPublicationContext.getStore() === true
      && this.#inFlightNotificationPublications.size
    ) {
      throw new Error("Cannot start Relay global catalog runtime from an active notification publication");
    }
    await this.#drainNotificationPublications();
    const lifecycleGeneration = ++this.#lifecycleGeneration;
    this.#relayBaseUrl = config.relayBaseUrl.replace(/\/+$/, "");
    this.#claimId = String(config.claimId).trim();
    let topology: RelayTopology | null = null;
    let diagnosticPersisted = false;
    try {
      topology = await this.#discoverTopology(this.#relayBaseUrl, {
        sourceKeys: new Set(["global"]),
        expectedFingerprints: {
          global: String(this.#manifest.schemas?.global?.fingerprint ?? "").trim(),
        },
      });
      this.#schemaDiagnostic = topology.global?.schemaFingerprintDiagnostic
        ? sanitizeSchemaFingerprintDiagnostic(topology.global.schemaFingerprintDiagnostic)
        : null;
      if (this.#schemaDiagnostic) {
        await this.#currentStateRepository.recordSchemaFingerprintDiagnostic?.({
          diagnostic: this.#schemaDiagnostic,
          database: topology.global?.database ?? null,
          ready: topology.global?.ready === true,
        });
        diagnosticPersisted = true;
      }
      this.#source = globalSourceFromTopology(this.#relayBaseUrl, topology, this.#manifest);
      this.#lastTopologyCheckedAt = this.#now();
      const generation = Number(this.#catalogRepository.getSourceState()?.generation ?? 0) + 1;
      this.#session = this.#createSession({
        onSnapshot: (snapshot) => this.#commitSnapshot(snapshot, lifecycleGeneration),
      });
      await this.#session.start({
        ...this.#source,
        manifest: this.#manifest,
        generation,
      });
      if (this.#empireNotificationScope.length) {
        await this.#session.setEmpireNotificationScope(this.#empireNotificationScope);
      }
      if (lifecycleGeneration === this.#lifecycleGeneration) this.#lastError = null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!this.#schemaDiagnostic && /schema fingerprint mismatch/i.test(message)) {
        const expected = String(this.#manifest.schemas?.global?.fingerprint ?? "").trim() || null;
        const observed = topology?.global?.schemaFingerprint ?? null;
        this.#schemaDiagnostic = sanitizeSchemaFingerprintDiagnostic({
          sourceKey: "global",
          schemaUrl: topology?.global
            ? operationalRelaySchemaUrl(
                this.#relayBaseUrl,
                topology.global.port,
                topology.global.database,
              )
            : operationalRelaySchemaUrl(this.#relayBaseUrl, 443, "unknown"),
          expected,
          observed,
          attemptedAt: topology?.discoveredAt ?? new Date(this.#now()).toISOString(),
          status: "mismatch",
          error: "Relay global schema fingerprint mismatch",
        });
      }
      if (lifecycleGeneration === this.#lifecycleGeneration) {
        this.#lastError = message;
      }
      if (this.#schemaDiagnostic && !diagnosticPersisted) {
        await this.#currentStateRepository.recordSchemaFingerprintDiagnostic?.({
          diagnostic: this.#schemaDiagnostic,
          database: topology?.global?.database ?? null,
          ready: topology?.global?.ready === true,
        });
      }
      const schemaBlocked = this.#schemaDiagnostic?.status === "mismatch"
        || this.#schemaDiagnostic?.status === "download_error";
      if (schemaBlocked && this.#schemaDiagnostic) {
        await this.#currentStateRepository.recordSubscriptionHealth?.({
          sourceKey: "global",
          domain: "region",
          generation: Number(this.#catalogRepository.getSourceState()?.generation ?? 0),
          connected: false,
          runtimeState: "blocked_by_schema",
          lastError: this.#schemaDiagnostic.error,
        }, this.#schemaDiagnostic.attemptedAt);
      }
      try {
        await this.#session?.stop();
      } catch {
        // Preserve the startup failure as the actionable error.
      }
      this.#session = null;
      throw error;
    }
  }

  async setEmpireNotificationScope(empireIds: string[]): Promise<boolean> {
    const normalized = normalizeEmpireNotificationScope(empireIds);
    const identical = normalized.length === this.#empireNotificationScope.length
      && normalized.every((value, index) => value === this.#empireNotificationScope[index]);
    const retryFailedScope = identical
      && this.#session?.health().notifications.lastError != null;
    if (identical && !retryFailedScope) return false;
    if (!identical) this.#empireNotificationScope = normalized;
    this.#notificationLastError = null;
    if (!this.#session) return true;
    try {
      return await this.#session.setEmpireNotificationScope(normalized);
    } catch (error) {
      this.#notificationLastError = error instanceof Error ? error.message : String(error);
      return false;
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
    const topologyDue = healthy
      && this.#now() - this.#lastTopologyCheckedAt >= this.#topologyRefreshMs;
    if (healthy && !topologyDue) return Promise.resolve(false);
    if (this.#reconcileInFlight) return this.#reconcileInFlight;
    const reconcile = (async () => {
      if (healthy) {
        const topology = await this.#discoverTopology(normalized.relayBaseUrl, {
          sourceKeys: new Set(["global"]),
          expectedFingerprints: {
            global: String(this.#manifest.schemas?.global?.fingerprint ?? "").trim(),
          },
        });
        const discoveredSource = globalSourceFromTopology(
          normalized.relayBaseUrl,
          topology,
          this.#manifest,
        );
        this.#lastTopologyCheckedAt = this.#now();
        if (sameGlobalSource(this.#source, discoveredSource)) return false;
      }
      await this.stop();
      await this.start(normalized);
      return true;
    })();
    this.#reconcileInFlight = reconcile;
    return reconcile.finally(() => {
      if (this.#reconcileInFlight === reconcile) this.#reconcileInFlight = null;
    });
  }

  async #commitSnapshot(
    snapshot: GlobalCatalogSnapshot,
    lifecycleGeneration: number,
  ): Promise<void> {
    if (
      lifecycleGeneration !== this.#lifecycleGeneration
      || this.#session == null
    ) return;
    const claimId = this.#claimId;
    if (!claimId) throw new Error("Relay global catalog runtime has no configured claim");
    const hasCatalogChanges = snapshot.changed.some(
      (group) => group !== "empire-notifications",
    );
    if (snapshot.changed.includes("empire-notifications")) {
      const publication = this.#notificationPublicationContext.run(true, async () => {
        await this.#onEmpireNotifications?.({
          siegeNotifications: snapshot.siegeNotifications,
          notificationScopeEmpireIds: snapshot.notificationScopeEmpireIds,
          database: snapshot.database,
          schemaFingerprint: snapshot.schemaFingerprint,
          generation: snapshot.generation,
          receivedAt: snapshot.receivedAt,
        });
      });
      this.#inFlightNotificationPublications.add(publication);
      try {
        await publication;
        if (
          lifecycleGeneration !== this.#lifecycleGeneration
          || this.#session == null
        ) return;
        this.#notificationLastError = null;
      } catch (error) {
        if (
          lifecycleGeneration !== this.#lifecycleGeneration
          || this.#session == null
        ) return;
        this.#notificationLastError = error instanceof Error ? error.message : String(error);
      } finally {
        this.#inFlightNotificationPublications.delete(publication);
      }
    }
    if (!hasCatalogChanges) return;
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
            sourceGeneration: snapshot.generation,
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
        domains.buildings = {
          data: { buildings: snapshot.descriptions.building ?? [] },
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
      if (Object.keys(domains).length) {
        await this.#currentStateRepository.commitGeneration({
          claimId,
          generation: this.#currentStateRepository.nextGeneration(claimId),
          domains,
        });
        if (
          lifecycleGeneration !== this.#lifecycleGeneration
          || this.#session == null
        ) return;
      }
      if (snapshot.changed.includes("empire-foundries")) {
        await this.#onEmpireFoundries?.({
          foundries: snapshot.foundries,
          foundryWarnings: snapshot.foundryWarnings,
          database: snapshot.database,
          schemaFingerprint: snapshot.schemaFingerprint,
          generation: snapshot.generation,
          receivedAt: snapshot.receivedAt,
        });
        if (
          lifecycleGeneration !== this.#lifecycleGeneration
          || this.#session == null
        ) return;
      }
      const health = this.#session?.health();
      await this.#currentStateRepository.recordSubscriptionHealth?.({
        sourceKey: "global",
        domain: "region",
        generation: snapshot.generation,
        connected: health?.connected === true && !health.lastError,
        lastError: health?.lastError ?? null,
      }, snapshot.receivedAt);
      if (
        lifecycleGeneration === this.#lifecycleGeneration
        && this.#session != null
      ) this.#lastError = null;
    } catch (error) {
      if (
        lifecycleGeneration !== this.#lifecycleGeneration
        || this.#session == null
      ) return;
      this.#lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  health() {
    const subscription = this.#session?.health() ?? {
      state: "stopped",
      connected: false,
      applied: false,
      lastAppliedAt: null,
      lastError: null,
      notifications: {
        applied: this.#empireNotificationScope.length === 0,
        requestedEmpireIds: [...this.#empireNotificationScope],
        appliedEmpireIds: [],
        lastAppliedAt: null,
        lastError: this.#notificationLastError,
      },
    };
    const typedState = this.#session
      ? (subscription.connected === true ? "connected" : "disconnected")
      : (this.#schemaDiagnostic?.status === "mismatch"
          || this.#schemaDiagnostic?.status === "download_error")
        ? "blocked_by_schema"
        : "disconnected";
    return {
      running: this.#session != null,
      claimId: this.#claimId,
      source: this.#source ? { ...this.#source } : null,
      sourceState: this.#catalogRepository.getSourceState(),
      subscription: { ...subscription, typedState },
      schemaDiagnostic: this.#schemaDiagnostic ? { ...this.#schemaDiagnostic } : null,
      lastError: this.#lastError,
      notificationLastError: this.#notificationLastError,
    };
  }

  async stop(): Promise<void> {
    const reentrantPublication = this.#notificationPublicationContext.getStore() === true;
    this.#lifecycleGeneration += 1;
    await this.#session?.stop();
    if (!reentrantPublication) await this.#drainNotificationPublications();
    this.#session = null;
    this.#relayBaseUrl = null;
    this.#claimId = null;
    this.#source = null;
  }

  async #drainNotificationPublications(): Promise<void> {
    while (this.#inFlightNotificationPublications.size) {
      await Promise.allSettled([...this.#inFlightNotificationPublications]);
    }
  }
}

export { relayWebSocketUri };
