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
