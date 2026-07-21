function positiveDelay(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

export function parseRetryAfterMs(value, nowMs = Date.now()) {
  const text = String(value ?? "").trim();
  if (!text) return 0;
  const seconds = Number(text);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
  const dateMs = Date.parse(text);
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - Number(nowMs)) : 0;
}

export function withCatalogRefreshTargetContext(error, target = {}) {
  const cause = error instanceof Error ? error : new Error(String(error ?? "Unknown catalogue refresh error"));
  const catalogKey = String(target?.catalogKey ?? `${target?.kind ?? "items"}:${target?.id ?? "unknown"}`);
  const name = String(target?.name ?? "").trim();
  const contextual = new Error(`Catalogue target ${catalogKey}${name ? ` (${name})` : ""}: ${cause.message}`, { cause });
  if (Number.isFinite(Number(cause.statusCode))) contextual.statusCode = Number(cause.statusCode);
  if (Number.isFinite(Number(cause.retryAfterMs))) contextual.retryAfterMs = Number(cause.retryAfterMs);
  return contextual;
}

export function classifyCatalogRefreshError(error, { attemptNumber = 1, retryDelaysMs = [15_000, 60_000, 300_000] } = {}) {
  const statusCode = Number(error?.statusCode ?? 0);
  const message = String(error?.message ?? error ?? "").toLowerCase();
  const attempt = Math.max(1, Math.floor(Number(attemptNumber) || 1));
  const transient = statusCode === 408
    || statusCode === 425
    || statusCode === 429
    || statusCode >= 500
    || message.includes("timed out")
    || message.includes("network request failed")
    || message.includes("http 429")
    || /http 5\d\d/.test(message);

  if (transient) {
    if (attempt >= 3) return { action: "skip", delayMs: 0, reason: "retry_exhausted" };
    const configuredDelay = positiveDelay(retryDelaysMs[Math.min(attempt - 1, retryDelaysMs.length - 1)], 15_000);
    const retryAfterMs = positiveDelay(error?.retryAfterMs);
    return {
      action: "retry",
      delayMs: retryAfterMs || (statusCode === 429 || message.includes("http 429") ? Math.max(60_000, configuredDelay) : configuredDelay),
      reason: statusCode === 429 || message.includes("http 429") ? "rate_limit" : "upstream",
    };
  }

  if (statusCode >= 400 && statusCode < 500) return { action: "skip", delayMs: 0, reason: "permanent_upstream" };
  return { action: "stop", delayMs: 0, reason: "local_error" };
}
