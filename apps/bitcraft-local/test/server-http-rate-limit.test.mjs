import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { RATE_LIMITS, createRateLimiter, requestAddress } from "../src/server/httpRateLimit.mjs";

test("requestAddress trusts forwarding only from explicit proxy peers", () => {
  assert.equal(requestAddress({ headers: { "x-forwarded-for": " 203.0.113.9, 198.51.100.4 " }, socket: { remoteAddress: "127.0.0.1" } }), "203.0.113.9");
  assert.equal(requestAddress({ headers: { "x-forwarded-for": "203.0.113.9" }, socket: { remoteAddress: "198.51.100.4" } }), "198.51.100.4");
  assert.equal(requestAddress({ headers: { "x-forwarded-for": "203.0.113.10" }, socket: { remoteAddress: "::ffff:127.0.0.1" } }), "203.0.113.10");
  assert.equal(requestAddress({ headers: { "x-forwarded-for": "  " }, socket: { remoteAddress: "::1" } }), "::1");
  assert.equal(requestAddress({ headers: { "x-forwarded-for": "203.0.113.11" }, socket: { remoteAddress: "10.0.0.5" } }, { trustedProxyAddresses: ["10.0.0.5"] }), "203.0.113.11");
  assert.equal(requestAddress({ headers: {}, socket: {} }), "");
});

test("the Caddy proxy overwrites client forwarding input at the trusted boundary", () => {
  const caddy = readFileSync(new URL("../../../deploy/Caddyfile.example", import.meta.url), "utf8");
  assert.match(caddy, /^\s*header_up X-Forwarded-For \{remote_host\}\s*$/m);
});

test("RATE_LIMITS preserves the public route rate-limit policies", () => {
  assert.deepEqual(RATE_LIMITS.auth, { windowMs: 15 * 60 * 1000, max: 30 });
  assert.deepEqual(RATE_LIMITS.analytics, { windowMs: 60 * 1000, max: 120 });
  assert.deepEqual(RATE_LIMITS.discordInteraction, { windowMs: 60 * 1000, max: 120 });
  assert.deepEqual(RATE_LIMITS.proxy, { windowMs: 60 * 1000, max: 600 });
  assert.deepEqual(RATE_LIMITS.expensiveLocal, { windowMs: 60 * 1000, max: 60 });
  assert.deepEqual(RATE_LIMITS.mapSnapshot, { windowMs: 60 * 1000, max: 600 });
  assert.deepEqual(RATE_LIMITS.mapEvents, { windowMs: 60 * 1000, max: 300 });
  assert.deepEqual(RATE_LIMITS.gameDataRead, {
    reportOnly: true,
    burst: { windowMs: 10_000, max: 12 },
    sustained: { windowMs: 60_000, max: 90 },
  });
  assert.deepEqual(RATE_LIMITS.orderBookRead, {
    reportOnly: true,
    burst: { windowMs: 10_000, max: 25 },
    sustained: { windowMs: 60_000, max: 120 },
  });
  assert.deepEqual(RATE_LIMITS.favoriteQuotesRead, {
    reportOnly: true,
    burst: { windowMs: 10_000, max: 8 },
    sustained: { windowMs: 60_000, max: 60 },
  });
});

test("named client profiles record would-limit decisions without blocking in report-only mode", () => {
  const decisions = [];
  const sent = [];
  const rateLimit = createRateLimiter({
    now: () => 1_000,
    onDecision: (decision) => decisions.push(decision),
    sendJson: (...args) => sent.push(args),
  });
  const base = { socket: { remoteAddress: "198.51.100.20" } };

  for (const policyName of ["gameDataRead", "orderBookRead", "favoriteQuotesRead"]) {
    const policy = RATE_LIMITS[policyName];
    for (let index = 0; index <= policy.burst.max; index += 1) {
      const req = { ...base, headers: { "x-manual-refresh-id": `normal-refresh-${index}` } };
      assert.equal(rateLimit(req, {}, policyName, policy), true);
    }
  }

  assert.deepEqual(decisions.map(({ name, reportOnly, wouldLimit }) => ({ name, reportOnly, wouldLimit })), [
    { name: "gameDataRead", reportOnly: true, wouldLimit: true },
    { name: "orderBookRead", reportOnly: true, wouldLimit: true },
    { name: "favoriteQuotesRead", reportOnly: true, wouldLimit: true },
  ]);
  assert.equal(sent.length, 0);
});

test("favorite quotes sustained 60-per-minute limit remains report-only", () => {
  const decisions = [];
  const sent = [];
  const rateLimit = createRateLimiter({
    now: () => 1_000,
    onDecision: (decision) => decisions.push(decision),
    sendJson: (...args) => sent.push(args),
  });
  const req = { headers: {}, socket: { remoteAddress: "198.51.100.61" } };

  for (let index = 0; index < 61; index += 1) {
    assert.equal(rateLimit(req, {}, "favoriteQuotesRead", RATE_LIMITS.favoriteQuotesRead), true);
  }

  assert.equal(sent.length, 0);
  assert.deepEqual(decisions.at(-1), {
    name: "favoriteQuotesRead",
    reportOnly: true,
    wouldLimit: true,
    limitedBy: ["burst", "sustained"],
  });
});

