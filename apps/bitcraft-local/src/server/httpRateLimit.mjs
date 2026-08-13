export const RATE_LIMITS = {
  auth: { windowMs: 15 * 60 * 1000, max: 30 },
  analytics: { windowMs: 60 * 1000, max: 120 },
  discordInteraction: { windowMs: 60 * 1000, max: 120 },
  proxy: { windowMs: 60 * 1000, max: 600 },
  expensiveLocal: { windowMs: 60 * 1000, max: 60 },
  mapSnapshot: { windowMs: 60 * 1000, max: 600 },
  mapEvents: { windowMs: 60 * 1000, max: 300 },
};

export function requestAddress(req) {
  return String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "").split(",")[0].trim();
}

export function createRateLimiter({ buckets = new Map(), sendJson, now = () => Date.now(), addressForRequest = requestAddress } = {}) {
  return function rateLimit(req, res, name, policy = RATE_LIMITS.expensiveLocal) {
    const currentTime = now();
    const key = `${name}:${addressForRequest(req) || "unknown"}`;
    const current = buckets.get(key);
    const bucket = current && current.resetAt > currentTime ? current : { count: 0, resetAt: currentTime + policy.windowMs };
    bucket.count += 1;
    buckets.set(key, bucket);
    if (bucket.count <= policy.max) return true;
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - currentTime) / 1000));
    sendJson(res, 429, {
      error: "Too many requests. Please slow down and try again shortly.",
      source: "local-rate-limit",
      retryAfter,
    }, { "retry-after": String(retryAfter), "x-rate-limit-source": "local" });
    return false;
  };
}
