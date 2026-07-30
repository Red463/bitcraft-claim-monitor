import {
  normalizeRegionalConstruction,
  normalizeRegionalEquipment,
  normalizeRegionalPlayers,
  normalizeRegionalResearch,
} from "./normalizers.ts";
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
    playerState: CachedTable;
    equipmentState: CachedTable;
    equipmentPresetState: CachedTable;
    activeBuffState: CachedTable;
    projectSiteState: CachedTable;
    claimTechState: CachedTable;
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

type RegionalBindingModule = {
  DbConnection: {
    builder(): ConnectionBuilder;
  };
};

type Member = {
  playerEntityId?: unknown;
  player_entity_id?: unknown;
  [key: string]: unknown;
};

type SessionConfig = {
  uri: string;
  database: string;
  schemaFingerprint: string;
  manifest: BindingManifest;
  generation: number;
  regionId: string;
  claimId: string;
  members: Member[];
};

type SessionDependencies = {
  loadBindings?: () => Promise<RegionalBindingModule>;
  onSnapshot: (snapshot: RegionalPlayerSnapshot) => void | Promise<void>;
  now?: () => Date;
};

export type RegionalPlayerSnapshot = {
  players: ReturnType<typeof normalizeRegionalPlayers>["data"];
  warnings: string[];
  equipment: ReturnType<typeof normalizeRegionalEquipment>["data"];
  equipmentWarnings: string[];
  construction: ReturnType<typeof normalizeRegionalConstruction>["data"];
  constructionWarnings: string[];
  research: ReturnType<typeof normalizeRegionalResearch>["data"];
  researchWarnings: string[];
  database: string;
  regionId: string;
  schemaFingerprint: string;
  generation: number;
  receivedAt: string;
};

async function loadBundledRegionalBindings(): Promise<RegionalBindingModule> {
  const moduleUrl = new URL("./bindings/regional.js", import.meta.url).href;
  return await import(moduleUrl) as unknown as RegionalBindingModule;
}

function memberEntityId(member: Member, index: number): string {
  const value = member.playerEntityId ?? member.player_entity_id;
  const id = typeof value === "bigint" ? value.toString() : String(value ?? "").trim();
  if (!/^\d+$/.test(id)) {
    throw new TypeError(`regional member ${index} has an invalid player entity id`);
  }
  return id;
}

export function playerStateQueries(members: Member[]): string[] {
  const ids = [...new Set(members.map(memberEntityId))];
  const where = (column: string) => ids.map((id) => `${column} = ${id}`).join(" OR ");
  return [
    `SELECT * FROM player_state WHERE ${where("entity_id")}`,
    `SELECT * FROM equipment_state WHERE ${where("entity_id")}`,
    `SELECT * FROM equipment_preset_state WHERE ${where("player_entity_id")}`,
    `SELECT * FROM active_buff_state WHERE ${where("entity_id")}`,
  ];
}

function constructionQuery(claimIdValue: string): string {
  const claimId = String(claimIdValue ?? "").trim();
  if (!/^\d+$/.test(claimId)) {
    throw new TypeError("regional construction claim id is invalid");
  }
  return `SELECT * FROM project_site_state WHERE owner_id = ${claimId}`;
}

function researchQuery(claimIdValue: string): string {
  const claimId = String(claimIdValue ?? "").trim();
  if (!/^\d+$/.test(claimId)) {
    throw new TypeError("regional research claim id is invalid");
  }
  return `SELECT * FROM claim_tech_state WHERE entity_id = ${claimId}`;
}