test("named client profiles return 429 only when explicitly enforced", () => {
  const sent = [];
  const rateLimit = createRateLimiter({
    now: () => 5_000,
    sendJson: (res, status, body, headers) => sent.push({ status, body, headers }),
  });
  const policy = { ...RATE_LIMITS.orderBookRead, reportOnly: false };
  const req = { headers: { "x-manual-refresh-id": "normal-refresh" }, socket: { remoteAddress: "198.51.100.30" } };

  for (let index = 0; index < policy.burst.max; index += 1) assert.equal(rateLimit(req, {}, "orderBookRead", policy), true);
  assert.equal(rateLimit(req, {}, "orderBookRead", policy), false);
  assert.equal(sent[0].status, 429);
  assert.deepEqual(sent[0].headers, { "retry-after": "10", "x-rate-limit-source": "local" });
});

test("createRateLimiter allows requests through the configured max then emits the app 429 response", () => {
  let currentTime = 1000;
  const sent = [];
  const rateLimit = createRateLimiter({
    now: () => currentTime,
    sendJson: (res, status, body, headers) => {
      sent.push({ res, status, body, headers });
    },
  });
  const req = { headers: { "x-forwarded-for": "203.0.113.9" }, socket: {} };
  const res = {};
  const policy = { windowMs: 4000, max: 2 };

  assert.equal(rateLimit(req, res, "auth", policy), true);
  assert.equal(rateLimit(req, res, "auth", policy), true);
  assert.equal(rateLimit(req, res, "auth", policy), false);

  assert.deepEqual(sent, [{
    res,
    status: 429,
    body: {
      error: "Too many requests. Please slow down and try again shortly.",
      source: "local-rate-limit",
      retryAfter: 4,
    },
    headers: { "retry-after": "4", "x-rate-limit-source": "local" },
  }]);

  currentTime = 5001;
  assert.equal(rateLimit(req, res, "auth", policy), true);
});

test("createRateLimiter prunes expired client buckets without exposing bucket keys", () => {
  let now = 0;
  const rateLimit = createRateLimiter({
    now: () => now,
    pruneIntervalMs: 1,
    maxBuckets: 10,
    enforcedBucketReserve: 4,
    addressForRequest: (req) => req.address,
    sendJson: () => {},
  });
  const policy = { windowMs: 10, max: 100 };

  rateLimit({ address: "client-a" }, {}, "public-read", policy);
  assert.deepEqual(rateLimit.stats(), {
    size: 1,
    maxBuckets: 10,
    pruned: 0,
    enforced: { size: 1, maxBuckets: 4, capacityRejected: 0 },
    reportOnly: { size: 0, maxBuckets: 6, evicted: 0 },
  });
  now = 11;
  rateLimit({ address: "client-b" }, {}, "public-read", policy);

  assert.deepEqual(rateLimit.stats(), {
    size: 1,
    maxBuckets: 10,
    pruned: 1,
    enforced: { size: 1, maxBuckets: 4, capacityRejected: 0 },
    reportOnly: { size: 0, maxBuckets: 6, evicted: 0 },
  });
});

test("createRateLimiter sheds only report-only state within partition and global caps", () => {
  const rateLimit = createRateLimiter({
    now: () => 1_000,
    pruneIntervalMs: 60_000,
    maxBuckets: 8,
    enforcedBucketReserve: 3,
    addressForRequest: (req) => req.address,
    sendJson: () => {},
  });
  const policy = { reportOnly: true, windowMs: 60_000, max: 100 };

  for (let index = 0; index < 100; index += 1) {
    rateLimit({ address: `client-${index}` }, {}, "public-read", policy);
  }

  assert.deepEqual(rateLimit.stats(), {
    size: 5,
    maxBuckets: 8,
    pruned: 0,
    enforced: { size: 0, maxBuckets: 3, capacityRejected: 0 },
    reportOnly: { size: 5, maxBuckets: 5, evicted: 95 },
  });
});

test("distributed report-only churn cannot evict an active enforced bucket", () => {
  const sent = [];
  const rateLimit = createRateLimiter({
    now: () => 2_000,
    maxBuckets: 6,
    enforcedBucketReserve: 2,
    addressForRequest: (req) => req.address,
    sendJson: (_res, status) => sent.push(status),
  });
  const authPolicy = { windowMs: 60_000, max: 1 };
  const reportOnlyPolicy = { reportOnly: true, windowMs: 60_000, max: 100 };

  assert.equal(rateLimit({ address: "auth-client" }, {}, "auth", authPolicy), true);
  for (let index = 0; index < 50; index += 1) {
    assert.equal(rateLimit({ address: `public-${index}` }, {}, "gameDataRead", reportOnlyPolicy), true);
  }
  assert.equal(rateLimit({ address: "auth-client" }, {}, "auth", authPolicy), false);

  assert.deepEqual(sent, [429]);
  assert.deepEqual(rateLimit.stats(), {
    size: 5,
    maxBuckets: 6,
    pruned: 0,
    enforced: { size: 1, maxBuckets: 2, capacityRejected: 0 },
    reportOnly: { size: 4, maxBuckets: 4, evicted: 46 },
  });
});

