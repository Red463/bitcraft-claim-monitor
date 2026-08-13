export const RESOURCE_FINDER_BATCH_SIZE = 80;

export function visibleResourceMatches(matches, limit = RESOURCE_FINDER_BATCH_SIZE) {
  return matches.slice(0, Math.max(0, Math.min(Number(limit) || 0, matches.length)));
}

export function nextResourceLimit(current, total) {
  const boundedTotal = Math.max(0, Number(total) || 0);
  return Math.min(
    boundedTotal,
    Math.max(RESOURCE_FINDER_BATCH_SIZE, Number(current) || 0) + RESOURCE_FINDER_BATCH_SIZE,
  );
}
