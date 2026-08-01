import {
  normalizeCatalogDescription,
  normalizeCatalogEntity,
  normalizeGlobalEmpireFoundries,
  normalizeGlobalRegions,
  type CatalogDescriptionKind,
} from "./normalizers.ts";
import {
  assertSchemaFingerprint,
  schemaBindingsReady,
} from "./schemaManifest.ts";
import { normalizeAndPairSiegeNotifications } from "./siegeNotifications.ts";
import { equalitySubscriptionQueries } from "./publicCraftRegionSession.ts";

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
  "SELECT * FROM empire_foundry_state",
  "SELECT * FROM region_population_info",
  "SELECT * FROM region_control_info",
  "SELECT * FROM world_region_name_state",
  "SELECT * FROM empire_notification_desc",
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
    empireFoundryState: CachedTable;
    regionPopulationInfo: CachedTable;
    regionControlInfo: CachedTable;
    worldRegionNameState: CachedTable;
    empireNotificationDesc: CachedTable;
    empireNotificationState: CachedTable;
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
  regions: ReturnType<typeof normalizeGlobalRegions>;
  foundries: ReturnType<typeof normalizeGlobalEmpireFoundries>["data"];
  foundryWarnings: string[];
  siegeNotifications: ReturnType<typeof normalizeAndPairSiegeNotifications>;
  notificationScopeEmpireIds: string[];
  changed: Array<"catalogs" | "region" | "empire-foundries" | "empire-notifications">;
  database: string;
  schemaFingerprint: string;
  generation: number;
  receivedAt: string;
};

type SnapshotGroup = GlobalCatalogSnapshot["changed"][number];

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

export function normalizeEmpireNotificationScope(empireIds: string[]): string[] {
  if (!Array.isArray(empireIds)) {
    throw new TypeError("Empire notification scope must be an array of decimal IDs");
  }
  const unique = new Set<string>();
  for (const value of empireIds) {
    if (typeof value !== "string" || !/^(?:0|[1-9]\d*)$/.test(value)) {
      throw new TypeError("Empire notification scope IDs must be canonical non-negative decimal integers");
    }
    unique.add(value);
  }
  return [...unique].sort((left, right) => (
    BigInt(left) < BigInt(right) ? -1 : BigInt(left) > BigInt(right) ? 1 : 0
  ));
}

