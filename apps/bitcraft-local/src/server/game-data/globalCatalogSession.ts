import {
  normalizeCatalogDescription,
  normalizeCatalogEntity,
  type CatalogDescriptionKind,
} from "./normalizers.ts";
import {
  assertSchemaFingerprint,
  schemaBindingsReady,
} from "./schemaManifest.ts";

export const GLOBAL_CATALOG_QUERIES = [
  "SELECT * FROM item_desc",
  "SELECT * FROM cargo_desc",
  "SELECT * FROM crafting_recipe_desc",
  "SELECT * FROM extraction_recipe_desc",
  "SELECT * FROM item_list_desc",
  "SELECT * FROM construction_recipe_desc",
  "SELECT * FROM building_desc",
  "SELECT * FROM building_type_desc",
  "SELECT * FROM skill_desc",
  "SELECT * FROM resource_desc",
  "SELECT * FROM enemy_desc",
  "SELECT * FROM equipment_desc",
  "SELECT * FROM tool_desc",
  "SELECT * FROM buff_desc",
  "SELECT * FROM claim_tech_desc",
] as const;

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
  db: Record<string, CachedTable> & {
    itemDesc: CachedTable;
    cargoDesc: CachedTable;
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

type GlobalBindingModule = {
  DbConnection: {
    builder(): ConnectionBuilder;
  };
};

export type GlobalCatalogSnapshot = {
  entities: ReturnType<typeof normalizeCatalogEntity>[];
  descriptions: Record<CatalogDescriptionKind, ReturnType<typeof normalizeCatalogDescription>[]>;
  database: string;
  schemaFingerprint: string;
  generation: number;
  receivedAt: string;
};

const DESCRIPTION_TABLES: ReadonlyArray<{
  accessor: string;
  kind: CatalogDescriptionKind;
}> = [
  { accessor: "craftingRecipeDesc", kind: "crafting_recipe" },
  { accessor: "extractionRecipeDesc", kind: "extraction_recipe" },
  { accessor: "itemListDesc", kind: "item_list" },
  { accessor: "constructionRecipeDesc", kind: "construction_recipe" },
  { accessor: "buildingDesc", kind: "building" },
  { accessor: "buildingTypeDesc", kind: "building_type" },
  { accessor: "skillDesc", kind: "skill" },
  { accessor: "resourceDesc", kind: "resource" },
  { accessor: "enemyDesc", kind: "enemy" },
  { accessor: "equipmentDesc", kind: "equipment" },
  { accessor: "toolDesc", kind: "tool" },
  { accessor: "buffDesc", kind: "buff" },
  { accessor: "claimTechDesc", kind: "claim_tech" },
];

type SessionConfig = {
  uri: string;
  database: string;
  schemaFingerprint: string;
  manifest: BindingManifest;
  generation: number;
};

type SessionDependencies = {
  loadBindings?: () => Promise<GlobalBindingModule>;
  onSnapshot: (snapshot: GlobalCatalogSnapshot) => void | Promise<void>;
  now?: () => Date;
};

async function loadBundledGlobalBindings(): Promise<GlobalBindingModule> {
  const moduleUrl = new URL("./bindings/global.js", import.meta.url).href;
  return await import(moduleUrl) as unknown as GlobalBindingModule;
}

export class RelayGlobalCatalogSession {
  readonly #loadBindings: () => Promise<GlobalBindingModule>;
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
    this.#loadBindings = dependencies.loadBindings ?? loadBundledGlobalBindings;
    this.#onSnapshot = dependencies.onSnapshot;
    this.#now = dependencies.now ?? (() => new Date());
  }

  async start(config: SessionConfig): Promise<void> {
    if (this.#connection) throw new Error("Relay global catalog session is already started");
    assertSchemaFingerprint(config.manifest, "global", config.schemaFingerprint);
    if (!schemaBindingsReady(config.manifest, "global")) {
      throw new Error("Relay global schema bindings are not generated");
    }
    if (!Number.isSafeInteger(config.generation) || config.generation <= 0) {
      throw new Error("Relay global catalog generation must be a positive safe integer");
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
          .subscribe([...GLOBAL_CATALOG_QUERIES]);
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
      const entities = [
        ...Array.from(connection.db.itemDesc.iter(), (row) => normalizeCatalogEntity(row, "item")),
        ...Array.from(connection.db.cargoDesc.iter(), (row) => normalizeCatalogEntity(row, "cargo")),
      ];
      const descriptions = Object.fromEntries(DESCRIPTION_TABLES.map(({ accessor, kind }) => [
        kind,
        Array.from(
          connection.db[accessor].iter(),
          (row) => normalizeCatalogDescription(row, kind),
        ),
      ])) as GlobalCatalogSnapshot["descriptions"];
      const receivedAt = this.#now().toISOString();
      const generation = this.#nextGeneration;
      this.#nextGeneration += 1;
      this.#applyInFlight = true;
      const result = this.#onSnapshot({
        entities,
        descriptions,
        database: config.database,
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
    for (const table of this.#catalogTables(connection)) {
      table.onInsert?.(this.#tableChanged);
      table.onUpdate?.(this.#tableChanged);
      table.onDelete?.(this.#tableChanged);
    }
    this.#listenersAttached = true;
  }

  #removeTableListeners(): void {
    if (!this.#listenersAttached || !this.#connection) return;
    for (const table of this.#catalogTables(this.#connection)) {
      table.removeOnInsert?.(this.#tableChanged);
      table.removeOnUpdate?.(this.#tableChanged);
      table.removeOnDelete?.(this.#tableChanged);
    }
    this.#listenersAttached = false;
  }

  #catalogTables(connection: BindingConnection): CachedTable[] {
    return [
      connection.db.itemDesc,
      connection.db.cargoDesc,
      ...DESCRIPTION_TABLES.map(({ accessor }) => connection.db[accessor]),
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
