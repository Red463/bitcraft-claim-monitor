type RegionSession = {
  start(): Promise<void>;
  stop(): Promise<void>;
  health?(): unknown;
};

type RegionSessionFactory = (regionId: string) => RegionSession;

type SessionEntry = {
  regionId: string;
  session: RegionSession;
  leases: number;
  pinned: boolean;
  openedAt: number;
  lastUsedAt: number;
};

type PoolDependencies = {
  createSession: RegionSessionFactory;
  maxSessions?: number;
  idleCloseMs?: number;
  staggerMs?: number;
  now?: () => number;
  sleep?: (delayMs: number) => Promise<void>;
  scheduleSweep?: (callback: () => void, intervalMs: number) => () => void;
};

type PoolConfig = {
  primaryRegionId: string;
  activeRegionIds: string[];
};

export type RegionSessionLease = {
  regionId: string;
  session: RegionSession;
  release(): Promise<void>;
};

function normalizedRegionId(value: unknown): string {
  const regionId = String(value ?? "").trim();
  if (!/^\d+$/.test(regionId)) {
    throw new TypeError("Relay region id must be a decimal integer");
  }
  return regionId;
}

function regionOrder(left: string, right: string): number {
  const numeric = Number(left) - Number(right);
  return numeric || left.localeCompare(right);
}

export class AdaptiveRegionSessionPool {
  readonly #createSession: RegionSessionFactory;
  readonly #maxSessions: number;
  readonly #idleCloseMs: number;
  readonly #staggerMs: number;
  readonly #now: () => number;
  readonly #sleep: (delayMs: number) => Promise<void>;
  readonly #scheduleSweep: (callback: () => void, intervalMs: number) => () => void;
  readonly #sessions = new Map<string, SessionEntry>();
  readonly #opening = new Map<string, Promise<SessionEntry>>();
  #primaryRegionId: string | null = null;
  #activeRegionIds: string[] = [];
  #allowedRegionIds = new Set<string>();
  #cancelSweep: (() => void) | null = null;
  #lastError: string | null = null;
  #started = false;

