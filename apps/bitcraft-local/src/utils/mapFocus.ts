import type { MapFocus } from "../pages/map/mapUtils";
import { toNumber } from "../main-app-data.ts";

export function urlMapFocus(): MapFocus {
  const params = new URLSearchParams(window.location.search);
  const x = params.get("x") ?? params.get("mapX");
  const z = params.get("z") ?? params.get("mapZ");
  if (x == null || z == null) return null;
  return {
    name: params.get("label") ?? params.get("mapName") ?? "Map focus",
    locationX: toNumber(x),
    locationZ: toNumber(z),
    regionId: params.get("regionId") ?? undefined,
  };
}
