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

export function createRateLimiter({ buckets = new Map(), reportOnlyBuckets = new Map(), sendJson, now = () => Date.now(), addressForRequest = requestAddress, onDecision = () => {}, maxBuckets = 20_000, enforcedBucketReserve = Math.floor(maxBuckets / 2), pruneIntervalMs = 60_000 } = {}) {
  const bucketLimit = Math.max(1, Math.floor(Number(maxBuckets) || 20_000));
  const enforcedBucketLimit = Math.min(bucketLimit, Math.max(1, Math.floor(Number(enforcedBucketReserve) || Math.floor(bucketLimit / 2) || 1)));
  const reportOnlyBucketLimit = bucketLimit - enforcedBucketLimit;
  const pruneInterval = Math.max(1, Math.floor(Number(pruneIntervalMs) || 60_000));
  let nextPruneAt = 0;
  let pruned = 0;
  let reportOnlyEvicted = 0;
  let enforcedCapacityRejected = 0;

  function pruneExpired(currentTime) {
    if (currentTime < nextPruneAt) return;
    nextPruneAt = currentTime + pruneInterval;
    for (const partition of [buckets, reportOnlyBuckets]) {
      for (const [key, bucket] of partition) {
        if (bucket.resetAt <= currentTime) {
          partition.delete(key);
          pruned += 1;
        }
      }
    }
  }

  function enforceReportOnlyBucketLimit() {
    while (reportOnlyBuckets.size > reportOnlyBucketLimit) {
      const oldestKey = reportOnlyBuckets.keys().next().value;
      if (oldestKey === undefined) break;
      reportOnlyBuckets.delete(oldestKey);
      reportOnlyEvicted += 1;
    }
  }

  function enforcedCapacityRetryAfter(currentTime, requiredKeys) {
    nextPruneAt = currentTime + pruneInterval;
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= currentTime) {
        buckets.delete(key);
        pruned += 1;
      }
    }
    const missingBucketCount = [...requiredKeys].reduce((count, key) => count + (buckets.has(key) ? 0 : 1), 0);
    const slotsNeeded = buckets.size + missingBucketCount - enforcedBucketLimit;
    if (slotsNeeded <= 0) return 0;
    const earliestResetTimes = [];
    for (const [key, bucket] of buckets) {
      if (requiredKeys.has(key)) continue;
      const insertAt = earliestResetTimes.findIndex((resetAt) => bucket.resetAt < resetAt);
      if (insertAt === -1) earliestResetTimes.push(bucket.resetAt);
      else earliestResetTimes.splice(insertAt, 0, bucket.resetAt);
      if (earliestResetTimes.length > slotsNeeded) earliestResetTimes.pop();
    }
    const capacityResetAt = earliestResetTimes[slotsNeeded - 1];
    return capacityResetAt === undefined ? null : Math.max(1, Math.ceil((capacityResetAt - currentTime) / 1000));
  }

  function rejectEnforcedCapacity(res, name, retryAfter) {
    enforcedCapacityRejected += 1;
    onDecision({ name, reportOnly: false, wouldLimit: true, limitedBy: ["capacity"] });
    sendJson(res, 429, {
      error: "Too many requests. Please slow down and try again shortly.",
      source: "local-rate-limit",
      retryAfter,
    }, { "retry-after": String(retryAfter), "x-rate-limit-source": "local" });
    return false;
  }

  function rateLimit(req, res, name, policy = RATE_LIMITS.expensiveLocal) {
    const currentTime = now();
    pruneExpired(currentTime);
    const address = addressForRequest(req) || "unknown";
    const reportOnly = policy.reportOnly === true;
    const windows = policy.burst && policy.sustained
      ? [["burst", policy.burst], ["sustained", policy.sustained]]
      : [["window", policy]];
    const partition = reportOnly ? reportOnlyBuckets : buckets;
    if (!reportOnly) {
      const requiredKeys = new Set(windows.map(([windowName]) => `${name}:${address}:${windowName}`));
      const newBucketCount = [...requiredKeys].reduce((count, key) => count + (partition.has(key) ? 0 : 1), 0);
      if (partition.size + newBucketCount > enforcedBucketLimit) {
        const capacityRetryAfter = enforcedCapacityRetryAfter(currentTime, requiredKeys);
        if (capacityRetryAfter !== 0) {
          const fallbackRetryAfter = Math.max(1, ...windows.map(([, windowPolicy]) => Math.ceil(windowPolicy.windowMs / 1000)));
          return rejectEnforcedCapacity(res, name, capacityRetryAfter ?? fallbackRetryAfter);
        }
      }
    }
    const limited = [];
    for (const [windowName, windowPolicy] of windows) {
      const key = `${name}:${address}:${windowName}`;
      const current = partition.get(key);
      const bucket = current && current.resetAt > currentTime ? current : { count: 0, resetAt: currentTime + windowPolicy.windowMs };
      bucket.count += 1;
      partition.set(key, bucket);
      if (reportOnly) enforceReportOnlyBucketLimit();
      if (bucket.count > windowPolicy.max) limited.push({ windowName, resetAt: bucket.resetAt });
    }
    if (!limited.length) return true;
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

  rateLimit.stats = () => ({
    size: buckets.size + reportOnlyBuckets.size,
    maxBuckets: bucketLimit,
    pruned,
    enforced: { size: buckets.size, maxBuckets: enforcedBucketLimit, capacityRejected: enforcedCapacityRejected },
    reportOnly: { size: reportOnlyBuckets.size, maxBuckets: reportOnlyBucketLimit, evicted: reportOnlyEvicted },
  });
  return rateLimit;
}
