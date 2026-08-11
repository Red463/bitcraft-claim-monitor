export const MAP_LAYER_PREFERENCE_KEY = "bitcraft-map-layers:v1";

export const MAP_LAYER_DEFINITIONS = Object.freeze([
  { key: "terrain", label: "Terrain", defaultVisible: true, dataLayer: null },
  { key: "water", label: "Water", defaultVisible: true, dataLayer: null },
  { key: "claims", label: "Claims", defaultVisible: true, dataLayer: "claims" },
  { key: "markets", label: "Markets", defaultVisible: true, dataLayer: "markets" },
  { key: "waystones", label: "Waystones", defaultVisible: true, dataLayer: "waystones" },
  { key: "empire-settlements", label: "Empire settlements", defaultVisible: true, dataLayer: "empire-settlements" },
  { key: "watchtowers", label: "Watchtowers", defaultVisible: true, dataLayer: "watchtowers" },
  { key: "players", label: "Players", defaultVisible: true, dataLayer: "players" },
  { key: "resources", label: "Resources", defaultVisible: true, dataLayer: "resources" },
  { key: "enemies", label: "Enemies", defaultVisible: true, dataLayer: "enemies" },
  { key: "roads", label: "Roads", defaultVisible: false, dataLayer: "roads" },
  { key: "claim-areas", label: "Claim areas", defaultVisible: false, dataLayer: "claim-areas" },
].map(Object.freeze));

export function defaultMapLayerVisibility() {
  return Object.fromEntries(MAP_LAYER_DEFINITIONS.map(({ key, defaultVisible }) => [key, defaultVisible]));
}

export function parseMapLayerVisibility(raw) {
  const result = defaultMapLayerVisibility();
  let value;
  try {
    value = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return result;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  for (const { key } of MAP_LAYER_DEFINITIONS) if (typeof value[key] === "boolean") result[key] = value[key];
  return result;
}

export function serializeMapLayerVisibility(value) {
  const normalized = parseMapLayerVisibility(value);
  return JSON.stringify(Object.fromEntries(MAP_LAYER_DEFINITIONS.map(({ key }) => [key, normalized[key]])));
}
