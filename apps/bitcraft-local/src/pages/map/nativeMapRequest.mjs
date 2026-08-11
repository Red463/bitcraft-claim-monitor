const OPERATIONAL_LAYERS = [
  "banks",
  "claims",
  "empire-settlements",
  "empire-territory",
  "markets",
  "watchtowers",
  "waystones",
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
  const params = new URLSearchParams({ regions: regions.join(","), layers: layers.join(",") });
  if (players.length) params.set("playerIds", players.join(","));
  if (resources.length) params.set("resourceIds", resources.join(","));
  if (enemies.length) params.set("enemyTypes", enemies.join(","));
  return {
    layers,
    snapshotUrl: `/api/local/map/snapshot?${params}`,
    eventsUrl: `/api/local/map/events?${params}`,
  };
}
