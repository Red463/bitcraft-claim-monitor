import { mapEnemyMobileQueries, mapSpatialQueries, normalizeMapSpatial, selectedMapEnemyRows } from "./mapSpatialProjection.ts";
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
  db: { waystoneState: CachedTable; enemyState: CachedTable; mobileEntityState: CachedTable; claimState: CachedTable; claimLocalState: CachedTable; claimTechState: CachedTable; claimTechDesc: CachedTable };
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
type MapSpatialScope = { claimId: string; regionId: string; playerIds: string[]; resourceIds: string[]; enemyTypes: string[]; includeClaims?: boolean };
type SessionConfig = { uri: string; database: string; schemaFingerprint: string; manifest: BindingManifest; generation: number; scope: MapSpatialScope; maxRows?: number };
export type MapSpatialSnapshot = { data: ReturnType<typeof normalizeMapSpatial>["data"]; warnings: string[]; database: string; regionId: string; schemaFingerprint: string; generation: number; receivedAt: string; freshness?: "live" | "partial" | "stale" };

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
  #activeEnemySubscription: SubscriptionHandle | null = null;
  #pendingEnemySubscription: SubscriptionHandle | null = null;
  #enemyRebuildRequested = false;
  #config: (SessionConfig & { maxRows: number }) | null = null;
  #nextGeneration = 1;
  #stopping = false;
  #listenersAttached = false;
  #enemyRebuildQueued = false;
  #applyQueued = false;
  #health = {
    connected: false,
    applied: false,
    stage: "idle",
    rowCount: 0,
    enemyRowCount: 0,
    queryCount: 0,
    lastAppliedAt: null as string | null,
    lastError: null as string | null,
  };

  readonly #changed = () => this.#queueApply();
  readonly #enemyChanged = () => this.#queueEnemyRebuild();

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
        this.#health.stage = "subscription";
        const queries = mapSpatialQueries(config.scope);
        this.#health.queryCount = queries.length;
        this.#baseSubscription = connection.subscriptionBuilder()
          .onApplied(() => {
            this.#attachListeners(connection);
            this.#rebuildEnemyPositions(connection);
          })
          .onError((_context, error) => this.#recordError(error))
          .subscribe(queries);
      })
      .onConnectError((_context, error) => { if (!this.#stopping) this.#recordError(error); })
      .onDisconnect((_context, error) => {
        this.#health.connected = false;
        if (!this.#stopping) this.#recordError(error ?? new Error("Relay map-spatial subscription disconnected."));
      })
      .build();
  }

  #rebuildEnemyPositions(connection: BindingConnection) {
    const config = this.#config;
    if (!config) return;
    if (this.#pendingEnemySubscription) {
      this.#enemyRebuildRequested = true;
      return;
    }
    const selectedEnemies = selectedMapEnemyRows(tableRows(connection.db.enemyState), config.scope.enemyTypes);
    const queries = mapEnemyMobileQueries(selectedEnemies);
    this.#health.enemyRowCount = selectedEnemies.length;
    this.#health.queryCount = mapSpatialQueries(config.scope).length + queries.length;
    if (!queries.length) {
      this.#activeEnemySubscription?.unsubscribe();
      this.#activeEnemySubscription = null;
      this.#apply(connection);
      return;
    }
    this.#health.stage = "enemy-positions";
    let next: SubscriptionHandle;
    next = connection.subscriptionBuilder()
      .onApplied(() => {
        if (this.#pendingEnemySubscription !== next) {
          next.unsubscribe();
          return;
        }
        this.#activeEnemySubscription?.unsubscribe();
        this.#activeEnemySubscription = next;
        this.#pendingEnemySubscription = null;
        if (this.#enemyRebuildRequested) {
          this.#enemyRebuildRequested = false;
          this.#rebuildEnemyPositions(connection);
        } else {
          this.#apply(connection);
        }
      })
      .onError((_context, error) => {
        if (this.#pendingEnemySubscription === next) this.#pendingEnemySubscription = null;
        this.#recordError(error);
      })
      .subscribe(queries);
    this.#pendingEnemySubscription = next;
  }

  #apply(connection: BindingConnection) {
    const config = this.#config;
    if (!config) return;
    try {
      const waystoneRows = tableRows(connection.db.waystoneState);
      const claimRows = config.scope.includeClaims ? tableRows(connection.db.claimState) : [];
      const claimLocalRows = config.scope.includeClaims ? tableRows(connection.db.claimLocalState) : [];
      const claimTechRows = config.scope.includeClaims ? tableRows(connection.db.claimTechState) : [];
      const claimTechDescriptionRows = config.scope.includeClaims ? tableRows(connection.db.claimTechDesc) : [];
      const enemyRows = tableRows(connection.db.enemyState);
      const mobileRows = tableRows(connection.db.mobileEntityState);
      const rowCount = waystoneRows.length + claimRows.length + claimLocalRows.length + claimTechRows.length + claimTechDescriptionRows.length + enemyRows.length + mobileRows.length;
      if (rowCount > config.maxRows) throw new Error(`Relay map-spatial row budget ${config.maxRows} exceeded by ${rowCount} rows`);
      const receivedAt = this.#now().toISOString();
      this.#health.enemyRowCount = selectedMapEnemyRows(enemyRows, config.scope.enemyTypes).length;
      const normalized = normalizeMapSpatial({ scope: config.scope, waystoneRows, claimRows, claimLocalRows, claimTechRows, claimTechDescriptionRows, enemyRows, mobileRows, observedAt: receivedAt });
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

  #queueApply() {
    if (this.#applyQueued || !this.#connection) return;
    this.#applyQueued = true;
    queueMicrotask(() => {
      this.#applyQueued = false;
      if (this.#connection) this.#apply(this.#connection);
    });
  }

  #queueEnemyRebuild() {
    if (this.#enemyRebuildQueued || !this.#connection) return;
    this.#enemyRebuildQueued = true;
    queueMicrotask(() => {
      this.#enemyRebuildQueued = false;
      if (this.#connection) this.#rebuildEnemyPositions(this.#connection);
    });
  }

  #attachListeners(connection: BindingConnection) {
    if (this.#listenersAttached) return;
    const tables = [connection.db.waystoneState, connection.db.mobileEntityState, ...(this.#config?.scope.includeClaims ? [connection.db.claimState, connection.db.claimLocalState, connection.db.claimTechState, connection.db.claimTechDesc] : [])];
    for (const table of tables) {
      table.onInsert?.(this.#changed); table.onUpdate?.(this.#changed); table.onDelete?.(this.#changed);
    }
    connection.db.enemyState.onInsert?.(this.#enemyChanged); connection.db.enemyState.onUpdate?.(this.#enemyChanged); connection.db.enemyState.onDelete?.(this.#enemyChanged);
    this.#listenersAttached = true;
  }

  #removeListeners() {
    if (!this.#connection) return;
    const tables = [this.#connection.db.waystoneState, this.#connection.db.mobileEntityState, ...(this.#config?.scope.includeClaims ? [this.#connection.db.claimState, this.#connection.db.claimLocalState, this.#connection.db.claimTechState, this.#connection.db.claimTechDesc] : [])];
    if (this.#listenersAttached) for (const table of tables) {
      table.removeOnInsert?.(this.#changed); table.removeOnUpdate?.(this.#changed); table.removeOnDelete?.(this.#changed);
    }
    if (this.#listenersAttached) {
      this.#connection.db.enemyState.removeOnInsert?.(this.#enemyChanged); this.#connection.db.enemyState.removeOnUpdate?.(this.#enemyChanged); this.#connection.db.enemyState.removeOnDelete?.(this.#enemyChanged);
    }
    this.#listenersAttached = false;
  }

  #recordError(error: unknown) {
    this.#health.lastError = error instanceof Error ? error.message : String(error);
    this.#onFailure(this.#health.lastError);
  }

  health() { return { ...this.#health }; }

  async stop() {
    this.#stopping = true;
    this.#removeListeners();
    this.#pendingEnemySubscription?.unsubscribe();
    this.#activeEnemySubscription?.unsubscribe();
    this.#baseSubscription?.unsubscribe();
    this.#connection?.disconnect();
    this.#pendingEnemySubscription = null;
    this.#activeEnemySubscription = null;
    this.#baseSubscription = null;
    this.#connection = null;
    this.#config = null;
    this.#health.connected = false;
  }
}
