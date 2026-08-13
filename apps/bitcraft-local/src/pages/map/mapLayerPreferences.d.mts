export type MapLayerKey = "claims" | "claim-areas" | "roads" | "watchtowers" | "players" | "resources" | "enemies";
export type MapLayerVisibility = Record<MapLayerKey, boolean>;
export type MapLayerDefinition = Readonly<{
  key: MapLayerKey;
  label: string;
  defaultVisible: boolean;
  dataLayer: string | null;
  control: string;
  available: boolean;
  unavailableReason: string | null;
  selectionRequired: boolean;
}>;

export const MAP_LAYER_PREFERENCE_KEY: "bitcraft-map-layers:v2";
export const MAP_LAYER_DEFINITIONS: ReadonlyArray<MapLayerDefinition>;
export function defaultMapLayerVisibility(): MapLayerVisibility;
export function parseMapLayerVisibility(raw: unknown): MapLayerVisibility;
export function serializeMapLayerVisibility(value: unknown): string;
export function loadMapLayerVisibility(getStorage: () => Pick<Storage, "getItem"> | null): MapLayerVisibility;
export function saveMapLayerVisibility(getStorage: () => Pick<Storage, "setItem"> | null, value: unknown): boolean;
