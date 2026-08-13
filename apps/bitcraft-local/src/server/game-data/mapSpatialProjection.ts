import { normalizeRegionalClaims } from "./normalizers.ts";

type MapSpatialScope = {
  claimId: string;
  regionId: string;
  playerIds: string[];
  resourceIds: string[];
  enemyTypes: string[];
  includeClaims?: boolean;
};

type WireRecord = Record<string, unknown>;

// Relay's live overworld rows use dimension 1. Keep this local because this
// module is compiled into the isolated provider runtime.
const MAP_OVERWORLD_DIMENSION = "1";
const MAP_WORLD_MAX = 38_400;
const MAP_MOBILE_WORLD_MAX = MAP_WORLD_MAX * 1_000;
const MAX_IDS_PER_QUERY = 100;
const ENEMY_TYPE_TAGS = [
  "None", "PracticeDummy", "GrassBird", "DesertBird", "SwampBird", "Goat", "MountainGoat", "DeerFemale", "DeerMale", "Elk",
  "BoarFemale", "BoarMale", "BoarElder", "PlainsOx", "TundraOx", "JungleLargeBird", "DesertLargeBird", "Jakyl", "AlphaJakyl", "KingJakyl",
  "RockCrab", "DesertCrab", "FrostCrab", "ForestToad", "SwampToad", "FrostToad", "Umbura", "AlphaUmbura", "KingUmbura", "Drone",
  "Soldier", "Queen", "Sentinel", "SentinelDungeonJakyl", "SentinelDungeonSkitch", "SentinelDungeonLargeJakyl", "CrabDungeonCrabBoss", "CrabDungeonCrabTrash",
  "SpiderDungeonEliteSpider", "SpiderDungeonSmallSpider", "SpiderDungeonSpiderNest", "EnragedAlphaJakyl", "DeerSwift", "CrystalizedHexiteCrab",
] as const;

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

function rows(value: unknown[] | undefined): WireRecord[] {
  return (value ?? []).filter((row): row is WireRecord => Boolean(row && typeof row === "object" && !Array.isArray(row)));
}

export function mapEnemyTypeId(value: unknown): string {
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "string" && /^\d+$/.test(value.trim())) return decimal(value, "Map enemy type");
  const tag = typeof value === "string" ? value.trim() : value && typeof value === "object" && !Array.isArray(value) ? String((value as WireRecord).tag ?? "").trim() : "";
  const id = ENEMY_TYPE_TAGS.indexOf(tag as typeof ENEMY_TYPE_TAGS[number]);
  if (id < 1) throw new TypeError(`Unsupported Relay EnemyType tag: ${tag || String(value)}`);
  return String(id);
}

export function selectedMapEnemyRows(values: unknown[], enemyTypes: string[]): WireRecord[] {
  const selected = new Set(enemyTypes.map(String));
  return rows(values).filter((row) => {
    try { return selected.has(mapEnemyTypeId(row.enemyType ?? row.enemy_type)); } catch { return false; }
  });
}

function equalityPredicate(table: string, column: string, values: string[]): string | null {
  const ids = [...new Set(values.map((value) => decimal(value, `${table} scope`)))].sort((left, right) => left.length - right.length || left.localeCompare(right));
  return ids.length ? ids.map((id) => `${column} = ${id}`).join(" OR ") : null;
}

function equalityQuery(table: string, column: string, values: string[], extraPredicate = ""): string | null {
  const predicate = equalityPredicate(table, column, values);
  if (!predicate) return null;
  return `SELECT * FROM ${table} WHERE ${extraPredicate ? `(${predicate}) AND ${extraPredicate}` : predicate}`;
}

function equalityQueries(table: string, column: string, values: string[], extraPredicate = ""): string[] {
  const ids = [...new Set(values.map((value) => decimal(value, `${table} scope`)))].sort((left, right) => left.length - right.length || left.localeCompare(right));
  const queries: string[] = [];
  for (let offset = 0; offset < ids.length; offset += MAX_IDS_PER_QUERY) {
    const query = equalityQuery(table, column, ids.slice(offset, offset + MAX_IDS_PER_QUERY), extraPredicate);
    if (query) queries.push(query);
  }
  return queries;
}

export function mapSpatialQueries(scope: MapSpatialScope): string[] {
  return [
    ...(scope.includeClaims ? [
      "SELECT * FROM claim_state",
      "SELECT * FROM claim_local_state",
      "SELECT * FROM claim_tech_state",
      "SELECT * FROM claim_tech_desc",
    ] : []),
    scope.enemyTypes.length ? "SELECT * FROM enemy_state" : null,
    ...equalityQueries("mobile_entity_state", "entity_id", scope.playerIds, `dimension = ${MAP_OVERWORLD_DIMENSION}`),
  ].filter((query): query is string => Boolean(query));
}

export function mapEnemyMobileQueries(enemyRows: unknown[]): string[] {
  const entityIds = rows(enemyRows).flatMap((row, index) => {
    try { return [decimal(row.entityId ?? row.entity_id, `Map enemy ${index} entity id`)]; }
    catch { return []; }
  });
  return equalityQueries("mobile_entity_state", "entity_id", entityIds, `dimension = ${MAP_OVERWORLD_DIMENSION}`);
}

