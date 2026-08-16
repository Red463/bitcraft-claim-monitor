function generationMax(left, right) {
  const values = [left, right].map((value) => String(value ?? "0")).filter((value) => /^\d+$/.test(value));
  return values.reduce((largest, value) => BigInt(value) > BigInt(largest) ? value : largest, "0");
}

function resourceFeature(row) {
  if (!Array.isArray(row) || row.length !== 5) return null;
  const [entityId, regionId, resourceId, x, z] = row;
  if (![entityId, regionId, resourceId].every((value) => /^\d+$/.test(String(value)))) return null;
  if (![x, z].every((value) => Number.isSafeInteger(value))) return null;
  return {
    kind: "resource",
    entityId: String(entityId),
    regionId: String(regionId),
    resourceId: String(resourceId),
    identity: `resource:${resourceId}`,
    point: { x, z, dimension: "1", coordinateSpace: "map-xz" },
  };
}

export function mapResourceFeatures(rows) {
  return (Array.isArray(rows) ? rows : []).map(resourceFeature).filter(Boolean);
}

function combinedFreshness(base, resources) {
  if (base === "live" && resources === "live") return "live";
  if (base === "stale" && resources === "stale") return "stale";
  if (base === "unavailable" && resources === "unavailable") return "unavailable";
  return "partial";
}

export function mergeMapResourcePayload(snapshot, payload) {
  const resources = mapResourceFeatures(payload?.resources);
  return {
    ...snapshot,
    generation: generationMax(snapshot?.generation, payload?.generation),
    freshness: combinedFreshness(snapshot?.freshness, payload?.freshness),
    warnings: [...new Set([...(snapshot?.warnings ?? []), ...(payload?.warnings ?? [])].map(String))],
    scope: { ...(snapshot?.scope ?? {}), resourceIds: [...(payload?.scope?.resourceIds ?? [])] },
    layers: { ...(snapshot?.layers ?? {}), resources },
    layerAvailability: { ...(snapshot?.layerAvailability ?? {}), resources: payload?.layerAvailability ?? { available: false, status: "unavailable", reason: "Live resource positions are unavailable." } },
  };
}
