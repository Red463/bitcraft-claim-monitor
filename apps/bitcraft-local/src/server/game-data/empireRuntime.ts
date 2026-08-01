import type {
  DomainSnapshotBatch,
  StoredDomainSnapshot,
} from "./contracts.ts";
import {
  RelayEmpireRegionSession,
  type RegionalEmpireSnapshot,
} from "./empireRegionSession.ts";
import { relayWebSocketUri } from "./globalCatalogRuntime.ts";
import { AdaptiveRegionSessionPool } from "./regionSessionPool.ts";
import type { SiegeOutcome } from "./siegeNotifications.ts";
import { discoverRelayTopology, type RelayTopology } from "./topology.ts";

type BindingManifest = Parameters<RelayEmpireRegionSession["start"]>[0]["manifest"];
type CurrentStateRepository = {
  read?(claimId: string, domain: "empires"): StoredDomainSnapshot | null;
  nextGeneration(claimId: string): number;
  commitGeneration(batch: DomainSnapshotBatch): Promise<void> | void;
  markError?(claimId: string, domain: "empires", error: string, attemptedAt: string): Promise<void> | void;
  recordSubscriptionHealth?(health: {
    sourceKey: `region:${number}`;
    domain: "empires";
    generation: number;
    connected: boolean;
    applyDurationMs?: number | null;
    reconnects?: number;
    malformedRows?: number;
    lastError?: string | null;
  }, observedAt: string): Promise<void> | void;
};
type EmpireSession = {
  start(config: Parameters<RelayEmpireRegionSession["start"]>[0]): Promise<void>;
  health(): ReturnType<RelayEmpireRegionSession["health"]>;
  stop(): Promise<void>;
};
type EmpireSessionFactory = (
  options: ConstructorParameters<typeof RelayEmpireRegionSession>[0],
) => EmpireSession;
type PoolOptions = Omit<
  ConstructorParameters<typeof AdaptiveRegionSessionPool>[0],
  "createSession"
>;
type RuntimeConfig = {
  relayBaseUrl: string;
  claimId: string;
  primaryRegionId: string;
  activeRegionIds: string[];
};
type RuntimeDependencies = {
  manifest: BindingManifest;
  currentStateRepository: CurrentStateRepository;
  discoverTopology?: (baseUrl: string) => Promise<RelayTopology>;
  createSession?: EmpireSessionFactory;
  poolOptions?: PoolOptions;
  rotationMs?: number;
  applyTimeoutMs?: number;
  now?: () => number;
  scheduleRotation?: (callback: () => void, intervalMs: number) => () => void;
  onSnapshotCommitted?: (input: {
    claimId: string;
    currentData: EmpireCombinedData;
    observedAt: string;
  }) => Promise<void> | void;
  onNotificationScopeChanged?: (empireIds: string[]) => Promise<void> | void;
};
type EmpireRow = Record<string, unknown> & { entityId: string; regionId: string };
type MemberRow = Record<string, unknown> & {
  entityId: string;
  empireEntityId: string;
  regionId: string;
};
type SettlementRow = Record<string, unknown> & {
  buildingEntityId: string;
  empireEntityId: string;
  regionId: string;
};
type ClaimMemberRow = Record<string, unknown> & {
  entityId: string;
  claimEntityId: string;
  playerEntityId: string;
  regionId: string;
};
type NodeRow = Record<string, unknown> & {
  entityId: string;
  empireEntityId: string;
  regionId: string;
};
type FoundryRow = Record<string, unknown> & {
  entityId: string;
  empireEntityId: string;
  hexiteCapsules: string;
  queued: string;
  startedAt: string | null;
};
type HexiteInventoryRow = Record<string, unknown> & {
  entityId: string;
  empireEntityId: string;
  regionId: string;
  sourceType: "player" | "claim";
  energy: string;
  capsules: string;
  reserveBuilding: boolean;
};
type HexiteCoverageRow = Record<string, unknown> & {
  empireEntityId: string;
  regionId: string;
  playerCount: number;
  claimCount: number;
};
type HexiteRegionData = {
  inventories: HexiteInventoryRow[];
  coverage: HexiteCoverageRow[];
};
type HexiteCombinedData = HexiteRegionData & {
  availableRegionIds: string[];
  missingRegionIds: string[];
};
type RegionState = {
  empires: EmpireRow[];
  members: MemberRow[];
  settlements: SettlementRow[];
  claimMembers: ClaimMemberRow[];
  nodes: NodeRow[];
  hexite: HexiteRegionData | null;
  warnings: string[];
  database: string;
  schemaFingerprint: string;
  receivedAt: string;
  lastError: string | null;
};
export type EmpireCombinedData = {
  primaryRegionId: string;
  activeRegionIds: string[];
  empires: EmpireRow[];
  members: MemberRow[];
  settlements: SettlementRow[];
  claimMembers: ClaimMemberRow[];
  nodes: NodeRow[];
  foundries: FoundryRow[] | null;
  siegeOutcomes: SiegeOutcome[] | null;
  hexite: HexiteCombinedData | null;
  regions: Array<{
    regionId: string;
    empireCount: number;
    memberCount: number;
    settlementCount: number;
    claimMemberCount: number;
    nodeCount: number;
    database: string;
    schemaFingerprint: string;
    receivedAt: string;
    warnings: string[];
    lastError: string | null;
  }>;
};

function decimalInteger(value: unknown, label: string): string {
  const normalized = String(value ?? "").trim();
  if (!/^\d+$/.test(normalized)) throw new TypeError(`${label} must be a decimal integer`);
  return normalized;
}

function numericStringOrder(left: string, right: string): number {
  const leftValue = BigInt(left);
  const rightValue = BigInt(right);
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
}