function overworldDimension(value: unknown, label: string): string {
  if (value == null) throw new TypeError(`${label} dimension is missing`);
  const dimension = decimal(value, `${label} dimension`);
  if (dimension !== MAP_OVERWORLD_DIMENSION) throw new TypeError(`${label} dimension ${dimension} is not overworld ${MAP_OVERWORLD_DIMENSION}`);
  return dimension;
}

function boundedCoordinate(value: unknown, label: string, max: number): number {
  const coordinate = integer(value, label);
  if (coordinate < 0 || coordinate > max) throw new RangeError(`${label} is outside verified world bounds`);
  return coordinate;
}

function coordinateFields(value: unknown, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} coordinates are missing`);
  const point = value as WireRecord;
  return {
    locationX: boundedCoordinate(point.x, `${label} x`, MAP_WORLD_MAX),
    locationZ: boundedCoordinate(point.z, `${label} z`, MAP_WORLD_MAX),
    dimension: overworldDimension(point.dimension, label),
  };
}

export function normalizeMapSpatial({
  scope,
  waystoneRows = [],
  claimRows = [],
  claimLocalRows = [],
  claimTechRows = [],
  claimTechDescriptionRows = [],
  enemyRows = [],
  mobileRows = [],
  observedAt = new Date().toISOString(),
}: {
  scope: MapSpatialScope;
  waystoneRows?: unknown[];
  claimRows?: unknown[];
  claimLocalRows?: unknown[];
  claimTechRows?: unknown[];
  claimTechDescriptionRows?: unknown[];
  enemyRows?: unknown[];
  mobileRows?: unknown[];
  observedAt?: string;
}) {
  const regionId = decimal(scope.regionId, "Map spatial region id");
  const warnings: string[] = [];
  const claimProjection = scope.includeClaims
    ? normalizeRegionalClaims({
        regionId,
        claimRows,
        localRows: claimLocalRows,
        claimTypeRows: [],
        claimTechRows,
        claimTechDescriptionRows,
        usernameRows: [],
      })
    : { data: { claims: [] }, warnings: [] };
  warnings.push(...claimProjection.warnings);
  const claims = claimProjection.data.claims
      .filter((claim) => claim.locationX != null && claim.locationZ != null && claim.locationDimension === MAP_OVERWORLD_DIMENSION)
      .map((claim) => ({
        entityId: String(claim.entityId),
        regionId,
        name: String(claim.name ?? "Claim"),
        tier: claim.tier == null ? null : Number(claim.tier),
        npc: claim.npc === true,
        locationX: Number(claim.locationX),
        locationZ: Number(claim.locationZ),
        dimension: String(claim.locationDimension),
        observedAt,
      }));
  if (scope.enemyTypes.length && !enemyRows.length) warnings.push("No enemies matched the selected types in this region.");
  const mobile = new Map<string, WireRecord>();
  for (const [index, row] of rows(mobileRows).entries()) {
    try { mobile.set(decimal(row.entityId ?? row.entity_id, `Map mobile ${index} entity id`), row); }
    catch (error) { warnings.push(error instanceof Error ? error.message : String(error)); }
  }
  const waystones = rows(waystoneRows).flatMap((row, index) => {
    try {
      const entityId = decimal(row.buildingEntityId ?? row.building_entity_id, `Map waystone ${index} entity id`);
      return [{ entityId, claimEntityId: decimal(row.claimEntityId ?? row.claim_entity_id, `Map waystone ${entityId} claim id`), regionId, ...coordinateFields(row.coordinates, `Map waystone ${entityId}`), observedAt }];
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
      return [];
    }
  });
  const enemies = rows(enemyRows).flatMap((row, index) => {
    try {
      const entityId = decimal(row.entityId ?? row.entity_id, `Map enemy ${index} entity id`);
      const enemyType = mapEnemyTypeId(row.enemyType ?? row.enemy_type);
      if (!scope.enemyTypes.includes(enemyType)) return [];
      const position = mobile.get(entityId);
      if (!position) {
        warnings.push(`Map enemy ${entityId} has no mobile_entity_state row.`);
        return [];
      }
      return [{ entityId, enemyType, regionId, locationX: boundedCoordinate(position.locationX ?? position.location_x, `Map enemy ${entityId} x`, MAP_MOBILE_WORLD_MAX), locationZ: boundedCoordinate(position.locationZ ?? position.location_z, `Map enemy ${entityId} z`, MAP_MOBILE_WORLD_MAX), dimension: overworldDimension(position.dimension, `Map enemy ${entityId}`), observedAt }];
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
      return [];
    }
  });
  const selectedPlayers = new Set(scope.playerIds.map(String));
  const players = [...mobile].filter(([entityId]) => selectedPlayers.has(entityId)).flatMap(([playerEntityId, position]) => {
    try {
      return [{ playerEntityId, regionId, locationX: boundedCoordinate(position.locationX ?? position.location_x, `Map player ${playerEntityId} x`, MAP_MOBILE_WORLD_MAX), locationZ: boundedCoordinate(position.locationZ ?? position.location_z, `Map player ${playerEntityId} z`, MAP_MOBILE_WORLD_MAX), dimension: overworldDimension(position.dimension, `Map player ${playerEntityId}`), observedAt }];
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
      return [];
    }
  });
  return { data: { regionId, claims, players, resources: [], enemies, waystones }, warnings };
}
