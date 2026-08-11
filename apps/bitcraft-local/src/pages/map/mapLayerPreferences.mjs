export const MAP_LAYER_PREFERENCE_KEY = "bitcraft-map-layers:v1";
const UNVERIFIED_COORDINATES = "Unavailable — awaiting verified Relay coordinates";

export const MAP_LAYER_DEFINITIONS = Object.freeze([
  { key: "terrain", label: "Terrain", defaultVisible: true, dataLayer: null, control: "tile:terrain", available: true, unavailableReason: null, selectionRequired: false },
  { key: "water", label: "Water", defaultVisible: true, dataLayer: null, control: "tile:water", available: true, unavailableReason: null, selectionRequired: false },
  { key: "claims", label: "Claims", defaultVisible: true, dataLayer: "claims", control: "markers:claims", available: true, unavailableReason: null, selectionRequired: false },
  { key: "markets", label: "Markets", defaultVisible: true, dataLayer: "markets", control: "markers:markets", available: true, unavailableReason: null, selectionRequired: false },
  { key: "waystones", label: "Waystones", defaultVisible: true, dataLayer: "waystones", control: "markers:waystones", available: true, unavailableReason: null, selectionRequired: false },
  { key: "empire-settlements", label: "Empire settlements", defaultVisible: true, dataLayer: "empire-settlements", control: "markers:empire-settlements", available: true, unavailableReason: null, selectionRequired: false },
  { key: "watchtowers", label: "Watchtowers", defaultVisible: true, dataLayer: "watchtowers", control: "markers:watchtowers", available: true, unavailableReason: null, selectionRequired: false },
  { key: "players", label: "Players", defaultVisible: true, dataLayer: "players", control: "markers:players", available: true, unavailableReason: null, selectionRequired: false },
  { key: "resources", label: "Resources", defaultVisible: true, dataLayer: "resources", control: "dense:resources", available: true, unavailableReason: null, selectionRequired: true },
  { key: "enemies", label: "Enemies", defaultVisible: true, dataLayer: "enemies", control: "dense:enemies", available: true, unavailableReason: null, selectionRequired: true },
  { key: "roads", label: "Roads", defaultVisible: false, dataLayer: "roads", control: "geometry:roads", available: false, unavailableReason: UNVERIFIED_COORDINATES, selectionRequired: false },
  { key: "claim-areas", label: "Claim areas", defaultVisible: false, dataLayer: "claim-areas", control: "geometry:claim-areas", available: false, unavailableReason: UNVERIFIED_COORDINATES, selectionRequired: false },
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

export function loadMapLayerVisibility(getStorage) {
  try {
    return parseMapLayerVisibility(getStorage()?.getItem(MAP_LAYER_PREFERENCE_KEY));
  } catch {
    return defaultMapLayerVisibility();
  }
}

export function saveMapLayerVisibility(getStorage, value) {
  try {
    getStorage()?.setItem(MAP_LAYER_PREFERENCE_KEY, serializeMapLayerVisibility(value));
    return true;
  } catch {
    return false;
  }
}
