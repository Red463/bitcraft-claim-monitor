export type MapToolId = "layers" | "biomes" | "players" | "resources";

export function nextMapTool(
  active: MapToolId | null,
  requested: MapToolId,
): MapToolId | null;
