import { normalizeRegionalEmpires } from "./normalizers.ts";
import { equalitySubscriptionQueries } from "./publicCraftRegionSession.ts";
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
type SubscriptionHandle = { unsubscribe(): void };
type SubscriptionBuilder = {
  onApplied(callback: (context: unknown) => void): SubscriptionBuilder;
  onError(callback: (context: unknown, error: Error) => void): SubscriptionBuilder;
  subscribe(queries: readonly string[] | string[]): SubscriptionHandle;
};
type BindingConnection = {
  db: {
    empireState: CachedTable;
    empirePlayerDataState: CachedTable;
    empireRankState: CachedTable;
    empireSettlementState: CachedTable;
    empireNodeState: CachedTable;
    empireNodeSiegeState: CachedTable;
    empireChunkState: CachedTable;
    claimState: CachedTable;
    playerUsernameState: CachedTable;
    buildingNicknameState: CachedTable;
  };
  subscriptionBuilder(): SubscriptionBuilder;
  disconnect(): void;
};
type ConnectionBuilder = {
  withUri(uri: string): ConnectionBuilder;
  withDatabaseName(database: string): ConnectionBuilder;
  onConnect(callback: (connection: BindingConnection, identity: unknown, token: string) => void): ConnectionBuilder;
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
  maxBaseRows?: number;
  maxApplyRows?: number;
  maxIdsPerQuery?: number;
};
type SessionDependencies = {
  loadBindings?: () => Promise<RegionalBindingModule>;
  onSnapshot(snapshot: RegionalEmpireSnapshot): void | Promise<void>;
  onFailure?(error: string): void;
  now?: () => Date;
};
export type RegionalEmpireSnapshot = {
  data: ReturnType<typeof normalizeRegionalEmpires>["data"];
  warnings: string[];
  database: string;
  regionId: string;
  schemaFingerprint: string;
  generation: number;
  receivedAt: string;
};
type WireRecord = Record<string, unknown>;

const DEFAULT_MAX_BASE_ROWS = 80_000;
const DEFAULT_MAX_APPLY_ROWS = 100_000;
const DEFAULT_MAX_IDS_PER_QUERY = 100;

async function loadBundledRegionalBindings(): Promise<RegionalBindingModule> {
  const moduleUrl = new URL("./bindings/regional.js", import.meta.url).href;
  return await import(moduleUrl) as unknown as RegionalBindingModule;
}

function positiveInteger(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return number;
}

function decimalInteger(value: unknown, label: string): string {
  const normalized = typeof value === "bigint" ? value.toString() : String(value ?? "").trim();
  if (!/^\d+$/.test(normalized)) throw new TypeError(`${label} must be a decimal integer`);
  return normalized;
}

function row(value: unknown, label: string): WireRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as WireRecord;
}

function rows(table: CachedTable): unknown[] {
  return [...table.iter()];
}

