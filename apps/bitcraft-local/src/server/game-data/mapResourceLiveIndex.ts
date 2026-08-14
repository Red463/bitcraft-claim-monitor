import {
  normalizePackedCoordinates,
  packResourceCoordinate,
} from "../../map/resourcePartitionCodec.mjs";

type WireRecord = Record<string, unknown>;

export type PackedResourceDelta = {
  resourceId: string;
  additions: Uint32Array;
  removals: Uint32Array;
};

type Contribution = { resourceId: string; coordinate: number };
type SeedResult = { complete: boolean; coordinates: Uint32Array; warnings: string[] };

function record(value: unknown, label: string): WireRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} row must be an object`);
  }
  return value as WireRecord;
}

function decimal(value: unknown, label: string): string {
  const result = typeof value === "bigint" ? value.toString() : String(value ?? "").trim();
  if (!/^(0|[1-9]\d*)$/.test(result)) throw new TypeError(`${label} must be a decimal integer`);
  return result;
}

function entityId(row: WireRecord, label: string): string {
  return decimal(row.entityId ?? row.entity_id, `${label} entity id`);
}

function resourceId(row: WireRecord): string {
  return decimal(row.resourceId ?? row.resource_id, "Map resource type");
}

function locationCoordinate(row: WireRecord): number | null {
  const dimension = decimal(row.dimension, "Map resource location dimension");
  if (dimension !== "1") return null;
  return packResourceCoordinate(
    Number(row.x ?? row.locationX ?? row.location_x),
    Number(row.z ?? row.locationZ ?? row.location_z),
  );
}

export class MapResourceLiveIndex {
  readonly #regionId: string;
  readonly #selected = new Set<string>();
  readonly #resources = new Map<string, string>();
  readonly #locations = new Map<string, number | null>();
  readonly #contributions = new Map<string, Contribution>();
  readonly #counts = new Map<string, Map<number, number>>();
  readonly #additions = new Map<string, Set<number>>();
  readonly #removals = new Map<string, Set<number>>();

  constructor(regionId: string) {
    this.#regionId = decimal(regionId, "Map resource region id");
  }

  select(rawResourceId: string): void {
    const selectedResourceId = decimal(rawResourceId, "Map resource id");
    if (this.#selected.has(selectedResourceId)) return;
    this.#selected.add(selectedResourceId);
    this.#counts.set(selectedResourceId, new Map());
    this.#additions.set(selectedResourceId, new Set());
    this.#removals.set(selectedResourceId, new Set());
    for (const [entity, currentResourceId] of this.#resources) {
      if (currentResourceId === selectedResourceId) this.#reconcile(entity);
    }
  }

  unselect(rawResourceId: string): void {
    const selectedResourceId = decimal(rawResourceId, "Map resource id");
    if (!this.#selected.delete(selectedResourceId)) return;
    for (const [entity, contribution] of this.#contributions) {
      if (contribution.resourceId === selectedResourceId) this.#contributions.delete(entity);
    }
    this.#counts.delete(selectedResourceId);
    this.#additions.delete(selectedResourceId);
    this.#removals.delete(selectedResourceId);
  }

  upsertResource(value: unknown): void {
    const row = record(value, "Map resource");
    const entity = entityId(row, "Map resource");
    this.#resources.set(entity, resourceId(row));
    this.#reconcile(entity);
  }

  deleteResource(value: unknown): void {
    const row = record(value, "Map resource");
    const entity = entityId(row, "Map resource");
    this.#resources.delete(entity);
    this.#reconcile(entity);
  }

  upsertLocation(value: unknown): void {
    const row = record(value, "Map resource location");
    const entity = entityId(row, "Map resource location");
    this.#locations.set(entity, locationCoordinate(row));
    this.#reconcile(entity);
  }

  deleteLocation(value: unknown): void {
    const row = record(value, "Map resource location");
    const entity = entityId(row, "Map resource location");
    this.#locations.delete(entity);
    this.#reconcile(entity);
  }

  seed(
    resourceIds: string[],
    resourceRows: Iterable<unknown>,
    locationRows: Iterable<unknown>,
  ): Map<string, SeedResult> {
    this.#selected.clear();
    this.#resources.clear();
    this.#locations.clear();
    this.#contributions.clear();
    this.#counts.clear();
    this.#additions.clear();
    this.#removals.clear();

    const warnings = new Map<string, string[]>();
    for (const selectedResourceId of resourceIds) {
      const normalized = decimal(selectedResourceId, "Map resource id");
      this.select(normalized);
      warnings.set(normalized, []);
    }
    for (const value of resourceRows) {
      try {
        this.upsertResource(value);
      } catch (error) {
        const warning = error instanceof Error ? error.message : String(error);
        for (const entries of warnings.values()) entries.push(warning);
      }
    }
    for (const value of locationRows) {
      try {
        this.upsertLocation(value);
      } catch (error) {
        const warning = error instanceof Error ? error.message : String(error);
        for (const entries of warnings.values()) entries.push(warning);
      }
    }

    const output = new Map<string, SeedResult>();
    for (const selectedResourceId of this.#selected) {
      const entries = warnings.get(selectedResourceId)!;
      let complete = true;
      for (const [entity, currentResourceId] of this.#resources) {
        if (currentResourceId !== selectedResourceId) continue;
        if (!this.#locations.has(entity) || this.#locations.get(entity) === null) {
          complete = false;
          entries.push(`Map resource ${entity} has no overworld location_state row.`);
        }
      }
      output.set(selectedResourceId, {
        complete,
        coordinates: this.coordinates(selectedResourceId),
        warnings: entries,
      });
      this.drain(selectedResourceId);
    }
    return output;
  }

  drain(rawResourceId: string): PackedResourceDelta {
    const selectedResourceId = decimal(rawResourceId, "Map resource id");
    const additions = normalizePackedCoordinates(this.#additions.get(selectedResourceId) ?? []);
    const removals = normalizePackedCoordinates(this.#removals.get(selectedResourceId) ?? []);
    this.#additions.get(selectedResourceId)?.clear();
    this.#removals.get(selectedResourceId)?.clear();
    return { resourceId: selectedResourceId, additions, removals };
  }

  coordinates(rawResourceId: string): Uint32Array {
    const selectedResourceId = decimal(rawResourceId, "Map resource id");
    return normalizePackedCoordinates(this.#counts.get(selectedResourceId)?.keys() ?? []);
  }

  dirtyResourceIds(): string[] {
    return [...this.#selected]
      .filter((selectedResourceId) => (
        (this.#additions.get(selectedResourceId)?.size ?? 0) > 0
        || (this.#removals.get(selectedResourceId)?.size ?? 0) > 0
      ))
      .sort((left, right) => left.length - right.length || left.localeCompare(right));
  }

  #reconcile(entity: string): void {
    const previous = this.#contributions.get(entity);
    const nextResourceId = this.#resources.get(entity);
    const nextCoordinate = this.#locations.get(entity);
    const next = nextResourceId && nextCoordinate !== undefined && nextCoordinate !== null && this.#selected.has(nextResourceId)
      ? { resourceId: nextResourceId, coordinate: nextCoordinate }
      : undefined;
    if (previous?.resourceId === next?.resourceId && previous?.coordinate === next?.coordinate) return;
    if (previous) this.#removeContribution(previous);
    if (next) this.#addContribution(next);
    if (next) this.#contributions.set(entity, next);
    else this.#contributions.delete(entity);
  }

  #addContribution({ resourceId: selectedResourceId, coordinate }: Contribution): void {
    const counts = this.#counts.get(selectedResourceId);
    if (!counts) return;
    const count = counts.get(coordinate) ?? 0;
    counts.set(coordinate, count + 1);
    if (count !== 0) return;
    if (!this.#removals.get(selectedResourceId)?.delete(coordinate)) {
      this.#additions.get(selectedResourceId)?.add(coordinate);
    }
  }

  #removeContribution({ resourceId: selectedResourceId, coordinate }: Contribution): void {
    const counts = this.#counts.get(selectedResourceId);
    if (!counts) return;
    const count = counts.get(coordinate) ?? 0;
    if (count > 1) {
      counts.set(coordinate, count - 1);
      return;
    }
    counts.delete(coordinate);
    if (!this.#additions.get(selectedResourceId)?.delete(coordinate)) {
      this.#removals.get(selectedResourceId)?.add(coordinate);
    }
  }
}
