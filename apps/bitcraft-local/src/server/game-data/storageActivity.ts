import type { DomainEvent, ItemKind } from "./contracts.ts";
import type { RelayHttpClient } from "./http.ts";
import { normalizeStorageLogs } from "./normalizers.ts";

type InventoryBuilding = {
  entityId?: unknown;
  entity_id?: unknown;
  name?: unknown;
  nickname?: unknown;
};

type InventoryPayload = {
  buildings?: InventoryBuilding[];
};

type CatalogEntity = {
  name?: string | null;
};

type StorageHttp = Pick<RelayHttpClient, "storageLogs">;

type StorageActivityDependencies = {
  http: StorageHttp;
  appendEvents: (events: DomainEvent[]) => Promise<void> | void;
  getEntity: (catalogKey: string) => CatalogEntity | null;
  batchSize?: number;
  concurrency?: number;
  maxSeenEvents?: number;
};

type SyncRequest = {
  claimId: string;
  regionId: string;
  inventories: InventoryPayload | null | undefined;
};

function decimalId(value: unknown): string | null {
  const id = typeof value === "bigint" ? value.toString() : String(value ?? "").trim();
  return /^\d+$/.test(id) ? id : null;
}

function containerName(building: InventoryBuilding | undefined, fallbackId: string): string {
  const nickname = String(building?.nickname ?? "").trim();
  const name = String(building?.name ?? "").trim();
  return nickname || name || `Storage ${fallbackId}`;
}

function catalogKey(itemType: ItemKind, itemId: string): string {
  return `${itemType === "cargo" ? "cargo" : "items"}:${itemId}`;
}

function fallbackItemName(itemType: ItemKind, itemId: string): string {
  return `${itemType === "cargo" ? "Cargo" : "Item"} #${itemId}`;
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let next = 0;
  async function worker() {
    while (next < values.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(values[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker()),
  );
  return results;
}

export class RelayStorageActivityService {
  readonly #http: StorageHttp;
  readonly #appendEvents: StorageActivityDependencies["appendEvents"];
  readonly #getEntity: StorageActivityDependencies["getEntity"];
  readonly #batchSize: number;
  readonly #concurrency: number;
  readonly #maxSeenEvents: number;
  readonly #primedStorageIds = new Set<string>();
  readonly #seenEventKeys = new Set<string>();
  #offset = 0;
  #inFlight: Promise<Awaited<ReturnType<RelayStorageActivityService["performSync"]>>> | null = null;

  constructor(dependencies: StorageActivityDependencies) {
    this.#http = dependencies.http;
    this.#appendEvents = dependencies.appendEvents;
    this.#getEntity = dependencies.getEntity;
    this.#batchSize = Math.max(1, Math.floor(dependencies.batchSize ?? 25));
    this.#concurrency = Math.max(1, Math.floor(dependencies.concurrency ?? 5));
    this.#maxSeenEvents = Math.max(1, Math.floor(dependencies.maxSeenEvents ?? 50_000));
  }

  sync(request: SyncRequest) {
    if (this.#inFlight) return this.#inFlight;
    const operation = this.performSync(request);
    this.#inFlight = operation;
    return operation.finally(() => {
      if (this.#inFlight === operation) this.#inFlight = null;
    });
  }

  private async performSync(request: SyncRequest) {
    const claimId = decimalId(request.claimId);
    const regionId = decimalId(request.regionId);
    if (!claimId || !regionId) throw new TypeError("Storage activity requires decimal claim and region IDs");
    const buildingMap = new Map<string, InventoryBuilding>();
    for (const building of Array.isArray(request.inventories?.buildings)
      ? request.inventories.buildings
      : []) {
      const id = decimalId(building?.entityId ?? building?.entity_id);
      if (id && !buildingMap.has(id)) buildingMap.set(id, building);
    }
    const storageIds = [...buildingMap.keys()].sort((left, right) => left.localeCompare(right));
    for (const storageId of this.#primedStorageIds) {
      if (!buildingMap.has(storageId)) this.#primedStorageIds.delete(storageId);
    }
    if (!storageIds.length) {
      this.#offset = 0;
      return {
        requested: 0,
        processed: 0,
        insertedCandidates: 0,
        complete: true,
        failures: [] as string[],
        warnings: [] as string[],
      };
    }
    if (this.#offset >= storageIds.length) this.#offset = 0;
    const batch = storageIds.slice(this.#offset, this.#offset + this.#batchSize);
    this.#offset = this.#offset + batch.length >= storageIds.length
      ? 0
      : this.#offset + batch.length;
    const failures: string[] = [];
    const warnings: string[] = [];
    const successfulStorageIds: string[] = [];
    const groups = await mapWithConcurrency(batch, this.#concurrency, async (storageId) => {
      try {
        const payload = await this.#http.storageLogs({
          storageId,
          regionId,
          limit: this.#primedStorageIds.has(storageId) ? 100 : 5000,
        });
        const normalized = normalizeStorageLogs(payload, { claimId, regionId });
        warnings.push(...normalized.warnings);
        successfulStorageIds.push(storageId);
        return normalized.data.filter((log) => {
          if (log.buildingId === storageId) return true;
          warnings.push(
            `Relay storage-log omitted row ${log.id} for unexpected storage ${log.buildingId} while reading ${storageId}.`,
          );
          return false;
        });
      } catch (error) {
        failures.push(
          `${containerName(buildingMap.get(storageId), storageId)}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return [];
      }
    });
    const events = groups.flat().map<DomainEvent>((log) => {
      const building = buildingMap.get(log.buildingId);
      const itemName = String(this.#getEntity(catalogKey(log.itemType, log.itemId))?.name ?? "").trim()
        || fallbackItemName(log.itemType, log.itemId);
      const selectedContainerName = containerName(building, log.buildingId);
      const actorName = log.playerName || `Player ${log.playerId}`;
      const action = log.action === "withdraw" ? "withdrew" : "deposited";
      const preposition = log.action === "withdraw" ? "from" : "to";
      return {
        claimId,
        domain: "inventories",
        sourceKey: `relay-storage:${regionId}:${log.id}`,
        occurredAt: log.occurredAt,
        data: {
          eventType: "storage",
          summary: `${actorName} ${action} ${BigInt(log.quantity).toLocaleString("en-GB")} ${itemName} ${preposition} ${selectedContainerName}`,
          metadata: {
            action: log.action,
            actorEntityId: log.playerId,
            actorName,
            buildingId: log.buildingId,
            containerName: selectedContainerName,
            itemId: log.itemId,
            itemName,
            itemType: log.itemType,
            quantity: log.quantity,
            regionId,
            relayLogId: log.id,
          },
        },
      };
    }).filter((event) => !this.#seenEventKeys.has(event.sourceKey));
    if (events.length) {
      await this.#appendEvents(events);
      for (const event of events) {
        this.#seenEventKeys.add(event.sourceKey);
        while (this.#seenEventKeys.size > this.#maxSeenEvents) {
          const oldest = this.#seenEventKeys.values().next().value;
          if (oldest == null) break;
          this.#seenEventKeys.delete(oldest);
        }
      }
    }
    for (const storageId of successfulStorageIds) this.#primedStorageIds.add(storageId);
    return {
      requested: storageIds.length,
      processed: batch.length,
      insertedCandidates: events.length,
      complete: this.#offset === 0,
      failures,
      warnings,
    };
  }
}