  constructor(dependencies: PoolDependencies) {
    if (!Number.isSafeInteger(dependencies.maxSessions ?? 4) || (dependencies.maxSessions ?? 4) < 1) {
      throw new TypeError("Relay region-session pool maxSessions must be a positive safe integer");
    }
    if (!Number.isFinite(dependencies.idleCloseMs ?? 60_000) || (dependencies.idleCloseMs ?? 60_000) < 0) {
      throw new TypeError("Relay region-session pool idleCloseMs must be non-negative");
    }
    if (!Number.isFinite(dependencies.staggerMs ?? 250) || (dependencies.staggerMs ?? 250) < 0) {
      throw new TypeError("Relay region-session pool staggerMs must be non-negative");
    }
    this.#createSession = dependencies.createSession;
    this.#maxSessions = dependencies.maxSessions ?? 4;
    this.#idleCloseMs = dependencies.idleCloseMs ?? 60_000;
    this.#staggerMs = dependencies.staggerMs ?? 250;
    this.#now = dependencies.now ?? Date.now;
    this.#sleep = dependencies.sleep ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
    this.#scheduleSweep = dependencies.scheduleSweep ?? ((callback, intervalMs) => {
      const timer = setInterval(callback, intervalMs);
      timer.unref?.();
      return () => clearInterval(timer);
    });
  }

  async start(config: PoolConfig): Promise<void> {
    if (this.#started) throw new Error("Relay region-session pool is already started");
    const normalized = this.#normalizeConfig(config);
    this.#primaryRegionId = normalized.primaryRegionId;
    this.#activeRegionIds = normalized.activeRegionIds;
    this.#allowedRegionIds = new Set(normalized.activeRegionIds);
    this.#started = true;
    try {
      await this.#ensureSession(normalized.primaryRegionId, true);
      const sweepIntervalMs = Math.max(1_000, Math.min(Math.max(this.#idleCloseMs, 1_000), 30_000));
      this.#cancelSweep = this.#scheduleSweep(() => {
        void this.sweepIdle().catch((error) => this.#recordError(error));
      }, sweepIntervalMs);
    } catch (error) {
      this.#started = false;
      this.#recordError(error);
      throw error;
    }
  }

  async acquire(regionIdValue: string): Promise<RegionSessionLease> {
    this.#requireStarted();
    const regionId = normalizedRegionId(regionIdValue);
    if (!this.#allowedRegionIds.has(regionId)) {
      throw new Error(`Relay region ${regionId} is not configured for cross-region work`);
    }
    const entry = await this.#ensureSession(regionId, regionId === this.#primaryRegionId);
    entry.leases += 1;
    entry.lastUsedAt = this.#now();
    let released = false;
    return {
      regionId,
      session: entry.session,
      release: async () => {
        if (released) return;
        released = true;
        const current = this.#sessions.get(regionId);
        if (!current || current.session !== entry.session) return;
        current.leases = Math.max(0, current.leases - 1);
        current.lastUsedAt = this.#now();
      },
    };
  }

  async warmActiveRegions(): Promise<void> {
    this.#requireStarted();
    for (const regionId of this.#activeRegionIds) {
      if (regionId === this.#primaryRegionId) continue;
      if (this.#sessions.has(regionId)) continue;
      await this.#sleep(this.#staggerMs);
      let lease: RegionSessionLease | null = null;
      try {
        lease = await this.acquire(regionId);
      } catch (error) {
        this.#recordError(error);
        if (String(error instanceof Error ? error.message : error).toLowerCase().includes("capacity")) break;
        continue;
      } finally {
        await lease?.release();
      }
    }
  }

  async sweepIdle(): Promise<string[]> {
    if (!this.#started) return [];
    const now = this.#now();
    const candidates = [...this.#sessions.values()]
      .filter((entry) => !entry.pinned && entry.leases === 0 && now - entry.lastUsedAt >= this.#idleCloseMs)
      .sort((left, right) => left.lastUsedAt - right.lastUsedAt || regionOrder(left.regionId, right.regionId));
    const closed: string[] = [];
    for (const entry of candidates) {
      if (this.#sessions.get(entry.regionId) !== entry) continue;
      await this.#closeEntry(entry);
      closed.push(entry.regionId);
    }
    return closed;
  }

  health() {
    return {
      running: this.#started,
      primaryRegionId: this.#primaryRegionId,
      allowedRegionIds: [...this.#allowedRegionIds].sort(regionOrder),
      maxSessions: this.#maxSessions,
      idleCloseMs: this.#idleCloseMs,
      staggerMs: this.#staggerMs,
      lastError: this.#lastError,
      sessions: [...this.#sessions.values()]
        .sort((left, right) => {
          if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
          return regionOrder(left.regionId, right.regionId);
        })
        .map((entry) => ({
          regionId: entry.regionId,
          leases: entry.leases,
          pinned: entry.pinned,
          openedAt: entry.openedAt,
          lastUsedAt: entry.lastUsedAt,
          health: entry.session.health?.() ?? null,
        })),
    };
  }

  async stop(): Promise<void> {
    this.#cancelSweep?.();
    this.#cancelSweep = null;
    await Promise.allSettled(this.#opening.values());
    const entries = [...this.#sessions.values()].sort((left, right) => {
      if (left.pinned !== right.pinned) return left.pinned ? 1 : -1;
      return regionOrder(left.regionId, right.regionId);
    });
    for (const entry of entries) await this.#closeEntry(entry);
    this.#opening.clear();
    this.#primaryRegionId = null;
    this.#activeRegionIds = [];
    this.#allowedRegionIds.clear();
    this.#started = false;
  }

  #normalizeConfig(config: PoolConfig): PoolConfig {
    const primaryRegionId = normalizedRegionId(config.primaryRegionId);
    const activeRegionIds = [...new Set([
      primaryRegionId,
      ...config.activeRegionIds.map(normalizedRegionId),
    ])].sort(regionOrder);
    return { primaryRegionId, activeRegionIds };
  }

  async #ensureSession(regionId: string, pinned: boolean): Promise<SessionEntry> {
    const existing = this.#sessions.get(regionId);
    if (existing) {
      existing.pinned ||= pinned;
      existing.lastUsedAt = this.#now();
      return existing;
    }
    const opening = this.#opening.get(regionId);
    if (opening) {
      const entry = await opening;
      entry.pinned ||= pinned;
      return entry;
    }
    const promise = this.#openSession(regionId, pinned);
    this.#opening.set(regionId, promise);
    try {
      return await promise;
    } finally {
      if (this.#opening.get(regionId) === promise) this.#opening.delete(regionId);
    }
  }

  async #openSession(regionId: string, pinned: boolean): Promise<SessionEntry> {
    if (this.#sessions.size + this.#opening.size >= this.#maxSessions) {
      const evictable = [...this.#sessions.values()]
        .filter((entry) => !entry.pinned && entry.leases === 0)
        .sort((left, right) => left.lastUsedAt - right.lastUsedAt || regionOrder(left.regionId, right.regionId))[0];
      if (!evictable) {
        throw new Error(`Relay region-session pool is at capacity (${this.#maxSessions})`);
      }
      await this.#closeEntry(evictable);
    }
    const session = this.#createSession(regionId);
    try {
      await session.start();
    } catch (error) {
      this.#recordError(error);
      try {
        await session.stop();
      } catch {
        // Preserve the connection failure as the actionable error.
      }
      throw error;
    }
    const now = this.#now();
    const entry = {
      regionId,
      session,
      leases: 0,
      pinned,
      openedAt: now,
      lastUsedAt: now,
    };
    this.#sessions.set(regionId, entry);
    this.#lastError = null;
    return entry;
  }

  async #closeEntry(entry: SessionEntry): Promise<void> {
    if (this.#sessions.get(entry.regionId) === entry) this.#sessions.delete(entry.regionId);
    try {
      await entry.session.stop();
    } catch (error) {
      this.#recordError(error);
    }
  }

  #recordError(error: unknown): void {
    this.#lastError = error instanceof Error ? error.message : String(error);
  }

  #requireStarted(): void {
    if (!this.#started) throw new Error("Relay region-session pool is not started");
  }
}
