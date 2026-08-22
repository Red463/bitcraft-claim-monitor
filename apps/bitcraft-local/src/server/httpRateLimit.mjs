export const RATE_LIMITS = {
  auth: { windowMs: 15 * 60 * 1000, max: 30 },
  analytics: { windowMs: 60 * 1000, max: 120 },
  discordInteraction: { windowMs: 60 * 1000, max: 120 },
  proxy: { windowMs: 60 * 1000, max: 600 },
  expensiveLocal: { windowMs: 60 * 1000, max: 60 },
  mapSnapshot: { windowMs: 60 * 1000, max: 600 },
  mapEvents: { windowMs: 60 * 1000, max: 300 },
  gameDataRead: {
    reportOnly: true,
    burst: { windowMs: 10 * 1000, max: 12 },
    sustained: { windowMs: 60 * 1000, max: 90 },
  },
  orderBookRead: {
    reportOnly: true,
    burst: { windowMs: 10 * 1000, max: 25 },
    sustained: { windowMs: 60 * 1000, max: 120 },
  },
  favoriteQuotesRead: {
    reportOnly: true,
    burst: { windowMs: 10 * 1000, max: 8 },
    sustained: { windowMs: 60 * 1000, max: 60 },
  },
};

export const DEFAULT_TRUSTED_PROXY_ADDRESSES = Object.freeze(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export function requestAddress(req, { trustedProxyAddresses = [] } = {}) {
  const peerAddress = String(req?.socket?.remoteAddress ?? "").trim();
  const trustedPeers = new Set([...DEFAULT_TRUSTED_PROXY_ADDRESSES, ...trustedProxyAddresses].map((address) => String(address).trim()).filter(Boolean));
  const forwardedAddress = String(req?.headers?.["x-forwarded-for"] ?? "").split(",")[0].trim();
  return trustedPeers.has(peerAddress) && forwardedAddress ? forwardedAddress : peerAddress;
}

export function createRateLimiter({ buckets = new Map(), sendJson, now = () => Date.now(), addressForRequest = requestAddress, onDecision = () => {}, maxBuckets = 20_000, pruneIntervalMs = 60_000 } = {}) {
  const bucketLimit = Math.max(1, Math.floor(Number(maxBuckets) || 20_000));
  const pruneInterval = Math.max(1, Math.floor(Number(pruneIntervalMs) || 60_000));
  let nextPruneAt = 0;
  let pruned = 0;
  let evicted = 0;

  function pruneExpired(currentTime) {
    if (currentTime < nextPruneAt) return;
    nextPruneAt = currentTime + pruneInterval;
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= currentTime) {
        buckets.delete(key);
        pruned += 1;
      }
    }
  }

  function enforceBucketLimit() {
    while (buckets.size > bucketLimit) {
      const oldestKey = buckets.keys().next().value;
      if (oldestKey === undefined) break;
      buckets.delete(oldestKey);
      evicted += 1;
    }
  }

  function rateLimit(req, res, name, policy = RATE_LIMITS.expensiveLocal) {
    const currentTime = now();
    pruneExpired(currentTime);
    const address = addressForRequest(req) || "unknown";
    const windows = policy.burst && policy.sustained
      ? [["burst", policy.burst], ["sustained", policy.sustained]]
      : [["window", policy]];
    const limited = [];
    for (const [windowName, windowPolicy] of windows) {
      const key = `${name}:${address}:${windowName}`;
      const current = buckets.get(key);
      const bucket = current && current.resetAt > currentTime ? current : { count: 0, resetAt: currentTime + windowPolicy.windowMs };
      bucket.count += 1;
      buckets.set(key, bucket);
      enforceBucketLimit();
      if (bucket.count > windowPolicy.max) limited.push({ windowName, resetAt: bucket.resetAt });
    }
    if (!limited.length) return true;
    const reportOnly = policy.reportOnly === true;
    onDecision({ name, reportOnly, wouldLimit: true, limitedBy: limited.map(({ windowName }) => windowName) });
    if (reportOnly) return true;
    const retryAfter = Math.max(1, ...limited.map(({ resetAt }) => Math.ceil((resetAt - currentTime) / 1000)));
    sendJson(res, 429, {
      error: "Too many requests. Please slow down and try again shortly.",
      source: "local-rate-limit",
      retryAfter,
    }, { "retry-after": String(retryAfter), "x-rate-limit-source": "local" });
    return false;
  }

  rateLimit.stats = () => ({ size: buckets.size, maxBuckets: bucketLimit, pruned, evicted });
  return rateLimit;
}
