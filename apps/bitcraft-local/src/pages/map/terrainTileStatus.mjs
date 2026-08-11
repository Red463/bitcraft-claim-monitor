const STATUS_URL = "/api/local/map/tiles/status";

function validStatus(value) {
  if (!value || typeof value !== "object" || value.provider !== "relay" || typeof value.available !== "boolean") return false;
  if (value.available && !/^\d+$/.test(String(value.generation ?? ""))) return false;
  if (!Array.isArray(value.warnings)) return false;
  return true;
}

export async function loadTerrainTileStatus(signal) {
  const response = await fetch(STATUS_URL, { signal, credentials: "same-origin" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error || `Terrain status HTTP ${response.status}`);
  if (!validStatus(payload)) throw new TypeError("Terrain status response is invalid");
  return payload;
}

export function mapTileUrl(style, generation) {
  if (style !== "terrain" && style !== "water" && style !== "roads") throw new TypeError("Map tile style must be terrain, water, or roads");
  const normalized = String(generation ?? "");
  if (!/^\d+$/.test(normalized)) throw new TypeError("Terrain tile generation must be a decimal integer");
  return `/api/local/map/tiles/${style}/{z}/{x}/{y}.webp?generation=${encodeURIComponent(normalized)}`;
}

export function terrainTileUrl(generation) {
  return mapTileUrl("terrain", generation);
}
