import { toNumber, type AnyRecord } from "../../main-app-data.ts";

export type MapFocus = { name: string; locationX: number; locationZ: number } | null;

export const MAP_DEFAULT_LAYERS = ["roadsLayer", "towersLayer", ...Array.from({ length: 11 }, (_, tier) => `claimT${tier}Layer`)];

export function bitcraftMapUrl(
  playerIds: string[],
  mapMarker: MapFocus,
  flyTo = false,
  resourceIds: string[] = [],
  regionIds: string[] = [],
  enemyIds: string[] = [],
): string {
  const params = new URLSearchParams();
  const sortedPlayers = playerIds.filter(Boolean).sort();
  const sortedResources = resourceIds.filter(Boolean).sort((a, b) => toNumber(a) - toNumber(b));
  const sortedEnemies = enemyIds.filter(Boolean).sort((a, b) => toNumber(a) - toNumber(b));
  const sortedRegions = regionIds.filter(Boolean).sort((a, b) => toNumber(a) - toNumber(b));
  if (sortedPlayers.length) params.set("playerId", sortedPlayers.join(","));
  if (sortedResources.length) params.set("resourceId", sortedResources.join(","));
  if (sortedEnemies.length) params.set("enemyId", sortedEnemies.join(","));
  if (sortedRegions.length) params.set("regionId", sortedRegions.join(","));
  const queryString = params.toString().replaceAll("%2C", ",");
  const query = queryString ? `?${queryString}` : "";
  const waypoint = mapMarker ? {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: {
        popupText: mapMarker.name,
        iconName: "waypoint",
        turnLayerOn: MAP_DEFAULT_LAYERS,
        ...(flyTo ? { flyTo: [mapMarker.locationZ, mapMarker.locationX], zoomTo: 2 } : { noPan: true }),
      },
      geometry: { type: "Point", coordinates: [mapMarker.locationX, mapMarker.locationZ] },
    }],
  } : null;
  return `https://bitcraftmap.com/${query}${waypoint ? `#${encodeURIComponent(JSON.stringify(waypoint))}` : ""}`;
}

export function parseBitcraftMapUrl(url: string): AnyRecord {
  try {
    const parsed = new URL(url);
    return {
      playerId: parsed.searchParams.get("playerId") ?? "",
      resourceId: parsed.searchParams.get("resourceId") ?? "",
      enemyId: parsed.searchParams.get("enemyId") ?? "",
      regionId: parsed.searchParams.get("regionId") ?? "",
      hasWaypoint: Boolean(parsed.hash),
    };
  } catch {
    return {};
  }
}

export function mapResourceToken(entry: AnyRecord): string {
  const kind = String(entry.mapKind ?? "resource");
  return kind === "enemy" ? `enemy:${entry.mapId ?? entry.enemyType ?? entry.id}` : `resource:${entry.mapId ?? entry.id}`;
}

export function normalizeMapResourceToken(token: string): string {
  const value = String(token ?? "").trim();
  if (!value) return "";
  return value.includes(":") ? value : `resource:${value}`;
}

export function mapResourceCategory(resource: AnyRecord): string {
  return String(resource.tag ?? resource.category ?? resource.resourceType ?? resource.type ?? "").trim();
}