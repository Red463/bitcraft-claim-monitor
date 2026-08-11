type MapSpatialScope = {
  claimId: string;
  regionId: string;
  playerIds: string[];
  resourceIds: string[];
  enemyTypes: string[];
};

type WireRecord = Record<string, unknown>;

// Relay's live overworld rows use dimension 1. Keep this local because this
// module is compiled into the isolated provider runtime.
const MAP_OVERWORLD_DIMENSION = "1";
const MAX_IDS_PER_DETAIL_QUERY = 100;
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

function equalityQuery(table: string, column: string, values: string[]): string | null {
  const ids = [...new Set(values.map((value) => decimal(value, `${table} scope`)))].sort((left, right) => left.length - right.length || left.localeCompare(right));
  return ids.length ? `SELECT * FROM ${table} WHERE ${ids.map((id) => `${column} = ${id}`).join(" OR ")}` : null;
}

function equalityQueries(table: string, column: string, values: string[], maxIdsPerQuery = MAX_IDS_PER_DETAIL_QUERY): string[] {
  const ids = [...new Set(values.map((value) => decimal(value, `${table} scope`)))].sort((left, right) => left.length - right.length || left.localeCompare(right));
  const queries: string[] = [];
  for (let offset = 0; offset < ids.length; offset += maxIdsPerQuery) {
    const query = equalityQuery(table, column, ids.slice(offset, offset + maxIdsPerQuery));
    if (query) queries.push(query);
  }
  return queries;
}

export function mapSpatialBaseQueries(scope: MapSpatialScope): string[] {
  const claimId = decimal(scope.claimId, "Map spatial claim id");
  return [
    `SELECT * FROM bank_state WHERE claim_entity_id = ${claimId}`,
    `SELECT * FROM waystone_state WHERE claim_entity_id = ${claimId}`,
    equalityQuery("resource_state", "resource_id", scope.resourceIds),
    scope.enemyTypes.length ? "SELECT * FROM enemy_state" : null,
  ].filter((query): query is string => Boolean(query));
}

export function mapSpatialDetailQueries({ playerIds, resourceRows, enemyRows }: { playerIds: string[]; resourceRows: unknown[]; enemyRows: unknown[] }): string[] {
  const resourceEntityIds = rows(resourceRows).flatMap((row, index) => {
    try { return [decimal(row.entityId ?? row.entity_id, `Map resource ${index} entity id`)]; } catch { return []; }
  });
  const enemyEntityIds = rows(enemyRows).flatMap((row, index) => {
    try { return [decimal(row.entityId ?? row.entity_id, `Map enemy ${index} entity id`)]; } catch { return []; }
  });
  return [
    ...equalityQueries("location_state", "entity_id", resourceEntityIds),
    ...equalityQueries("mobile_entity_state", "entity_id", [...enemyEntityIds, ...playerIds]),
  ];
}

