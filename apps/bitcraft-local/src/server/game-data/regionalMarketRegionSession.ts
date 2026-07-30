import {
  normalizeRegionalOrders,
  normalizeRegionalStalls,
} from "./normalizers.ts";
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
    buyOrderState: CachedTable;
    sellOrderState: CachedTable;
    barterStallState: CachedTable;
    tradeOrderState: CachedTable;
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
  maxOrders?: number;
  maxStalls?: number;
  maxIdsPerQuery?: number;
  maxApplyRows?: number;
};

type SessionDependencies = {
  loadBindings?: () => Promise<RegionalBindingModule>;
  onSnapshot(snapshot: RegionalMarketSnapshot): void | Promise<void>;
  now?: () => Date;
  random?: () => number;
  scheduleRetry?: (callback: () => void, delayMs: number) => () => void;
};

export type RegionalMarketSnapshot = {
  data: ReturnType<typeof normalizeRegionalOrders>["data"]
    & ReturnType<typeof normalizeRegionalStalls>["data"];
  warnings: string[];
  database: string;
  regionId: string;
  schemaFingerprint: string;
  generation: number;
  receivedAt: string;
};

type WireRecord = Record<string, unknown>;

const DEFAULT_MAX_ORDERS = 5_000;
const DEFAULT_MAX_STALLS = 1_000;
const DEFAULT_MAX_IDS_PER_QUERY = 100;
const DEFAULT_MAX_APPLY_ROWS = 12_000;

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
  if (!/^\d+$/.test(normalized)) throw new TypeError(`${label} must be a decimal integer`);
  return normalized;
}

function wireRecord(value: unknown, label: string): WireRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as WireRecord;
}

function rows(table: CachedTable): unknown[] {
  return [...table.iter()];
}

