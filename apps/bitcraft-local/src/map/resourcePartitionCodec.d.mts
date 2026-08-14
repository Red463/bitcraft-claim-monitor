export type ResourcePartitionIdentity = {
  regionId: string;
  resourceId: string;
  dimension: "1";
  generation: string;
};

export type DecodedResourcePartition = ResourcePartitionIdentity & {
  coordinates: Uint32Array;
  pointCount: number;
};

export function packResourceCoordinate(x: number, z: number): number;
export function unpackResourceCoordinate(value: number): { x: number; z: number };
export function normalizePackedCoordinates(values: Iterable<number>): Uint32Array;
export function mergePackedCoordinateDelta(
  current: Uint32Array,
  additions: Uint32Array,
  removals: Uint32Array,
): Uint32Array;
export function encodeResourcePartition(
  input: ResourcePartitionIdentity & { coordinates: Uint32Array },
): Uint8Array;
export function decodeResourcePartition(
  bytes: ArrayBuffer | ArrayBufferView,
  expected?: Partial<ResourcePartitionIdentity>,
): DecodedResourcePartition;

export const RESOURCE_PARTITION_HEADER_BYTES: 44;
export const RESOURCE_PARTITION_VERSION: 1;
