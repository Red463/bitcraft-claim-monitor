function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function decimal(value) {
  const text = String(value ?? "").trim();
  return /^\d+$/.test(text) ? BigInt(text).toString() : null;
}

function decimalList(values) {
  return [...new Set((values ?? []).map(decimal).filter(Boolean))]
    .sort((left, right) => left.length - right.length || left.localeCompare(right));
}

function regionNames(snapshot) {
  const data = record(record(snapshot).data);
  return new Map((Array.isArray(data.regions) ? data.regions : []).flatMap((row) => {
    const value = record(row);
    const regionId = decimal(value.regionId ?? value.region_id);
    if (!regionId) return [];
    const regionName = String(value.regionName ?? value.region_name ?? "").trim();
    return regionName ? [[regionId, regionName]] : [];
  }));
}

export function nameMapResourceRegionCatalog({ catalog, regionSnapshot } = {}) {
  const names = regionNames(regionSnapshot);
  const value = record(catalog);
  return {
    ...value,
    regions: (Array.isArray(value.regions) ? value.regions : []).map((region) => {
      const row = record(region);
      const regionId = decimal(row.regionId);
      if (!regionId) return row;
      return { ...row, regionId, regionName: names.get(regionId) ?? String(row.regionName ?? `Region ${regionId}`) };
    }),
  };
}

export function mapResourceRegionCatalog({ providerHealth, regionSnapshot, fallbackRegionIds = [], generatedAt } = {}) {
  const sources = record(record(providerHealth).sources);
  const topologyEntries = Object.entries(sources).filter(([key]) => /^region:\d+$/.test(key));
  const topologyKnown = topologyEntries.length > 0;
  const readyRegionIds = decimalList(topologyEntries.flatMap(([key, source]) => {
    const health = record(source);
    return health.ready === true && String(health.schemaFingerprint ?? "").trim()
      ? [key.slice("region:".length)]
      : [];
  }));
  const regionIds = topologyKnown ? readyRegionIds : decimalList(fallbackRegionIds);
  const names = regionNames(regionSnapshot);
  const provenance = record(record(regionSnapshot).provenance);
  const observedAt = String(generatedAt ?? provenance.receivedAt ?? "").trim() || null;
  const freshness = regionIds.length ? (topologyKnown ? "live" : "stale") : "unavailable";
  const warnings = topologyKnown
    ? (regionIds.length ? [] : ["No Relay regional source is currently schema-ready."])
    : ["Relay topology readiness is unavailable; showing configured fallback regions."];
  return {
    provider: "relay",
    generatedAt: observedAt,
    freshness,
    warnings,
    regionIds,
    regions: regionIds.map((regionId) => ({
      regionId,
      regionName: names.get(regionId) ?? `Region ${regionId}`,
      relayReady: true,
      freshness: topologyKnown ? "live" : "stale",
    })),
  };
}