export class RelayRegionalMarketRegionSession {
  readonly #loadBindings: () => Promise<RegionalBindingModule>;
  readonly #onSnapshot: SessionDependencies["onSnapshot"];
  readonly #now: () => Date;
  readonly #random: () => number;
  readonly #scheduleRetry: NonNullable<SessionDependencies["scheduleRetry"]>;
  #bindings: RegionalBindingModule | null = null;
  #connection: BindingConnection | null = null;
  #baseSubscription: SubscriptionHandle | null = null;
  #stallDetailSubscription: SubscriptionHandle | null = null;
  #identitySubscription: SubscriptionHandle | null = null;
  #config: Required<Pick<SessionConfig, "maxOrders" | "maxStalls" | "maxIdsPerQuery" | "maxApplyRows">>
    & Omit<SessionConfig, "maxOrders" | "maxStalls" | "maxIdsPerQuery" | "maxApplyRows">
    | null = null;
  #nextGeneration = 0;
  #detailEpoch = 0;
  #detailRefreshQueued = false;
  #snapshotQueued = false;
  #refreshingDetails = false;
  #detailRefreshPending = false;
  #applyInFlight = false;
  #applyPending = false;
  #baseListenersAttached = false;
  #stallDetailListenersAttached = false;
  #connectionEpoch = 0;
  #reconnectAttempt = 0;
  #detailRetryAttempt = 0;
  #cancelReconnect: (() => void) | null = null;
  #cancelDetailRetry: (() => void) | null = null;
  #stopping = false;
  readonly #baseChanged = () => this.#queueDetailRefresh();
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
    this.#random = dependencies.random ?? Math.random;
    this.#scheduleRetry = dependencies.scheduleRetry ?? ((callback, delayMs) => {
      const timer = setTimeout(callback, delayMs);
      timer.unref?.();
      return () => clearTimeout(timer);
    });
  }

  async start(config: SessionConfig): Promise<void> {
    if (this.#config) throw new Error("Relay regional market session is already started");
    assertSchemaFingerprint(config.manifest, "regional", config.schemaFingerprint);
    if (!schemaBindingsReady(config.manifest, "regional")) {
      throw new Error("Relay regional schema bindings are not generated");
    }
    this.#config = {
      ...config,
      generation: positiveSafeInteger(config.generation, "Relay regional market generation"),
      regionId: decimalInteger(config.regionId, "Relay regional market region id"),
      maxOrders: positiveSafeInteger(
        config.maxOrders ?? DEFAULT_MAX_ORDERS,
        "Relay regional market order budget",
      ),
      maxStalls: positiveSafeInteger(
        config.maxStalls ?? DEFAULT_MAX_STALLS,
        "Relay regional market stall budget",
      ),
      maxIdsPerQuery: positiveSafeInteger(
        config.maxIdsPerQuery ?? DEFAULT_MAX_IDS_PER_QUERY,
        "Relay regional market query size",
      ),
      maxApplyRows: positiveSafeInteger(
        config.maxApplyRows ?? DEFAULT_MAX_APPLY_ROWS,
        "Relay regional market apply row budget",
      ),
    };
    this.#nextGeneration = this.#config.generation;
    this.#stopping = false;
    this.#bindings = await this.#loadBindings();
    this.#openConnection();
  }

  #openConnection(): void {
    const config = this.#requiredConfig();
    const bindings = this.#bindings;
    if (!bindings) throw new Error("Relay regional market bindings are not loaded");
    const connectionEpoch = this.#connectionEpoch + 1;
    this.#connectionEpoch = connectionEpoch;
    const connection = bindings.DbConnection.builder()
      .withUri(config.uri)
      .withDatabaseName(config.database)
      .onConnect((connection) => {
        if (this.#stopping || connectionEpoch !== this.#connectionEpoch) {
          connection.disconnect();
          return;
        }
        this.#connection = connection;
        this.#cancelReconnect?.();
        this.#cancelReconnect = null;
        this.#reconnectAttempt = 0;
        this.#health.connected = true;
        this.#health.lastError = null;
        this.#baseSubscription = connection.subscriptionBuilder()
          .onApplied(() => this.#guard(() => {
            this.#attachListeners(connection);
            this.#beginDetailRefresh(connection);
          }))
          .onError((_context, error) => (
            this.#handleBaseError(connection, connectionEpoch, error)
          ))
          .subscribe([
            "SELECT * FROM buy_order_state",
            "SELECT * FROM sell_order_state",
            "SELECT * FROM barter_stall_state",
          ]);
      })
      .onConnectError((_context, error) => {
        if (connectionEpoch !== this.#connectionEpoch || this.#stopping) return;
        this.#health.connected = false;
        this.#recordError(error);
        this.#connection = null;
        this.#scheduleReconnect();
      })
      .onDisconnect((_context, error) => {
        if (connectionEpoch !== this.#connectionEpoch || this.#stopping) return;
        this.#health.connected = false;
        if (error) this.#recordError(error);
        this.#clearConnectionState(connection);
        if (this.#connection === connection) this.#connection = null;
        this.#scheduleReconnect();
      })
      .build();
    if (connectionEpoch === this.#connectionEpoch && !this.#stopping) {
      this.#connection = connection;
    }
  }

  #retryDelay(attempt: number): number {
    const baseMs = Math.min(30_000, 1_000 * (2 ** Math.min(attempt, 5)));
    return Math.max(1, Math.round(baseMs * (0.8 + (this.#random() * 0.4))));
  }

  #scheduleReconnect(): void {
    if (this.#cancelReconnect || this.#stopping || !this.#config || !this.#bindings) return;
    const delayMs = this.#retryDelay(this.#reconnectAttempt);
    this.#reconnectAttempt += 1;
    this.#cancelReconnect = this.#scheduleRetry(() => {
      this.#cancelReconnect = null;
      if (this.#stopping || !this.#config || !this.#bindings) return;
      try {
        this.#openConnection();
      } catch (error) {
        this.#recordError(error);
        this.#scheduleReconnect();
      }
    }, delayMs);
  }

  #beginDetailRefresh(connection: BindingConnection): void {
    const config = this.#requiredConfig();
    this.#cancelDetailRetry?.();
    this.#cancelDetailRetry = null;
    const buyRows = rows(connection.db.buyOrderState);
    const sellRows = rows(connection.db.sellOrderState);
    const stallRows = rows(connection.db.barterStallState);
    const orderCount = buyRows.length + sellRows.length;
    if (orderCount > config.maxOrders) {
      throw new Error(
        `Relay regional market order budget ${config.maxOrders} exceeded by ${orderCount} rows`,
      );
    }
    if (stallRows.length > config.maxStalls) {
      throw new Error(
        `Relay regional market stall budget ${config.maxStalls} exceeded by ${stallRows.length} rows`,
      );
    }
    this.#refreshingDetails = true;
    this.#detailRefreshPending = false;
    this.#detailEpoch += 1;
    const epoch = this.#detailEpoch;
    this.#removeStallDetailListeners(connection);
    this.#stallDetailSubscription?.unsubscribe();
    this.#stallDetailSubscription = null;
    this.#identitySubscription?.unsubscribe();
    this.#identitySubscription = null;
    const stallIds = stallRows.map((value, index) => {
      const row = wireRecord(value, `Relay regional market stall ${index}`);
      return decimalInteger(
        row.entityId ?? row.entity_id,
        `Relay regional market stall ${index} entity id`,
      );
    });
    const queries = [
      ...equalitySubscriptionQueries(
        "trade_order_state",
        "shop_entity_id",
        stallIds,
        config.maxIdsPerQuery,
      ),
      ...equalitySubscriptionQueries(
        "building_state",
        "entity_id",
        stallIds,
        config.maxIdsPerQuery,
      ),
      ...equalitySubscriptionQueries(
        "building_nickname_state",
        "entity_id",
        stallIds,
        config.maxIdsPerQuery,
      ),
      ...equalitySubscriptionQueries(
        "location_state",
        "entity_id",
        stallIds,
        config.maxIdsPerQuery,
      ),
    ];
    if (!queries.length) {
      this.#attachStallDetailListeners(connection);
      this.#beginIdentityRefresh(connection, epoch);
      return;
    }
    this.#stallDetailSubscription = connection.subscriptionBuilder()
      .onApplied(() => this.#guard(() => {
        if (epoch !== this.#detailEpoch) return;
        this.#attachStallDetailListeners(connection);
        this.#beginIdentityRefresh(connection, epoch);
      }))
      .onError((_context, error) => this.#handleDetailError(connection, epoch, error))
      .subscribe(queries);
  }

  #beginIdentityRefresh(connection: BindingConnection, epoch: number): void {
    if (epoch !== this.#detailEpoch || connection !== this.#connection || this.#stopping) return;
    const config = this.#requiredConfig();
    const claimIds: string[] = [];
    const ownerIds: string[] = [];
    for (const [index, value] of [
      ...rows(connection.db.buyOrderState),
      ...rows(connection.db.sellOrderState),
    ].entries()) {
      const row = wireRecord(value, `Relay regional market order ${index}`);
      claimIds.push(decimalInteger(
        row.claimEntityId ?? row.claim_entity_id,
        `Relay regional market order ${index} claim id`,
      ));
      ownerIds.push(decimalInteger(
        row.ownerEntityId ?? row.owner_entity_id,
        `Relay regional market order ${index} owner id`,
      ));
    }
    for (const [index, value] of rows(connection.db.buildingState).entries()) {
      const row = wireRecord(value, `Relay regional market stall building ${index}`);
      claimIds.push(decimalInteger(
        row.claimEntityId ?? row.claim_entity_id,
        `Relay regional market stall building ${index} claim id`,
      ));
      ownerIds.push(decimalInteger(
        row.constructedByPlayerEntityId ?? row.constructed_by_player_entity_id,
        `Relay regional market stall building ${index} owner id`,
      ));
    }
    const queries = [
      ...equalitySubscriptionQueries(
        "claim_state",
        "entity_id",
        claimIds,
        config.maxIdsPerQuery,
      ),
      ...equalitySubscriptionQueries(
        "player_username_state",
        "entity_id",
        ownerIds,
        config.maxIdsPerQuery,
      ),
    ];
    if (!queries.length) {
      this.#finishDetailRefresh(connection, epoch);
      return;
    }
    this.#identitySubscription = connection.subscriptionBuilder()
      .onApplied(() => this.#guard(() => {
        if (epoch !== this.#detailEpoch) return;
        this.#finishDetailRefresh(connection, epoch);
      }))
      .onError((_context, error) => this.#handleDetailError(connection, epoch, error))
      .subscribe(queries);
  }

  #finishDetailRefresh(connection: BindingConnection, epoch: number): void {
    if (epoch !== this.#detailEpoch || connection !== this.#connection || this.#stopping) return;
    if (this.#detailRefreshPending) {
      this.#beginDetailRefresh(connection);
      return;
    }
    this.#detailRetryAttempt = 0;
    this.#refreshingDetails = false;
    this.#applySnapshot(connection);
  }

  #handleDetailError(connection: BindingConnection, epoch: number, error: unknown): void {
    if (epoch !== this.#detailEpoch || connection !== this.#connection || this.#stopping) return;
    this.#refreshingDetails = false;
    this.#recordError(error);
    this.#stallDetailSubscription?.unsubscribe();
    this.#stallDetailSubscription = null;
    this.#identitySubscription?.unsubscribe();
    this.#identitySubscription = null;
    if (this.#cancelDetailRetry) return;
    const delayMs = this.#retryDelay(this.#detailRetryAttempt);
    this.#detailRetryAttempt += 1;
    this.#cancelDetailRetry = this.#scheduleRetry(() => {
      this.#cancelDetailRetry = null;
      if (
        this.#stopping
        || connection !== this.#connection
        || epoch !== this.#detailEpoch
      ) return;
      this.#guard(() => this.#beginDetailRefresh(connection));
    }, delayMs);
  }

  #handleBaseError(
    connection: BindingConnection,
    connectionEpoch: number,
    error: unknown,
  ): void {
    if (
      this.#stopping
      || connectionEpoch !== this.#connectionEpoch
      || connection !== this.#connection
    ) return;
    this.#health.connected = false;
    this.#recordError(error);
    this.#connectionEpoch += 1;
    this.#clearConnectionState(connection);
    this.#connection = null;
    connection.disconnect();
    this.#scheduleReconnect();
  }

  #applySnapshot(connection: BindingConnection): void {
    const config = this.#requiredConfig();
    if (this.#refreshingDetails) return;
    if (this.#applyInFlight) {
      this.#applyPending = true;
      return;
    }
    const startedAt = Date.now();
    try {
      const buyRows = rows(connection.db.buyOrderState);
      const sellRows = rows(connection.db.sellOrderState);
      const stallRows = rows(connection.db.barterStallState);
      const tradeOrderRows = rows(connection.db.tradeOrderState);
      const buildingRows = rows(connection.db.buildingState);
      const buildingNicknameRows = rows(connection.db.buildingNicknameState);
      const claimRows = rows(connection.db.claimState);
      const usernameRows = rows(connection.db.playerUsernameState);
      const locationRows = rows(connection.db.locationState);
      const rowCount = buyRows.length
        + sellRows.length
        + stallRows.length
        + tradeOrderRows.length
        + buildingRows.length
        + buildingNicknameRows.length
        + claimRows.length
        + usernameRows.length
        + locationRows.length;
      if (rowCount > config.maxApplyRows) {
        throw new Error(
          `Relay regional market apply row budget ${config.maxApplyRows} exceeded by ${rowCount} rows`,
        );
      }
      const normalized = normalizeRegionalOrders({
        regionId: config.regionId,
        sellRows,
        buyRows,
        claimRows,
        usernameRows,
      });
      const normalizedStalls = normalizeRegionalStalls({
        regionId: config.regionId,
        stallRows,
        tradeOrderRows,
        buildingRows,
        buildingNicknameRows,
        claimRows,
        usernameRows,
        locationRows,
      });
      const receivedAt = this.#now().toISOString();
      const generation = this.#nextGeneration;
      this.#nextGeneration += 1;
      this.#applyInFlight = true;
      this.#health.rowCount = rowCount;
      this.#health.lastApplyDurationMs = Date.now() - startedAt;
      Promise.resolve(this.#onSnapshot({
        data: {
          ...normalized.data,
          ...normalizedStalls.data,
        },
        warnings: [...normalized.warnings, ...normalizedStalls.warnings],
        database: config.database,
        regionId: config.regionId,
        schemaFingerprint: config.schemaFingerprint,
        generation,
        receivedAt,
      })).then(() => {
        this.#health.applied = true;
        this.#health.lastAppliedAt = receivedAt;
        this.#health.lastError = null;
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
    if (!this.#connection) return;
    if (this.#refreshingDetails) {
      this.#detailRefreshPending = true;
      return;
    }
    if (this.#detailRefreshQueued) return;
    this.#detailRefreshQueued = true;
    queueMicrotask(() => {
      this.#detailRefreshQueued = false;
      if (this.#connection) this.#guard(() => this.#beginDetailRefresh(this.#connection!));
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
    if (this.#baseListenersAttached) return;
    for (const table of [
      connection.db.buyOrderState,
      connection.db.sellOrderState,
      connection.db.barterStallState,
    ]) {
      table.onInsert?.(this.#baseChanged);
      table.onUpdate?.(this.#baseChanged);
      table.onDelete?.(this.#baseChanged);
    }
    for (const table of [connection.db.claimState, connection.db.playerUsernameState]) {
      table.onInsert?.(this.#detailChanged);
      table.onUpdate?.(this.#detailChanged);
      table.onDelete?.(this.#detailChanged);
    }
    this.#baseListenersAttached = true;
  }

  #removeListeners(connection = this.#connection): void {
    if (!connection) return;
    this.#removeStallDetailListeners(connection);
    if (!this.#baseListenersAttached) return;
    for (const table of [
      connection.db.buyOrderState,
      connection.db.sellOrderState,
      connection.db.barterStallState,
    ]) {
      table.removeOnInsert?.(this.#baseChanged);
      table.removeOnUpdate?.(this.#baseChanged);
      table.removeOnDelete?.(this.#baseChanged);
    }
    for (const table of [connection.db.claimState, connection.db.playerUsernameState]) {
      table.removeOnInsert?.(this.#detailChanged);
      table.removeOnUpdate?.(this.#detailChanged);
      table.removeOnDelete?.(this.#detailChanged);
    }
    this.#baseListenersAttached = false;
  }

  #attachStallDetailListeners(connection: BindingConnection): void {
    if (this.#stallDetailListenersAttached) return;
    for (const table of [
      connection.db.tradeOrderState,
      connection.db.buildingState,
      connection.db.buildingNicknameState,
      connection.db.locationState,
    ]) {
      table.onInsert?.(this.#baseChanged);
      table.onUpdate?.(this.#baseChanged);
      table.onDelete?.(this.#baseChanged);
    }
    this.#stallDetailListenersAttached = true;
  }

  #removeStallDetailListeners(connection: BindingConnection): void {
    if (!this.#stallDetailListenersAttached) return;
    for (const table of [
      connection.db.tradeOrderState,
      connection.db.buildingState,
      connection.db.buildingNicknameState,
      connection.db.locationState,
    ]) {
      table.removeOnInsert?.(this.#baseChanged);
      table.removeOnUpdate?.(this.#baseChanged);
      table.removeOnDelete?.(this.#baseChanged);
    }
    this.#stallDetailListenersAttached = false;
  }

  #clearConnectionState(connection: BindingConnection): void {
    this.#detailEpoch += 1;
    this.#cancelDetailRetry?.();
    this.#cancelDetailRetry = null;
    this.#detailRetryAttempt = 0;
    this.#removeListeners(connection);
    this.#stallDetailSubscription?.unsubscribe();
    this.#stallDetailSubscription = null;
    this.#identitySubscription?.unsubscribe();
    this.#identitySubscription = null;
    this.#baseSubscription?.unsubscribe();
    this.#baseSubscription = null;
    this.#detailRefreshQueued = false;
    this.#detailRefreshPending = false;
    this.#snapshotQueued = false;
    this.#refreshingDetails = false;
  }

  #requiredConfig() {
    if (!this.#config) throw new Error("Relay regional market session is not configured");
    return this.#config;
  }

  #guard(action: () => void): void {
    try {
      action();
    } catch (error) {
      this.#refreshingDetails = false;
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
    this.#stopping = true;
    this.#connectionEpoch += 1;
    this.#cancelReconnect?.();
    this.#cancelReconnect = null;
    const connection = this.#connection;
    if (connection) this.#clearConnectionState(connection);
    connection?.disconnect();
    this.#connection = null;
    this.#bindings = null;
    this.#config = null;
    this.#nextGeneration = 0;
    this.#reconnectAttempt = 0;
    this.#detailRetryAttempt = 0;
    this.#detailRefreshQueued = false;
    this.#detailRefreshPending = false;
    this.#snapshotQueued = false;
    this.#refreshingDetails = false;
    this.#applyInFlight = false;
    this.#applyPending = false;
    this.#health.connected = false;
  }
}
