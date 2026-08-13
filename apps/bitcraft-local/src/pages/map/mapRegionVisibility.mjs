export function mapFeatureInRegionScope(feature, selectedRegionIds = []) {
  if (String(feature?.kind ?? "") === "player") return true;
  const selected = new Set(selectedRegionIds.filter((value) => /^(?:0|[1-9]\d*)$/.test(value)));
  if (!selected.size) return true;
  return selected.has(String(feature?.regionId ?? ""));
}

export function mapFeaturesInRegionScope(features, selectedRegionIds = []) {
  return features.filter((feature) => mapFeatureInRegionScope(feature, selectedRegionIds));
}
