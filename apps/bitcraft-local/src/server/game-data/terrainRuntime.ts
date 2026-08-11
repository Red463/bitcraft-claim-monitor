import { relayWebSocketUri } from "./globalCatalogRuntime.ts";
import { RelayTerrainRegionSession, type TerrainRegionSnapshot } from "./terrainRegionSession.ts";
import type { TerrainLayoutEvidence, NormalizedTerrainGeneration } from "./terrainProjection.ts";
import { discoverRelayTopology, type RelayTopology } from "./topology.ts";

type BindingManifest = Parameters<RelayTerrainRegionSession["start"]>[0]["manifest"];
type TerrainSession = Pick<RelayTerrainRegionSession, "start" | "health" | "stop">;
type TerrainTileStore = {
  buildAndInstall(generation: NormalizedTerrainGeneration & {
    generation: string;
    regionIds: string[];
    evidence: TerrainLayoutEvidence;
  }): Promise<{ generation?: string; tileCount?: number; totalBytes?: number; generatedAt?: string }>;
};
type RuntimeConfig = { relayBaseUrl: string; activeRegionIds: string[] };
type RegionEntry = {
  session: TerrainSession;
  database: string;
  schemaFingerprint: string;
  port: number;
};

function canonicalRegions(values: unknown[]): string[] {
  const normalized = values.map((value) => String(value ?? "").trim());
  if (normalized.some((value) => !/^\d+$/.test(value))) throw new TypeError("Terrain region IDs must be decimal integers");
  const unique = [...new Set(normalized)].sort((left, right) => (BigInt(left) < BigInt(right) ? -1 : BigInt(left) > BigInt(right) ? 1 : 0));
  if (!unique.length) throw new TypeError("Terrain runtime requires at least one active region");
  if (unique.length > 4) throw new RangeError("Terrain runtime supports at most four active regions");
  return unique;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class RelayTerrainRuntime {
  readonly #manifest: BindingManifest;
  readonly #tileStore: TerrainTileStore;
  readonly #evidence: TerrainLayoutEvidence;
  readonly #discoverTopology: (baseUrl: string) => Promise<RelayTopology>;
  readonly #createSession: (options: ConstructorParameters<typeof RelayTerrainRegionSession>[0]) => TerrainSession;
  #config: RuntimeConfig | null = null;
  #sessions = new Map<string, RegionEntry>();
  #snapshots = new Map<string, TerrainRegionSnapshot>();
  #pending: (NormalizedTerrainGeneration & { regionIds: string[]; evidence: TerrainLayoutEvidence }) | null = null;
  #building: Promise<void> | null = null;
  #bundleGeneration = 0;
  #stopping = false;
  #health = {
    activeRegionIds: [] as string[],
    connectedRegionIds: [] as string[],
    appliedRegionIds: [] as string[],
    buildStage: "idle",
    pending: false,
    generation: null as string | null,
    lastGoodGeneration: null as string | null,
    lastGoodAt: null as string | null,
    tileCount: 0,
    totalBytes: 0,
    lastError: null as string | null,
  };

  constructor({
    manifest,
    tileStore,
    evidence,
    discoverTopology: discover = discoverRelayTopology,
    createSession = (options) => new RelayTerrainRegionSession(options),
  }: {
    manifest: BindingManifest;
    tileStore: TerrainTileStore;
    evidence: TerrainLayoutEvidence;
    discoverTopology?: (baseUrl: string) => Promise<RelayTopology>;
    createSession?: (options: ConstructorParameters<typeof RelayTerrainRegionSession>[0]) => TerrainSession;
  }) {
    if (!evidence?.verified) throw new TypeError("Terrain runtime requires verified layout evidence");
    this.#manifest = manifest;
    this.#tileStore = tileStore;
    this.#evidence = evidence;
    this.#discoverTopology = discover;
    this.#createSession = createSession;
  }

  async start(config: RuntimeConfig): Promise<void> {
    if (this.#config) throw new Error("Relay terrain runtime is already started");
    await this.#applyConfig(config);
  }

  async reconcile(config: RuntimeConfig): Promise<boolean> {
    const regions = canonicalRegions(config.activeRegionIds);
    const changed = !this.#config
      || this.#config.relayBaseUrl !== config.relayBaseUrl
      || regions.join(",") !== this.#health.activeRegionIds.join(",");
    await this.#applyConfig({ ...config, activeRegionIds: regions });
    return changed;
  }

  async #applyConfig(config: RuntimeConfig): Promise<void> {
    const activeRegionIds = canonicalRegions(config.activeRegionIds);
    this.#config = { relayBaseUrl: String(config.relayBaseUrl), activeRegionIds };
    this.#health.activeRegionIds = activeRegionIds;
    const topology = await this.#discoverTopology(this.#config.relayBaseUrl);
    for (const [regionId, entry] of [...this.#sessions]) {
      const source = topology.regions.get(regionId as never);
      const desired = activeRegionIds.includes(regionId)
        && source?.ready
        && source.schemaFingerprint
        && entry.database === source.database
        && entry.schemaFingerprint === source.schemaFingerprint
        && entry.port === source.port;
      if (!desired) {
        await entry.session.stop();
        this.#sessions.delete(regionId);
        this.#snapshots.delete(regionId);
      }
    }
    for (const regionId of activeRegionIds) {
      if (this.#sessions.has(regionId)) continue;
      const source = topology.regions.get(regionId as never);
      if (!source?.ready || !source.schemaFingerprint) {
        this.#health.lastError = `Relay terrain region ${regionId} source is unavailable`;
        continue;
      }
      const session = this.#createSession({
        onSnapshot: (snapshot) => { this.#acceptSnapshot(snapshot); },
        onFailure: (error) => { this.#health.lastError = error; },
      });
      await session.start({
        uri: relayWebSocketUri(this.#config.relayBaseUrl, source.port),
        database: source.database,
        schemaFingerprint: source.schemaFingerprint,
        manifest: this.#manifest,
        generation: 1,
        regionId,
        maxChunks: 20_000,
        maxBytes: 128 * 1024 * 1024,
      });
      this.#sessions.set(regionId, { session, database: source.database, schemaFingerprint: source.schemaFingerprint, port: source.port });
    }
    this.#refreshSessionHealth();
  }

  #acceptSnapshot(snapshot: TerrainRegionSnapshot) {
    if (this.#stopping || !this.#health.activeRegionIds.includes(snapshot.regionId)) return;
    this.#snapshots.set(snapshot.regionId, snapshot);
    const selected = this.#health.activeRegionIds.map((regionId) => this.#snapshots.get(regionId)).filter((value): value is TerrainRegionSnapshot => value != null);
    const chunks = selected.flatMap(({ data }) => data.chunks).sort((left, right) => left.chunkX - right.chunkX || left.chunkZ - right.chunkZ);
    const bounds = selected.map(({ data }) => data.regionBounds);
    const latest = selected.reduce((winner, value) => value.receivedAt > winner.receivedAt ? value : winner);
    this.#pending = {
      ...latest.data,
      observedAt: latest.receivedAt,
      regionBounds: {
        minChunkX: Math.min(...bounds.map((value) => value.minChunkX)),
        minChunkZ: Math.min(...bounds.map((value) => value.minChunkZ)),
        maxChunkX: Math.max(...bounds.map((value) => value.maxChunkX)),
        maxChunkZ: Math.max(...bounds.map((value) => value.maxChunkZ)),
      },
      chunks,
      cellCount: selected.reduce((total, value) => total + value.data.cellCount, 0),
      normalizedBytes: selected.reduce((total, value) => total + value.data.normalizedBytes, 0),
      regionIds: selected.map(({ regionId }) => regionId),
      evidence: this.#evidence,
    };
    this.#health.pending = true;
    this.#refreshSessionHealth();
    if (!this.#building) this.#building = this.#drainBuilds();
  }

  async #drainBuilds() {
    try {
      while (this.#pending && !this.#stopping) {
        const pending = this.#pending;
        this.#pending = null;
        this.#health.pending = false;
        const generation = String(++this.#bundleGeneration);
        this.#health.generation = generation;
        this.#health.buildStage = "building";
        try {
          const manifest = await this.#tileStore.buildAndInstall({ ...pending, generation });
          this.#health.buildStage = "installed";
          this.#health.lastGoodGeneration = String(manifest.generation ?? generation);
          this.#health.lastGoodAt = manifest.generatedAt ?? new Date().toISOString();
          this.#health.tileCount = Number(manifest.tileCount ?? 0);
          this.#health.totalBytes = Number(manifest.totalBytes ?? 0);
          this.#health.lastError = null;
        } catch (error) {
          this.#health.buildStage = "error";
          this.#health.lastError = errorMessage(error);
        }
      }
    } finally {
      this.#building = null;
      if (this.#pending && !this.#stopping) this.#building = this.#drainBuilds();
    }
  }

  #refreshSessionHealth() {
    this.#health.connectedRegionIds = [...this.#sessions].filter(([, entry]) => entry.session.health().connected).map(([regionId]) => regionId);
    this.#health.appliedRegionIds = [...this.#snapshots.keys()].sort((left, right) => Number(left) - Number(right));
  }

  health() {
    this.#refreshSessionHealth();
    return { ...this.#health, activeRegionIds: [...this.#health.activeRegionIds], connectedRegionIds: [...this.#health.connectedRegionIds], appliedRegionIds: [...this.#health.appliedRegionIds] };
  }

  async waitForIdle(): Promise<void> {
    while (this.#building) await this.#building;
  }

  async stop(): Promise<void> {
    this.#stopping = true;
    this.#pending = null;
    await Promise.all([...this.#sessions.values()].map(({ session }) => session.stop()));
    this.#sessions.clear();
    this.#snapshots.clear();
    await this.waitForIdle();
    this.#config = null;
    this.#health.activeRegionIds = [];
    this.#refreshSessionHealth();
  }
}
