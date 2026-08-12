export type CompactResourceRow = [entityId: string, regionId: string, resourceId: string, x: number, z: number];
export type ResourcePartitionPlan = { key: string; regionId: string; resourceId: string };
export type ResourcePartition = ResourcePartitionPlan & {
  generation: string;
  rows: readonly CompactResourceRow[];
  warnings: readonly string[];
  freshness: string;
};
export function resourcePartitionKey(regionId: string, resourceId: string): string;
export function resourcePartitionPlan(regionIds?: string[], resourceIds?: string[]): ResourcePartitionPlan[];
export function replaceResourcePartition(state: Map<string, ResourcePartition>, partition: Partial<ResourcePartition> & Pick<ResourcePartition, "key" | "generation" | "rows">): Map<string, ResourcePartition>;
export function retainResourcePartitions(state: Map<string, ResourcePartition>, wantedKeys?: string[]): Map<string, ResourcePartition>;
export function resourceRowsFromPartitions(state: Map<string, ResourcePartition>): CompactResourceRow[];
