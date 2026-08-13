export type NativeMapRequestInput = { operationalRegionIds?: string[]; resourceRegionIds?: string[]; playerIds?: string[]; resourceIds?: string[]; enemyTypes?: string[] };
export function boundedNativeMapRegions(selectedRegionIds?: string[], availableRegionIds?: string[], limit?: number): string[];
export function nativeMapResourceRegions(selectedRegionIds?: string[], availableRegionIds?: string[]): string[];
export function normalizeNativeMapRegionSelection(selectedRegionIds?: string[], availableRegionIds?: string[]): string[];
export function nativeMapRequest(input: NativeMapRequestInput): {
  layers: string[];
  snapshotUrl: string;
  eventsUrl: string;
  resourcePartitions: Array<{ key: string; regionId: string; resourceId: string; url: string }>;
  resourceEventUrl: string | null;
};
