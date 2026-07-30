import type { DomainEnvelope } from "./contracts.ts";
import { normalizePlayerInventory } from "./normalizers.ts";

type CatalogRecord = Record<string, unknown>;
type NormalizedPlayerInventory = ReturnType<typeof normalizePlayerInventory> & {
  items?: Record<string, CatalogRecord>;
  cargos?: Record<string, CatalogRecord>;
};

type RelayPlayerInventoryHttp = {
  playerInventory(playerId: string): Promise<unknown>;
};

type PlayerDataServiceOptions = {
  http: RelayPlayerInventoryHttp;
  readMembers(claimId: string): unknown;
  getEntity(catalogKey: string): CatalogRecord | null;
  getDescription(kind: string, id: string): CatalogRecord | null;
  now?: () => number;
  ttlMs?: number;
};

type PlayerInventoryRequest = {
  configuredClaimId: string;
  claimId: string;
  playerId: string;
  forceRefresh: boolean;
};

type CachedPlayerInventory = {
  data: NormalizedPlayerInventory;
  receivedAt: string;
  receivedAtMs: number;
};

export class PlayerDataAccessError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "PlayerDataAccessError";
    this.statusCode = statusCode;
  }
}

function decimalId(value: unknown, label: string): string {
  const id = typeof value === "bigint" ? value.toString() : String(value ?? "").trim();
  if (!/^\d+$/.test(id)) throw new PlayerDataAccessError(400, `${label} must be a decimal integer.`);
  return id;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function enrichPlayerInventory(
  normalized: ReturnType<typeof normalizePlayerInventory>,
  getEntity: PlayerDataServiceOptions["getEntity"],
  getDescription: PlayerDataServiceOptions["getDescription"],
): NormalizedPlayerInventory {
  const items: Record<string, CatalogRecord> = {};
  const cargos: Record<string, CatalogRecord> = {};
  const entityCache = new Map<string, CatalogRecord | null>();
  const toolCache = new Map<string, CatalogRecord | null>();
  const enrichedInventories = normalized.inventories.map((inventory) => ({
    ...inventory,
    items: inventory.items.map((stack) => {
      const catalogKey = `${stack.itemType === "cargo" ? "cargo" : "items"}:${stack.itemId}`;
      if (!entityCache.has(catalogKey)) entityCache.set(catalogKey, getEntity(catalogKey));
      const entity = entityCache.get(catalogKey) ?? {};
      if (stack.itemType === "item" && !toolCache.has(stack.itemId)) {
        toolCache.set(stack.itemId, getDescription("tool", stack.itemId));
      }
      const tool = stack.itemType === "item" ? toolCache.get(stack.itemId) : null;
      const catalogItem = {
        ...entity,
        id: stack.itemId,
        itemId: stack.itemId,
        itemType: stack.itemType,
        ...(tool ? {
          toolType: tool.toolType,
          toolLevel: tool.level,
          toolPower: tool.power,
        } : {}),
      };
      if (stack.itemType === "cargo") cargos[stack.itemId] = catalogItem;
      else items[stack.itemId] = catalogItem;
      return { ...stack, item: catalogItem };
    }),
  }));
  return {
    ...normalized,
    inventories: enrichedInventories.map((inventory) => ({
      ...inventory,
      pockets: inventory.items.map(({ item: _item, ...contents }) => ({ contents })),
    })),
    items,
    cargos,
  };
}

export class RelayPlayerDataService {
  readonly #http: RelayPlayerInventoryHttp;
  readonly #readMembers: PlayerDataServiceOptions["readMembers"];
  readonly #getEntity: PlayerDataServiceOptions["getEntity"];
  readonly #getDescription: PlayerDataServiceOptions["getDescription"];
  readonly #now: () => number;
  readonly #ttlMs: number;
  readonly #cache = new Map<string, CachedPlayerInventory>();
  readonly #inflight = new Map<string, Promise<CachedPlayerInventory>>();

  constructor(options: PlayerDataServiceOptions) {
    this.#http = options.http;
    this.#readMembers = options.readMembers;
    this.#getEntity = options.getEntity;
    this.#getDescription = options.getDescription;
    this.#now = options.now ?? Date.now;
    this.#ttlMs = options.ttlMs ?? 15_000;
  }

  async inventory(request: PlayerInventoryRequest): Promise<DomainEnvelope<NormalizedPlayerInventory>> {
    const configuredClaimId = decimalId(request.configuredClaimId, "configured claimId");
    const claimId = decimalId(request.claimId, "claimId");
    const playerId = decimalId(request.playerId, "playerId");
    if (claimId !== configuredClaimId) {
      throw new PlayerDataAccessError(403, "The requested claim is not the monitored claim.");
    }
    const members = this.#readMembers(claimId);
    const memberRows = Array.isArray(members) ? members : [];
    const isMember = memberRows.some((member) => (
      member != null
      && typeof member === "object"
      && String((member as CatalogRecord).playerEntityId ?? (member as CatalogRecord).player_entity_id ?? "") === playerId
    ));
    if (!isMember) throw new PlayerDataAccessError(403, "The requested player is not a monitored claim member.");

    const key = `${claimId}:${playerId}`;
    const now = this.#now();
    const cached = this.#cache.get(key);
    if (!request.forceRefresh && cached && now - cached.receivedAtMs < this.#ttlMs) {
      return this.#envelope(cached, "fresh", [], now);
    }

    let inflight = this.#inflight.get(key);
    if (!inflight) {
      inflight = this.#load(playerId);
      this.#inflight.set(key, inflight);
      void inflight.finally(() => this.#inflight.delete(key)).catch(() => {});
    }
    try {
      const loaded = await inflight;
      this.#cache.set(key, loaded);
      return this.#envelope(loaded, "fresh", [], this.#now());
    } catch (error) {
      const lastGood = this.#cache.get(key);
      if (lastGood) {
        return this.#envelope(
          lastGood,
          "stale",
          [`Relay player inventory refresh failed: ${errorMessage(error)}`],
          this.#now(),
        );
      }
      throw new PlayerDataAccessError(
        503,
        `Relay player inventory has not loaded: ${errorMessage(error)}`,
      );
    }
  }

  async #load(playerId: string): Promise<CachedPlayerInventory> {
    const wire = await this.#http.playerInventory(playerId);
    const normalized = normalizePlayerInventory(wire);
    if (normalized.player.entityId !== playerId) {
      throw new Error(`Relay returned player ${normalized.player.entityId} for requested player ${playerId}.`);
    }
    const receivedAtMs = this.#now();
    return {
      data: enrichPlayerInventory(normalized, this.#getEntity, this.#getDescription),
      receivedAt: new Date(receivedAtMs).toISOString(),
      receivedAtMs,
    };
  }

  #envelope(
    cached: CachedPlayerInventory,
    freshness: "fresh" | "stale",
    warnings: string[],
    now: number,
  ): DomainEnvelope<NormalizedPlayerInventory> {
    return {
      data: cached.data,
      freshness,
      confidence: "authoritative",
      ageMs: Math.max(0, now - cached.receivedAtMs),
      provenance: {
        provider: "relay",
        sourceKey: "relay-cache",
        regionId: cached.data.player.regionId,
        database: null,
        schemaFingerprint: null,
        sourceObservedAt: null,
        receivedAt: cached.receivedAt,
      },
      warnings,
    };
  }
}
