import { normalizeRegionalClaims } from "./normalizers.ts";
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
    claimTechState: CachedTable;
    claimTechDesc: CachedTable;
    playerUsernameState: CachedTable;
    bankState: CachedTable;
    waystoneState: CachedTable;
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
  #config: Required<Pick<SessionConfig, "maxClaims" | "maxApplyRows">>
    & Omit<SessionConfig, "maxClaims" | "maxApplyRows"> | null = null;
  #nextGeneration = 0;
  #snapshotQueued = false;
  #applyInFlight = false;
  #applyPending = false;
  #listenersAttached = false;
  #stopping = false;
  readonly #snapshotChanged = () => this.#queueSnapshot();
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
        this.#baseSubscription = connection.subscriptionBuilder()
          .onApplied(() => this.#guard(() => {
            this.#attachListeners(connection);
            this.#health.stage = "applying";
            this.#applySnapshot(connection);
          }))
          .onError((_context, error) => this.#recordError(error))
          .subscribe([
            "SELECT * FROM claim_state",
            "SELECT * FROM claim_local_state",
            "SELECT * FROM building_claim_desc",
            "SELECT * FROM claim_tech_state",
            "SELECT * FROM claim_tech_desc",
            "SELECT * FROM player_username_state",
            "SELECT * FROM bank_state",
            "SELECT * FROM waystone_state",
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

  #applySnapshot(connection: BindingConnection): void {
    const config = this.#config;
    if (!config) return;
    if (this.#applyInFlight) {
      this.#applyPending = true;
      return;
    }
    const startedAt = Date.now();
    try {
      const claimRows = rows(connection.db.claimState);
      const localRows = rows(connection.db.claimLocalState);
      const claimTypeRows = rows(connection.db.buildingClaimDesc);
      const claimTechRows = rows(connection.db.claimTechState);
      const claimTechDescriptionRows = rows(connection.db.claimTechDesc);
      const usernameRows = rows(connection.db.playerUsernameState);
      const bankRows = rows(connection.db.bankState);
      const waystoneRows = rows(connection.db.waystoneState);
      const rowCount = claimRows.length + localRows.length + claimTypeRows.length
        + claimTechRows.length + claimTechDescriptionRows.length + usernameRows.length
        + bankRows.length + waystoneRows.length;
      this.#health.claimRowCount = claimRows.length;
      if (claimRows.length > config.maxClaims) {
        throw new Error(
          `Relay regional-claims claim budget ${config.maxClaims} exceeded by ${claimRows.length} claims`,
        );
      }
      this.#health.ownerIdCount = new Set(claimRows.map((value, index) => {
        const claim = row(value, `Relay regional claim ${index}`);
        return decimalInteger(
          claim.ownerPlayerEntityId ?? claim.owner_player_entity_id,
          `Relay regional claim ${index} owner id`,
        );
      })).size;
      this.#health.ownerQueryCount = 1;
      this.#health.ownerQueriesPending = 0;
      if (rowCount > config.maxApplyRows) {
        throw new Error(`Relay regional-claims apply budget ${config.maxApplyRows} exceeded by ${rowCount} rows`);
      }
      const normalized = normalizeRegionalClaims({
        regionId: config.regionId,
        claimRows,
        localRows,
        claimTypeRows,
        claimTechRows,
        claimTechDescriptionRows,
        usernameRows,
        bankRows,
        waystoneRows,
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

  #queueSnapshot(): void {
    if (this.#snapshotQueued || !this.#connection) return;
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
      connection.db.claimTechState,
      connection.db.claimTechDesc,
      connection.db.playerUsernameState,
      connection.db.bankState,
      connection.db.waystoneState,
    ]) {
      table.onInsert?.(this.#snapshotChanged);
      table.onUpdate?.(this.#snapshotChanged);
      table.onDelete?.(this.#snapshotChanged);
    }
    this.#listenersAttached = true;
  }

  #removeListeners(): void {
    if (!this.#listenersAttached || !this.#connection) return;
    for (const table of [
      this.#connection.db.claimState,
      this.#connection.db.claimLocalState,
      this.#connection.db.buildingClaimDesc,
      this.#connection.db.claimTechState,
      this.#connection.db.claimTechDesc,
      this.#connection.db.playerUsernameState,
      this.#connection.db.bankState,
      this.#connection.db.waystoneState,
    ]) {
      table.removeOnInsert?.(this.#snapshotChanged);
      table.removeOnUpdate?.(this.#snapshotChanged);
      table.removeOnDelete?.(this.#snapshotChanged);
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
    this.#onFailure(this.#health.lastError);
  }

  health() {
    return { ...this.#health };
  }

  async stop(): Promise<void> {
    this.#stopping = true;
    this.#removeListeners();
    this.#baseSubscription?.unsubscribe();
    this.#baseSubscription = null;
    this.#connection?.disconnect();
    this.#connection = null;
    this.#config = null;
    this.#health.connected = false;
  }
}