function coordinateFields(value: unknown, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} coordinates are missing`);
  const point = value as WireRecord;
  return {
    locationX: integer(point.x, `${label} x`),
    locationZ: integer(point.z, `${label} z`),
    dimension: decimal(point.dimension ?? MAP_OVERWORLD_DIMENSION, `${label} dimension`),
  };
}

export function normalizeMapSpatial({
  scope,
  bankRows = [],
  waystoneRows = [],
  resourceRows = [],
  enemyRows = [],
  locationRows = [],
  mobileRows = [],
  observedAt = new Date().toISOString(),
}: {
  scope: MapSpatialScope;
  bankRows?: unknown[];
  waystoneRows?: unknown[];
  resourceRows?: unknown[];
  enemyRows?: unknown[];
  locationRows?: unknown[];
  mobileRows?: unknown[];
  observedAt?: string;
}) {
  const regionId = decimal(scope.regionId, "Map spatial region id");
  const warnings: string[] = [];
  if (scope.enemyTypes.length && !enemyRows.length) warnings.push("No enemies matched the selected types in this region.");
  const locations = new Map<string, WireRecord>();
  for (const [index, row] of rows(locationRows).entries()) {
    try { locations.set(decimal(row.entityId ?? row.entity_id, `Map location ${index} entity id`), row); }
    catch (error) { warnings.push(error instanceof Error ? error.message : String(error)); }
  }
  const mobile = new Map<string, WireRecord>();
  for (const [index, row] of rows(mobileRows).entries()) {
    try { mobile.set(decimal(row.entityId ?? row.entity_id, `Map mobile ${index} entity id`), row); }
    catch (error) { warnings.push(error instanceof Error ? error.message : String(error)); }
  }
  const banks = rows(bankRows).flatMap((row, index) => {
    try {
      const entityId = decimal(row.buildingEntityId ?? row.building_entity_id, `Map bank ${index} entity id`);
      return [{ entityId, claimEntityId: decimal(row.claimEntityId ?? row.claim_entity_id, `Map bank ${entityId} claim id`), regionId, ...coordinateFields(row.coordinates, `Map bank ${entityId}`), observedAt }];
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
      return [];
    }
  });
  const waystones = rows(waystoneRows).flatMap((row, index) => {
    try {
      const entityId = decimal(row.buildingEntityId ?? row.building_entity_id, `Map waystone ${index} entity id`);
      return [{ entityId, claimEntityId: decimal(row.claimEntityId ?? row.claim_entity_id, `Map waystone ${entityId} claim id`), regionId, ...coordinateFields(row.coordinates, `Map waystone ${entityId}`), observedAt }];
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
      return [];
    }
  });
  const resources = rows(resourceRows).flatMap((row, index) => {
    try {
      const entityId = decimal(row.entityId ?? row.entity_id, `Map resource ${index} entity id`);
      const location = locations.get(entityId);
      if (!location) {
        warnings.push(`Map resource ${entityId} has no location_state row.`);
        return [];
      }
      return [{ entityId, resourceId: decimal(row.resourceId ?? row.resource_id, `Map resource ${entityId} type`), regionId, locationX: integer(location.x, `Map resource ${entityId} x`), locationZ: integer(location.z, `Map resource ${entityId} z`), dimension: decimal(location.dimension ?? MAP_OVERWORLD_DIMENSION, `Map resource ${entityId} dimension`), observedAt }];
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
      return [];
    }
  });
  const enemies = rows(enemyRows).flatMap((row, index) => {
    const entityId = decimal(row.entityId ?? row.entity_id, `Map enemy ${index} entity id`);
    const position = mobile.get(entityId);
    if (!position) {
      warnings.push(`Map enemy ${entityId} has no mobile_entity_state row.`);
      return [];
    }
    try {
      return [{ entityId, enemyType: mapEnemyTypeId(row.enemyType ?? row.enemy_type), regionId, locationX: integer(position.locationX ?? position.location_x, `Map enemy ${entityId} x`), locationZ: integer(position.locationZ ?? position.location_z, `Map enemy ${entityId} z`), dimension: decimal(position.dimension ?? MAP_OVERWORLD_DIMENSION, `Map enemy ${entityId} dimension`), observedAt }];
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
      return [];
    }
  });
  const selectedPlayers = new Set(scope.playerIds.map(String));
  const players = [...mobile].filter(([entityId]) => selectedPlayers.has(entityId)).flatMap(([playerEntityId, position]) => {
    try {
      return [{ playerEntityId, regionId, locationX: integer(position.locationX ?? position.location_x, `Map player ${playerEntityId} x`), locationZ: integer(position.locationZ ?? position.location_z, `Map player ${playerEntityId} z`), dimension: decimal(position.dimension ?? MAP_OVERWORLD_DIMENSION, `Map player ${playerEntityId} dimension`), observedAt }];
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
      return [];
    }
  });
  return { data: { regionId, players, resources, enemies, banks, waystones }, warnings };
}
