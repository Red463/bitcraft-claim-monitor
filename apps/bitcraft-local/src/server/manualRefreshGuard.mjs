export const MANUAL_REFRESH_HEADER = "x-manual-refresh-id";
export const MANUAL_REFRESH_COOLDOWN_MS = 15_000;
export const MANUAL_REFRESH_MAX_REQUESTS = 40;

const REFRESH_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ordinaryDecision() {
  return { allowed: true, forceRefresh: false, retryAfterSeconds: 0, reason: "ordinary" };
}

function rejectedDecision(reason, retryAfterSeconds = 0) {
  return { allowed: false, forceRefresh: false, retryAfterSeconds, reason };
}

export function createManualRefreshGuard(options = {}) {
  const cooldownMs = Math.max(1_000, Number(options.cooldownMs ?? MANUAL_REFRESH_COOLDOWN_MS));
  const maxRequests = Math.max(1, Math.floor(Number(options.maxRequests ?? MANUAL_REFRESH_MAX_REQUESTS)));
  const now = options.now ?? Date.now;
  const windows = new Map();

  function authorize(clientKey, refreshId) {
    const id = String(refreshId ?? "").trim();
    if (!id) return ordinaryDecision();
    if (!REFRESH_ID_PATTERN.test(id)) return rejectedDecision("invalid-id");

    const checkedAt = now();
    for (const [key, entry] of windows) {
      if (entry.expiresAt <= checkedAt) windows.delete(key);
    }

    const key = String(clientKey ?? "").trim() || "unknown";
    const current = windows.get(key);
    if (!current) {
      windows.set(key, {
        refreshId: id,
        startedAt: checkedAt,
        expiresAt: checkedAt + cooldownMs,
        requestCount: 1,
      });
      return { allowed: true, forceRefresh: true, retryAfterSeconds: 0, reason: "accepted" };
    }

    const retryAfterSeconds = Math.max(1, Math.ceil((current.expiresAt - checkedAt) / 1_000));
    if (current.refreshId !== id) return rejectedDecision("cooldown", retryAfterSeconds);
    if (current.requestCount >= maxRequests) return rejectedDecision("fanout-limit", retryAfterSeconds);

    current.requestCount += 1;
    return { allowed: true, forceRefresh: true, retryAfterSeconds: 0, reason: "fanout" };
  }

  return { authorize };
}
