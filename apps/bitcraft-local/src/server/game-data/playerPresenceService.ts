import type { RelayHttpClient } from "./http.ts";
import {
  normalizeRelayPlayerDetail,
  type RelayPlayerDetail as PlayerDetail,
} from "./normalizers.ts";

type PlayerPresenceHttp = Pick<RelayHttpClient, "player">;
type PlayerProjection = Record<string, unknown> & {
  playerEntityId?: unknown;
  presenceSource?: unknown;
};
type CacheEntry = { loadedAt: number; detail: PlayerDetail | null };

const PLAYER_PRESENCE_TTL_MS = 60_000;
const PLAYER_PRESENCE_CONCURRENCY = 4;

function decimalId(value: unknown, label: string): string {
  const id = typeof value === "bigint" ? value.toString() : String(value ?? "").trim();
  if (!/^\d+$/.test(id)) throw new TypeError(`${label} must be a decimal integer`);
  return id;
}

function newestValidTimestamp(...values: unknown[]): string | undefined {
  let newest: { value: string; time: number } | null = null;
  for (const value of values) {
    if (typeof value !== "string") continue;
    const time = Date.parse(value);
    if (!Number.isFinite(time) || (newest && time <= newest.time)) continue;
    newest = { value, time };
  }
  return newest?.value;
}

export class RelayPlayerPresenceService {
  readonly #http: PlayerPresenceHttp;
  readonly #now: () => number;
  readonly #cache = new Map<string, CacheEntry>();
  readonly #inflight = new Map<string, Promise<PlayerDetail>>();
  readonly #waiters: Array<() => void> = [];
  #active = 0;

  constructor(options: { http: PlayerPresenceHttp; now?: () => number }) {
    this.#http = options.http;
    this.#now = options.now ?? Date.now;
  }

  async enrich(players: PlayerProjection[]): Promise<PlayerProjection[]> {
    return Promise.all(players.map(async (player) => {
      if (player.presenceSource !== "unavailable") return player;
      const playerEntityId = decimalId(player.playerEntityId, "unavailable player entity id");
      try {
        const detail = await this.#detail(playerEntityId);
        const lastActiveTimestamp = newestValidTimestamp(
          player.lastActiveTimestamp,
          detail.lastActiveTimestamp,
        );
        return {
          ...player,
          signedIn: detail.signedIn,
          presenceRegionId: detail.presenceRegionId,
          presenceSource: "relay-player",
          ...(lastActiveTimestamp == null ? {} : { lastActiveTimestamp }),
          ...(detail.lastLoginTimestamp == null ? {} : {
            lastLoginTimestamp: detail.lastLoginTimestamp,
          }),
        };
      } catch {
        return player;
      }
    }));
  }

  async resolvePlayerName(playerEntityIdValue: unknown): Promise<string> {
    const playerEntityId = decimalId(playerEntityIdValue, "contribution player entity id");
    return await this.resolveExactPlayerName(playerEntityId) ?? `Player ${playerEntityId}`;
  }

  async resolveExactPlayerName(playerEntityIdValue: unknown): Promise<string | null> {
    const playerEntityId = decimalId(playerEntityIdValue, "player entity id");
    try {
      const detail = await this.#detail(playerEntityId);
      return detail.username.trim() || null;
    } catch {
      return null;
    }
  }

  async #detail(playerEntityId: string): Promise<PlayerDetail> {
    const now = this.#now();
    const cached = this.#cache.get(playerEntityId);
    if (cached && now - cached.loadedAt < PLAYER_PRESENCE_TTL_MS) {
      if (cached.detail) return cached.detail;
      throw new Error(`Relay player ${playerEntityId} is unavailable`);
    }
    const existing = this.#inflight.get(playerEntityId);
    if (existing) return existing;
    const request = this.#load(playerEntityId);
    this.#inflight.set(playerEntityId, request);
    try {
      const detail = await request;
      this.#cache.set(playerEntityId, { loadedAt: this.#now(), detail });
      return detail;
    } catch (error) {
      this.#cache.set(playerEntityId, { loadedAt: this.#now(), detail: null });
      throw error;
    } finally {
      this.#inflight.delete(playerEntityId);
    }
  }

  async #load(playerEntityId: string): Promise<PlayerDetail> {
    await this.#acquire();
    try {
      const detail = normalizeRelayPlayerDetail(await this.#http.player(playerEntityId));
      if (detail.playerEntityId !== playerEntityId) {
        throw new TypeError(
          `Relay returned player ${detail.playerEntityId} for requested player ${playerEntityId}`,
        );
      }
      return detail;
    } finally {
      this.#release();
    }
  }

  #acquire(): Promise<void> {
    if (this.#active < PLAYER_PRESENCE_CONCURRENCY) {
      this.#active += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.#waiters.push(() => {
      this.#active += 1;
      resolve();
    }));
  }

  #release(): void {
    this.#active -= 1;
    this.#waiters.shift()?.();
  }
}
