import { mapSpatialBaseQueries, mapSpatialDetailQueries, normalizeMapSpatial, selectedMapEnemyRows } from "./mapSpatialProjection.ts";
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
  onApplied(callback: () => void): SubscriptionBuilder;
  onError(callback: (context: unknown, error: Error) => void): SubscriptionBuilder;
  subscribe(queries: string[]): SubscriptionHandle;
};
type BindingConnection = {
  db: { bankState: CachedTable; waystoneState: CachedTable; resourceState: CachedTable; enemyState: CachedTable; locationState: CachedTable; mobileEntityState: CachedTable };
  subscriptionBuilder(): SubscriptionBuilder;
  disconnect(): void;
};
type ConnectionBuilder = {
  withUri(uri: string): ConnectionBuilder;
  withDatabaseName(database: string): ConnectionBuilder;
  onConnect(callback: (connection: BindingConnection) => void): ConnectionBuilder;
  onConnectError(callback: (context: unknown, error: Error) => void): ConnectionBuilder;
  onDisconnect(callback: (context: unknown, error?: Error) => void): ConnectionBuilder;
  build(): BindingConnection;
};
type RegionalBindingModule = { DbConnection: { builder(): ConnectionBuilder } };
type MapSpatialScope = { claimId: string; regionId: string; playerIds: string[]; resourceIds: string[]; enemyTypes: string[] };
type SessionConfig = { uri: string; database: string; schemaFingerprint: string; manifest: BindingManifest; generation: number; scope: MapSpatialScope; maxRows?: number };
export type MapSpatialSnapshot = { data: ReturnType<typeof normalizeMapSpatial>["data"]; warnings: string[]; database: string; regionId: string; schemaFingerprint: string; generation: number; receivedAt: string };

async function loadBundledRegionalBindings(): Promise<RegionalBindingModule> {
  return await import(new URL("./bindings/regional.js", import.meta.url).href) as unknown as RegionalBindingModule;
}

function tableRows(table: CachedTable): unknown[] {
  return [...table.iter()];
}

