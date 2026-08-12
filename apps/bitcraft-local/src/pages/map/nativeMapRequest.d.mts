export type NativeMapRequestInput = { regionIds?: string[]; playerIds?: string[]; resourceIds?: string[]; enemyTypes?: string[] };
export function boundedNativeMapRegions(selectedRegionIds?: string[], availableRegionIds?: string[], limit?: number): string[];
export function nativeMapRequest(input: NativeMapRequestInput): { layers: string[]; snapshotUrl: string; resourceUrl: string | null; eventsUrl: string };
