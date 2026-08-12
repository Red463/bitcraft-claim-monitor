type WireRecord = Record<string, unknown>;

const MAP_OVERWORLD_DIMENSION = "1";
const MAP_WORLD_MAX = 38_400;

export type MapResourcePoint = {
  entityId: string;
  resourceId: string;
  regionId: string;
  locationX: number;
  locationZ: number;
  dimension: "1";
  observedAt: string;
};

export type MapResourceGenerationData = {
  complete: boolean;
  resources: MapResourcePoint[];
  warnings: string[];
};

function decimal(value: unknown, label: string): string {
  const result = typeof value === "bigint" ? value.toString() : String(value ?? "").trim();
  if (!/^\d+$/.test(result)) throw new TypeError(`${label} must be a decimal integer`);
  return result;
}

function integer(value: unknown, label: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new TypeError(`${label} must be a safe integer`);
  return result;
}

function rows(value: unknown[]): WireRecord[] {
  return value.filter((row): row is WireRecord => Boolean(row && typeof row === "object" && !Array.isArray(row)));
}

function overworldDimension(value: unknown, label: string): "1" {
  if (value == null) throw new TypeError(`${label} dimension is missing`);
  const dimension = decimal(value, `${label} dimension`);
  if (dimension !== MAP_OVERWORLD_DIMENSION) throw new TypeError(`${label} dimension ${dimension} is not overworld ${MAP_OVERWORLD_DIMENSION}`);
  return MAP_OVERWORLD_DIMENSION;
}

function boundedCoordinate(value: unknown, label: string): number {
  const coordinate = integer(value, label);
  if (coordinate < 0 || coordinate > MAP_WORLD_MAX) throw new RangeError(`${label} is outside verified world bounds`);
  return coordinate;
}

export function mapResourceKey(regionId: string, resourceId: string): string {
  return `${decimal(regionId, "Map resource region id")}:${decimal(resourceId, "Map resource id")}`;
}

export function mapResourceQueries(resourceId: string): string[] {
  const selectedResourceId = decimal(resourceId, "Map resource id");
  const resourceJoin = "FROM resource_state JOIN location_state ON resource_state.entity_id = location_state.entity_id";
  return [
    `SELECT resource_state.* ${resourceJoin} WHERE resource_state.resource_id = ${selectedResourceId} AND location_state.dimension = ${MAP_OVERWORLD_DIMENSION}`,
    `SELECT location_state.* ${resourceJoin} WHERE resource_state.resource_id = ${selectedResourceId} AND location_state.dimension = ${MAP_OVERWORLD_DIMENSION}`,
  ];
}

export function normalizeMapResourceGeneration({
  regionId: rawRegionId,
  resourceId: rawResourceId,
  resourceRows,
  locationRows,
  observedAt,
}: {
  regionId: string;
  resourceId: string;
  resourceRows: unknown[];
  locationRows: unknown[];
  observedAt: string;
}): MapResourceGenerationData {
  const regionId = decimal(rawRegionId, "Map resource region id");
  const resourceId = decimal(rawResourceId, "Map resource id");
  const warnings: string[] = [];
  const selectedResources = rows(resourceRows).flatMap((row, index) => {
    try {
      if (decimal(row.resourceId ?? row.resource_id, `Map resource ${index} type`) !== resourceId) return [];
      const entityId = decimal(row.entityId ?? row.entity_id, `Map resource ${index} entity id`);
      return [entityId];
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
      return [];
    }
  });
  const selectedEntityIds = new Set(selectedResources);
  const locations = new Map<string, WireRecord>();
  for (const [index, row] of rows(locationRows).entries()) {
    try {
      const entityId = decimal(row.entityId ?? row.entity_id, `Map location ${index} entity id`);
      if (selectedEntityIds.has(entityId)) locations.set(entityId, row);
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
    }
  }
  let complete = true;
  const resources = selectedResources.flatMap((entityId) => {
    const location = locations.get(entityId);
    if (!location) {
      complete = false;
      warnings.push(`Map resource ${entityId} has no location_state row.`);
      return [];
    }
    try {
      return [{
        entityId,
        resourceId,
        regionId,
        locationX: boundedCoordinate(location.x, `Map resource ${entityId} x`),
        locationZ: boundedCoordinate(location.z, `Map resource ${entityId} z`),
        dimension: overworldDimension(location.dimension, `Map resource ${entityId}`),
        observedAt,
      }];
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
      return [];
    }
  });
  resources.sort((left, right) => left.entityId.length - right.entityId.length || left.entityId.localeCompare(right.entityId));
  return { complete, resources, warnings };
}
