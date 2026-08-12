import { relayWebSocketUri } from "./globalCatalogRuntime.ts";
import { RelayMapSpatialSession, type MapSpatialSnapshot } from "./mapSpatialSession.ts";
import { discoverRelayTopology, type RelayTopology } from "./topology.ts";

type Scope = { claimId: string; regionId: string; playerIds: string[]; resourceIds: string[]; enemyTypes: string[] };
type Session = { start(config: Parameters<RelayMapSpatialSession["start"]>[0]): Promise<void>; health(): unknown; stop(): Promise<void> };
type SnapshotWaiter = { timer: unknown; resolve(snapshot: MapSpatialSnapshot | null): void };
type Entry = { key: string; relayBaseUrl: string; scope: Scope; session: Session | null; leases: number; snapshot: MapSpatialSnapshot | null; snapshotWaiters: Set<SnapshotWaiter>; closeTimer: unknown; restartTimer: unknown; restartAttempts: number; openedAt: number };
type Dependencies = {
  manifest: Parameters<RelayMapSpatialSession["start"]>[0]["manifest"];
  discoverTopology?: (baseUrl: string) => Promise<RelayTopology>;
  createSession?: (options: ConstructorParameters<typeof RelayMapSpatialSession>[0]) => Session;
  onGeneration?: (snapshot: MapSpatialSnapshot, scope: Scope) => void;
  idleCloseMs?: number;
  maxSessions?: number;
  now?: () => number;
  setTimer?: (callback: () => void, delayMs: number) => unknown;
  clearTimer?: (timer: unknown) => void;
  reconnectDelayMs?: (attempt: number) => number;
};

function decimal(value: unknown, label: string): string {
  const result = String(value ?? "").trim();
  if (!/^\d+$/.test(result)) throw new TypeError(`${label} must be a decimal integer`);
  return result;
}

function sorted(values: string[]): string[] {
  return [...new Set(values.map((value) => decimal(value, "Map spatial scope id")))].sort((left, right) => left.length - right.length || left.localeCompare(right));
}

function normalizedScope(scope: Scope): Scope {
  return { claimId: decimal(scope.claimId, "Map spatial claim id"), regionId: decimal(scope.regionId, "Map spatial region id"), playerIds: sorted(scope.playerIds), resourceIds: sorted(scope.resourceIds), enemyTypes: sorted(scope.enemyTypes) };
}

export function mapSpatialScopeKey(rawScope: Scope): string {
  const scope = normalizedScope(rawScope);
  return `${scope.claimId}|${scope.regionId}|p:${scope.playerIds.join(",")}|r:${scope.resourceIds.join(",")}|e:${scope.enemyTypes.join(",")}`;
}

export class RelayMapSpatialScopeManager {
  readonly #manifest: Dependencies["manifest"];
  readonly #discoverTopology: NonNullable<Dependencies["discoverTopology"]>;
  readonly #createSession: NonNullable<Dependencies["createSession"]>;
  readonly #onGeneration: NonNullable<Dependencies["onGeneration"]>;
  readonly #idleCloseMs: number;
  readonly #maxSessions: number;
  readonly #now: () => number;
  readonly #setTimer: NonNullable<Dependencies["setTimer"]>;
  readonly #clearTimer: NonNullable<Dependencies["clearTimer"]>;
  readonly #reconnectDelayMs: NonNullable<Dependencies["reconnectDelayMs"]>;
  readonly #entries = new Map<string, Entry>();
  readonly #opening = new Map<string, Promise<Entry>>();

  constructor(dependencies: Dependencies) {
    this.#manifest = dependencies.manifest;
    this.#discoverTopology = dependencies.discoverTopology ?? discoverRelayTopology;
    this.#createSession = dependencies.createSession ?? ((options) => new RelayMapSpatialSession(options));
    this.#onGeneration = dependencies.onGeneration ?? (() => {});
    this.#idleCloseMs = dependencies.idleCloseMs ?? 60_000;
    this.#maxSessions = dependencies.maxSessions ?? 16;
    this.#now = dependencies.now ?? Date.now;
    this.#setTimer = dependencies.setTimer ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.#clearTimer = dependencies.clearTimer ?? ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>));
    this.#reconnectDelayMs = dependencies.reconnectDelayMs ?? ((attempt) => Math.min(30_000, 1_000 * (2 ** Math.max(0, attempt - 1))));
  }