export class RelayPrimaryRegionPlayerSession {
  readonly #loadBindings: () => Promise<RegionalBindingModule>;
  readonly #onSnapshot: SessionDependencies["onSnapshot"];
  readonly #now: () => Date;
  #connection: BindingConnection | null = null;
  #subscription: SubscriptionHandle | null = null;
  #config: SessionConfig | null = null;
  #nextGeneration = 0;
  #snapshotQueued = false;
  #applyInFlight = false;
  #applyPending = false;
  #listenersAttached = false;
  readonly #tableChanged = () => this.#queueSnapshot();
  #health = {
    connected: false,
    applied: false,
    lastAppliedAt: null as string | null,
    lastError: null as string | null,
  };

  constructor(dependencies: SessionDependencies) {
    this.#loadBindings = dependencies.loadBindings ?? loadBundledRegionalBindings;
    this.#onSnapshot = dependencies.onSnapshot;
    this.#now = dependencies.now ?? (() => new Date());
  }

  async start(config: SessionConfig): Promise<void> {
    if (this.#connection) throw new Error("Relay primary-region player session is already started");
    assertSchemaFingerprint(config.manifest, "regional", config.schemaFingerprint);
    if (!schemaBindingsReady(config.manifest, "regional")) {
      throw new Error("Relay regional schema bindings are not generated");
    }
    if (!Number.isSafeInteger(config.generation) || config.generation <= 0) {
      throw new Error("Relay regional player generation must be a positive safe integer");
    }
    const queries = [
      ...playerStateQueries(config.members),
      constructionQuery(config.claimId),
      researchQuery(config.claimId),
    ];
    if (queries.length === 0) {
      throw new Error("Relay regional player session requires at least one claim member");
    }
    this.#config = config;
    this.#nextGeneration = config.generation;
    const bindings = await this.#loadBindings();
    this.#connection = bindings.DbConnection.builder()
      .withUri(config.uri)
      .withDatabaseName(config.database)
      .onConnect((connection) => {
        this.#health.connected = true;
        this.#health.lastError = null;
        this.#subscription = connection.subscriptionBuilder()
          .onApplied(() => {
            this.#applySnapshot(connection);
            this.#attachTableListeners(connection);
          })
          .onError((_context, error) => this.#recordError(error))
          .subscribe(queries);
      })
      .onConnectError((_context, error) => this.#recordError(error))
      .onDisconnect((_context, error) => {
        this.#health.connected = false;
        if (error) this.#recordError(error);
      })
      .build();
  }

  #applySnapshot(connection: BindingConnection): void {
    const config = this.#config;
    if (!config) return;
    if (this.#applyInFlight) {
      this.#applyPending = true;
      return;
    }
    try {
      const receivedAt = this.#now().toISOString();
      const normalized = normalizeRegionalPlayers({
        members: config.members,
        playerRows: [...connection.db.playerState.iter()],
        observedAt: receivedAt,
      });
      const equipment = normalizeRegionalEquipment({
        members: config.members,
        equipmentRows: [...connection.db.equipmentState.iter()],
        presetRows: [...connection.db.equipmentPresetState.iter()],
        buffRows: [...connection.db.activeBuffState.iter()],
      });
      const construction = normalizeRegionalConstruction({
        claimId: config.claimId,
        projectRows: [...connection.db.projectSiteState.iter()],
      });
      const research = normalizeRegionalResearch({
        claimId: config.claimId,
        stateRows: [...connection.db.claimTechState.iter()],
      });
      const generation = this.#nextGeneration;
      this.#nextGeneration += 1;
      this.#applyInFlight = true;
      const result = this.#onSnapshot({
        players: normalized.data,
        warnings: normalized.warnings,
        equipment: equipment.data,
        equipmentWarnings: equipment.warnings,
        construction: construction.data,
        constructionWarnings: construction.warnings,
        research: research.data,
        researchWarnings: research.warnings,
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

  #attachTableListeners(connection: BindingConnection): void {
    if (this.#listenersAttached) return;
    for (const table of this.#tables(connection)) {
      table.onInsert?.(this.#tableChanged);
      table.onUpdate?.(this.#tableChanged);
      table.onDelete?.(this.#tableChanged);
    }
    this.#listenersAttached = true;
  }

  #removeTableListeners(): void {
    if (!this.#listenersAttached || !this.#connection) return;
    for (const table of this.#tables(this.#connection)) {
      table.removeOnInsert?.(this.#tableChanged);
      table.removeOnUpdate?.(this.#tableChanged);
      table.removeOnDelete?.(this.#tableChanged);
    }
    this.#listenersAttached = false;
  }

  #tables(connection: BindingConnection): CachedTable[] {
    return [
      connection.db.playerState,
      connection.db.equipmentState,
      connection.db.equipmentPresetState,
      connection.db.activeBuffState,
      connection.db.projectSiteState,
      connection.db.claimTechState,
    ];
  }

  #queueSnapshot(): void {
    if (this.#snapshotQueued || !this.#connection) return;
    this.#snapshotQueued = true;
    queueMicrotask(() => {
      this.#snapshotQueued = false;
      if (this.#connection) this.#applySnapshot(this.#connection);
    });
  }

  #recordError(error: unknown): void {
    this.#health.lastError = error instanceof Error ? error.message : String(error);
  }

  health() {
    return { ...this.#health };
  }

  async stop(): Promise<void> {
    this.#removeTableListeners();
    this.#subscription?.unsubscribe();
    this.#subscription = null;
    this.#connection?.disconnect();
    this.#connection = null;
    this.#config = null;
    this.#nextGeneration = 0;
    this.#snapshotQueued = false;
    this.#applyInFlight = false;
    this.#applyPending = false;
    this.#health.connected = false;
  }
}
