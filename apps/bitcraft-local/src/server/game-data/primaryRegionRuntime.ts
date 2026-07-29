import type { DomainSnapshotBatch } from "./contracts.ts";
import { relayWebSocketUri } from "./globalCatalogRuntime.ts";
import {
  RelayPrimaryRegionPlayerSession,
  type RegionalPlayerSnapshot,
} from "./primaryRegionPlayerSession.ts";
import { discoverRelayTopology, type RelayTopology } from "./topology.ts";

type BindingManifest = Parameters<RelayPrimaryRegionPlayerSession["start"]>[0]["manifest"];
type Member = Parameters<RelayPrimaryRegionPlayerSession["start"]>[0]["members"][number];

type CurrentStateRepository = {
  nextGeneration(claimId: string): number;
  commitGeneration(batch: DomainSnapshotBatch): Promise<void> | void;
};

type RegionalSession = {
  start(config: Parameters<RelayPrimaryRegionPlayerSession["start"]>[0]): Promise<void>;
  health(): ReturnType<RelayPrimaryRegionPlayerSession["health"]>;
  stop(): Promise<void>;
};

type RegionalSessionFactory = (
  options: ConstructorParameters<typeof RelayPrimaryRegionPlayerSession>[0],
) => RegionalSession;

type RuntimeDependencies = {
  manifest: BindingManifest;
  currentStateRepository: CurrentStateRepository;
  discoverTopology?: (baseUrl: string) => Promise<RelayTopology>;
  createSession?: RegionalSessionFactory;
};

function memberId(member: Member): string {
  return String(member.playerEntityId ?? member.player_entity_id ?? "").trim();
}

function membershipSignature(regionId: string, members: Member[]): string {
  const identities = members.map((member) => (
    `${memberId(member)}:${String(member.userName ?? member.user_name ?? "").trim()}`
  ));
  return `${regionId}:${[...new Set(identities)].sort().join(",")}`;
}

export class RelayPrimaryRegionRuntime {
  readonly #manifest: BindingManifest;
  readonly #currentStateRepository: CurrentStateRepository;
  readonly #discoverTopology: (baseUrl: string) => Promise<RelayTopology>;
  readonly #createSession: RegionalSessionFactory;
  #session: RegionalSession | null = null;
  #relayBaseUrl: string | null = null;
  #claimId: string | null = null;
  #signature: string | null = null;
  #sessionEpoch = 0;
  #commitTail: Promise<void> = Promise.resolve();
  #source: {
    sourceKey: `region:${number}`;
    regionId: string;
    database: string;
    schemaFingerprint: string;
    uri: string;
  } | null = null;
  #lastError: string | null = null;

  constructor(dependencies: RuntimeDependencies) {
    this.#manifest = dependencies.manifest;
    this.#currentStateRepository = dependencies.currentStateRepository;
    this.#discoverTopology = dependencies.discoverTopology ?? discoverRelayTopology;
    this.#createSession = dependencies.createSession
      ?? ((options) => new RelayPrimaryRegionPlayerSession(options));
  }

  async start(config: {
    relayBaseUrl: string;
    claimId: string;
    regionId: string;
    members: Member[];
  }): Promise<void> {
    if (this.#session) throw new Error("Relay primary-region runtime is already started");
    this.#relayBaseUrl = config.relayBaseUrl.replace(/\/+$/, "");
    this.#claimId = String(config.claimId).trim();
    await this.#startSession(config.regionId, config.members);
  }

  async reconcile(config: { regionId: string; members: Member[] }): Promise<void> {
    const nextSignature = membershipSignature(config.regionId, config.members);
    if (this.#session && nextSignature === this.#signature) return;
    this.#sessionEpoch += 1;
    await this.#session?.stop();
    await this.#commitTail;
    this.#session = null;
    this.#signature = null;
    await this.#startSession(config.regionId, config.members);
  }

  async #startSession(regionIdValue: string, members: Member[]): Promise<void> {
    const relayBaseUrl = this.#relayBaseUrl;
    if (!relayBaseUrl || !this.#claimId) {
      throw new Error("Relay primary-region runtime is not configured");
    }
    const regionId = String(regionIdValue).trim();
    let openingSession: RegionalSession | null = null;
    try {
      const topology = await this.#discoverTopology(relayBaseUrl);
      const region = topology.regions.get(regionId);
      if (!region?.ready || !region.schemaFingerprint) {
        throw new Error(`Relay region ${regionId} source is not ready or has no schema fingerprint`);
      }
      this.#source = {
        sourceKey: `region:${Number(regionId)}`,
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
        uri: this.#source.uri,
        database: this.#source.database,
        schemaFingerprint: this.#source.schemaFingerprint,
        manifest: this.#manifest,
        generation: 1,
        regionId,
        members,
      });
      this.#session = openingSession;
      this.#signature = membershipSignature(regionId, members);
      this.#lastError = null;
    } catch (error) {
      this.#lastError = error instanceof Error ? error.message : String(error);
      try {
        await openingSession?.stop();
      } catch {
        // Preserve the startup failure as the actionable error.
      }
      this.#session = null;
      throw error;
    }
  }

  #enqueueSnapshot(snapshot: RegionalPlayerSnapshot, sessionEpoch: number): Promise<void> {
    const commit = this.#commitTail.then(async () => {
      if (sessionEpoch !== this.#sessionEpoch) return;
      await this.#commitSnapshot(snapshot);
    });
    this.#commitTail = commit.catch(() => {});
    return commit;
  }

  async #commitSnapshot(snapshot: RegionalPlayerSnapshot): Promise<void> {
    const claimId = this.#claimId;
    if (!claimId) throw new Error("Relay primary-region runtime has no configured claim");
    const sourceKey = `region:${Number(snapshot.regionId)}` as const;
    try {
      await this.#currentStateRepository.commitGeneration({
        claimId,
        generation: this.#currentStateRepository.nextGeneration(claimId),
        domains: {
          players: {
            data: snapshot.players,
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
          equipment: {
            data: snapshot.equipment,
            confidence: snapshot.equipmentWarnings.length ? "partial" : "authoritative",
            provenance: {
              provider: "relay",
              sourceKey,
              regionId: snapshot.regionId,
              database: snapshot.database,
              schemaFingerprint: snapshot.schemaFingerprint,
              sourceObservedAt: null,
              receivedAt: snapshot.receivedAt,
            },
            warnings: snapshot.equipmentWarnings,
          },
        },
      });
      this.#lastError = null;
    } catch (error) {
      this.#lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  health() {
    return {
      running: this.#session != null,
      source: this.#source ? { ...this.#source } : null,
      membershipSignature: this.#signature,
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
    this.#sessionEpoch += 1;
    await this.#session?.stop();
    await this.#commitTail;
    this.#session = null;
    this.#signature = null;
  }
}
