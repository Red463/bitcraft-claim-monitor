import { normalizeRegionalClaims } from "./normalizers.ts";
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
    claimState: CachedTable;
    claimLocalState: CachedTable;
    buildingClaimDesc: CachedTable;
    playerUsernameState: CachedTable;
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
  maxClaims?: number;
  maxIdsPerQuery?: number;
  maxApplyRows?: number;
};
type SessionDependencies = {
  loadBindings?: () => Promise<RegionalBindingModule>;
  onSnapshot(snapshot: RegionalClaimsSnapshot): void | Promise<void>;
  onFailure?(error: string): void;
  now?: () => Date;
};
export type RegionalClaimsSnapshot = {
  data: ReturnType<typeof normalizeRegionalClaims>["data"];
  warnings: string[];
  database: string;
  regionId: string;
  schemaFingerprint: string;
  generation: number;
  receivedAt: string;
};
type WireRecord = Record<string, unknown>;

const DEFAULT_MAX_CLAIMS = 5_000;
// Relay's current regional source applies indexed point subscriptions
// reliably, while OR-combined username predicates can remain unapplied.
const DEFAULT_MAX_IDS_PER_QUERY = 1;
const DEFAULT_MAX_APPLY_ROWS = 12_000;

async function loadBundledRegionalBindings(): Promise<RegionalBindingModule> {
  const moduleUrl = new URL("./bindings/regional.js", import.meta.url).href;
  return await import(moduleUrl) as unknown as RegionalBindingModule;
}

function positiveInteger(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new TypeError(`${label} must be a positive safe integer`);
  return number;
}

function decimalInteger(value: unknown, label: string): string {
  const normalized = typeof value === "bigint" ? value.toString() : String(value ?? "").trim();
  if (!/^\d+$/.test(normalized)) throw new TypeError(`${label} must be a decimal integer`);
  return normalized;
}

function rows(table: CachedTable): unknown[] {
  return [...table.iter()];
}

function row(value: unknown, label: string): WireRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value as WireRecord;
}

