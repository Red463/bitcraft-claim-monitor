import assert from "node:assert/strict";
import test from "node:test";

import { RATE_LIMITS, createRateLimiter, requestAddress } from "../src/server/httpRateLimit.mjs";

test("requestAddress uses the first forwarded address before the socket fallback", () => {
  assert.equal(requestAddress({ headers: { "x-forwarded-for": " 203.0.113.9, 198.51.100.4 " }, socket: { remoteAddress: "127.0.0.1" } }), "203.0.113.9");
  assert.equal(requestAddress({ headers: {}, socket: { remoteAddress: "::1" } }), "::1");
  assert.equal(requestAddress({ headers: {}, socket: {} }), "");
});

test("RATE_LIMITS preserves the public route rate-limit policies", () => {
  assert.deepEqual(RATE_LIMITS.auth, { windowMs: 15 * 60 * 1000, max: 30 });
  assert.deepEqual(RATE_LIMITS.analytics, { windowMs: 60 * 1000, max: 120 });
  assert.deepEqual(RATE_LIMITS.discordInteraction, { windowMs: 60 * 1000, max: 120 });
  assert.deepEqual(RATE_LIMITS.proxy, { windowMs: 60 * 1000, max: 600 });
  assert.deepEqual(RATE_LIMITS.expensiveLocal, { windowMs: 60 * 1000, max: 60 });
  assert.deepEqual(RATE_LIMITS.mapSnapshot, { windowMs: 60 * 1000, max: 600 });
  assert.deepEqual(RATE_LIMITS.mapEvents, { windowMs: 60 * 1000, max: 300 });
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