export class RelayEmpireRegionSession {
  readonly #loadBindings: () => Promise<RegionalBindingModule>;
  readonly #onSnapshot: SessionDependencies["onSnapshot"];
  readonly #onFailure: NonNullable<SessionDependencies["onFailure"]>;
  readonly #now: () => Date;
  #connection: BindingConnection | null = null;
  #baseSubscription: SubscriptionHandle | null = null;
  #detailSubscription: SubscriptionHandle | null = null;
  #config: Required<Pick<SessionConfig, "maxBaseRows" | "maxApplyRows" | "maxIdsPerQuery">>
    & Omit<SessionConfig, "maxBaseRows" | "maxApplyRows" | "maxIdsPerQuery"> | null = null;
  #nextGeneration = 0;
  #detailEpoch = 0;
  #refreshingDetails = false;
  #detailRefreshQueued = false;
  #snapshotQueued = false;
  #applyInFlight = false;
  #applyPending = false;
  #listenersAttached = false;
  #stopping = false;
  readonly #identityChanged = () => this.#queueDetailRefresh();
  readonly #baseChanged = () => this.#queueSnapshot();
  readonly #detailChanged = () => this.#queueSnapshot();
  #health = {
    connected: false,
    applied: false,
    stage: "idle",
    lastAppliedAt: null as string | null,
    lastApplyDurationMs: null as number | null,
    rowCount: 0,
    lastError: null as string | null,
  };

  constructor(dependencies: SessionDependencies) {
    this.#loadBindings = dependencies.loadBindings ?? loadBundledRegionalBindings;
    this.#onSnapshot = dependencies.onSnapshot;
    this.#onFailure = dependencies.onFailure ?? (() => {});
    this.#now = dependencies.now ?? (() => new Date());
  }

  async start(config: SessionConfig): Promise<void> {
    if (this.#connection) throw new Error("Relay empire region session is already started");
    assertSchemaFingerprint(config.manifest, "regional", config.schemaFingerprint);
    if (!schemaBindingsReady(config.manifest, "regional")) {
      throw new Error("Relay regional schema bindings are not generated");
    }
    this.#config = {
      ...config,
      generation: positiveInteger(config.generation, "Relay empire generation"),
      regionId: decimalInteger(config.regionId, "Relay empire region id"),
      maxBaseRows: positiveInteger(
        config.maxBaseRows ?? DEFAULT_MAX_BASE_ROWS,
        "Relay empire base-row budget",
      ),
      maxApplyRows: positiveInteger(
        config.maxApplyRows ?? DEFAULT_MAX_APPLY_ROWS,
        "Relay empire apply-row budget",
      ),
      maxIdsPerQuery: positiveInteger(
        config.maxIdsPerQuery ?? DEFAULT_MAX_IDS_PER_QUERY,
        "Relay empire query-size budget",
      ),
    };
    this.#nextGeneration = this.#config.generation;
    this.#stopping = false;
    const bindings = await this.#loadBindings();
    this.#health.stage = "connecting";
    this.#connection = bindings.DbConnection.builder()
      .withUri(config.uri)
      .withDatabaseName(config.database)
      .onConnect((connection) => {
        this.#health.connected = true;
        this.#health.lastError = null;
        this.#health.stage = "base";
        this.#baseSubscription = connection.subscriptionBuilder()
          .onApplied(() => this.#guard(() => {
            this.#attachListeners(connection);
            this.#refreshDetails(connection);
          }))
          .onError((_context, error) => this.#recordError(error))
          .subscribe([
            "SELECT * FROM empire_state",
            "SELECT * FROM empire_player_data_state",
            "SELECT * FROM empire_rank_state",
            "SELECT * FROM empire_settlement_state",
            "SELECT * FROM empire_node_state",
            "SELECT * FROM empire_node_siege_state",
            "SELECT * FROM empire_chunk_state",
          ]);
      })
      .onConnectError((_context, error) => {
        if (!this.#stopping) this.#recordError(error);
      })
      .onDisconnect((_context, error) => {
        this.#health.connected = false;
        if (this.#stopping) return;
        this.#recordError(error ?? new Error("Relay empire region subscription disconnected."));
      })
      .build();
  }

  #requiredConfig() {
    if (!this.#config) throw new Error("Relay empire region session is not configured");
    return this.#config;
  }

  #baseRows(connection: BindingConnection) {
    return {
      empireRows: rows(connection.db.empireState),
      playerRows: rows(connection.db.empirePlayerDataState),
      rankRows: rows(connection.db.empireRankState),
      settlementRows: rows(connection.db.empireSettlementState),
      nodeRows: rows(connection.db.empireNodeState),
      siegeRows: rows(connection.db.empireNodeSiegeState),
      chunkRows: rows(connection.db.empireChunkState),
    };
  }

  #refreshDetails(connection: BindingConnection): void {
    const config = this.#requiredConfig();
    const base = this.#baseRows(connection);
    const baseRowCount = Object.values(base).reduce((total, values) => total + values.length, 0);
    if (baseRowCount > config.maxBaseRows) {
      throw new Error(
        `Relay empire base-row budget ${config.maxBaseRows} exceeded by ${baseRowCount} rows`,
      );
    }
    const memberIds = base.playerRows.map((value, index) => {
      const player = row(value, `Relay empire player ${index}`);
      return decimalInteger(
        player.entityId ?? player.entity_id,
        `Relay empire player ${index} entity id`,
      );
    });
    const claimIds = base.settlementRows.map((value, index) => {
      const settlement = row(value, `Relay empire settlement ${index}`);
      return decimalInteger(
        settlement.claimEntityId ?? settlement.claim_entity_id,
        `Relay empire settlement ${index} claim id`,
      );
    });
    const buildingIds = [
      ...base.settlementRows.map((value, index) => {
        const settlement = row(value, `Relay empire settlement ${index}`);
        return decimalInteger(
          settlement.buildingEntityId ?? settlement.building_entity_id,
          `Relay empire settlement ${index} building id`,
        );
      }),
      ...base.nodeRows.map((value, index) => {
        const node = row(value, `Relay empire node ${index}`);
        return decimalInteger(
          node.entityId ?? node.entity_id,
          `Relay empire node ${index} entity id`,
        );
      }),
    ];
    const queries = [
      ...equalitySubscriptionQueries(
        "player_username_state",
        "entity_id",
        memberIds,
        config.maxIdsPerQuery,
      ),
      ...equalitySubscriptionQueries(
        "claim_state",
        "entity_id",
        claimIds,
        config.maxIdsPerQuery,
      ),
      ...equalitySubscriptionQueries(
        "building_nickname_state",
        "entity_id",
        buildingIds,
        config.maxIdsPerQuery,
      ),
    ];
    this.#refreshingDetails = true;
    this.#detailEpoch += 1;
    const epoch = this.#detailEpoch;
    this.#detailSubscription?.unsubscribe();
    this.#detailSubscription = null;
    if (!queries.length) {
      this.#refreshingDetails = false;
      this.#applySnapshot(connection);
      return;
    }
    this.#health.stage = "details";
    this.#detailSubscription = connection.subscriptionBuilder()
      .onApplied(() => this.#guard(() => {
        if (epoch !== this.#detailEpoch) return;
        this.#refreshingDetails = false;
        this.#applySnapshot(connection);
      }))
      .onError((_context, error) => this.#recordError(error))
      .subscribe(queries);
  }

  #applySnapshot(connection: BindingConnection): void {
    const config = this.#config;
    if (!config || this.#refreshingDetails) return;
    if (this.#applyInFlight) {
      this.#applyPending = true;
      return;
    }
    const startedAt = Date.now();
    try {
      const base = this.#baseRows(connection);
      const claimRows = rows(connection.db.claimState);
      const usernameRows = rows(connection.db.playerUsernameState);
      const nicknameRows = rows(connection.db.buildingNicknameState);
      const rowCount = Object.values(base).reduce((total, values) => total + values.length, 0)
        + claimRows.length + usernameRows.length + nicknameRows.length;
      if (rowCount > config.maxApplyRows) {
        throw new Error(
          `Relay empire apply-row budget ${config.maxApplyRows} exceeded by ${rowCount} rows`,
        );
      }
      const normalized = normalizeRegionalEmpires({
        regionId: config.regionId,
        ...base,
        claimRows,
        usernameRows,
        nicknameRows,
      });
      const receivedAt = this.#now().toISOString();
      const generation = this.#nextGeneration;
      this.#nextGeneration += 1;
      this.#applyInFlight = true;
      this.#health.rowCount = rowCount;
      this.#health.lastApplyDurationMs = Date.now() - startedAt;
      this.#health.stage = "applying";
      Promise.resolve(this.#onSnapshot({
        data: normalized.data,
        warnings: normalized.warnings,
        database: config.database,
        regionId: config.regionId,
        schemaFingerprint: config.schemaFingerprint,
        generation,
        receivedAt,
      })).then(() => {
        this.#health.applied = true;
        this.#health.lastAppliedAt = receivedAt;
        this.#health.lastError = null;
        this.#health.stage = "live";
      }).catch((error: unknown) => this.#recordError(error))
        .finally(() => this.#completeApply(connection));
    } catch (error) {
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
      if (this.#connection) this.#guard(() => this.#refreshDetails(this.#connection!));
    });
  }

  #queueSnapshot(): void {
    if (this.#snapshotQueued || !this.#connection || this.#refreshingDetails) return;
    this.#snapshotQueued = true;
    queueMicrotask(() => {
      this.#snapshotQueued = false;
      if (this.#connection) this.#applySnapshot(this.#connection);
    });
  }

  #attachListeners(connection: BindingConnection): void {
    if (this.#listenersAttached) return;
    for (const table of [
      connection.db.empirePlayerDataState,
      connection.db.empireNodeState,
    ]) {
      table.onInsert?.(this.#identityChanged);
      table.onDelete?.(this.#identityChanged);
      table.onUpdate?.(this.#baseChanged);
    }
    connection.db.empireSettlementState.onInsert?.(this.#identityChanged);
    connection.db.empireSettlementState.onUpdate?.(this.#identityChanged);
    connection.db.empireSettlementState.onDelete?.(this.#identityChanged);
    for (const table of [
      connection.db.empireState,
      connection.db.empireRankState,
      connection.db.empireNodeSiegeState,
      connection.db.empireChunkState,
    ]) {
      table.onInsert?.(this.#baseChanged);
      table.onUpdate?.(this.#baseChanged);
      table.onDelete?.(this.#baseChanged);
    }
    for (const table of [
      connection.db.claimState,
      connection.db.playerUsernameState,
      connection.db.buildingNicknameState,
    ]) {
      table.onInsert?.(this.#detailChanged);
      table.onUpdate?.(this.#detailChanged);
      table.onDelete?.(this.#detailChanged);
    }
    this.#listenersAttached = true;
  }

  #removeListeners(): void {
    const connection = this.#connection;
    if (!this.#listenersAttached || !connection) return;
    for (const table of [
      connection.db.empirePlayerDataState,
      connection.db.empireNodeState,
    ]) {
      table.removeOnInsert?.(this.#identityChanged);
      table.removeOnDelete?.(this.#identityChanged);
      table.removeOnUpdate?.(this.#baseChanged);
    }
    connection.db.empireSettlementState.removeOnInsert?.(this.#identityChanged);
    connection.db.empireSettlementState.removeOnUpdate?.(this.#identityChanged);
    connection.db.empireSettlementState.removeOnDelete?.(this.#identityChanged);
    for (const table of [
      connection.db.empireState,
      connection.db.empireRankState,
      connection.db.empireNodeSiegeState,
      connection.db.empireChunkState,
    ]) {
      table.removeOnInsert?.(this.#baseChanged);
      table.removeOnUpdate?.(this.#baseChanged);
      table.removeOnDelete?.(this.#baseChanged);
    }
    for (const table of [
      connection.db.claimState,
      connection.db.playerUsernameState,
      connection.db.buildingNicknameState,
    ]) {
      table.removeOnInsert?.(this.#detailChanged);
      table.removeOnUpdate?.(this.#detailChanged);
      table.removeOnDelete?.(this.#detailChanged);
    }
    this.#listenersAttached = false;
  }

  #guard(action: () => void): void {
    try {
      action();
    } catch (error) {
      this.#recordError(error);
    }
  }

  #recordError(error: unknown): void {
    this.#health.lastError = error instanceof Error ? error.message : String(error);
    this.#health.stage = "error";
    this.#onFailure(this.#health.lastError);
  }

  health() {
    return { ...this.#health };
  }

  async stop(): Promise<void> {
    this.#stopping = true;
    this.#detailEpoch += 1;
    this.#removeListeners();
    this.#detailSubscription?.unsubscribe();
    this.#detailSubscription = null;
    this.#baseSubscription?.unsubscribe();
    this.#baseSubscription = null;
    this.#connection?.disconnect();
    this.#connection = null;
    this.#config = null;
    this.#refreshingDetails = false;
    this.#health.connected = false;
    this.#health.stage = "stopped";
  }
}