function sameScope(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function notificationQueries(empireIds: readonly string[]): string[] {
  return equalitySubscriptionQueries(
    "empire_notification_state",
    "empire_entity_id",
    empireIds,
  );
}

function notificationRowEmpireId(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const raw = row.empireEntityId ?? row.empire_entity_id;
  if (typeof raw === "bigint" && raw >= 0n) return raw.toString();
  if (typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0) return String(raw);
  if (typeof raw === "string" && /^(?:0|[1-9]\d*)$/.test(raw)) return raw;
  return null;
}

export class RelayGlobalCatalogSession {
  readonly #loadBindings: () => Promise<GlobalBindingModule>;
  readonly #onSnapshot: SessionDependencies["onSnapshot"];
  readonly #now: () => Date;
  #connection: BindingConnection | null = null;
  #subscription: SubscriptionHandle | null = null;
  #notificationSubscription: SubscriptionHandle | null = null;
  #pendingNotificationSubscription: SubscriptionHandle | null = null;
  #config: SessionConfig | null = null;
  #nextGeneration = 0;
  #snapshotQueued = false;
  #applyInFlight = false;
  readonly #queuedGroups = new Set<SnapshotGroup>();
  readonly #pendingGroups = new Set<SnapshotGroup>();
  #queuedNotificationGeneration: number | null = null;
  #pendingNotificationGeneration: number | null = null;
  #listenersAttached = false;
  #staticApplied = false;
  #notificationListener: ((...args: unknown[]) => void) | null = null;
  #notificationScopeGeneration = 0;
  #notificationAppliedGeneration = 0;
  #notificationRequestedIds: string[] = [];
  #notificationAppliedIds: string[] = [];
  #pendingNotificationResolve: ((applied: boolean) => void) | null = null;
  #lifecycleGeneration = 0;
  #connectionGeneration = 0;
  readonly #catalogChanged = () => this.#queueSnapshot("catalogs");
  readonly #regionChanged = () => this.#queueSnapshot("region");
  readonly #foundryChanged = () => this.#queueSnapshot("empire-foundries");
  #health = {
    state: "stopped" as "stopped" | "connecting" | "connected" | "disconnected",
    connected: false,
    applied: false,
    lastAppliedAt: null as string | null,
    lastError: null as string | null,
    notifications: {
      applied: true,
      requestedEmpireIds: [] as string[],
      appliedEmpireIds: [] as string[],
      lastAppliedAt: null as string | null,
      lastError: null as string | null,
    },
  };

  constructor(dependencies: SessionDependencies) {
    this.#loadBindings = dependencies.loadBindings ?? loadBundledGlobalBindings;
    this.#onSnapshot = dependencies.onSnapshot;
    this.#now = dependencies.now ?? (() => new Date());
  }

  async start(config: SessionConfig): Promise<void> {
    if (this.#connection) throw new Error("Relay global catalog session is already started");
    const lifecycleGeneration = ++this.#lifecycleGeneration;
    assertSchemaFingerprint(config.manifest, "global", config.schemaFingerprint);
    if (!schemaBindingsReady(config.manifest, "global")) {
      throw new Error("Relay global schema bindings are not generated");
    }
    if (!Number.isSafeInteger(config.generation) || config.generation <= 0) {
      throw new Error("Relay global catalog generation must be a positive safe integer");
    }
    this.#config = config;
    this.#nextGeneration = config.generation;
    this.#health = {
      state: "connecting",
      connected: false,
      applied: false,
      lastAppliedAt: null,
      lastError: null,
      notifications: {
        applied: this.#notificationRequestedIds.length === 0,
        requestedEmpireIds: [...this.#notificationRequestedIds],
        appliedEmpireIds: [],
        lastAppliedAt: null,
        lastError: null,
      },
    };

    const bindings = await this.#loadBindings();
    if (lifecycleGeneration !== this.#lifecycleGeneration || this.#config !== config) {
      throw new Error("Relay global catalog session was stopped during startup");
    }
    this.#connection = bindings.DbConnection.builder()
      .withUri(config.uri)
      .withDatabaseName(config.database)
      .onConnect((connection) => {
        if (
          lifecycleGeneration !== this.#lifecycleGeneration
          || connection !== this.#connection
        ) return;
        const connectionGeneration = ++this.#connectionGeneration;
        this.#health.state = "connected";
        this.#health.connected = true;
        this.#health.lastError = null;
        this.#subscription = connection.subscriptionBuilder()
          .onApplied(() => {
            if (
              lifecycleGeneration !== this.#lifecycleGeneration
              || connectionGeneration !== this.#connectionGeneration
              || connection !== this.#connection
              || !this.#health.connected
            ) return;
            this.#staticApplied = true;
            this.#applySnapshot(
              connection,
              new Set(["catalogs", "region", "empire-foundries"]),
              undefined,
              lifecycleGeneration,
              connectionGeneration,
            );
            this.#attachTableListeners(connection);
            if (this.#notificationRequestedIds.length) {
              void this.#subscribeToNotificationScope(
                connection,
                this.#notificationRequestedIds,
                this.#notificationScopeGeneration,
                lifecycleGeneration,
                connectionGeneration,
              );
            }
          })
          .onError((_context, error) => {
            if (
              lifecycleGeneration === this.#lifecycleGeneration
              && connectionGeneration === this.#connectionGeneration
              && connection === this.#connection
            ) this.#recordError(error);
          })
          .subscribe([...GLOBAL_CATALOG_QUERIES]);
      })
      .onConnectError((_context, error) => {
        if (lifecycleGeneration !== this.#lifecycleGeneration) return;
        this.#health.state = "disconnected";
        this.#recordError(error);
      })
      .onDisconnect((_context, error) => {
        if (
          lifecycleGeneration !== this.#lifecycleGeneration
          || this.#connection == null
        ) return;
        this.#connectionGeneration += 1;
        this.#health.state = "disconnected";
        this.#health.connected = false;
        this.#staticApplied = false;
        this.#invalidatePendingNotificationAttempt();
        this.#removeNotificationListener();
        this.#health.notifications.applied = false;
        this.#snapshotQueued = false;
        this.#applyInFlight = false;
        this.#queuedGroups.clear();
        this.#pendingGroups.clear();
        this.#queuedNotificationGeneration = null;
        this.#pendingNotificationGeneration = null;
        if (error) this.#recordError(error);
      })
      .build();
  }

  async setEmpireNotificationScope(empireIds: string[]): Promise<boolean> {
    const normalized = normalizeEmpireNotificationScope(empireIds);
    const sameDesiredScope = sameScope(normalized, this.#notificationRequestedIds);
    if (
      sameDesiredScope
      && (
        sameScope(normalized, this.#notificationAppliedIds)
        || this.#pendingNotificationSubscription != null
        || !this.#connection
        || !this.#staticApplied
      )
    ) return false;

    this.#invalidatePendingNotificationAttempt();
    const scopeGeneration = ++this.#notificationScopeGeneration;
    this.#notificationRequestedIds = normalized;
    this.#health.notifications.requestedEmpireIds = [...normalized];
    this.#health.notifications.lastError = null;

    if (normalized.length === 0) {
      this.#removeNotificationListener();
      this.#notificationSubscription?.unsubscribe();
      this.#notificationSubscription = null;
      this.#notificationAppliedIds = [];
      this.#notificationAppliedGeneration = scopeGeneration;
      this.#health.notifications.applied = true;
      this.#health.notifications.appliedEmpireIds = [];
      this.#health.notifications.lastAppliedAt = this.#now().toISOString();
      if (this.#connection && this.#staticApplied) {
        this.#applySnapshot(
          this.#connection,
          new Set(["empire-notifications"]),
          scopeGeneration,
          this.#lifecycleGeneration,
          this.#connectionGeneration,
        );
      }
      return true;
    }

    this.#health.notifications.applied = this.#notificationSubscription != null;
    const connection = this.#connection;
    if (!connection || !this.#staticApplied) return true;
    return await this.#subscribeToNotificationScope(
      connection,
      normalized,
      scopeGeneration,
      this.#lifecycleGeneration,
      this.#connectionGeneration,
    );
  }

  #subscribeToNotificationScope(
    connection: BindingConnection,
    empireIds: string[],
    scopeGeneration: number,
    lifecycleGeneration: number,
    connectionGeneration: number,
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.#pendingNotificationResolve = resolve;
      let handle: SubscriptionHandle | null = null;
      const attemptIsCurrent = () => (
        scopeGeneration === this.#notificationScopeGeneration
        && lifecycleGeneration === this.#lifecycleGeneration
        && connectionGeneration === this.#connectionGeneration
        && connection === this.#connection
        && this.#health.connected
        && this.#staticApplied
      );
      const finish = (applied: boolean) => {
        if (this.#pendingNotificationResolve === resolve) {
          this.#pendingNotificationResolve = null;
        }
        resolve(applied);
      };
      const fail = (error: unknown) => {
        handle?.unsubscribe();
        if (attemptIsCurrent()) {
          this.#pendingNotificationSubscription = null;
          this.#health.notifications.applied = this.#notificationSubscription != null;
          this.#health.notifications.lastError = error instanceof Error
            ? error.message
            : String(error);
        }
        finish(false);
      };
      try {
        handle = connection.subscriptionBuilder()
          .onApplied(() => {
            if (!attemptIsCurrent()) {
              handle?.unsubscribe();
              finish(false);
              return;
            }
            const previous = this.#notificationSubscription;
            this.#removeNotificationListener();
            this.#notificationSubscription = handle;
            this.#pendingNotificationSubscription = null;
            this.#notificationAppliedIds = [...empireIds];
            this.#notificationAppliedGeneration = scopeGeneration;
            this.#health.notifications.applied = true;
            this.#health.notifications.appliedEmpireIds = [...empireIds];
            this.#health.notifications.lastAppliedAt = this.#now().toISOString();
            this.#health.notifications.lastError = null;
            previous?.unsubscribe();
            this.#attachNotificationListener(
              connection,
              scopeGeneration,
              lifecycleGeneration,
              connectionGeneration,
            );
            this.#applySnapshot(
              connection,
              new Set(["empire-notifications"]),
              scopeGeneration,
              lifecycleGeneration,
              connectionGeneration,
            );
            finish(true);
          })
          .onError((_context, error) => {
            if (!attemptIsCurrent()) {
              handle?.unsubscribe();
              finish(false);
              return;
            }
            fail(error);
          })
          .subscribe(notificationQueries(empireIds));
        this.#pendingNotificationSubscription = handle;
      } catch (error) {
        fail(error);
      }
    });
  }

  #invalidatePendingNotificationAttempt(): void {
    this.#pendingNotificationResolve?.(false);
    this.#pendingNotificationResolve = null;
    this.#pendingNotificationSubscription?.unsubscribe();
    this.#pendingNotificationSubscription = null;
    this.#notificationScopeGeneration += 1;
  }

  #applySnapshot(
    connection: BindingConnection,
    changed: Set<SnapshotGroup>,
    notificationGeneration?: number,
    lifecycleGeneration = this.#lifecycleGeneration,
    connectionGeneration = this.#connectionGeneration,
  ): void {
    const config = this.#config;
    if (
      !config
      || lifecycleGeneration !== this.#lifecycleGeneration
      || connectionGeneration !== this.#connectionGeneration
      || connection !== this.#connection
    ) return;
    if (
      changed.has("empire-notifications")
      && notificationGeneration !== this.#notificationAppliedGeneration
    ) {
      changed.delete("empire-notifications");
      if (!changed.size) return;
    }
    if (this.#applyInFlight) {
      for (const group of changed) this.#pendingGroups.add(group);
      if (changed.has("empire-notifications")) {
        this.#pendingNotificationGeneration = notificationGeneration ?? null;
      }
      return;
    }
    try {
      const entities = changed.has("catalogs")
        ? [
            ...Array.from(connection.db.itemDesc.iter(), (row) => normalizeCatalogEntity(row, "item")),
            ...Array.from(connection.db.cargoDesc.iter(), (row) => normalizeCatalogEntity(row, "cargo")),
          ]
        : [];
      const descriptions = changed.has("catalogs")
        ? Object.fromEntries(DESCRIPTION_TABLES.map(({ accessor, kind }) => [
            kind,
            Array.from(
              connection.db[accessor].iter(),
              (row) => normalizeCatalogDescription(row, kind),
            ),
          ])) as GlobalCatalogSnapshot["descriptions"]
        : {} as GlobalCatalogSnapshot["descriptions"];
      const regions = changed.has("region")
        ? normalizeGlobalRegions(
            [...connection.db.regionPopulationInfo.iter()],
            [...connection.db.regionControlInfo.iter()],
            [...connection.db.worldRegionNameState.iter()],
          )
        : [];
      const foundries = changed.has("empire-foundries")
        ? normalizeGlobalEmpireFoundries([...connection.db.empireFoundryState.iter()])
        : { data: [], warnings: [] };
      const notificationScope = new Set(this.#notificationAppliedIds);
      const siegeNotifications = changed.has("empire-notifications")
        ? normalizeAndPairSiegeNotifications(
            [...connection.db.empireNotificationDesc.iter()],
            [...connection.db.empireNotificationState.iter()].filter((row) => {
              const empireId = notificationRowEmpireId(row);
              return empireId != null && notificationScope.has(empireId);
            }),
          )
        : { notifications: [], outcomes: [], warnings: [] };
      const receivedAt = this.#now().toISOString();
      const generation = this.#nextGeneration;
      this.#nextGeneration += 1;
      this.#applyInFlight = true;
      const result = this.#onSnapshot({
        entities,
        descriptions,
        regions,
        foundries: foundries.data,
        foundryWarnings: foundries.warnings,
        siegeNotifications,
        notificationScopeEmpireIds: [...this.#notificationAppliedIds],
        changed: [...changed],
        database: config.database,
        schemaFingerprint: config.schemaFingerprint,
        generation,
        receivedAt,
      });
      Promise.resolve(result).then(() => {
        if (
          lifecycleGeneration !== this.#lifecycleGeneration
          || connectionGeneration !== this.#connectionGeneration
          || connection !== this.#connection
        ) return;
        if (changed.has("empire-notifications")) {
          this.#health.notifications.applied = true;
          this.#health.notifications.lastAppliedAt = receivedAt;
          this.#health.notifications.lastError = null;
        }
        if ([...changed].some((group) => group !== "empire-notifications")) {
          this.#health.applied = true;
          this.#health.lastAppliedAt = receivedAt;
          this.#health.lastError = null;
        }
      }).catch((error: unknown) => {
        if (
          lifecycleGeneration !== this.#lifecycleGeneration
          || connectionGeneration !== this.#connectionGeneration
          || connection !== this.#connection
        ) return;
        if (changed.has("empire-notifications")) {
          this.#recordNotificationError(error);
        }
        if ([...changed].some((group) => group !== "empire-notifications")) {
          this.#recordError(error);
        }
      })
        .finally(() => {
          if (
            lifecycleGeneration === this.#lifecycleGeneration
            && connectionGeneration === this.#connectionGeneration
            && connection === this.#connection
          ) this.#completeApply(connection, lifecycleGeneration, connectionGeneration);
        });
    } catch (error) {
      this.#applyInFlight = false;
      if (
        lifecycleGeneration === this.#lifecycleGeneration
        && connectionGeneration === this.#connectionGeneration
        && connection === this.#connection
      ) {
        if (changed.has("empire-notifications")) this.#recordNotificationError(error);
        if ([...changed].some((group) => group !== "empire-notifications")) {
          this.#recordError(error);
        }
        this.#completeApply(connection, lifecycleGeneration, connectionGeneration);
      }
    }
  }

  #completeApply(
    connection: BindingConnection,
    lifecycleGeneration: number,
    connectionGeneration: number,
  ): void {
    if (
      lifecycleGeneration !== this.#lifecycleGeneration
      || connectionGeneration !== this.#connectionGeneration
      || connection !== this.#connection
    ) return;
    this.#applyInFlight = false;
    if (!this.#pendingGroups.size) return;
    const changed = new Set(this.#pendingGroups);
    this.#pendingGroups.clear();
    const notificationGeneration = this.#pendingNotificationGeneration;
    this.#pendingNotificationGeneration = null;
    if (
      changed.has("empire-notifications")
      && notificationGeneration !== this.#notificationAppliedGeneration
    ) {
      changed.delete("empire-notifications");
    }
    if (!changed.size) return;
    queueMicrotask(() => {
      if (this.#connection === connection) {
        this.#applySnapshot(
          connection,
          changed,
          notificationGeneration ?? undefined,
          lifecycleGeneration,
          connectionGeneration,
        );
      }
    });
  }

  #attachTableListeners(connection: BindingConnection): void {
    if (this.#listenersAttached) return;
    for (const table of this.#catalogTables(connection)) {
      table.onInsert?.(this.#catalogChanged);
      table.onUpdate?.(this.#catalogChanged);
      table.onDelete?.(this.#catalogChanged);
    }
    for (const table of this.#regionTables(connection)) {
      table.onInsert?.(this.#regionChanged);
      table.onUpdate?.(this.#regionChanged);
      table.onDelete?.(this.#regionChanged);
    }
    connection.db.empireFoundryState.onInsert?.(this.#foundryChanged);
    connection.db.empireFoundryState.onUpdate?.(this.#foundryChanged);
    connection.db.empireFoundryState.onDelete?.(this.#foundryChanged);
    this.#listenersAttached = true;
  }

  #removeTableListeners(): void {
    if (!this.#listenersAttached || !this.#connection) return;
    for (const table of this.#catalogTables(this.#connection)) {
      table.removeOnInsert?.(this.#catalogChanged);
      table.removeOnUpdate?.(this.#catalogChanged);
      table.removeOnDelete?.(this.#catalogChanged);
    }
    for (const table of this.#regionTables(this.#connection)) {
      table.removeOnInsert?.(this.#regionChanged);
      table.removeOnUpdate?.(this.#regionChanged);
      table.removeOnDelete?.(this.#regionChanged);
    }
    this.#connection.db.empireFoundryState.removeOnInsert?.(this.#foundryChanged);
    this.#connection.db.empireFoundryState.removeOnUpdate?.(this.#foundryChanged);
    this.#connection.db.empireFoundryState.removeOnDelete?.(this.#foundryChanged);
    this.#listenersAttached = false;
  }

  #attachNotificationListener(
    connection: BindingConnection,
    scopeGeneration: number,
    lifecycleGeneration: number,
    connectionGeneration: number,
  ): void {
    const listener = () => {
      if (
        lifecycleGeneration !== this.#lifecycleGeneration
        || connectionGeneration !== this.#connectionGeneration
        || connection !== this.#connection
        || !this.#health.connected
        || scopeGeneration !== this.#notificationAppliedGeneration
      ) return;
      this.#queueSnapshot(
        "empire-notifications",
        scopeGeneration,
        connection,
        lifecycleGeneration,
        connectionGeneration,
      );
    };
    connection.db.empireNotificationState.onInsert?.(listener);
    connection.db.empireNotificationState.onUpdate?.(listener);
    connection.db.empireNotificationState.onDelete?.(listener);
    connection.db.empireNotificationDesc.onInsert?.(listener);
    connection.db.empireNotificationDesc.onUpdate?.(listener);
    connection.db.empireNotificationDesc.onDelete?.(listener);
    this.#notificationListener = listener;
  }

  #removeNotificationListener(): void {
    if (!this.#notificationListener || !this.#connection) return;
    this.#connection.db.empireNotificationState.removeOnInsert?.(this.#notificationListener);
    this.#connection.db.empireNotificationState.removeOnUpdate?.(this.#notificationListener);
    this.#connection.db.empireNotificationState.removeOnDelete?.(this.#notificationListener);
    this.#connection.db.empireNotificationDesc.removeOnInsert?.(this.#notificationListener);
    this.#connection.db.empireNotificationDesc.removeOnUpdate?.(this.#notificationListener);
    this.#connection.db.empireNotificationDesc.removeOnDelete?.(this.#notificationListener);
    this.#notificationListener = null;
  }

  #catalogTables(connection: BindingConnection): CachedTable[] {
    return [
      connection.db.itemDesc,
      connection.db.cargoDesc,
      ...DESCRIPTION_TABLES.map(({ accessor }) => connection.db[accessor]),
    ];
  }

  #regionTables(connection: BindingConnection): CachedTable[] {
    return [
      connection.db.regionPopulationInfo,
      connection.db.regionControlInfo,
      connection.db.worldRegionNameState,
    ];
  }

  #queueSnapshot(
    group: SnapshotGroup,
    notificationGeneration?: number,
    connection = this.#connection,
    lifecycleGeneration = this.#lifecycleGeneration,
    connectionGeneration = this.#connectionGeneration,
  ): void {
    if (
      !connection
      || connection !== this.#connection
      || lifecycleGeneration !== this.#lifecycleGeneration
      || connectionGeneration !== this.#connectionGeneration
    ) return;
    if (
      group === "empire-notifications"
      && notificationGeneration !== this.#notificationAppliedGeneration
    ) return;
    this.#queuedGroups.add(group);
    if (group === "empire-notifications") {
      this.#queuedNotificationGeneration = notificationGeneration ?? null;
    }
    if (this.#snapshotQueued) return;
    this.#snapshotQueued = true;
    queueMicrotask(() => {
      this.#snapshotQueued = false;
      const changed = new Set(this.#queuedGroups);
      this.#queuedGroups.clear();
      const queuedNotificationGeneration = this.#queuedNotificationGeneration;
      this.#queuedNotificationGeneration = null;
      if (
        connection === this.#connection
        && lifecycleGeneration === this.#lifecycleGeneration
        && connectionGeneration === this.#connectionGeneration
      ) {
        this.#applySnapshot(
          connection,
          changed,
          queuedNotificationGeneration ?? undefined,
          lifecycleGeneration,
          connectionGeneration,
        );
      }
    });
  }

  #recordError(error: unknown): void {
    this.#health.lastError = error instanceof Error ? error.message : String(error);
  }

  #recordNotificationError(error: unknown): void {
    this.#health.notifications.lastError = error instanceof Error ? error.message : String(error);
  }

  health() {
    return {
      ...this.#health,
      notifications: {
        ...this.#health.notifications,
        requestedEmpireIds: [...this.#health.notifications.requestedEmpireIds],
        appliedEmpireIds: [...this.#health.notifications.appliedEmpireIds],
      },
    };
  }

  async stop(): Promise<void> {
    this.#lifecycleGeneration += 1;
    this.#connectionGeneration += 1;
    this.#removeTableListeners();
    this.#removeNotificationListener();
    this.#invalidatePendingNotificationAttempt();
    this.#notificationSubscription?.unsubscribe();
    this.#notificationSubscription = null;
    this.#subscription?.unsubscribe();
    this.#subscription = null;
    this.#connection?.disconnect();
    this.#connection = null;
    this.#config = null;
    this.#nextGeneration = 0;
    this.#staticApplied = false;
    this.#snapshotQueued = false;
    this.#applyInFlight = false;
    this.#queuedGroups.clear();
    this.#pendingGroups.clear();
    this.#queuedNotificationGeneration = null;
    this.#pendingNotificationGeneration = null;
    this.#notificationAppliedIds = [];
    this.#notificationAppliedGeneration = 0;
    this.#health.state = "stopped";
    this.#health.connected = false;
    this.#health.notifications.applied = this.#notificationRequestedIds.length === 0;
    this.#health.notifications.appliedEmpireIds = [];
  }
}
