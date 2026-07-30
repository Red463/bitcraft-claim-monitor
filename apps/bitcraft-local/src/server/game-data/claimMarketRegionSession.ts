import { normalizeRegionalMarket } from "./normalizers.ts";
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
    sellOrderState: CachedTable;
    buyOrderState: CachedTable;
    marketplaceState: CachedTable;
    playerUsernameState: CachedTable;
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
  claimId: string;
  maxOrders?: number;
  maxIdsPerQuery?: number;
  maxApplyRows?: number;
};

type SessionDependencies = {
  loadBindings?: () => Promise<RegionalBindingModule>;
  onSnapshot(snapshot: RegionalClaimMarketSnapshot): void | Promise<void>;
  now?: () => Date;
};

export type RegionalClaimMarketSnapshot = {
  data: ReturnType<typeof normalizeRegionalMarket>["data"];
  warnings: string[];
  database: string;
  regionId: string;
  schemaFingerprint: string;
  generation: number;
  receivedAt: string;
};

type WireRecord = Record<string, unknown>;

const DEFAULT_MAX_ORDERS = 5_000;
const DEFAULT_MAX_IDS_PER_QUERY = 100;
const DEFAULT_MAX_APPLY_ROWS = 6_000;

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

export class RelayClaimMarketRegionSession {
  readonly #loadBindings: () => Promise<RegionalBindingModule>;
  readonly #onSnapshot: SessionDependencies["onSnapshot"];
  readonly #now: () => Date;
  #connection: BindingConnection | null = null;
  #baseSubscription: SubscriptionHandle | null = null;
  #ownerSubscriptions: SubscriptionHandle[] = [];
  #config: Required<Pick<SessionConfig, "maxOrders" | "maxIdsPerQuery" | "maxApplyRows">>
    & Omit<SessionConfig, "maxOrders" | "maxIdsPerQuery" | "maxApplyRows">
    | null = null;
  #nextGeneration = 0;
  #ownerRefreshEpoch = 0;
  #ownerRefreshQueued = false;
  #snapshotQueued = false;
  #refreshingOwners = false;
  #applyInFlight = false;
  #applyPending = false;
  #listenersAttached = false;
  readonly #baseChanged = () => this.#queueOwnerRefresh();
  readonly #ownerChanged = () => this.#queueSnapshot();
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
    if (this.#connection) throw new Error("Relay claim-market session is already started");
    assertSchemaFingerprint(config.manifest, "regional", config.schemaFingerprint);
    if (!schemaBindingsReady(config.manifest, "regional")) {
      throw new Error("Relay regional schema bindings are not generated");
    }
    this.#config = {
      ...config,
      generation: positiveSafeInteger(config.generation, "Relay market generation"),
      regionId: decimalInteger(config.regionId, "Relay market region id"),
      claimId: decimalInteger(config.claimId, "Relay market claim id"),
      maxOrders: positiveSafeInteger(
        config.maxOrders ?? DEFAULT_MAX_ORDERS,
        "Relay market order budget",
      ),
      maxIdsPerQuery: positiveSafeInteger(
        config.maxIdsPerQuery ?? DEFAULT_MAX_IDS_PER_QUERY,
        "Relay market owner query size",
      ),
      maxApplyRows: positiveSafeInteger(
        config.maxApplyRows ?? DEFAULT_MAX_APPLY_ROWS,
        "Relay market apply row budget",
      ),
    };
    this.#nextGeneration = this.#config.generation;
    const bindings = await this.#loadBindings();
    this.#connection = bindings.DbConnection.builder()
      .withUri(config.uri)
      .withDatabaseName(config.database)
      .onConnect((connection) => {
        this.#health.connected = true;
        this.#health.lastError = null;
        const claimId = this.#requiredConfig().claimId;
        this.#baseSubscription = connection.subscriptionBuilder()
          .onApplied(() => this.#guard(() => {
            this.#attachListeners(connection);
            this.#beginOwnerRefresh(connection);
          }))
          .onError((_context, error) => this.#recordError(error))
          .subscribe([
            `SELECT * FROM sell_order_state WHERE claim_entity_id = ${claimId}`,
            `SELECT * FROM buy_order_state WHERE claim_entity_id = ${claimId}`,
            `SELECT * FROM marketplace_state WHERE claim_entity_id = ${claimId}`,
          ]);
      })
      .onConnectError((_context, error) => this.#recordError(error))
      .onDisconnect((_context, error) => {
        this.#health.connected = false;
        if (error) this.#recordError(error);
      })
      .build();
  }

  #beginOwnerRefresh(connection: BindingConnection): void {
    const config = this.#requiredConfig();
    const orders = [
      ...rows(connection.db.sellOrderState),
      ...rows(connection.db.buyOrderState),
    ];
    if (orders.length > config.maxOrders) {
      throw new Error(
        `Relay market order budget ${config.maxOrders} exceeded by ${orders.length} rows`,
      );
    }
    this.#refreshingOwners = true;
    this.#ownerRefreshEpoch += 1;
    const epoch = this.#ownerRefreshEpoch;
    this.#clearOwnerSubscriptions();
    const ownerIds = orders.map((value, index) => {
      const row = wireRecord(value, `Relay market order ${index}`);
      return decimalInteger(
        row.ownerEntityId ?? row.owner_entity_id,
        `Relay market order ${index} owner id`,
      );
    });
    if (!ownerIds.length) {
      this.#refreshingOwners = false;
      this.#applySnapshot(connection);
      return;
    }
    const queries = equalitySubscriptionQueries(
      "player_username_state",
      "entity_id",
      ownerIds,
      config.maxIdsPerQuery,
    );
    let remaining = queries.length;
    for (const query of queries) {
      const subscription = connection.subscriptionBuilder()
        .onApplied(() => this.#guard(() => {
          if (epoch !== this.#ownerRefreshEpoch) return;
          remaining -= 1;
          if (remaining === 0) {
            this.#refreshingOwners = false;
            this.#applySnapshot(connection);
          }
        }))
        .onError((_context, error) => this.#recordError(error))
        .subscribe([query]);
      this.#ownerSubscriptions.push(subscription);
    }
  }

  #applySnapshot(connection: BindingConnection): void {
    const config = this.#config;
    if (!config || this.#refreshingOwners) return;
    if (this.#applyInFlight) {
      this.#applyPending = true;
      return;
    }
    const startedAt = Date.now();
    try {
      const sellRows = rows(connection.db.sellOrderState);
      const buyRows = rows(connection.db.buyOrderState);
      const marketplaceRows = rows(connection.db.marketplaceState);
      const usernameRows = rows(connection.db.playerUsernameState);
      const rowCount = sellRows.length + buyRows.length
        + marketplaceRows.length + usernameRows.length;
      if (rowCount > config.maxApplyRows) {
        throw new Error(
          `Relay market apply row budget ${config.maxApplyRows} exceeded by ${rowCount} rows`,
        );
      }
      const normalized = normalizeRegionalMarket({
        claimId: config.claimId,
        regionId: config.regionId,
        sellRows,
        buyRows,
        marketplaceRows,
        usernameRows,
      });
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

  #queueOwnerRefresh(): void {
    if (this.#ownerRefreshQueued || !this.#connection) return;
    this.#ownerRefreshQueued = true;
    queueMicrotask(() => {
      this.#ownerRefreshQueued = false;
      if (this.#connection) this.#guard(() => this.#beginOwnerRefresh(this.#connection!));
    });
  }

  #queueSnapshot(): void {
    if (this.#snapshotQueued || !this.#connection || this.#refreshingOwners) return;
    this.#snapshotQueued = true;
    queueMicrotask(() => {
      this.#snapshotQueued = false;
      if (this.#connection) this.#applySnapshot(this.#connection);
    });
  }

  #attachListeners(connection: BindingConnection): void {
    if (this.#listenersAttached) return;
    for (const table of [
      connection.db.sellOrderState,
      connection.db.buyOrderState,
      connection.db.marketplaceState,
    ]) {
      table.onInsert?.(this.#baseChanged);
      table.onUpdate?.(this.#baseChanged);
      table.onDelete?.(this.#baseChanged);
    }
    connection.db.playerUsernameState.onInsert?.(this.#ownerChanged);
    connection.db.playerUsernameState.onUpdate?.(this.#ownerChanged);
    connection.db.playerUsernameState.onDelete?.(this.#ownerChanged);
    this.#listenersAttached = true;
  }

  #removeListeners(): void {
    if (!this.#listenersAttached || !this.#connection) return;
    for (const table of [
      this.#connection.db.sellOrderState,
      this.#connection.db.buyOrderState,
      this.#connection.db.marketplaceState,
    ]) {
      table.removeOnInsert?.(this.#baseChanged);
      table.removeOnUpdate?.(this.#baseChanged);
      table.removeOnDelete?.(this.#baseChanged);
    }
    this.#connection.db.playerUsernameState.removeOnInsert?.(this.#ownerChanged);
    this.#connection.db.playerUsernameState.removeOnUpdate?.(this.#ownerChanged);
    this.#connection.db.playerUsernameState.removeOnDelete?.(this.#ownerChanged);
    this.#listenersAttached = false;
  }

  #clearOwnerSubscriptions(): void {
    for (const subscription of this.#ownerSubscriptions) subscription.unsubscribe();
    this.#ownerSubscriptions = [];
  }

  #requiredConfig() {
    if (!this.#config) throw new Error("Relay claim-market session is not configured");
    return this.#config;
  }

  #guard(callback: () => void): void {
    try {
      callback();
    } catch (error) {
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
    this.#ownerRefreshEpoch += 1;
    this.#removeListeners();
    this.#clearOwnerSubscriptions();
    this.#baseSubscription?.unsubscribe();
    this.#baseSubscription = null;
    this.#connection?.disconnect();
    this.#connection = null;
    this.#config = null;
    this.#nextGeneration = 0;
    this.#ownerRefreshQueued = false;
    this.#snapshotQueued = false;
    this.#refreshingOwners = false;
    this.#applyInFlight = false;
    this.#applyPending = false;
    this.#health.connected = false;
  }
}
