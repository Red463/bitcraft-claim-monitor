import type { RelayHttpClient } from "./http.ts";
import { normalizeTimestamp } from "./normalizers.ts";

type PlayerPresenceHttp = Pick<RelayHttpClient, "player">;
type PlayerProjection = Record<string, unknown> & {
  playerEntityId?: unknown;
  presenceSource?: unknown;
};
type PlayerDetail = {
  playerEntityId: string;
  username: string;
  presenceRegionId: string;
  signedIn: boolean;
  lastActiveTimestamp?: string;
  lastLoginTimestamp?: string;
};
type CacheEntry = { loadedAt: number; detail: PlayerDetail };

const PLAYER_PRESENCE_TTL_MS = 60_000;
const PLAYER_PRESENCE_CONCURRENCY = 4;

function record(value: unknown, label: string): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function decimalId(value: unknown, label: string): string {
  const id = typeof value === "bigint" ? value.toString() : String(value ?? "").trim();
  if (!/^\d+$/.test(id)) throw new TypeError(`${label} must be a decimal integer`);
  return id;
}

function optionalTimestamp(value: unknown, label: string): string | undefined {
  return value == null
    ? undefined
    : normalizeTimestamp(decimalId(value, label), "seconds");
}

function normalizePlayerDetail(value: unknown, expectedPlayerEntityId: string): PlayerDetail {
  const payload = record(value, "Relay player detail payload");
  const player = record(payload.player ?? payload, "Relay player detail");
  const playerEntityId = decimalId(
    player.entity_id ?? player.entityId,
    "Relay player detail entity id",
  );
  if (playerEntityId !== expectedPlayerEntityId) {
    throw new TypeError(
      `Relay returned player ${playerEntityId} for requested player ${expectedPlayerEntityId}`,
    );
  }
  const signedIn = player.signed_in ?? player.signedIn;
  if (typeof signedIn !== "boolean") {
    throw new TypeError("Relay player detail signed_in must be boolean");
  }
  const lastActiveTimestamp = optionalTimestamp(
    player.last_active_timestamp ?? player.lastActiveTimestamp,
    "Relay player last active",
  );
  const lastLoginTimestamp = optionalTimestamp(
    player.last_login_timestamp ?? player.lastLoginTimestamp,
    "Relay player last login",
  );
  return {
    playerEntityId,
    username: String(player.username ?? ""),
    presenceRegionId: decimalId(player.region ?? player.region_id ?? player.regionId, "Relay player detail region"),
    signedIn,
    ...(lastActiveTimestamp == null ? {} : { lastActiveTimestamp }),
    ...(lastLoginTimestamp == null ? {} : { lastLoginTimestamp }),
  };
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
        return {
          ...player,
          signedIn: detail.signedIn,
          presenceRegionId: detail.presenceRegionId,
          presenceSource: "relay-player",
          ...(detail.lastActiveTimestamp == null ? {} : {
            lastActiveTimestamp: detail.lastActiveTimestamp,
          }),
          ...(detail.lastLoginTimestamp == null ? {} : {
            lastLoginTimestamp: detail.lastLoginTimestamp,
          }),
        };
      } catch {
        return player;
      }
    }));
  }

  async #detail(playerEntityId: string): Promise<PlayerDetail> {
    const now = this.#now();
    const cached = this.#cache.get(playerEntityId);
    if (cached && now - cached.loadedAt < PLAYER_PRESENCE_TTL_MS) return cached.detail;
    const existing = this.#inflight.get(playerEntityId);
    if (existing) return existing;
    const request = this.#load(playerEntityId);
    this.#inflight.set(playerEntityId, request);
    try {
      const detail = await request;
      this.#cache.set(playerEntityId, { loadedAt: this.#now(), detail });
      return detail;
    } finally {
      this.#inflight.delete(playerEntityId);
    }
  }

  async #load(playerEntityId: string): Promise<PlayerDetail> {
    await this.#acquire();
    try {
      return normalizePlayerDetail(await this.#http.player(playerEntityId), playerEntityId);
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
