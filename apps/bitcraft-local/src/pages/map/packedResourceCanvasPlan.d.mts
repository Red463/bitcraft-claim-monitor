import type { BrowserResourcePartition } from "./mapResourceBinaryState.mjs";

export type PackedResourceDrawPartition = {
  partition: BrowserResourcePartition;
  coordinates: Uint32Array;
  startIndex: number;
  endIndex: number;
};
export type PackedResourceViewport = { minX: number; minZ: number; maxX: number; maxZ: number };
export type PackedResourceSample = { key: string; regionId: string; resourceId: string; x: number; z: number };

export function planPackedResourceDraw(
  partitions: ReadonlyMap<string, BrowserResourcePartition>,
  regionIds?: readonly string[],
  budget?: number,
  viewport?: PackedResourceViewport,
): { partitions: PackedResourceDrawPartition[]; pointCount: number; stride: number; viewport?: PackedResourceViewport | null };
export function packedResourcePointCount(partitions: ReadonlyMap<string, BrowserResourcePartition>, regionIds?: readonly string[]): number;
export function packedResourceBounds(partitions: ReadonlyMap<string, BrowserResourcePartition>, regionIds?: readonly string[]): { minX: number; minZ: number; maxX: number; maxZ: number } | null;
export function packedResourceSamples(partitions: ReadonlyMap<string, BrowserResourcePartition>, regionIds?: readonly string[], limit?: number): PackedResourceSample[];
export function packedResourceSome(partitions: ReadonlyMap<string, BrowserResourcePartition>, regionIds: readonly string[] | undefined, predicate: (sample: PackedResourceSample) => boolean): boolean;
