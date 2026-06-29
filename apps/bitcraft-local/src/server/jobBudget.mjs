function positiveInteger(value, fallback, { round = Math.round } = {}) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.max(1, round(number)) : fallback;
}

export function normalizeJobBudget(value = {}, defaults = {}) {
  return {
    maxRuntimeMs: positiveInteger(value.maxRuntimeMs, positiveInteger(defaults.maxRuntimeMs, 5000)),
    batchSize: positiveInteger(value.batchSize, positiveInteger(defaults.batchSize, 25), { round: Math.floor }),
  };
}

export function selectResumeBatch(items, { cursor = null, batchSize = 25, getKey = (value) => value } = {}) {
  const source = Array.isArray(items) ? items : [];
  const limit = normalizeJobBudget({ batchSize }).batchSize;
  const cursorText = cursor == null ? "" : String(cursor);
  const cursorIndex = cursorText ? source.findIndex((item) => String(getKey(item)) === cursorText) : -1;
  const startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;
  const batch = source.slice(startIndex, startIndex + limit);
  const complete = startIndex + batch.length >= source.length;
  return {
    items: batch,
    startIndex,
    startedAfterCursor: cursorIndex >= 0,
    nextCursor: complete || !batch.length ? null : String(getKey(batch[batch.length - 1])),
    complete,
  };
}

export function jobBudgetAllowsMore(startedAtMs, budget, processedCount = 0, now = () => Date.now()) {
  const normalized = normalizeJobBudget(budget);
  if (processedCount >= normalized.batchSize) return false;
  return Number(now()) - Number(startedAtMs) <= normalized.maxRuntimeMs;
}