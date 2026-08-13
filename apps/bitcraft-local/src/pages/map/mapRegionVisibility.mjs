function selectedMapRegionIds(selectedRegionIds) {
  return new Set(selectedRegionIds.filter((value) => /^(?:0|[1-9]\d*)$/.test(value)));
}

function mapFeatureInSelectedRegionScope(feature, selected) {
  if (String(feature?.kind ?? "") === "player") return true;
  if (!selected.size) return true;
  return selected.has(String(feature?.regionId ?? ""));
}

export function mapFeatureInRegionScope(feature, selectedRegionIds = []) {
  return mapFeatureInSelectedRegionScope(feature, selectedMapRegionIds(selectedRegionIds));
}

export function mapFeaturesInRegionScope(features, selectedRegionIds = []) {
  const selected = selectedMapRegionIds(selectedRegionIds);
  return features.filter((feature) => mapFeatureInSelectedRegionScope(feature, selected));
}
