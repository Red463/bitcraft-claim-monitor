import {
  RelayClaimMarketRegionSession,
  type RegionalClaimMarketSnapshot,
} from "./claimMarketRegionSession.ts";
import type { DomainSnapshotBatch } from "./contracts.ts";
import { relayWebSocketUri } from "./globalCatalogRuntime.ts";
import { discoverRelayTopology, type RelayTopology } from "./topology.ts";

type BindingManifest = Parameters<RelayClaimMarketRegionSession["start"]>[0]["manifest"];

type CurrentStateRepository = {
  nextGeneration(claimId: string): number;
  commitGenerationWithTransition(
    batch: DomainSnapshotBatch,
    transition: {
      transitionKey: string;
      claimId: string;
      domain: "market";
      observedAt: string;
      payload: unknown;
    },
  ): Promise<{
    published: boolean;
    changedDomains: string[];
    generation: number;
  }> | {
    published: boolean;
    changedDomains: string[];
    generation: number;
  };
  read?(claimId: string, domain: "market"): { data: unknown } | null;
};

type ClaimMarketSession = {
  start(config: Parameters<RelayClaimMarketRegionSession["start"]>[0]): Promise<void>;
  health(): ReturnType<RelayClaimMarketRegionSession["health"]>;
  stop(): Promise<void>;
};

type ClaimMarketSessionFactory = (
  options: ConstructorParameters<typeof RelayClaimMarketRegionSession>[0],
) => ClaimMarketSession;

type RuntimeDependencies = {
  manifest: BindingManifest;
  currentStateRepository: CurrentStateRepository;
  discoverTopology?: (baseUrl: string) => Promise<RelayTopology>;
  createSession?: ClaimMarketSessionFactory;
  onSnapshotCommitted?: (input: {
    claimId: string;
    generation: number;
    transitionKey: string;
    previousData: unknown | null;
    currentData: RegionalClaimMarketSnapshot["data"];
    observedAt: string;
  }) => Promise<void> | void;
  deriveTransitionEvents?: (input: {
    claimId: string;
    previousData: unknown | null;
    currentData: RegionalClaimMarketSnapshot["data"];
    observedAt: string;
  }) => unknown[];
  now?: () => number;
  reconnectDelayMs?: (failureCount: number) => number;
};

function decimalInteger(value: unknown, label: string): string {
  const normalized = String(value ?? "").trim();
  if (!/^\d+$/.test(normalized)) throw new TypeError(`${label} must be a decimal integer`);
  return normalized;
}

