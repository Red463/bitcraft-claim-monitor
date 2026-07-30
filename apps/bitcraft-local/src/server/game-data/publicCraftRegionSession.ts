import { normalizeRegionalPublicCrafts } from "./normalizers.ts";
import {
  assertSchemaFingerprint,
  schemaBindingsReady,
} from "./schemaManifest.ts";

type BindingManifest = Parameters<typeof assertSchemaFingerprint>[0];

type CachedTable = {
  iter(): IterableIterator<unknown>;
  onInsert?(callback: (...args: unknown[]) => void): void;
  onUpdate?(callback: (...args: unknown[]) => void): void;
  onDelete?(callback: (...args: unknown[]) => void): void;
  removeOnInsert?(callback: (...args: unknown[]) => void): void;
  removeOnUpdate?(callback: (...args: unknown[]) => void): void;
  removeOnDelete?(callback: (...args: unknown[]) => void): void;
};

type SubscriptionHandle = {
  unsubscribe(): void;
};

type SubscriptionBuilder = {
  onApplied(callback: (context: unknown) => void): SubscriptionBuilder;
  onError(callback: (context: unknown, error: Error) => void): SubscriptionBuilder;
  subscribe(queries: readonly string[] | string[]): SubscriptionHandle;
};

type BindingConnection = {
  db: {
    publicProgressiveActionState: CachedTable;
    progressiveActionState: CachedTable;
    buildingState: CachedTable;
    buildingNicknameState: CachedTable;
    claimState: CachedTable;
    playerUsernameState: CachedTable;
    locationState: CachedTable;
  };
  subscriptionBuilder(): SubscriptionBuilder;
  disconnect(): void;
};

type ConnectionBuilder = {
  withUri(uri: string): ConnectionBuilder;
  withDatabaseName(database: string): ConnectionBuilder;
  onConnect(
    callback: (connection: BindingConnection, identity: unknown, token: string) => void,
  ): ConnectionBuilder;
  onConnectError(callback: (context: unknown, error: Error) => void): ConnectionBuilder;
  onDisconnect(callback: (context: unknown, error?: Error) => void): ConnectionBuilder;
  build(): BindingConnection;
};

type RegionalBindingModule = {
  DbConnection: {
    builder(): ConnectionBuilder;
  };
};

type SessionConfig = {
  uri: string;
  database: string;
  schemaFingerprint: string;
  manifest: BindingManifest;
  generation: number;
  regionId: string;
  maxPublicRows?: number;
  maxIdsPerQuery?: number;
  maxApplyRows?: number;
};

type SessionDependencies = {
  loadBindings?: () => Promise<RegionalBindingModule>;
  onSnapshot: (snapshot: RegionalPublicCraftSnapshot) => void | Promise<void>;
  now?: () => Date;
};

export type RegionalPublicCraftSnapshot = {
  data: ReturnType<typeof normalizeRegionalPublicCrafts>["data"];
  warnings: string[];
  database: string;
  regionId: string;
  schemaFingerprint: string;
  generation: number;
  receivedAt: string;
};

type WireRecord = Record<string, unknown>;

const DEFAULT_MAX_PUBLIC_ROWS = 1_000;
const DEFAULT_MAX_IDS_PER_QUERY = 100;
const DEFAULT_MAX_APPLY_ROWS = 8_000;

async function loadBundledRegionalBindings(): Promise<RegionalBindingModule> {
  const moduleUrl = new URL("./bindings/regional.js", import.meta.url).href;
  return await import(moduleUrl) as unknown as RegionalBindingModule;
}

function positiveSafeInteger(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return number;
}

function decimalInteger(value: unknown, label: string): string {
  const normalized = typeof value === "bigint" ? value.toString() : String(value ?? "").trim();
  if (!/^\d+$/.test(normalized)) {
    throw new TypeError(`${label} must be a decimal integer`);
  }
  return normalized;
}

function wireRecord(value: unknown, label: string): WireRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as WireRecord;
}

