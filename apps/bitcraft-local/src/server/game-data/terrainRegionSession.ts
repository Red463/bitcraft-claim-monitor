import { normalizeTerrainGeneration, type NormalizedTerrainGeneration } from "./terrainProjection.ts";
import { assertSchemaFingerprint, schemaBindingsReady } from "./schemaManifest.ts";

type BindingManifest = Parameters<typeof assertSchemaFingerprint>[0];
type CachedTable = {
  iter(): IterableIterator<unknown>;
  onInsert?(callback: () => void): void;
  onUpdate?(callback: () => void): void;
  onDelete?(callback: () => void): void;
  removeOnInsert?(callback: () => void): void;
  removeOnUpdate?(callback: () => void): void;
  removeOnDelete?(callback: () => void): void;
};
type SubscriptionHandle = { unsubscribe(): void };
type SubscriptionBuilder = {
  onApplied(callback: (context?: unknown) => void): SubscriptionBuilder;
  onError(callback: (context: unknown, error: Error) => void): SubscriptionBuilder;
  subscribe(queries: readonly string[] | string[]): SubscriptionHandle;
};
type BindingConnection = {
  db: { worldRegionState: CachedTable; biomeDesc: CachedTable; terrainChunkState: CachedTable };
  subscriptionBuilder(): SubscriptionBuilder;
  disconnect(): void;
};
type ConnectionBuilder = {
  withUri(uri: string): ConnectionBuilder;
  withDatabaseName(database: string): ConnectionBuilder;
  onConnect(callback: (connection: BindingConnection, identity?: unknown, token?: string) => void): ConnectionBuilder;
  onConnectError(callback: (context: unknown, error: Error) => void): ConnectionBuilder;
  onDisconnect(callback: (context: unknown, error?: Error) => void): ConnectionBuilder;
  build(): BindingConnection;
};
type RegionalBindingModule = { DbConnection: { builder(): ConnectionBuilder } };
type SessionConfig = {
  uri: string;
  database: string;
  schemaFingerprint: string;
  manifest: BindingManifest;
  generation: number;
  regionId: string;
  maxChunks?: number;
  maxBytes?: number;
};

export type TerrainRegionSnapshot = {
  data: NormalizedTerrainGeneration;
  warnings: string[];
  database: string;
  regionId: string;
  schemaFingerprint: string;
  generation: number;
  receivedAt: string;
};

async function loadBundledRegionalBindings(): Promise<RegionalBindingModule> {
  return await import(new URL("./bindings/regional.js", import.meta.url).href) as unknown as RegionalBindingModule;
}

function tableRows(table: CachedTable): unknown[] {
  return [...table.iter()];
}

function decimal(value: unknown, label: string): string {
  const normalized = String(value ?? "").trim();
  if (!/^\d+$/.test(normalized)) throw new TypeError(`${label} must be a decimal integer`);
  return normalized;
}

function positiveInteger(value: unknown, label: string): number {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized <= 0) throw new TypeError(`${label} must be a positive safe integer`);
  return normalized;
}

export function terrainRegionQueries(regionId: string): string[] {
  decimal(regionId, "Terrain region id");
  return [
    "SELECT * FROM world_region_state",
    "SELECT * FROM biome_desc",
    "SELECT * FROM terrain_chunk_state WHERE dimension = 1",
  ];
}

