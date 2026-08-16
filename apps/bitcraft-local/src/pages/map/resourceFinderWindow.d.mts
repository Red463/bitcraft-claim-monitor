export const RESOURCE_FINDER_BATCH_SIZE: 80;

export function visibleResourceMatches<T>(matches: readonly T[], limit?: number): T[];

export function nextResourceLimit(current: number, total: number): number;