function numericIdOrder(left: string, right: string): number {
  const leftValue = BigInt(left);
  const rightValue = BigInt(right);
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
}

export function equalitySubscriptionQueries(
  table: string,
  column: string,
  values: readonly string[],
  maxIdsPerQuery = DEFAULT_MAX_IDS_PER_QUERY,
): string[] {
  if (!/^[a-z][a-z0-9_]*$/.test(table) || !/^[a-z][a-z0-9_]*$/.test(column)) {
    throw new TypeError("Relay subscription table and column must be safe identifiers");
  }
  const chunkSize = positiveSafeInteger(maxIdsPerQuery, "Relay equality query chunk size");
  const ids = [...new Set(values.map((value, index) => (
    decimalInteger(value, `Relay equality query id ${index}`)
  )))].sort(numericIdOrder);
  const queries: string[] = [];
  for (let offset = 0; offset < ids.length; offset += chunkSize) {
    const chunk = ids.slice(offset, offset + chunkSize);
    queries.push(
      `SELECT * FROM ${table} WHERE ${chunk.map((id) => `${column} = ${id}`).join(" OR ")}`,
    );
  }
  return queries;
}

function rows(table: CachedTable): unknown[] {
  return [...table.iter()];
}

export class RelayPublicCraftRegionSession {
  readonly #loadBindings: () => Promise<RegionalBindingModule>;
  readonly #onSnapshot: SessionDependencies["onSnapshot"];
  readonly #now: () => Date;
  #connection: BindingConnection | null = null;
  #publicSubscription: SubscriptionHandle | null = null;
  #detailSubscriptions: SubscriptionHandle[] = [];
  #config: Required<Pick<SessionConfig, "maxPublicRows" | "maxIdsPerQuery" | "maxApplyRows">>
    & Omit<SessionConfig, "maxPublicRows" | "maxIdsPerQuery" | "maxApplyRows">
    | null = null;
  #nextGeneration = 0;
  #refreshEpoch = 0;
  #detailRefreshQueued = false;
  #snapshotQueued = false;
  #applyInFlight = false;
  #applyPending = false;
  #listenersAttached = false;
  #refreshing = false;
  readonly #publicChanged = () => this.#queueDetailRefresh();
  readonly #detailChanged = () => this.#queueSnapshot();
  #health = {
    connected: false,
    applied: false,
    lastAppliedAt: null as string | null,
    lastApplyDurationMs: null as number | null,
    rowCount: 0,
    lastError: null as string | null,
  };

  constructor(dependencies: SessionDependencies) {
    this.#loadBindings = dependencies.loadBindings ?? loadBundledRegionalBindings;
    this.#onSnapshot = dependencies.onSnapshot;
    this.#now = dependencies.now ?? (() => new Date());
  }

  async start(config: SessionConfig): Promise<void> {
    if (this.#connection) throw new Error("Relay public-craft region session is already started");
    assertSchemaFingerprint(config.manifest, "regional", config.schemaFingerprint);
    if (!schemaBindingsReady(config.manifest, "regional")) {
      throw new Error("Relay regional schema bindings are not generated");
    }
    const generation = positiveSafeInteger(config.generation, "Relay public-craft generation");
    const regionId = decimalInteger(config.regionId, "Relay public-craft region id");
    this.#config = {
      ...config,
      generation,
      regionId,
      maxPublicRows: positiveSafeInteger(
        config.maxPublicRows ?? DEFAULT_MAX_PUBLIC_ROWS,
        "Relay public-craft public row budget",
      ),
      maxIdsPerQuery: positiveSafeInteger(
        config.maxIdsPerQuery ?? DEFAULT_MAX_IDS_PER_QUERY,
        "Relay public-craft query chunk size",
      ),
      maxApplyRows: positiveSafeInteger(
        config.maxApplyRows ?? DEFAULT_MAX_APPLY_ROWS,
        "Relay public-craft apply row budget",
      ),
    };
    this.#nextGeneration = generation;
    const bindings = await this.#loadBindings();
    this.#connection = bindings.DbConnection.builder()
      .withUri(config.uri)
      .withDatabaseName(config.database)
      .onConnect((connection) => {
        this.#health.connected = true;
        this.#health.lastError = null;
        this.#publicSubscription = connection.subscriptionBuilder()
          .onApplied(() => this.#guard(() => {
            this.#attachTableListeners(connection);
            this.#beginDetailRefresh(connection);
          }))
          .onError((_context, error) => this.#recordError(error))
          .subscribe(["SELECT * FROM public_progressive_action_state"]);
      })
      .onConnectError((_context, error) => this.#recordError(error))
      .onDisconnect((_context, error) => {
        this.#health.connected = false;
        if (error) this.#recordError(error);
      })
      .build();
  }

  #beginDetailRefresh(connection: BindingConnection): void {
    const config = this.#requiredConfig();
    const publicRows = rows(connection.db.publicProgressiveActionState);
    if (publicRows.length > config.maxPublicRows) {
      throw new Error(
        `Relay public-craft public row budget ${config.maxPublicRows} exceeded by ${publicRows.length} rows`,
      );
    }
    this.#refreshing = true;
    this.#refreshEpoch += 1;
    const epoch = this.#refreshEpoch;
    this.#clearDetailSubscriptions();
    const craftIds: string[] = [];
    const buildingIds: string[] = [];
    const ownerIds: string[] = [];
    for (const [index, value] of publicRows.entries()) {
      const marker = wireRecord(value, `Relay public-craft marker ${index}`);
      craftIds.push(decimalInteger(
        marker.entityId ?? marker.entity_id,
        `Relay public-craft marker ${index} entity id`,
      ));
      buildingIds.push(decimalInteger(
        marker.buildingEntityId ?? marker.building_entity_id,
        `Relay public-craft marker ${index} building id`,
      ));
      ownerIds.push(decimalInteger(
        marker.ownerEntityId ?? marker.owner_entity_id,
        `Relay public-craft marker ${index} owner id`,
      ));
    }
    if (!craftIds.length) {
      this.#refreshing = false;
      this.#attachTableListeners(connection);
      this.#applySnapshot(connection);
      return;
    }
    const queries = [
      ...equalitySubscriptionQueries(
        "progressive_action_state",
        "entity_id",
        craftIds,
        config.maxIdsPerQuery,
      ),
      ...equalitySubscriptionQueries(
        "building_state",
        "entity_id",
        buildingIds,
        config.maxIdsPerQuery,
      ),
      ...equalitySubscriptionQueries(
        "building_nickname_state",
        "entity_id",
        buildingIds,
        config.maxIdsPerQuery,
      ),
      ...equalitySubscriptionQueries(
        "player_username_state",
        "entity_id",
        ownerIds,
        config.maxIdsPerQuery,
      ),
    ];
    this.#detailSubscriptions.push(
      connection.subscriptionBuilder()
        .onApplied(() => this.#guard(() => {
          if (epoch !== this.#refreshEpoch) return;
          this.#subscribeClaims(connection, epoch, new Set(buildingIds));
        }))
        .onError((_context, error) => this.#recordError(error))
        .subscribe(queries),
    );
  }

  #subscribeClaims(
    connection: BindingConnection,
    epoch: number,
    buildingIds: Set<string>,
  ): void {
    const config = this.#requiredConfig();
    const claimIds: string[] = [];
    for (const [index, value] of rows(connection.db.buildingState).entries()) {
      const row = wireRecord(value, `Relay public-craft building ${index}`);
      const id = decimalInteger(
        row.entityId ?? row.entity_id,
        `Relay public-craft building ${index} entity id`,
      );
      if (!buildingIds.has(id)) continue;
      claimIds.push(decimalInteger(
        row.claimEntityId ?? row.claim_entity_id,
        `Relay public-craft building ${id} claim id`,
      ));
    }
    const queries = equalitySubscriptionQueries(
      "claim_state",
      "entity_id",
      claimIds,
      config.maxIdsPerQuery,
    );
    if (!queries.length) {
      this.#subscribeLocations(connection, epoch, buildingIds, new Set());
      return;
    }
    this.#detailSubscriptions.push(
      connection.subscriptionBuilder()
        .onApplied(() => this.#guard(() => {
          if (epoch !== this.#refreshEpoch) return;
          this.#subscribeLocations(connection, epoch, buildingIds, new Set(claimIds));
        }))
        .onError((_context, error) => this.#recordError(error))
        .subscribe(queries),
    );
  }

  #subscribeLocations(
    connection: BindingConnection,
    epoch: number,
    buildingIds: Set<string>,
    claimIds: Set<string>,
  ): void {
    const config = this.#requiredConfig();
    const locationIds = [...buildingIds];
    for (const [index, value] of rows(connection.db.claimState).entries()) {
      const row = wireRecord(value, `Relay public-craft claim ${index}`);
      const id = decimalInteger(
        row.entityId ?? row.entity_id,
        `Relay public-craft claim ${index} entity id`,
      );
      if (!claimIds.has(id)) continue;
      locationIds.push(decimalInteger(
        row.ownerBuildingEntityId ?? row.owner_building_entity_id,
        `Relay public-craft claim ${id} owner building id`,
      ));
    }
    const queries = equalitySubscriptionQueries(
      "location_state",
      "entity_id",
      locationIds,
      config.maxIdsPerQuery,
    );
    if (!queries.length) {
      this.#completeDetailRefresh(connection, epoch);
      return;
    }
    this.#detailSubscriptions.push(
      connection.subscriptionBuilder()
        .onApplied(() => this.#guard(() => this.#completeDetailRefresh(connection, epoch)))
        .onError((_context, error) => this.#recordError(error))
        .subscribe(queries),
    );
  }

  #completeDetailRefresh(connection: BindingConnection, epoch: number): void {
    if (epoch !== this.#refreshEpoch) return;
    this.#refreshing = false;
    this.#attachTableListeners(connection);
    this.#applySnapshot(connection);
  }

  #applySnapshot(connection: BindingConnection): void {
    const config = this.#requiredConfig();
    if (this.#refreshing) return;
    if (this.#applyInFlight) {
      this.#applyPending = true;
      return;
    }
    const startedAt = Date.now();
    try {
      const publicRows = rows(connection.db.publicProgressiveActionState);
      const craftRows = rows(connection.db.progressiveActionState);
      const buildingRows = rows(connection.db.buildingState);
      const buildingNicknameRows = rows(connection.db.buildingNicknameState);
      const claimRows = rows(connection.db.claimState);
      const usernameRows = rows(connection.db.playerUsernameState);
      const locationRows = rows(connection.db.locationState);
      const rowCount = publicRows.length
        + craftRows.length
        + buildingRows.length
        + buildingNicknameRows.length
        + claimRows.length
        + usernameRows.length
        + locationRows.length;
      if (rowCount > config.maxApplyRows) {
        throw new Error(
          `Relay public-craft apply row budget ${config.maxApplyRows} exceeded by ${rowCount} rows`,
        );
      }
      const normalized = normalizeRegionalPublicCrafts({
        regionId: config.regionId,
        publicRows,
        craftRows,
        buildingRows,
        buildingNicknameRows,
        claimRows,
        usernameRows,
        locationRows,
      });
      if (!normalized.complete) {
        throw new Error(
          `Relay public-craft join generation is incomplete: ${normalized.warnings.join("; ")}`,
        );
      }
      const receivedAt = this.#now().toISOString();
      const generation = this.#nextGeneration;
      this.#nextGeneration += 1;
      this.#applyInFlight = true;
      this.#health.rowCount = rowCount;
      this.#health.lastApplyDurationMs = Date.now() - startedAt;
      const result = this.#onSnapshot({
        data: normalized.data,
        warnings: normalized.warnings,
        database: config.database,
        regionId: config.regionId,
        schemaFingerprint: config.schemaFingerprint,
        generation,
        receivedAt,
      });
      Promise.resolve(result).then(() => {
        this.#health.applied = true;
        this.#health.lastAppliedAt = receivedAt;
        this.#health.lastError = null;
      }).catch((error: unknown) => this.#recordError(error))
        .finally(() => this.#completeApply(connection));
    } catch (error) {
      this.#applyInFlight = false;
      this.#health.lastApplyDurationMs = Date.now() - startedAt;
      this.#recordError(error);
      this.#completeApply(connection);
    }
  }

  #completeApply(connection: BindingConnection): void {
    this.#applyInFlight = false;
    if (!this.#applyPending) return;
    this.#applyPending = false;
    queueMicrotask(() => {
      if (this.#connection === connection) this.#applySnapshot(connection);
    });
  }

  #queueDetailRefresh(): void {
    if (this.#detailRefreshQueued || !this.#connection) return;
    this.#detailRefreshQueued = true;
    queueMicrotask(() => {
      this.#detailRefreshQueued = false;
      if (this.#connection) this.#guard(() => this.#beginDetailRefresh(this.#connection!));
    });
  }

  #queueSnapshot(): void {
    if (this.#snapshotQueued || !this.#connection || this.#refreshing) return;
    this.#snapshotQueued = true;
    queueMicrotask(() => {
      this.#snapshotQueued = false;
      if (this.#connection) this.#applySnapshot(this.#connection);
    });
  }

  #attachTableListeners(connection: BindingConnection): void {
    if (this.#listenersAttached) return;
    connection.db.publicProgressiveActionState.onInsert?.(this.#publicChanged);
    connection.db.publicProgressiveActionState.onUpdate?.(this.#publicChanged);
    connection.db.publicProgressiveActionState.onDelete?.(this.#publicChanged);
    for (const table of this.#detailTables(connection)) {
      table.onInsert?.(this.#detailChanged);
      table.onUpdate?.(this.#detailChanged);
      table.onDelete?.(this.#detailChanged);
    }
    this.#listenersAttached = true;
  }

  #removeTableListeners(): void {
    if (!this.#listenersAttached || !this.#connection) return;
    const publicTable = this.#connection.db.publicProgressiveActionState;
    publicTable.removeOnInsert?.(this.#publicChanged);
    publicTable.removeOnUpdate?.(this.#publicChanged);
    publicTable.removeOnDelete?.(this.#publicChanged);
    for (const table of this.#detailTables(this.#connection)) {
      table.removeOnInsert?.(this.#detailChanged);
      table.removeOnUpdate?.(this.#detailChanged);
      table.removeOnDelete?.(this.#detailChanged);
    }
    this.#listenersAttached = false;
  }

  #detailTables(connection: BindingConnection): CachedTable[] {
    return [
      connection.db.progressiveActionState,
      connection.db.buildingState,
      connection.db.buildingNicknameState,
      connection.db.claimState,
      connection.db.playerUsernameState,
      connection.db.locationState,
    ];
  }

  #clearDetailSubscriptions(): void {
    for (const subscription of this.#detailSubscriptions) subscription.unsubscribe();
    this.#detailSubscriptions = [];
  }

  #requiredConfig() {
    if (!this.#config) throw new Error("Relay public-craft region session is not configured");
    return this.#config;
  }

  #guard(action: () => void): void {
    try {
      action();
    } catch (error) {
      this.#refreshing = false;
      this.#recordError(error);
    }
  }

  #recordError(error: unknown): void {
    this.#health.lastError = error instanceof Error ? error.message : String(error);
  }

  health() {
    return { ...this.#health };
  }

  async stop(): Promise<void> {
    this.#removeTableListeners();
    this.#refreshEpoch += 1;
    this.#clearDetailSubscriptions();
    this.#publicSubscription?.unsubscribe();
    this.#publicSubscription = null;
    this.#connection?.disconnect();
    this.#connection = null;
    this.#config = null;
    this.#nextGeneration = 0;
    this.#detailRefreshQueued = false;
    this.#snapshotQueued = false;
    this.#applyInFlight = false;
    this.#applyPending = false;
    this.#refreshing = false;
    this.#health.connected = false;
  }
}