  async acquire({ relayBaseUrl, claimId, scope: rawScope }: { relayBaseUrl: string; claimId: string; scope: Scope }) {
    const scope = normalizedScope({ ...rawScope, claimId });
    const key = mapSpatialScopeKey(scope);
    const entry = await this.#ensure(key, relayBaseUrl.replace(/\/+$/, ""), scope);
    if (entry.closeTimer != null) {
      this.#clearTimer(entry.closeTimer);
      entry.closeTimer = null;
    }
    entry.leases += 1;
    let released = false;
    return {
      snapshot: () => {
        if (!entry.snapshot) return null;
        const health = entry.session?.health() as { connected?: boolean; applied?: boolean; lastError?: string | null } | undefined;
        if (health?.connected && health.applied && !health.lastError) return entry.snapshot;
        return {
          ...entry.snapshot,
          data: { ...entry.snapshot.data, players: [] },
          warnings: [...entry.snapshot.warnings, "Live player positions are unavailable; last-known player positions were withheld."],
        };
      },
      waitForSnapshot: (timeoutMs: number) => {
        if (entry.snapshot) return Promise.resolve(entry.snapshot);
        const delay = Number.isFinite(timeoutMs) && timeoutMs >= 0 ? timeoutMs : 0;
        return new Promise<MapSpatialSnapshot | null>((resolve) => {
          const waiter: SnapshotWaiter = { timer: null, resolve };
          waiter.timer = this.#setTimer(() => {
            entry.snapshotWaiters.delete(waiter);
            resolve(null);
          }, delay);
          entry.snapshotWaiters.add(waiter);
        });
      },
      release: async () => {
        if (released) return;
        released = true;
        entry.leases = Math.max(0, entry.leases - 1);
        if (entry.leases === 0) entry.closeTimer = this.#setTimer(() => { void this.#close(key, entry); }, this.#idleCloseMs);
      },
    };
  }

  async #ensure(key: string, relayBaseUrl: string, scope: Scope): Promise<Entry> {
    const existing = this.#entries.get(key);
    if (existing) return existing;
    const opening = this.#opening.get(key);
    if (opening) return opening;
    const promise = this.#open(key, relayBaseUrl, scope);
    this.#opening.set(key, promise);
    try { return await promise; } finally { this.#opening.delete(key); }
  }

  async #open(key: string, relayBaseUrl: string, scope: Scope): Promise<Entry> {
    if (this.#entries.size >= this.#maxSessions) {
      const idle = [...this.#entries.entries()].filter(([, entry]) => entry.leases === 0).sort(([, left], [, right]) => left.openedAt - right.openedAt)[0];
      if (!idle) throw new Error(`Relay map-spatial scope capacity ${this.#maxSessions} is exhausted`);
      await this.#close(idle[0], idle[1]);
    }
    const entry: Entry = { key, relayBaseUrl, scope, session: null, leases: 0, snapshot: null, snapshotWaiters: new Set(), closeTimer: null, restartTimer: null, restartAttempts: 0, openedAt: this.#now() };
    await this.#replaceSession(entry);
    this.#entries.set(key, entry);
    return entry;
  }

  async #replaceSession(entry: Entry) {
    const topology = await this.#discoverTopology(entry.relayBaseUrl);
    const region = topology.regions.get(entry.scope.regionId);
    if (!region?.ready || !region.schemaFingerprint) throw new Error(`Relay region ${entry.scope.regionId} source is not ready or has no schema fingerprint`);
    const session = this.#createSession({
      onSnapshot: (snapshot) => {
        if (entry.session !== session) return;
        entry.snapshot = snapshot;
        for (const waiter of entry.snapshotWaiters) {
          this.#clearTimer(waiter.timer);
          waiter.resolve(snapshot);
        }
        entry.snapshotWaiters.clear();
        entry.restartAttempts = 0;
        this.#onGeneration(snapshot, entry.scope);
      },
      onFailure: (error) => { if (entry.session === session) this.#scheduleRestart(entry, error); },
    });
    entry.session = session;
    await session.start({ uri: relayWebSocketUri(entry.relayBaseUrl, region.port), database: region.database, schemaFingerprint: region.schemaFingerprint, manifest: this.#manifest, generation: (entry.snapshot?.generation ?? 0) + 1, scope: entry.scope });
  }

  #scheduleRestart(entry: Entry, _error: string) {
    if (entry.restartTimer != null || this.#entries.get(entry.key) !== entry) return;
    entry.restartAttempts += 1;
    entry.restartTimer = this.#setTimer(async () => {
      entry.restartTimer = null;
      const previous = entry.session;
      entry.session = null;
      await previous?.stop();
      try {
        await this.#replaceSession(entry);
      } catch (error) {
        this.#scheduleRestart(entry, error instanceof Error ? error.message : String(error));
      }
    }, this.#reconnectDelayMs(entry.restartAttempts));
  }

  async #close(key: string, entry: Entry) {
    if (this.#entries.get(key) !== entry) return;
    if (entry.leases > 0) return;
    if (entry.closeTimer != null) this.#clearTimer(entry.closeTimer);
    if (entry.restartTimer != null) this.#clearTimer(entry.restartTimer);
    entry.closeTimer = null;
    for (const waiter of entry.snapshotWaiters) {
      this.#clearTimer(waiter.timer);
      waiter.resolve(null);
    }
    entry.snapshotWaiters.clear();
    this.#entries.delete(key);
    await entry.session?.stop();
  }

  health() {
    return { sessions: [...this.#entries.values()].map((entry) => ({ key: entry.key, regionId: entry.scope.regionId, leases: entry.leases, hasSnapshot: Boolean(entry.snapshot), restartAttempts: entry.restartAttempts, health: entry.session?.health() ?? null })) };
  }

  async stop() {
    await Promise.allSettled(this.#opening.values());
    const entries = [...this.#entries.entries()];
    this.#entries.clear();
    for (const [, entry] of entries) {
      if (entry.closeTimer != null) this.#clearTimer(entry.closeTimer);
      if (entry.restartTimer != null) this.#clearTimer(entry.restartTimer);
      for (const waiter of entry.snapshotWaiters) {
        this.#clearTimer(waiter.timer);
        waiter.resolve(null);
      }
      entry.snapshotWaiters.clear();
      await entry.session?.stop();
    }
  }
}
