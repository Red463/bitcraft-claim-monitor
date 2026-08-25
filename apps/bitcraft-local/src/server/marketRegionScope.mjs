function decimalRegionIds(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value ?? "").trim())
    .filter((value) => /^\d+$/.test(value)))]
    .sort((left, right) => (
      BigInt(left) < BigInt(right) ? -1 : BigInt(left) > BigInt(right) ? 1 : 0
    ));
}

export function readyMarketRegionIds(providerHealth, fallbackRegionIds = []) {
  const sources = providerHealth?.sources && typeof providerHealth.sources === "object"
    ? providerHealth.sources
    : {};
  const readyRegionIds = Object.entries(sources)
    .filter(([sourceKey, source]) => (
      /^region:\d+$/.test(sourceKey)
      && source?.ready === true
    ))
    .map(([sourceKey]) => sourceKey.slice("region:".length));
  return decimalRegionIds(readyRegionIds.length ? readyRegionIds : fallbackRegionIds);
}