export class RelayRegionClaimsSession {
  readonly #loadBindings: () => Promise<RegionalBindingModule>;
  readonly #onSnapshot: SessionDependencies["onSnapshot"];
  readonly #onFailure: NonNullable<SessionDependencies["onFailure"]>;
  readonly #now: () => Date;
  #connection: BindingConnection | null = null;
  #baseSubscription: SubscriptionHandle | null = null;
  #ownerSubscriptions: SubscriptionHandle[] = [];
  #config: Required<Pick<SessionConfig, "maxClaims" | "maxIdsPerQuery" | "maxApplyRows">>
    & Omit<SessionConfig, "maxClaims" | "maxIdsPerQuery" | "maxApplyRows"> | null = null;
  #nextGeneration = 0;
  #ownerEpoch = 0;
  #refreshingOwners = false;
  #ownerRefreshQueued = false;
  #snapshotQueued = false;
  #applyInFlight = false;
  #applyPending = false;
  #listenersAttached = false;
  #stopping = false;
  readonly #baseChanged = () => this.#queueOwnerRefresh();
  readonly #ownerChanged = () => this.#queueSnapshot();
  #health = {
    connected: false,
    applied: false,
    stage: "idle",
    lastAppliedAt: null as string | null,
    lastApplyDurationMs: null as number | null,
    rowCount: 0,
    claimRowCount: 0,
    ownerIdCount: 0,
    ownerQueryCount: 0,
    ownerQueriesPending: 0,
    lastError: null as string | null,
  };

  constructor(dependencies: SessionDependencies) {
    this.#loadBindings = dependencies.loadBindings ?? loadBundledRegionalBindings;
    this.#onSnapshot = dependencies.onSnapshot;
    this.#onFailure = dependencies.onFailure ?? (() => {});
    this.#now = dependencies.now ?? (() => new Date());
  }

  async start(config: SessionConfig): Promise<void> {
    if (this.#connection) throw new Error("Relay regional-claims session is already started");
    this.#stopping = false;
    assertSchemaFingerprint(config.manifest, "regional", config.schemaFingerprint);
    if (!schemaBindingsReady(config.manifest, "regional")) throw new Error("Relay regional schema bindings are not generated");
    this.#config = {
      ...config,
      generation: positiveInteger(config.generation, "Relay regional-claims generation"),
      regionId: decimalInteger(config.regionId, "Relay regional-claims region id"),
      maxClaims: positiveInteger(config.maxClaims ?? DEFAULT_MAX_CLAIMS, "Relay regional-claims claim budget"),
      maxIdsPerQuery: positiveInteger(config.maxIdsPerQuery ?? DEFAULT_MAX_IDS_PER_QUERY, "Relay regional-claims owner query size"),
      maxApplyRows: positiveInteger(config.maxApplyRows ?? DEFAULT_MAX_APPLY_ROWS, "Relay regional-claims apply row budget"),
    };
    this.#nextGeneration = this.#config.generation;
    const bindings = await this.#loadBindings();
    this.#connection = bindings.DbConnection.builder()
      .withUri(config.uri)
      .withDatabaseName(config.database)
      .onConnect((connection) => {
        this.#health.connected = true;
        this.#health.stage = "base";
        this.#health.lastError = null;
        this.#baseSubscription = connection.subscriptionBuilder()
          .onApplied(() => this.#guard(() => {
            this.#attachListeners(connection);
            this.#refreshOwners(connection);
          }))
          .onError((_context, error) => this.#recordError(error))
          .subscribe([
            "SELECT * FROM claim_state",
            "SELECT * FROM claim_local_state",
            "SELECT * FROM building_claim_desc",
          ]);
      })
      .onConnectError((_context, error) => {
        if (!this.#stopping) this.#recordError(error);
      })
      .onDisconnect((_context, error) => {
        this.#health.connected = false;
        if (!this.#stopping) {
          this.#recordError(error ?? new Error("Relay regional-claims subscription disconnected."));
        }
      })
      .build();
  }

  #requiredConfig() {
    if (!this.#config) throw new Error("Relay regional-claims session is not configured");
    return this.#config;
  }

  #refreshOwners(connection: BindingConnection): void {
    const config = this.#requiredConfig();
    const claimRows = rows(connection.db.claimState);
    this.#health.stage = "owners";
    this.#health.claimRowCount = claimRows.length;
    if (claimRows.length > config.maxClaims) {
      throw new Error(`Relay regional-claims budget ${config.maxClaims} exceeded by ${claimRows.length} claims`);
    }
    const ownerIds = claimRows.map((value, index) => {
      const claim = row(value, `Relay regional claim ${index}`);
      return decimalInteger(
        claim.ownerPlayerEntityId ?? claim.owner_player_entity_id,
        `Relay regional claim ${index} owner id`,
      );
    });
    this.#refreshingOwners = true;
    this.#ownerEpoch += 1;
    const epoch = this.#ownerEpoch;
    this.#clearOwnerSubscriptions();
    const queries = equalitySubscriptionQueries(
      "player_username_state",
      "entity_id",
      ownerIds,
      config.maxIdsPerQuery,
    );
    this.#health.ownerIdCount = new Set(ownerIds).size;
    this.#health.ownerQueryCount = queries.length;
    this.#health.ownerQueriesPending = queries.length;
    if (!queries.length) {
      this.#refreshingOwners = false;
      this.#health.stage = "applying";
      this.#applySnapshot(connection);
      return;
    }
    let remaining = queries.length;
    for (const query of queries) {
      const subscription = connection.subscriptionBuilder()
        .onApplied(() => this.#guard(() => {
          if (epoch !== this.#ownerEpoch) return;
          remaining -= 1;
          this.#health.ownerQueriesPending = remaining;
          if (remaining === 0) {
            this.#refreshingOwners = false;
            this.#health.stage = "applying";
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
      const claimRows = rows(connection.db.claimState);
      const localRows = rows(connection.db.claimLocalState);
      const claimTypeRows = rows(connection.db.buildingClaimDesc);
      const usernameRows = rows(connection.db.playerUsernameState);
      const rowCount = claimRows.length + localRows.length + claimTypeRows.length + usernameRows.length;
      if (rowCount > config.maxApplyRows) {
        throw new Error(`Relay regional-claims apply budget ${config.maxApplyRows} exceeded by ${rowCount} rows`);
      }
      const normalized = normalizeRegionalClaims({
        regionId: config.regionId,
        claimRows,
        localRows,
        claimTypeRows,
        usernameRows,
      });
      const receivedAt = this.#now().toISOString();
      const generation = this.#nextGeneration;
      this.#nextGeneration += 1;
      this.#applyInFlight = true;
      this.#health.rowCount = rowCount;
      this.#health.lastApplyDurationMs = Date.now() - startedAt;
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
        this.#health.stage = "applied";
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
      if (this.#connection) this.#guard(() => this.#refreshOwners(this.#connection!));
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
      connection.db.claimState,
      connection.db.claimLocalState,
      connection.db.buildingClaimDesc,
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
      this.#connection.db.claimState,
      this.#connection.db.claimLocalState,
      this.#connection.db.buildingClaimDesc,
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

  #guard(action: () => void): void {
    try {
      action();
    } catch (error) {
      this.#recordError(error);
    }
  }

  #recordError(error: unknown): void {
    this.#health.lastError = error instanceof Error ? error.message : String(error);
    this.#onFailure(this.#health.lastError);
  }

  health() {
    return { ...this.#health };
  }

  async stop(): Promise<void> {
    this.#stopping = true;
    this.#ownerEpoch += 1;
    this.#removeListeners();
    this.#clearOwnerSubscriptions();
    this.#baseSubscription?.unsubscribe();
    this.#baseSubscription = null;
    this.#connection?.disconnect();
    this.#connection = null;
    this.#config = null;
    this.#refreshingOwners = false;
    this.#health.connected = false;
  }
}
