const STATUS_URL = "/api/local/map/tiles/status";

function validStatus(value) {
  if (!value || typeof value !== "object" || value.provider !== "relay" || typeof value.available !== "boolean") return false;
  if (value.available && !/^\d+$/.test(String(value.generation ?? ""))) return false;
  if (!Array.isArray(value.warnings)) return false;
  if (!Array.isArray(value.waterTypes) || !value.waterTypes.every((waterType) => ["lake", "river", "ocean", "ocean-biome", "swamp"].includes(waterType))) return false;
  if (!Array.isArray(value.biomes) || !value.biomes.every((biome) => biome
    && Number.isInteger(biome.biomeType) && biome.biomeType >= 0 && biome.biomeType <= 255
    && typeof biome.name === "string" && biome.name.trim()
    && typeof biome.description === "string" && typeof biome.hazardLevel === "string"
    && typeof biome.disallowPlayerBuild === "boolean" && typeof biome.present === "boolean")) return false;
  if (!value.channels || !["terrain", "water", "biomeMasks"].every((key) => {
    const channel = value.channels[key];
    return channel && Number.isFinite(channel.tileCount) && channel.tileCount >= 0 && Number.isFinite(channel.totalBytes) && channel.totalBytes >= 0;
  })) return false;
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

export function biomeTileUrl(biomeType, generation) {
  const normalizedType = Number(biomeType);
  if (!Number.isInteger(normalizedType) || normalizedType < 0 || normalizedType > 255) throw new TypeError("Biome type must be an integer between 0 and 255");
  const normalizedGeneration = String(generation ?? "");
  if (!/^\d+$/.test(normalizedGeneration)) throw new TypeError("Terrain tile generation must be a decimal integer");
  return `/api/local/map/tiles/biome-${normalizedType}/{z}/{x}/{y}.webp?generation=${encodeURIComponent(normalizedGeneration)}`;
}
