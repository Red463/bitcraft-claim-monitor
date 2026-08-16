export function mapFeatureInRegionScope(feature: { kind?: unknown; regionId?: unknown }, selectedRegionIds?: string[]): boolean;
export function mapFeaturesInRegionScope<T extends { kind?: unknown; regionId?: unknown }>(features: readonly T[], selectedRegionIds?: string[]): T[];