export class RelayTerrainRegionSession {
  readonly #loadBindings: () => Promise<RegionalBindingModule>;
  readonly #onSnapshot: (snapshot: TerrainRegionSnapshot) => void | Promise<void>;
  readonly #onFailure: (error: string) => void;
  readonly #now: () => Date;
  #connection: BindingConnection | null = null;
  #subscription: SubscriptionHandle | null = null;
  #config: (SessionConfig & { maxChunks: number; maxBytes: number; regionId: string }) | null = null;
  #generation = 1;
  #listenersAttached = false;
  #applyQueued = false;
  #stopping = false;
  #health = {
    connected: false,
    applied: false,
    stage: "idle",
    rowCount: 0,
    chunkCount: 0,
    normalizedBytes: 0,
    lastAppliedAt: null as string | null,
    lastError: null as string | null,
  };

  readonly #changed = () => this.#queueApply();

  constructor({ loadBindings = loadBundledRegionalBindings, onSnapshot, onFailure = () => {}, now = () => new Date() }: {
    loadBindings?: () => Promise<RegionalBindingModule>;
    onSnapshot: (snapshot: TerrainRegionSnapshot) => void | Promise<void>;
    onFailure?: (error: string) => void;
    now?: () => Date;
  }) {
    this.#loadBindings = loadBindings;
    this.#onSnapshot = onSnapshot;
    this.#onFailure = onFailure;
    this.#now = now;
  }

  async start(config: SessionConfig): Promise<void> {
    if (this.#connection || this.#config) throw new Error("Relay terrain region session is already started");
    assertSchemaFingerprint(config.manifest, "regional", config.schemaFingerprint);
    if (!schemaBindingsReady(config.manifest, "regional")) throw new Error("Relay regional schema bindings are not generated");
    const regionId = decimal(config.regionId, "Relay terrain region id");
    this.#generation = positiveInteger(config.generation, "Relay terrain generation");
    this.#config = {
      ...config,
      regionId,
      maxChunks: positiveInteger(config.maxChunks ?? 20_000, "Relay terrain chunk budget"),
      maxBytes: positiveInteger(config.maxBytes ?? 128 * 1024 * 1024, "Relay terrain byte budget"),
    };
    this.#stopping = false;
    const bindings = await this.#loadBindings();
    this.#connection = bindings.DbConnection.builder()
      .withUri(config.uri)
      .withDatabaseName(config.database)
      .onConnect((connection) => {
        this.#health.connected = true;
        this.#health.stage = "subscribing";
        this.#subscription = connection.subscriptionBuilder()
          .onApplied(() => {
            this.#attachListeners(connection);
            this.#apply(connection);
          })
          .onError((_context, error) => this.#recordError(error))
          .subscribe(terrainRegionQueries(regionId));
      })
      .onConnectError((_context, error) => this.#recordError(error))
      .onDisconnect((_context, error) => {
        this.#health.connected = false;
        if (!this.#stopping) this.#recordError(error ?? new Error("Relay terrain subscription disconnected"));
      })
      .build();
  }

  #attachListeners(connection: BindingConnection) {
    if (this.#listenersAttached) return;
    for (const table of [connection.db.worldRegionState, connection.db.biomeDesc, connection.db.terrainChunkState]) {
      table.onInsert?.(this.#changed);
      table.onUpdate?.(this.#changed);
      table.onDelete?.(this.#changed);
    }
    this.#listenersAttached = true;
  }

  #removeListeners() {
    if (!this.#connection || !this.#listenersAttached) return;
    for (const table of [this.#connection.db.worldRegionState, this.#connection.db.biomeDesc, this.#connection.db.terrainChunkState]) {
      table.removeOnInsert?.(this.#changed);
      table.removeOnUpdate?.(this.#changed);
      table.removeOnDelete?.(this.#changed);
    }
    this.#listenersAttached = false;
  }

  #queueApply() {
    if (this.#applyQueued || !this.#connection) return;
    this.#applyQueued = true;
    queueMicrotask(() => {
      this.#applyQueued = false;
      if (this.#connection) this.#apply(this.#connection);
    });
  }

  #apply(connection: BindingConnection) {
    const config = this.#config;
    if (!config) return;
    try {
      const worldRegionRows = tableRows(connection.db.worldRegionState);
      const biomeRows = tableRows(connection.db.biomeDesc);
      const terrainRows = tableRows(connection.db.terrainChunkState);
      const receivedAt = this.#now().toISOString();
      const data = normalizeTerrainGeneration({
        regionId: config.regionId,
        dimension: "1",
        worldRegionRows,
        biomeRows,
        terrainRows,
        observedAt: receivedAt,
        maxChunks: config.maxChunks,
        maxBytes: config.maxBytes,
      });
      const snapshot = {
        data,
        warnings: [],
        database: config.database,
        regionId: config.regionId,
        schemaFingerprint: config.schemaFingerprint,
        generation: this.#generation++,
        receivedAt,
      };
      Promise.resolve(this.#onSnapshot(snapshot)).then(() => {
        this.#health.applied = true;
        this.#health.stage = "applied";
        this.#health.rowCount = worldRegionRows.length + biomeRows.length + terrainRows.length;
        this.#health.chunkCount = terrainRows.length;
        this.#health.normalizedBytes = data.normalizedBytes;
        this.#health.lastAppliedAt = receivedAt;
        this.#health.lastError = null;
      }).catch((error) => this.#recordError(error));
    } catch (error) {
      this.#recordError(error);
    }
  }

  #recordError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    this.#health.stage = "error";
    this.#health.lastError = message;
    this.#onFailure(message);
  }

  health() {
    return { ...this.#health };
  }

  async stop(): Promise<void> {
    this.#stopping = true;
    this.#subscription?.unsubscribe();
    this.#subscription = null;
    this.#removeListeners();
    this.#connection?.disconnect();
    this.#connection = null;
    this.#config = null;
    this.#health.connected = false;
    this.#health.stage = "stopped";
  }
}