function combineHexiteRegions(
  activeRegionIds: string[],
  regions: Map<string, RegionState>,
): HexiteCombinedData | null {
  const availableRegionIds = activeRegionIds.filter(
    (regionId) => regions.get(regionId)?.hexite != null,
  );
  if (!availableRegionIds.length) return null;
  const missingRegionIds = activeRegionIds.filter(
    (regionId) => regions.get(regionId)?.hexite == null,
  );
  const inventoryById = new Map<string, HexiteInventoryRow>();
  const coverageByKey = new Map<string, HexiteCoverageRow>();
  for (const regionId of availableRegionIds) {
    const hexite = regions.get(regionId)?.hexite;
    if (!hexite) continue;
    for (const inventory of hexite.inventories) {
      const previous = inventoryById.get(inventory.entityId);
      if (previous && JSON.stringify(previous) !== JSON.stringify(inventory)) {
        throw new Error(
          `Relay Empire Hexite inventory ${inventory.entityId} conflicts across regional sources`,
        );
      }
      inventoryById.set(inventory.entityId, inventory);
    }
    for (const coverage of hexite.coverage) {
      const key = `${coverage.regionId}:${coverage.empireEntityId}`;
      if (coverageByKey.has(key)) {
        throw new Error(`Relay Empire Hexite coverage ${key} is duplicated`);
      }
      coverageByKey.set(key, coverage);
    }
  }
  return {
    inventories: [...inventoryById.values()].sort((left, right) => (
      numericStringOrder(left.empireEntityId, right.empireEntityId)
      || numericStringOrder(left.entityId, right.entityId)
    )),
    coverage: [...coverageByKey.values()].sort((left, right) => (
      numericStringOrder(left.regionId, right.regionId)
      || numericStringOrder(left.empireEntityId, right.empireEntityId)
    )),
    availableRegionIds,
    missingRegionIds,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function scopedEntity(
  value: unknown,
  regionId: string,
  key: "entityId" | "buildingEntityId",
): (Record<string, unknown> & { regionId: string }) | null {
  const row = asRecord(value);
  const entityId = String(row[key] ?? "").trim();
  const empireEntityId = row.empireEntityId == null
    ? null
    : String(row.empireEntityId).trim();
  if (!/^\d+$/.test(entityId)) return null;
  if (empireEntityId != null && !/^\d+$/.test(empireEntityId)) return null;
  return { ...row, [key]: entityId, ...(empireEntityId == null ? {} : { empireEntityId }), regionId };
}

function sameDecimalIds(left: string[], right: string[]): boolean {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function normalizedNotificationScope(values: unknown[]): string[] {
  const normalized = values.map((value, index) => (
    decimalInteger(value, `Relay siege notification scope ${index}`)
  ));
  const unique = [...new Set(normalized)].sort(numericStringOrder);
  if (unique.length !== normalized.length) {
    throw new TypeError("Relay siege notification scope contains duplicate Empire ids");
  }
  return unique;
}

function notificationScopeFor(data: Pick<
  EmpireCombinedData,
  "settlements" | "nodes"
>): string[] {
  const empireIds = new Set<string>();
  for (const settlement of data.settlements) {
    empireIds.add(decimalInteger(
      settlement.empireEntityId,
      "Relay Empire notification settlement owner",
    ));
  }
  for (const node of data.nodes) {
    empireIds.add(decimalInteger(
      node.empireEntityId,
      "Relay Empire notification node owner",
    ));
    const sieges = Array.isArray(node.sieges) ? node.sieges : [];
    for (const [index, value] of sieges.entries()) {
      const siege = asRecord(value);
      empireIds.add(decimalInteger(
        siege.empireEntityId,
        `Relay Empire notification siege ${index} attacker`,
      ));
    }
  }
  return [...empireIds].sort(numericStringOrder);
}

function normalizeSiegeOutcomes(values: unknown[]): SiegeOutcome[] {
  const eventKeys = new Set<string>();
  const outcomes = values.map((value, index) => {
    const row = asRecord(value);
    const eventKey = typeof row.eventKey === "string" ? row.eventKey : "";
    if (!eventKey) throw new TypeError(`Relay siege outcome ${index} event key is invalid`);
    if (eventKeys.has(eventKey)) {
      throw new TypeError(`Relay siege outcome ${index} duplicates event key ${eventKey}`);
    }
    eventKeys.add(eventKey);
    const occurredAt = typeof row.occurredAt === "string" ? row.occurredAt : "";
    const occurredMs = Date.parse(occurredAt);
    if (!Number.isFinite(occurredMs) || new Date(occurredMs).toISOString() !== occurredAt) {
      throw new TypeError(`Relay siege outcome ${index} timestamp is invalid`);
    }
    if (typeof row.watchtowerLabel !== "string" || typeof row.encodedLocation !== "string") {
      throw new TypeError(`Relay siege outcome ${index} replacements are invalid`);
    }
    const outcome = row.outcome;
    if (outcome !== "attacker_won" && outcome !== "defender_won") {
      throw new TypeError(`Relay siege outcome ${index} result is invalid`);
    }
    return {
      eventKey,
      occurredAt,
      watchtowerLabel: row.watchtowerLabel,
      encodedLocation: row.encodedLocation,
      attackerEmpireEntityId: decimalInteger(
        row.attackerEmpireEntityId,
        `Relay siege outcome ${index} attacker Empire id`,
      ),
      defenderEmpireEntityId: decimalInteger(
        row.defenderEmpireEntityId,
        `Relay siege outcome ${index} defender Empire id`,
      ),
      outcome,
    } satisfies SiegeOutcome;
  });
  return outcomes.sort((left, right) => (
    Date.parse(right.occurredAt) - Date.parse(left.occurredAt)
    || left.eventKey.localeCompare(right.eventKey)
  )).slice(0, 50);
}

export class RelayEmpireRuntime {
  readonly #manifest: BindingManifest;
  readonly #currentStateRepository: CurrentStateRepository;
  readonly #discoverTopology: (baseUrl: string) => Promise<RelayTopology>;
  readonly #createSession: EmpireSessionFactory;
  readonly #poolOptions: PoolOptions;
  readonly #rotationMs: number;
  readonly #applyTimeoutMs: number;
  readonly #now: () => number;
  readonly #scheduleRotation: NonNullable<RuntimeDependencies["scheduleRotation"]>;
  readonly #onSnapshotCommitted: RuntimeDependencies["onSnapshotCommitted"];
  readonly #onNotificationScopeChanged: RuntimeDependencies["onNotificationScopeChanged"];
  readonly #regions = new Map<string, RegionState>();
  readonly #sourceErrors = new Map<string, string>();
  #globalFoundries: FoundryRow[] | null = null;
  #globalFoundryWarnings: string[] = [];
  #globalSiegeOutcomes: SiegeOutcome[] | null = null;
  #globalSiegeWarnings: string[] = [];
  #notificationScopeRequested: string[] = [];
  #notificationScopeApplied: string[] = [];
  #notificationScopeApplying = false;
  #notificationScopeLastError: string | null = null;
  readonly #activeSessionIds = new Map<string, number>();
  #pool: AdaptiveRegionSessionPool | null = null;
  #relayBaseUrl: string | null = null;
  #claimId: string | null = null;
  #primaryRegionId: string | null = null;
  #activeRegionIds: string[] = [];
  #nextSessionId = 0;
  #rotationCursor = 0;
  #commitTail: Promise<void> = Promise.resolve();
  #transitionTail: Promise<void> = Promise.resolve();
  #notificationScopeTail: Promise<void> = Promise.resolve();
  #warmPromise: Promise<void> | null = null;
  #cancelRotation: (() => void) | null = null;
  #lastError: string | null = null;
  #transitionLastError: string | null = null;
  #started = false;

  constructor(dependencies: RuntimeDependencies) {
    this.#manifest = dependencies.manifest;
    this.#currentStateRepository = dependencies.currentStateRepository;
    this.#discoverTopology = dependencies.discoverTopology ?? discoverRelayTopology;
    this.#createSession = dependencies.createSession
      ?? ((options) => new RelayEmpireRegionSession(options));
    this.#poolOptions = dependencies.poolOptions ?? {};
    this.#rotationMs = dependencies.rotationMs ?? 15_000;
    this.#applyTimeoutMs = dependencies.applyTimeoutMs ?? 30_000;
    if (!Number.isSafeInteger(this.#rotationMs) || this.#rotationMs < 1_000) {
      throw new TypeError("Relay Empire rotation interval must be at least 1000ms");
    }
    if (!Number.isSafeInteger(this.#applyTimeoutMs) || this.#applyTimeoutMs < 1_000) {
      throw new TypeError("Relay Empire apply timeout must be at least 1000ms");
    }
    this.#now = dependencies.now ?? Date.now;
    this.#scheduleRotation = dependencies.scheduleRotation ?? ((callback, intervalMs) => {
      const timer = setInterval(callback, intervalMs);
      timer.unref?.();
      return () => clearInterval(timer);
    });
    this.#onSnapshotCommitted = dependencies.onSnapshotCommitted;
    this.#onNotificationScopeChanged = dependencies.onNotificationScopeChanged;
  }

  #normalizeConfig(config: RuntimeConfig): RuntimeConfig {
    const primaryRegionId = decimalInteger(config.primaryRegionId, "Relay Empire primary region id");
    const activeRegionIds = [...new Set([
      primaryRegionId,
      ...config.activeRegionIds.map((regionId, index) => (
        decimalInteger(regionId, `Relay Empire active region ${index}`)
      )),
    ])].sort(numericStringOrder);
    return {
      relayBaseUrl: config.relayBaseUrl.replace(/\/+$/, ""),
      claimId: decimalInteger(config.claimId, "Relay Empire claim id"),
      primaryRegionId,
      activeRegionIds,
    };
  }

  async updateGlobalFoundries(snapshot: {
    foundries: unknown[];
    warnings: string[];
    database: string;
    schemaFingerprint: string;
    generation: number;
    receivedAt: string;
  }): Promise<void> {
    const foundries = snapshot.foundries.map((value, index) => {
      const row = asRecord(value);
      const entityId = decimalInteger(row.entityId, `Relay Empire Foundry ${index} entity id`);
      const empireEntityId = decimalInteger(
        row.empireEntityId,
        `Relay Empire Foundry ${index} Empire id`,
      );
      const hexiteCapsules = decimalInteger(
        row.hexiteCapsules,
        `Relay Empire Foundry ${index} completed Capsules`,
      );
      const queued = decimalInteger(row.queued, `Relay Empire Foundry ${index} queued Capsules`);
      const startedAt = row.startedAt == null ? null : String(row.startedAt).trim();
      if (startedAt !== null && !Number.isFinite(Date.parse(startedAt))) {
        throw new TypeError(`Relay Empire Foundry ${index} startedAt is invalid`);
      }
      return {
        ...row,
        entityId,
        empireEntityId,
        hexiteCapsules,
        queued,
        startedAt,
      } as FoundryRow;
    });
    const entityIds = new Set(foundries.map(({ entityId }) => entityId));
    if (entityIds.size !== foundries.length) {
      throw new TypeError("Relay Empire Foundry generation contains duplicate entity ids");
    }
    const committedFoundries = foundries.sort((left, right) => (
      numericStringOrder(left.empireEntityId, right.empireEntityId)
      || numericStringOrder(left.entityId, right.entityId)
    ));
    this.#globalFoundries = committedFoundries;
    const committedWarnings = snapshot.warnings.map(String);
    this.#globalFoundryWarnings = committedWarnings;
    if (!this.#started || !this.#claimId) return;
    const claimId = this.#claimId;
    const commit = this.#commitTail.then(async () => {
      if (!this.#started || this.#claimId !== claimId) return;
      const stored = this.#currentStateRepository.read?.(claimId, "empires");
      const storedData = asRecord(stored?.data);
      if (!stored || !Array.isArray(storedData.activeRegionIds)) return;
      const retainedWarnings = (stored.warnings ?? [])
        .filter((warning) => !String(warning).startsWith("Global Foundry:"));
      const warnings = [
        ...retainedWarnings,
        ...committedWarnings.map((warning) => `Global Foundry: ${warning}`),
      ];
      await this.#currentStateRepository.commitGeneration({
        claimId,
        generation: this.#currentStateRepository.nextGeneration(claimId),
        domains: {
          empires: {
            data: {
              ...storedData,
              foundries: [...committedFoundries],
            },
            confidence: warnings.length ? "partial" : stored.confidence,
            provenance: {
              provider: "relay",
              sourceKey: "global",
              regionId: null,
              database: snapshot.database,
              schemaFingerprint: snapshot.schemaFingerprint,
              sourceObservedAt: null,
              receivedAt: snapshot.receivedAt,
            },
            warnings,
          },
        },
      });
    });
    this.#commitTail = commit.catch(() => {});
    await commit;
  }

  async updateGlobalSiegeNotifications(snapshot: {
    siegeNotifications: {
      notifications: unknown[];
      outcomes: unknown[];
      warnings: string[];
    };
    notificationScopeEmpireIds: unknown[];
    database: string;
    schemaFingerprint: string;
    generation: number;
    receivedAt: string;
  }): Promise<boolean> {
    const appliedScope = normalizedNotificationScope(snapshot.notificationScopeEmpireIds);
    if (!sameDecimalIds(appliedScope, this.#notificationScopeRequested)) return false;
    const outcomes = normalizeSiegeOutcomes(snapshot.siegeNotifications.outcomes);
    const warnings = snapshot.siegeNotifications.warnings.map(String);
    this.#globalSiegeOutcomes = outcomes;
    this.#globalSiegeWarnings = warnings;
    this.#notificationScopeApplied = appliedScope;
    this.#notificationScopeApplying = false;
    this.#notificationScopeLastError = null;
    await this.#commitSiegeProjection({
      database: snapshot.database,
      schemaFingerprint: snapshot.schemaFingerprint,
      receivedAt: snapshot.receivedAt,
    });
    return true;
  }

  async start(config: RuntimeConfig): Promise<void> {
    if (this.#started || this.#pool) throw new Error("Relay Empire runtime is already started");
    const normalized = this.#normalizeConfig(config);
    this.#relayBaseUrl = normalized.relayBaseUrl;
    this.#claimId = normalized.claimId;
    this.#primaryRegionId = normalized.primaryRegionId;
    this.#activeRegionIds = normalized.activeRegionIds;
    this.#rotationCursor = 0;
    this.#sourceErrors.clear();
    this.#notificationScopeRequested = [];
    this.#notificationScopeApplied = [];
    this.#notificationScopeApplying = false;
    this.#notificationScopeLastError = null;
    const stored = this.#currentStateRepository.read?.(normalized.claimId, "empires") ?? null;
    this.#hydrateLastGood(stored);
    await this.#publishScopeFenceIfNeeded(stored);
    this.#pool = new AdaptiveRegionSessionPool({
      ...this.#poolOptions,
      createSession: (regionId) => this.#pooledSession(regionId),
    });
    try {
      await this.#pool.start({
        primaryRegionId: normalized.primaryRegionId,
        activeRegionIds: normalized.activeRegionIds,
      });
      this.#started = true;
      this.#lastError = null;
      this.#cancelRotation = this.#scheduleRotation(() => {
        void this.warmActiveRegions().catch((error) => this.#recordError(error));
      }, this.#rotationMs);
      void this.warmActiveRegions().catch((error) => this.#recordError(error));
    } catch (error) {
      this.#recordError(error);
      await this.#pool.stop();
      this.#pool = null;
      throw error;
    }
  }

  async reconcile(config: RuntimeConfig): Promise<boolean> {
    const normalized = this.#normalizeConfig(config);
    const unchanged = this.#started
      && this.#relayBaseUrl === normalized.relayBaseUrl
      && this.#claimId === normalized.claimId
      && this.#primaryRegionId === normalized.primaryRegionId
      && this.#activeRegionIds.length === normalized.activeRegionIds.length
      && this.#activeRegionIds.every((regionId, index) => regionId === normalized.activeRegionIds[index]);
    if (unchanged) return false;
    if (this.#pool || this.#started) await this.stop();
    await this.start(normalized);
    return true;
  }

  async warmActiveRegions(): Promise<void> {
    if (!this.#pool || !this.#started) throw new Error("Relay Empire runtime is not started");
    const previous = this.#warmPromise ?? Promise.resolve();
    const operation = previous.then(() => this.#rotateOneRegion());
    const tracked = operation.finally(() => {
      if (this.#warmPromise === tracked) this.#warmPromise = null;
    });
    this.#warmPromise = tracked;
    await tracked;
  }

  async #rotateOneRegion(): Promise<void> {
    const pool = this.#pool;
    const primaryRegionId = this.#primaryRegionId;
    if (!pool || !this.#started || !primaryRegionId) return;
    const candidates = this.#activeRegionIds.filter((regionId) => regionId !== primaryRegionId);
    if (!candidates.length) return;
    const poolHealth = pool.health();
    const openRegionIds = new Set(poolHealth.sessions.map((entry) => entry.regionId));
    let targetRegionId: string | null = null;
    for (let offset = 0; offset < candidates.length; offset += 1) {
      const index = (this.#rotationCursor + offset) % candidates.length;
      const regionId = candidates[index];
      if (openRegionIds.has(regionId)) continue;
      targetRegionId = regionId;
      this.#rotationCursor = (index + 1) % candidates.length;
      break;
    }
    if (!targetRegionId) return;
    if (poolHealth.sessions.length >= poolHealth.maxSessions) {
      const evictable = poolHealth.sessions
        .filter((entry) => !entry.pinned && entry.leases === 0)
        .sort((left, right) => (
          left.lastUsedAt - right.lastUsedAt
          || numericStringOrder(left.regionId, right.regionId)
        ))[0];
      if (!evictable) return;
      const sessionHealth = asRecord(evictable.health);
      const timedOut = this.#now() - evictable.openedAt >= this.#applyTimeoutMs;
      if (sessionHealth.applied !== true && !timedOut) return;
    }
    let lease: Awaited<ReturnType<AdaptiveRegionSessionPool["acquire"]>> | null = null;
    try {
      lease = await pool.acquire(targetRegionId);
      this.#lastError = null;
    } catch (error) {
      this.#recordError(error);
    } finally {
      await lease?.release();
    }
  }

  async #resolveSource(regionId: string): Promise<{
    uri: string;
    database: string;
    schemaFingerprint: string;
  }> {
    const relayBaseUrl = this.#relayBaseUrl;
    if (!relayBaseUrl) throw new Error("Relay Empire runtime has no base URL");
    const topology = await this.#discoverTopology(relayBaseUrl);
    const source = topology.regions.get(regionId);
    if (!source?.ready || !source.schemaFingerprint) {
      throw new Error(`Relay region ${regionId} source is not ready or has no schema fingerprint`);
    }
    return {
      uri: relayWebSocketUri(relayBaseUrl, source.port),
      database: source.database,
      schemaFingerprint: source.schemaFingerprint,
    };
  }

  #pooledSession(regionId: string) {
    let session: EmpireSession | null = null;
    let sessionId = 0;
    return {
      start: async () => {
        const source = await this.#resolveSource(regionId);
        sessionId = this.#nextSessionId + 1;
        this.#nextSessionId = sessionId;
        session = this.#createSession({
          onSnapshot: (snapshot) => {
            if (snapshot.regionId !== regionId || snapshot.data.regionId !== regionId) {
              throw new Error(
                `Relay Empire session ${regionId} emitted unconfigured region ${snapshot.regionId}`,
              );
            }
            return this.#enqueueSnapshot(snapshot, sessionId);
          },
          onFailure: (error) => this.#recordSourceError(regionId, error),
          refreshSource: () => this.#resolveSource(regionId),
        });
        this.#activeSessionIds.set(regionId, sessionId);
        try {
          await session.start({
            uri: source.uri,
            database: source.database,
            schemaFingerprint: source.schemaFingerprint,
            manifest: this.#manifest,
            generation: 1,
            regionId,
            includeIdentities: regionId === this.#primaryRegionId,
            includeHexiteInventories: true,
          });
        } catch (error) {
          if (this.#activeSessionIds.get(regionId) === sessionId) {
            this.#activeSessionIds.delete(regionId);
          }
          throw error;
        }
      },
      stop: async () => {
        if (this.#activeSessionIds.get(regionId) === sessionId) {
          this.#activeSessionIds.delete(regionId);
        }
        await session?.stop();
      },
      health: () => session?.health() ?? {
        connected: false,
        applied: false,
        stage: "idle",
        lastAppliedAt: null,
        lastApplyDurationMs: null,
        rowCount: 0,
        lastError: null,
      },
    };
  }

  #enqueueSnapshot(snapshot: RegionalEmpireSnapshot, sessionId: number): Promise<void> {
    const commit = this.#commitTail.then(async () => {
      if (this.#activeSessionIds.get(snapshot.regionId) !== sessionId) return;
      await this.#commitSnapshot(snapshot);
    });
    this.#commitTail = commit.catch(() => {});
    return commit;
  }

  #normalizeRegion(snapshot: RegionalEmpireSnapshot): RegionState {
    if (snapshot.data.regionId !== snapshot.regionId) {
      throw new Error(`Relay Empire snapshot region ${snapshot.data.regionId} does not match source ${snapshot.regionId}`);
    }
    const empires = snapshot.data.empires
      .map((value) => scopedEntity(value, snapshot.regionId, "entityId"))
      .filter((value): value is EmpireRow => value != null);
    const members = snapshot.data.members
      .map((value) => scopedEntity(value, snapshot.regionId, "entityId"))
      .filter((value): value is MemberRow => value != null);
    const settlements = snapshot.data.settlements
      .map((value) => scopedEntity(value, snapshot.regionId, "buildingEntityId"))
      .filter((value): value is SettlementRow => value != null);
    const claimMembers = snapshot.data.claimMembers
      .map((value) => scopedEntity(value, snapshot.regionId, "entityId"))
      .filter((value): value is ClaimMemberRow => value != null);
    const nodes = snapshot.data.nodes
      .map((value) => scopedEntity(value, snapshot.regionId, "entityId"))
      .filter((value): value is NodeRow => value != null);
    const rawHexite = snapshot.data.hexite;
    const hexite = rawHexite == null ? null : {
      inventories: rawHexite.inventories.map((value, index) => {
        const row = asRecord(value);
        const regionId = decimalInteger(
          row.regionId,
          `Relay Empire Hexite inventory ${index} region id`,
        );
        if (regionId !== snapshot.regionId) {
          throw new Error(
            `Relay Empire Hexite inventory ${index} escaped region ${snapshot.regionId}`,
          );
        }
        const sourceType = String(row.sourceType);
        if (sourceType !== "player" && sourceType !== "claim") {
          throw new TypeError(`Relay Empire Hexite inventory ${index} source type is invalid`);
        }
        return {
          ...row,
          entityId: decimalInteger(
            row.entityId,
            `Relay Empire Hexite inventory ${index} entity id`,
          ),
          empireEntityId: decimalInteger(
            row.empireEntityId,
            `Relay Empire Hexite inventory ${index} Empire id`,
          ),
          regionId,
          sourceType,
          energy: decimalInteger(
            row.energy,
            `Relay Empire Hexite inventory ${index} energy`,
          ),
          capsules: decimalInteger(
            row.capsules,
            `Relay Empire Hexite inventory ${index} Capsules`,
          ),
          reserveBuilding: row.reserveBuilding === true,
        } as HexiteInventoryRow;
      }),
      coverage: rawHexite.coverage.map((value, index) => {
        const row = asRecord(value);
        const regionId = decimalInteger(
          row.regionId,
          `Relay Empire Hexite coverage ${index} region id`,
        );
        if (regionId !== snapshot.regionId) {
          throw new Error(
            `Relay Empire Hexite coverage ${index} escaped region ${snapshot.regionId}`,
          );
        }
        const playerCount = Number(row.playerCount);
        const claimCount = Number(row.claimCount);
        if (
          !Number.isSafeInteger(playerCount)
          || playerCount < 0
          || !Number.isSafeInteger(claimCount)
          || claimCount < 0
        ) {
          throw new TypeError(`Relay Empire Hexite coverage ${index} counts are invalid`);
        }
        return {
          ...row,
          empireEntityId: decimalInteger(
            row.empireEntityId,
            `Relay Empire Hexite coverage ${index} Empire id`,
          ),
          regionId,
          playerCount,
          claimCount,
        } as HexiteCoverageRow;
      }),
    };
    if (
      empires.length !== snapshot.data.empires.length
      || members.length !== snapshot.data.members.length
      || settlements.length !== snapshot.data.settlements.length
      || claimMembers.length !== snapshot.data.claimMembers.length
      || nodes.length !== snapshot.data.nodes.length
    ) {
      throw new Error(`Relay Empire region ${snapshot.regionId} contains malformed normalized identities`);
    }
    return {
      empires,
      members,
      settlements,
      claimMembers,
      nodes,
      hexite,
      warnings: [...snapshot.warnings],
      database: snapshot.database,
      schemaFingerprint: snapshot.schemaFingerprint,
      receivedAt: snapshot.receivedAt,
      lastError: null,
    };
  }

  async #commitSnapshot(snapshot: RegionalEmpireSnapshot): Promise<void> {
    const claimId = this.#claimId;
    if (!claimId) throw new Error("Relay Empire runtime has no configured claim");
    if (!this.#activeRegionIds.includes(snapshot.regionId)) {
      throw new Error(`Relay Empire snapshot leaked unconfigured region ${snapshot.regionId}`);
    }
    const nextRegion = this.#normalizeRegion(snapshot);
    const previousRegion = this.#regions.get(snapshot.regionId);
    if (nextRegion.hexite == null && previousRegion?.hexite != null) {
      nextRegion.hexite = previousRegion.hexite;
      nextRegion.warnings.push(
        "Relay Empire Hexite inventory generation is still applying; retained last-good values.",
      );
    }
    const nextRegions = new Map(this.#regions);
    nextRegions.set(snapshot.regionId, nextRegion);
    const nextSourceErrors = new Map(this.#sourceErrors);
    nextSourceErrors.delete(snapshot.regionId);
    const missingRegions = this.#activeRegionIds.filter((regionId) => !nextRegions.has(regionId));
    const warnings = [
      ...missingRegions.map((regionId) => `Relay empires have not loaded region ${regionId} yet.`),
      ...this.#activeRegionIds.flatMap((regionId) => {
        const error = nextSourceErrors.get(regionId);
        return error ? [`Region ${regionId}: ${error}`] : [];
      }),
      ...this.#activeRegionIds.flatMap((regionId) => (
        (nextRegions.get(regionId)?.warnings ?? []).map((warning) => `Region ${regionId}: ${warning}`)
      )),
      ...this.#globalFoundryWarnings.map((warning) => `Global Foundry: ${warning}`),
      ...this.#siegeWarnings(),
    ];
    const sortEntities = <T extends { regionId: string }>(
      values: T[],
      entityId: (row: T) => string,
    ): T[] => values.sort((left, right) => (
      numericStringOrder(String(left.regionId), String(right.regionId))
      || numericStringOrder(entityId(left), entityId(right))
    ));
    const identityRegion = nextRegions.get(this.#primaryRegionId ?? "") ?? nextRegion;
    const empires = [...identityRegion.empires];
    const members = [...identityRegion.members];
    const settlements = this.#activeRegionIds.flatMap((regionId) => (
      nextRegions.get(regionId)?.settlements ?? []
    ));
    const claimMembers = this.#activeRegionIds.flatMap((regionId) => (
      nextRegions.get(regionId)?.claimMembers ?? []
    ));
    const nodes = this.#activeRegionIds.flatMap((regionId) => (
      nextRegions.get(regionId)?.nodes ?? []
    ));
    const currentData: EmpireCombinedData = {
      primaryRegionId: this.#primaryRegionId ?? snapshot.regionId,
      activeRegionIds: [...this.#activeRegionIds],
      empires: sortEntities(empires, (row) => row.entityId),
      members: sortEntities(members, (row) => row.entityId),
      settlements: sortEntities(settlements, (row) => row.buildingEntityId),
      claimMembers: sortEntities(claimMembers, (row) => row.entityId),
      nodes: sortEntities(nodes, (row) => row.entityId),
      foundries: this.#globalFoundries == null ? null : [...this.#globalFoundries],
      siegeOutcomes: this.#globalSiegeOutcomes == null ? null : [...this.#globalSiegeOutcomes],
      hexite: combineHexiteRegions(this.#activeRegionIds, nextRegions),
      regions: this.#activeRegionIds.flatMap((regionId) => {
        const region = nextRegions.get(regionId);
        if (!region) return [];
        const localEmpireIds = new Set(region.settlements.map((row) => row.empireEntityId));
        return [{
          regionId,
          empireCount: localEmpireIds.size,
          memberCount: members.filter((row) => localEmpireIds.has(row.empireEntityId)).length,
          settlementCount: region.settlements.length,
          claimMemberCount: region.claimMembers.length,
          nodeCount: region.nodes.length,
          database: region.database,
          schemaFingerprint: region.schemaFingerprint,
          receivedAt: region.receivedAt,
          warnings: region.warnings,
          lastError: nextSourceErrors.get(regionId) ?? region.lastError,
        }];
      }),
    };
    await this.#currentStateRepository.commitGeneration({
      claimId,
      generation: this.#currentStateRepository.nextGeneration(claimId),
      domains: {
        empires: {
          data: currentData,
          confidence: warnings.length ? "partial" : "authoritative",
          provenance: {
            provider: "relay",
            sourceKey: `region:${snapshot.regionId}` as `region:${number}`,
            regionId: snapshot.regionId,
            database: snapshot.database,
            schemaFingerprint: snapshot.schemaFingerprint,
            sourceObservedAt: null,
            receivedAt: snapshot.receivedAt,
          },
          warnings,
        },
      },
    });
    this.#regions.clear();
    for (const [regionId, region] of nextRegions) this.#regions.set(regionId, region);
    this.#sourceErrors.clear();
    for (const [regionId, error] of nextSourceErrors) this.#sourceErrors.set(regionId, error);
    this.#lastError = this.#sourceErrors.values().next().value ?? null;
    if (snapshot.regionId === this.#primaryRegionId) {
      this.#enqueueTransition({ claimId, currentData, observedAt: snapshot.receivedAt });
    }
    this.#enqueueNotificationScope(notificationScopeFor(currentData));
    await this.#persistHealth(snapshot.regionId, snapshot.generation, null);
  }

  async #publishScopeFenceIfNeeded(stored: StoredDomainSnapshot | null): Promise<void> {
    const claimId = this.#claimId;
    const primaryRegionId = this.#primaryRegionId;
    if (!stored || !claimId || !primaryRegionId) return;
    const storedData = asRecord(stored.data);
    const storedPrimaryRegionId = String(storedData.primaryRegionId ?? "").trim();
    const storedActiveRegionIds = (Array.isArray(storedData.activeRegionIds)
      ? storedData.activeRegionIds
      : [])
      .map(String)
      .sort(numericStringOrder);
    const scopeUnchanged = storedPrimaryRegionId === primaryRegionId
      && storedActiveRegionIds.length === this.#activeRegionIds.length
      && storedActiveRegionIds.every(
        (regionId, index) => regionId === this.#activeRegionIds[index],
      );
    if (scopeUnchanged) return;
    const identityRegion = storedPrimaryRegionId === primaryRegionId
      ? this.#regions.get(primaryRegionId)
      : null;
    const settlements = this.#activeRegionIds.flatMap(
      (regionId) => this.#regions.get(regionId)?.settlements ?? [],
    );
    const claimMembers = this.#activeRegionIds.flatMap(
      (regionId) => this.#regions.get(regionId)?.claimMembers ?? [],
    );
    const nodes = this.#activeRegionIds.flatMap(
      (regionId) => this.#regions.get(regionId)?.nodes ?? [],
    );
    const currentData: EmpireCombinedData = {
      primaryRegionId,
      activeRegionIds: [...this.#activeRegionIds],
      empires: [...(identityRegion?.empires ?? [])],
      members: [...(identityRegion?.members ?? [])],
      settlements,
      claimMembers,
      nodes,
      foundries: this.#globalFoundries == null ? null : [...this.#globalFoundries],
      siegeOutcomes: this.#globalSiegeOutcomes == null ? null : [...this.#globalSiegeOutcomes],
      hexite: combineHexiteRegions(this.#activeRegionIds, this.#regions),
      regions: this.#activeRegionIds.flatMap((regionId) => {
        const region = this.#regions.get(regionId);
        if (!region) return [];
        const localEmpireIds = new Set(region.settlements.map((row) => row.empireEntityId));
        const identityMembers = identityRegion?.members ?? [];
        return [{
          regionId,
          empireCount: localEmpireIds.size,
          memberCount: identityMembers.filter(
            (row) => localEmpireIds.has(row.empireEntityId),
          ).length,
          settlementCount: region.settlements.length,
          claimMemberCount: region.claimMembers.length,
          nodeCount: region.nodes.length,
          database: region.database,
          schemaFingerprint: region.schemaFingerprint,
          receivedAt: region.receivedAt,
          warnings: region.warnings,
          lastError: region.lastError,
        }];
      }),
    };
    const receivedAt = new Date(this.#now()).toISOString();
    await this.#currentStateRepository.commitGeneration({
      claimId,
      generation: this.#currentStateRepository.nextGeneration(claimId),
      domains: {
        empires: {
          data: currentData,
          confidence: "partial",
          provenance: {
            provider: "relay",
            sourceKey: `region:${primaryRegionId}` as `region:${number}`,
            regionId: primaryRegionId,
            database: identityRegion?.database ?? null,
            schemaFingerprint: identityRegion?.schemaFingerprint ?? null,
            sourceObservedAt: null,
            receivedAt,
          },
          warnings: [
            "Relay Empire configured scope changed; retained rows were pruned before reconnecting.",
          ],
        },
      },
    });
  }

  #enqueueTransition(input: {
    claimId: string;
    currentData: EmpireCombinedData;
    observedAt: string;
  }): void {
    if (!this.#onSnapshotCommitted) return;
    const transition = this.#transitionTail.then(async () => {
      await this.#onSnapshotCommitted?.(input);
      this.#transitionLastError = null;
    });
    this.#transitionTail = transition.catch((error) => {
      this.#transitionLastError = error instanceof Error ? error.message : String(error);
    });
  }

  #siegeWarnings(): string[] {
    return [
      ...(this.#notificationScopeApplying
        ? ["Global Siege: notification scope is updating; retained last-good outcomes."]
        : []),
      ...(this.#notificationScopeLastError
        ? [`Global Siege: ${this.#notificationScopeLastError}`]
        : []),
      ...this.#globalSiegeWarnings.map((warning) => `Global Siege: ${warning}`),
    ];
  }

  #enqueueNotificationScope(empireIds: string[]): void {
    if (!this.#onNotificationScopeChanged) return;
    if (
      sameDecimalIds(empireIds, this.#notificationScopeRequested)
      && (this.#notificationScopeApplying || this.#notificationScopeLastError == null)
    ) return;
    this.#notificationScopeRequested = [...empireIds];
    this.#notificationScopeApplying = true;
    const requested = [...empireIds];
    const scopeUpdate = this.#notificationScopeTail.then(async () => {
      const replacement = Promise.resolve().then(async () => {
        try {
          await this.#onNotificationScopeChanged?.(requested);
          return null;
        } catch (error) {
          return error;
        }
      });
      await this.#commitSiegeProjection();
      const error = await replacement;
      if (error == null) {
        if (!sameDecimalIds(requested, this.#notificationScopeRequested)) return;
      } else {
        if (!sameDecimalIds(requested, this.#notificationScopeRequested)) return;
        this.#notificationScopeApplying = false;
        this.#notificationScopeLastError = error instanceof Error ? error.message : String(error);
      }
      await this.#commitSiegeProjection();
    });
    this.#notificationScopeTail = scopeUpdate.catch(() => {});
  }

  async #commitSiegeProjection(metadata?: {
    database: string;
    schemaFingerprint: string;
    receivedAt: string;
  }): Promise<void> {
    if (!this.#started || !this.#claimId) return;
    const claimId = this.#claimId;
    const commit = this.#commitTail.then(async () => {
      if (!this.#started || this.#claimId !== claimId) return;
      const stored = this.#currentStateRepository.read?.(claimId, "empires");
      if (!stored) return;
      const storedData = asRecord(stored.data);
      const warnings = [
        ...(stored.warnings ?? []).filter(
          (warning) => !String(warning).startsWith("Global Siege:"),
        ),
        ...this.#siegeWarnings(),
      ];
      await this.#currentStateRepository.commitGeneration({
        claimId,
        generation: this.#currentStateRepository.nextGeneration(claimId),
        domains: {
          empires: {
            data: {
              ...storedData,
              siegeOutcomes: this.#globalSiegeOutcomes == null
                ? null
                : [...this.#globalSiegeOutcomes],
            },
            confidence: warnings.length ? "partial" : "authoritative",
            provenance: metadata ? {
              provider: "relay",
              sourceKey: "global",
              regionId: null,
              database: metadata.database,
              schemaFingerprint: metadata.schemaFingerprint,
              sourceObservedAt: null,
              receivedAt: metadata.receivedAt,
            } : stored.provenance,
            warnings,
          },
        },
      });
    });
    this.#commitTail = commit.catch(() => {});
    await commit;
  }

  #hydrateLastGood(stored?: StoredDomainSnapshot | null): void {
    this.#regions.clear();
    const claimId = this.#claimId;
    if (!claimId || !this.#currentStateRepository.read) return;
    stored ??= this.#currentStateRepository.read(claimId, "empires");
    const data = asRecord(stored?.data);
    try {
      this.#globalSiegeOutcomes = Array.isArray(data.siegeOutcomes)
        ? normalizeSiegeOutcomes(data.siegeOutcomes)
        : null;
    } catch {
      this.#globalSiegeOutcomes = null;
      this.#globalSiegeWarnings = ["Stored last-good siege outcomes were malformed and rejected."];
    }
    const metadata = Array.isArray(data.regions) ? data.regions : [];
    const storedHexite = asRecord(data.hexite);
    const storedHexiteRegionIds = new Set(
      Array.isArray(storedHexite.availableRegionIds)
        ? storedHexite.availableRegionIds.map(String)
        : [],
    );
    for (const value of metadata) {
      const row = asRecord(value);
      const regionId = String(row.regionId ?? "").trim();
      if (!this.#activeRegionIds.includes(regionId)) continue;
      const select = (
        key: "empires" | "members" | "settlements" | "claimMembers" | "nodes",
        idKey: "entityId" | "buildingEntityId",
      ) => (
        (Array.isArray(data[key]) ? data[key] : [])
          .filter((entry) => String(asRecord(entry).regionId ?? "") === regionId)
          .map((entry) => scopedEntity(entry, regionId, idKey))
          .filter((entry): entry is Record<string, unknown> & { regionId: string } => entry != null)
      );
      const lastError = row.lastError == null ? null : String(row.lastError);
      if (lastError) this.#sourceErrors.set(regionId, lastError);
      const hexite = storedHexiteRegionIds.has(regionId) ? {
        inventories: (Array.isArray(storedHexite.inventories)
          ? storedHexite.inventories
          : [])
          .filter((entry) => String(asRecord(entry).regionId ?? "") === regionId)
          .map((entry) => asRecord(entry) as HexiteInventoryRow),
        coverage: (Array.isArray(storedHexite.coverage)
          ? storedHexite.coverage
          : [])
          .filter((entry) => String(asRecord(entry).regionId ?? "") === regionId)
          .map((entry) => asRecord(entry) as HexiteCoverageRow),
      } : null;
      this.#regions.set(regionId, {
        empires: select("empires", "entityId") as EmpireRow[],
        members: select("members", "entityId") as MemberRow[],
        settlements: select("settlements", "buildingEntityId") as SettlementRow[],
        claimMembers: select("claimMembers", "entityId") as ClaimMemberRow[],
        nodes: select("nodes", "entityId") as NodeRow[],
        hexite,
        warnings: Array.isArray(row.warnings) ? row.warnings.map(String) : [],
        database: String(row.database ?? ""),
        schemaFingerprint: String(row.schemaFingerprint ?? ""),
        receivedAt: String(row.receivedAt ?? stored?.provenance.receivedAt ?? ""),
        lastError,
      });
    }
  }

  #recordError(error: unknown): void {
    this.#lastError = error instanceof Error ? error.message : String(error);
  }

  #recordSourceError(regionId: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    const persistedMessage = `Region ${regionId}: ${message}`;
    this.#lastError = message;
    this.#sourceErrors.set(regionId, message);
    const claimId = this.#claimId;
    const observedAt = new Date(this.#now()).toISOString();
    if (claimId) {
      void Promise.resolve(
        this.#currentStateRepository.markError?.(claimId, "empires", persistedMessage, observedAt),
      ).catch(() => {});
    }
    void this.#persistHealth(regionId, 0, message, observedAt);
  }

  async #persistHealth(
    regionId: string,
    generation: number,
    lastError: string | null,
    observedAt = new Date(this.#now()).toISOString(),
  ): Promise<void> {
    const sessionHealth = this.#pool?.health().sessions
      .find((entry) => entry.regionId === regionId)?.health;
    const health = asRecord(sessionHealth);
    await this.#currentStateRepository.recordSubscriptionHealth?.({
      sourceKey: `region:${regionId}` as `region:${number}`,
      domain: "empires",
      generation,
      connected: health.connected === true && !lastError,
      applyDurationMs: typeof health.lastApplyDurationMs === "number"
        ? health.lastApplyDurationMs
        : null,
      reconnects: typeof health.reconnects === "number"
        ? Math.max(0, Math.trunc(health.reconnects))
        : 0,
      malformedRows: 0,
      lastError,
    }, observedAt);
  }

  health() {
    return {
      running: this.#started,
      primaryRegionId: this.#primaryRegionId,
      activeRegionIds: [...this.#activeRegionIds],
      loadedRegionIds: [...this.#regions.keys()].sort(numericStringOrder),
      lastError: this.#lastError,
      transition: { lastError: this.#transitionLastError },
      notifications: {
        requestedEmpireIds: [...this.#notificationScopeRequested],
        appliedEmpireIds: [...this.#notificationScopeApplied],
        applying: this.#notificationScopeApplying,
        lastError: this.#notificationScopeLastError,
        outcomeCount: this.#globalSiegeOutcomes?.length ?? 0,
      },
      sourceErrors: Object.fromEntries(this.#sourceErrors),
      pool: this.#pool?.health() ?? null,
    };
  }

  async stop(): Promise<void> {
    this.#started = false;
    this.#cancelRotation?.();
    this.#cancelRotation = null;
    await this.#warmPromise?.catch(() => {});
    this.#warmPromise = null;
    await this.#pool?.stop();
    this.#pool = null;
    this.#activeSessionIds.clear();
    await this.#commitTail;
    await this.#transitionTail;
    await this.#notificationScopeTail;
    if (this.#onNotificationScopeChanged && this.#notificationScopeRequested.length) {
      await Promise.resolve(this.#onNotificationScopeChanged([])).catch(() => {});
    }
    this.#relayBaseUrl = null;
    this.#claimId = null;
    this.#primaryRegionId = null;
    this.#activeRegionIds = [];
    this.#rotationCursor = 0;
    this.#regions.clear();
    this.#sourceErrors.clear();
    this.#globalSiegeOutcomes = null;
    this.#globalSiegeWarnings = [];
    this.#notificationScopeRequested = [];
    this.#notificationScopeApplied = [];
    this.#notificationScopeApplying = false;
    this.#notificationScopeLastError = null;
  }
}
