const DECIMAL_ID = /^\d+$/;
const MOBILE_SCALE = 1_000;
const WORLD_MAX = 38_400;

function playerId(value, label) {
  const normalized = String(value ?? "").trim();
  if (!DECIMAL_ID.test(normalized)) throw new TypeError(`${label} must be a decimal entity id`);
  return normalized;
}

function mobileCoordinate(value, label) {
  if (!Number.isSafeInteger(value)) throw new TypeError(`${label} must be a safe integer`);
  if (value < 0 || value > WORLD_MAX * MOBILE_SCALE) throw new RangeError(`${label} is outside verified world bounds`);
  return value;
}

export function summarizeMapPlayerEvidence({ requestedPlayerIds = [], players = [] } = {}) {
  const requested = [...new Set(requestedPlayerIds.map((value) => playerId(value, "Requested player id")))];
  const byId = new Map(players.map((row) => [playerId(row.playerEntityId, "Matched player id"), row]));
  const evidence = requested.map((id) => {
    const row = byId.get(id);
    if (!row) throw new Error(`Requested player ${id} has no direct mobile_entity_state match`);
    const dimension = String(row.dimension ?? "");
    if (dimension !== "1") throw new Error(`Player ${id} dimension ${dimension || "missing"} is not overworld dimension 1`);
    const x = mobileCoordinate(row.locationX, `Player ${id} X`);
    const z = mobileCoordinate(row.locationZ, `Player ${id} Z`);
    return {
      playerEntityId: id,
      raw: { x, z, dimension },
      map: { x: x / MOBILE_SCALE, z: z / MOBILE_SCALE },
    };
  });
  const coordinates = evidence.map(({ map }) => map);
  return {
    requestedPlayerCount: requested.length,
    matchedPlayerCount: evidence.length,
    bounds: coordinates.length ? {
      minX: Math.min(...coordinates.map(({ x }) => x)),
      minZ: Math.min(...coordinates.map(({ z }) => z)),
      maxX: Math.max(...coordinates.map(({ x }) => x)),
      maxZ: Math.max(...coordinates.map(({ z }) => z)),
    } : null,
    players: evidence,
  };
}