test("new enforced clients fail closed when the enforced partition is full", () => {
  const sent = [];
  const rateLimit = createRateLimiter({
    now: () => 3_000,
    maxBuckets: 5,
    enforcedBucketReserve: 2,
    addressForRequest: (req) => req.address,
    sendJson: (_res, status, body, headers) => sent.push({ status, body, headers }),
  });
  const policy = { windowMs: 60_000, max: 2 };

  assert.equal(rateLimit({ address: "client-a" }, {}, "auth", policy), true);
  assert.equal(rateLimit({ address: "client-b" }, {}, "auth", policy), true);
  assert.equal(rateLimit({ address: "client-c" }, {}, "auth", policy), false);
  assert.equal(rateLimit({ address: "client-a" }, {}, "auth", policy), true);
  assert.equal(rateLimit({ address: "client-a" }, {}, "auth", policy), false);

  assert.equal(sent.length, 2);
  assert.equal(sent[0].status, 429);
  assert.equal(sent[0].headers["retry-after"], "60");
  assert.equal(sent[1].status, 429);
  assert.deepEqual(rateLimit.stats(), {
    size: 2,
    maxBuckets: 5,
    pruned: 0,
    enforced: { size: 2, maxBuckets: 2, capacityRejected: 1 },
    reportOnly: { size: 0, maxBuckets: 3, evicted: 0 },
  });
});

test("enforced capacity pressure prunes expired buckets before rejecting a new client", () => {
  let now = 0;
  const sent = [];
  const rateLimit = createRateLimiter({
    now: () => now,
    pruneIntervalMs: 60_000,
    maxBuckets: 2,
    enforcedBucketReserve: 1,
    addressForRequest: (req) => req.address,
    sendJson: (...args) => sent.push(args),
  });

  assert.equal(rateLimit({ address: "expired-client" }, {}, "short-window", { windowMs: 10, max: 10 }), true);
  now = 11;
  assert.equal(rateLimit({ address: "new-client" }, {}, "auth", { windowMs: 900_000, max: 10 }), true);

  assert.equal(sent.length, 0);
  assert.deepEqual(rateLimit.stats(), {
    size: 1,
    maxBuckets: 2,
    pruned: 1,
    enforced: { size: 1, maxBuckets: 1, capacityRejected: 0 },
    reportOnly: { size: 0, maxBuckets: 1, evicted: 0 },
  });
});

test("enforced capacity retry uses the resident expiry and rounds partial seconds up", () => {
  let now = 1_000;
  const decisions = [];
  const sent = [];
  const rateLimit = createRateLimiter({
    now: () => now,
    maxBuckets: 2,
    enforcedBucketReserve: 1,
    addressForRequest: (req) => req.address,
    onDecision: (decision) => decisions.push(decision),
    sendJson: (_res, status, body, headers) => sent.push({ status, body, headers }),
  });

  assert.equal(rateLimit({ address: "resident-client" }, {}, "short-window", { windowMs: 1_501, max: 10 }), true);
  now = 1_500;
  assert.equal(rateLimit({ address: "new-client" }, {}, "auth", { windowMs: 900_000, max: 10 }), false);

  assert.deepEqual(decisions, [{ name: "auth", reportOnly: false, wouldLimit: true, limitedBy: ["capacity"] }]);
  assert.deepEqual(sent, [{
    status: 429,
    body: {
      error: "Too many requests. Please slow down and try again shortly.",
      source: "local-rate-limit",
      retryAfter: 2,
    },
    headers: { "retry-after": "2", "x-rate-limit-source": "local" },
  }]);
});

test("enforced capacity retry waits for enough expiries to admit every missing window", () => {
  let now = 1_000;
  const sent = [];
  const rateLimit = createRateLimiter({
    now: () => now,
    maxBuckets: 6,
    enforcedBucketReserve: 3,
    addressForRequest: (req) => req.address,
    sendJson: (_res, status, body, headers) => sent.push({ status, body, headers }),
  });

  assert.equal(rateLimit({ address: "resident-a" }, {}, "seed-a", { windowMs: 1_001, max: 10 }), true);
  assert.equal(rateLimit({ address: "resident-b" }, {}, "seed-b", { windowMs: 2_501, max: 10 }), true);
  assert.equal(rateLimit({ address: "resident-c" }, {}, "seed-c", { windowMs: 60_000, max: 10 }), true);
  now = 1_001;
  assert.equal(rateLimit({ address: "new-client" }, {}, "auth", {
    burst: { windowMs: 600_000, max: 10 },
    sustained: { windowMs: 900_000, max: 10 },
  }), false);

  assert.equal(sent.length, 1);
  assert.equal(sent[0].status, 429);
  assert.equal(sent[0].body.retryAfter, 3);
  assert.deepEqual(sent[0].headers, { "retry-after": "3", "x-rate-limit-source": "local" });
});