export class RelayMapSpatialSession {
  readonly #loadBindings: () => Promise<RegionalBindingModule>;
  readonly #onSnapshot: (snapshot: MapSpatialSnapshot) => void | Promise<void>;
  readonly #onFailure: (error: string) => void;
  readonly #now: () => Date;
  #connection: BindingConnection | null = null;
  #baseSubscription: SubscriptionHandle | null = null;
  #detailSubscription: SubscriptionHandle | null = null;
  #config: (SessionConfig & { maxRows: number }) | null = null;
  #nextGeneration = 1;
  #stopping = false;
  #baseListeners = false;
  #detailListeners = false;
  #rebuildQueued = false;
  #applyQueued = false;
  #health = {
    connected: false,
    applied: false,
    stage: "idle",
    rowCount: 0,
    resourceRowCount: 0,
    enemyRowCount: 0,
    detailEntityCount: 0,
    detailQueryCount: 0,
    lastAppliedAt: null as string | null,
    lastError: null as string | null,
  };

  readonly #baseChanged = () => this.#queueDetailRebuild();
  readonly #detailChanged = () => this.#queueApply();

  constructor({ loadBindings = loadBundledRegionalBindings, onSnapshot, onFailure = () => {}, now = () => new Date() }: { loadBindings?: () => Promise<RegionalBindingModule>; onSnapshot: (snapshot: MapSpatialSnapshot) => void | Promise<void>; onFailure?: (error: string) => void; now?: () => Date }) {
    this.#loadBindings = loadBindings;
    this.#onSnapshot = onSnapshot;
    this.#onFailure = onFailure;
    this.#now = now;
  }

  async start(config: SessionConfig): Promise<void> {
    if (this.#connection) throw new Error("Relay map-spatial session is already started");
    assertSchemaFingerprint(config.manifest, "regional", config.schemaFingerprint);
    if (!schemaBindingsReady(config.manifest, "regional")) throw new Error("Relay regional schema bindings are not generated");
    if (!Number.isSafeInteger(config.generation) || config.generation < 1) throw new TypeError("Relay map-spatial generation must be positive");
    this.#config = { ...config, maxRows: config.maxRows ?? 50_000 };
    this.#nextGeneration = config.generation;
    this.#stopping = false;
    const bindings = await this.#loadBindings();
    this.#connection = bindings.DbConnection.builder()
      .withUri(config.uri)
      .withDatabaseName(config.database)
      .onConnect((connection) => {
        this.#health.connected = true;
        this.#health.stage = "base";
        this.#baseSubscription = connection.subscriptionBuilder()
          .onApplied(() => {
            this.#attachBaseListeners(connection);
            this.#rebuildDetails(connection);
          })
          .onError((_context, error) => this.#recordError(error))
          .subscribe(mapSpatialBaseQueries(config.scope));
      })
      .onConnectError((_context, error) => { if (!this.#stopping) this.#recordError(error); })
      .onDisconnect((_context, error) => {
        this.#health.connected = false;
        if (!this.#stopping) this.#recordError(error ?? new Error("Relay map-spatial subscription disconnected."));
      })
      .build();
  }

  #rebuildDetails(connection: BindingConnection) {
    const config = this.#config;
    if (!config) return;
    this.#detailSubscription?.unsubscribe();
    this.#detailSubscription = null;
    const resourceRows = tableRows(connection.db.resourceState);
    const enemyRows = selectedMapEnemyRows(tableRows(connection.db.enemyState), config.scope.enemyTypes);
    const queries = mapSpatialDetailQueries({ playerIds: config.scope.playerIds, resourceRows, enemyRows });
    const detailEntities = new Set([
      ...config.scope.playerIds,
      ...resourceRows.map((row) => String((row as Record<string, unknown>).entityId ?? (row as Record<string, unknown>).entity_id ?? "")),
      ...enemyRows.map((row) => String(row.entityId ?? row.entity_id ?? "")),
    ].filter(Boolean));
    this.#health.resourceRowCount = resourceRows.length;
    this.#health.enemyRowCount = enemyRows.length;
    this.#health.detailEntityCount = detailEntities.size;
    this.#health.detailQueryCount = queries.length;
    if (!queries.length) {
      this.#apply(connection);
      return;
    }
    this.#health.stage = "details";
    this.#detailSubscription = connection.subscriptionBuilder()
      .onApplied(() => {
        this.#attachDetailListeners(connection);
        this.#apply(connection);
      })
      .onError((_context, error) => this.#recordError(error))
      .subscribe(queries);
  }

  #apply(connection: BindingConnection) {
    const config = this.#config;
    if (!config) return;
    try {
      const bankRows = tableRows(connection.db.bankState);
      const waystoneRows = tableRows(connection.db.waystoneState);
      const resourceRows = tableRows(connection.db.resourceState);
      const enemyRows = selectedMapEnemyRows(tableRows(connection.db.enemyState), config.scope.enemyTypes);
      const locationRows = tableRows(connection.db.locationState);
      const mobileRows = tableRows(connection.db.mobileEntityState);
      const rowCount = bankRows.length + waystoneRows.length + resourceRows.length + enemyRows.length + locationRows.length + mobileRows.length;
      if (rowCount > config.maxRows) throw new Error(`Relay map-spatial row budget ${config.maxRows} exceeded by ${rowCount} rows`);
      const receivedAt = this.#now().toISOString();
      const normalized = normalizeMapSpatial({ scope: config.scope, bankRows, waystoneRows, resourceRows, enemyRows, locationRows, mobileRows, observedAt: receivedAt });
      const generation = this.#nextGeneration++;
      this.#health.rowCount = rowCount;
      Promise.resolve(this.#onSnapshot({ data: normalized.data, warnings: normalized.warnings, database: config.database, regionId: config.scope.regionId, schemaFingerprint: config.schemaFingerprint, generation, receivedAt }))
        .then(() => {
          this.#health.applied = true;
          this.#health.stage = "applied";
          this.#health.lastAppliedAt = receivedAt;
          this.#health.lastError = null;
        })
        .catch((error) => this.#recordError(error));
    } catch (error) {
      this.#recordError(error);
    }
  }

  #queueDetailRebuild() {
    if (this.#rebuildQueued || !this.#connection) return;
    this.#rebuildQueued = true;
    queueMicrotask(() => {
      this.#rebuildQueued = false;
      if (this.#connection) this.#rebuildDetails(this.#connection);
    });
  }

  #queueApply() {
    if (this.#applyQueued || !this.#connection) return;
    this.#applyQueued = true;
    queueMicrotask(() => {
      this.#applyQueued = false;
      if (this.#connection) this.#apply(this.#connection);
    });
  }

  #attachBaseListeners(connection: BindingConnection) {
    if (this.#baseListeners) return;
    for (const table of [connection.db.bankState, connection.db.waystoneState, connection.db.resourceState, connection.db.enemyState]) {
      table.onInsert?.(this.#baseChanged); table.onUpdate?.(this.#baseChanged); table.onDelete?.(this.#baseChanged);
    }
    this.#baseListeners = true;
  }

  #attachDetailListeners(connection: BindingConnection) {
    if (this.#detailListeners) return;
    for (const table of [connection.db.locationState, connection.db.mobileEntityState]) {
      table.onInsert?.(this.#detailChanged); table.onUpdate?.(this.#detailChanged); table.onDelete?.(this.#detailChanged);
    }
    this.#detailListeners = true;
  }

  #removeListeners() {
    if (!this.#connection) return;
    if (this.#baseListeners) for (const table of [this.#connection.db.bankState, this.#connection.db.waystoneState, this.#connection.db.resourceState, this.#connection.db.enemyState]) {
      table.removeOnInsert?.(this.#baseChanged); table.removeOnUpdate?.(this.#baseChanged); table.removeOnDelete?.(this.#baseChanged);
    }
    if (this.#detailListeners) for (const table of [this.#connection.db.locationState, this.#connection.db.mobileEntityState]) {
      table.removeOnInsert?.(this.#detailChanged); table.removeOnUpdate?.(this.#detailChanged); table.removeOnDelete?.(this.#detailChanged);
    }
    this.#baseListeners = false;
    this.#detailListeners = false;
  }

  #recordError(error: unknown) {
    this.#health.lastError = error instanceof Error ? error.message : String(error);
    this.#onFailure(this.#health.lastError);
  }

  health() { return { ...this.#health }; }

  async stop() {
    this.#stopping = true;
    this.#removeListeners();
    this.#detailSubscription?.unsubscribe();
    this.#baseSubscription?.unsubscribe();
    this.#connection?.disconnect();
    this.#detailSubscription = null;
    this.#baseSubscription = null;
    this.#connection = null;
    this.#config = null;
    this.#health.connected = false;
  }
}
