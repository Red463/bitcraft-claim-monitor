const OPERATIONAL_LAYERS = [
  "claims",
  "watchtowers",
  "claim-areas",
];

function decimalSort(values) {
  return [...new Set((values ?? []).map(String).filter((value) => /^\d+$/.test(value)))]
    .sort((left, right) => left.length - right.length || left.localeCompare(right));
}

export function boundedNativeMapRegions(selectedRegionIds = [], availableRegionIds = [], limit = 4) {
  const available = decimalSort(availableRegionIds);
  const allowed = new Set(available);
  const selected = decimalSort(selectedRegionIds).filter((regionId) => allowed.has(regionId));
  return (selected.length ? selected : available).slice(0, limit);
}

export function nativeMapRequest({ regionIds = [], playerIds = [], resourceIds = [], enemyTypes = [] }) {
  const regions = decimalSort(regionIds);
  const players = decimalSort(playerIds);
  const resources = decimalSort(resourceIds);
  const enemies = decimalSort(enemyTypes);
  const layers = [
    ...OPERATIONAL_LAYERS,
    ...(players.length ? ["players"] : []),
    ...(resources.length ? ["resources"] : []),
    ...(enemies.length ? ["enemies"] : []),
  ].sort();
  const snapshotLayers = layers.filter((layer) => layer !== "resources");
  const snapshotParams = new URLSearchParams({ regions: regions.join(","), layers: snapshotLayers.join(",") });
  if (players.length) snapshotParams.set("playerIds", players.join(","));
  if (enemies.length) snapshotParams.set("enemyTypes", enemies.join(","));
  const eventParams = new URLSearchParams(snapshotParams);
  if (resources.length) {
    eventParams.set("layers", layers.join(","));
    eventParams.set("resourceIds", resources.join(","));
  }
  const resourceParams = resources.length
    ? new URLSearchParams({ regions: regions.join(","), layers: "resources", resourceIds: resources.join(",") })
    : null;
  return {
    layers,
    snapshotUrl: `/api/local/map/snapshot?${snapshotParams}`,
    resourceUrl: resourceParams ? `/api/local/map/resources?${resourceParams}` : null,
    eventsUrl: `/api/local/map/events?${eventParams}`,
  };
}
