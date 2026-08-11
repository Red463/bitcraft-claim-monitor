export type NativeMapRequestInput = { regionIds?: string[]; playerIds?: string[]; resourceIds?: string[]; enemyTypes?: string[] };
export function nativeMapRequest(input: NativeMapRequestInput): { layers: string[]; snapshotUrl: string; eventsUrl: string };