export class RelayClaimMarketRuntime {
  readonly #manifest: BindingManifest;
  readonly #currentStateRepository: CurrentStateRepository;
  readonly #discoverTopology: (baseUrl: string) => Promise<RelayTopology>;
  readonly #createSession: ClaimMarketSessionFactory;
  readonly #onSnapshotCommitted: RuntimeDependencies["onSnapshotCommitted"];
  readonly #deriveTransitionEvents: NonNullable<RuntimeDependencies["deriveTransitionEvents"]>;
  readonly #now: () => number;
  readonly #reconnectDelayMs: (failureCount: number) => number;
  #session: ClaimMarketSession | null = null;
  #relayBaseUrl: string | null = null;
  #claimId: string | null = null;
  #regionId: string | null = null;
  #sessionEpoch = 0;
  #commitTail: Promise<void> = Promise.resolve();
  #transitionTail: Promise<void> = Promise.resolve();
  #source: {
    sourceKey: `region:${number}`;
    regionId: string;
    database: string;
    schemaFingerprint: string;
    uri: string;
  } | null = null;
  #lastError: string | null = null;
  #transitionLastError: string | null = null;
  #connectionFailures = 0;
  #nextReconnectAt = 0;

  constructor(dependencies: RuntimeDependencies) {
    this.#manifest = dependencies.manifest;
    this.#currentStateRepository = dependencies.currentStateRepository;
    this.#discoverTopology = dependencies.discoverTopology ?? discoverRelayTopology;
    this.#createSession = dependencies.createSession
      ?? ((options) => new RelayClaimMarketRegionSession(options));
    this.#onSnapshotCommitted = dependencies.onSnapshotCommitted;
    this.#deriveTransitionEvents = dependencies.deriveTransitionEvents ?? (() => []);
    this.#now = dependencies.now ?? Date.now;
    this.#reconnectDelayMs = dependencies.reconnectDelayMs ?? (() => 1_000);
  }

  async start(config: {
    relayBaseUrl: string;
    claimId: string;
    regionId: string;
  }): Promise<void> {
    if (this.#session) throw new Error("Relay claim-market runtime is already started");
    this.#relayBaseUrl = config.relayBaseUrl.replace(/\/+$/, "");
    this.#claimId = decimalInteger(config.claimId, "Relay claim-market claim id");
    this.#regionId = decimalInteger(config.regionId, "Relay claim-market region id");
    await this.#startSession(this.#regionId);
  }

  async reconcile(config: { claimId?: string; regionId: string }): Promise<void> {
    const claimId = decimalInteger(
      config.claimId ?? this.#claimId,
      "Relay claim-market claim id",
    );
    const regionId = decimalInteger(config.regionId, "Relay claim-market region id");
    const configuredScope = this.#claimId === claimId && this.#regionId === regionId;
    const sameScope = Boolean(this.#session && configuredScope);
    const health = this.#session?.health();
    const unhealthy = configuredScope && (
      this.#session
        ? health?.connected === false || Boolean(health?.lastError || this.#lastError)
        : Boolean(this.#lastError)
    );
    if (configuredScope && unhealthy) {
      if (this.#now() < this.#nextReconnectAt) return;
      this.#connectionFailures += 1;
      this.#nextReconnectAt = this.#now() + this.#reconnectDelayMs(this.#connectionFailures);
    } else if (sameScope) {
      this.#connectionFailures = 0;
      this.#nextReconnectAt = 0;
      return;
    } else if (!configuredScope) {
      this.#connectionFailures = 0;
      this.#nextReconnectAt = 0;
    }
    this.#sessionEpoch += 1;
    await this.#session?.stop();
    await this.#commitTail;
    this.#session = null;
    this.#claimId = claimId;
    this.#regionId = regionId;
    await this.#startSession(regionId);
  }

  async #startSession(regionIdValue: string): Promise<void> {
    const relayBaseUrl = this.#relayBaseUrl;
    const claimId = this.#claimId;
    if (!relayBaseUrl || !claimId) throw new Error("Relay claim-market runtime is not configured");
    const regionId = decimalInteger(regionIdValue, "Relay claim-market region id");
    let openingSession: ClaimMarketSession | null = null;
    try {
      const topology = await this.#discoverTopology(relayBaseUrl);
      const region = topology.regions.get(regionId);
      if (!region?.ready || !region.schemaFingerprint) {
        throw new Error(`Relay region ${regionId} source is not ready or has no schema fingerprint`);
      }
      const source = {
        sourceKey: `region:${Number(regionId)}` as const,
        regionId,
        database: region.database,
        schemaFingerprint: region.schemaFingerprint,
        uri: relayWebSocketUri(relayBaseUrl, region.port),
      };
      const sessionEpoch = this.#sessionEpoch + 1;
      this.#sessionEpoch = sessionEpoch;
      openingSession = this.#createSession({
        onSnapshot: (snapshot) => this.#enqueueSnapshot(snapshot, sessionEpoch),
      });
      await openingSession.start({
        uri: source.uri,
        database: source.database,
        schemaFingerprint: source.schemaFingerprint,
        manifest: this.#manifest,
        generation: 1,
        regionId,
        claimId,
      });
      this.#session = openingSession;
      this.#regionId = regionId;
      this.#source = source;
      this.#lastError = null;
    } catch (error) {
      this.#lastError = error instanceof Error ? error.message : String(error);
      try {
        await openingSession?.stop();
      } catch {
        // Preserve the actionable startup failure.
      }
      this.#session = null;
      throw error;
    }
  }

  #enqueueSnapshot(snapshot: RegionalClaimMarketSnapshot, sessionEpoch: number): Promise<void> {
    const commit = this.#commitTail.then(async () => {
      if (sessionEpoch !== this.#sessionEpoch) return;
      await this.#commitSnapshot(snapshot);
    });
    this.#commitTail = commit.catch(() => {});
    return commit;
  }

  async #commitSnapshot(snapshot: RegionalClaimMarketSnapshot): Promise<void> {
    const claimId = this.#claimId;
    if (!claimId) throw new Error("Relay claim-market runtime has no configured claim");
    if (snapshot.data.claimId !== claimId || snapshot.regionId !== this.#regionId) {
      throw new Error("Relay claim-market snapshot escaped its configured claim or region");
    }
    const sourceKey = `region:${Number(snapshot.regionId)}` as const;
    const previousData = this.#currentStateRepository.read?.(claimId, "market")?.data ?? null;
    try {
      const generation = this.#currentStateRepository.nextGeneration(claimId);
      const transitionInput = {
        claimId,
        previousData,
        currentData: snapshot.data,
        observedAt: snapshot.receivedAt,
      };
      const events = this.#deriveTransitionEvents(transitionInput);
      if (!Array.isArray(events)) {
        throw new TypeError("Relay claim-market transition derivation must return an array");
      }
      const transitionKey = `claim-market:${claimId}:market:${generation}`;
      const publication = await this.#currentStateRepository.commitGenerationWithTransition({
        claimId,
        generation,
        domains: {
          market: {
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
      }, {
        transitionKey,
        claimId,
        domain: "market",
        observedAt: snapshot.receivedAt,
        payload: {
          version: 1,
          claimId,
          generation,
          observedAt: snapshot.receivedAt,
          events,
        },
      });
      this.#lastError = null;
      if (publication.published) {
        this.#enqueueTransition({
          ...transitionInput,
          generation,
          transitionKey,
        });
      }
    } catch (error) {
      this.#lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  #enqueueTransition(input: {
    claimId: string;
    generation: number;
    transitionKey: string;
    previousData: unknown | null;
    currentData: RegionalClaimMarketSnapshot["data"];
    observedAt: string;
  }) {
    if (!this.#onSnapshotCommitted) return;
    const transition = this.#transitionTail.then(async () => {
      await this.#onSnapshotCommitted?.(input);
      this.#transitionLastError = null;
    });
    this.#transitionTail = transition.catch((error) => {
      this.#transitionLastError = error instanceof Error ? error.message : String(error);
    });
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
      transition: {
        lastError: this.#transitionLastError,
      },
    };
  }

  async stop(): Promise<void> {
    this.#sessionEpoch += 1;
    await this.#session?.stop();
    await this.#commitTail;
    await this.#transitionTail;
    this.#session = null;
    this.#relayBaseUrl = null;
    this.#claimId = null;
    this.#regionId = null;
    this.#source = null;
    this.#connectionFailures = 0;
    this.#nextReconnectAt = 0;
  }
}
