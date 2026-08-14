import type { BrowserResourcePartition } from "./mapResourceBinaryState.mjs";

export type PackedResourceDrawPartition = {
  partition: BrowserResourcePartition;
  coordinates: Uint32Array;
};
export type PackedResourceSample = { key: string; regionId: string; resourceId: string; x: number; z: number };

export function planPackedResourceDraw(
  partitions: ReadonlyMap<string, BrowserResourcePartition>,
  regionIds?: readonly string[],
  budget?: number,
): { partitions: PackedResourceDrawPartition[]; pointCount: number; stride: number };
export function packedResourcePointCount(partitions: ReadonlyMap<string, BrowserResourcePartition>, regionIds?: readonly string[]): number;
export function packedResourceBounds(partitions: ReadonlyMap<string, BrowserResourcePartition>, regionIds?: readonly string[]): { minX: number; minZ: number; maxX: number; maxZ: number } | null;
export function packedResourceSamples(partitions: ReadonlyMap<string, BrowserResourcePartition>, regionIds?: readonly string[], limit?: number): PackedResourceSample[];
export function packedResourceSome(partitions: ReadonlyMap<string, BrowserResourcePartition>, regionIds: readonly string[] | undefined, predicate: (sample: PackedResourceSample) => boolean): boolean;
