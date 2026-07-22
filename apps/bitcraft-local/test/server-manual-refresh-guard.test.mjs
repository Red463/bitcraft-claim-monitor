import assert from "node:assert/strict";
import test from "node:test";

import {
  MANUAL_REFRESH_COOLDOWN_MS,
  MANUAL_REFRESH_HEADER,
  MANUAL_REFRESH_MAX_REQUESTS,
  createManualRefreshGuard,
} from "../src/server/manualRefreshGuard.mjs";

const REQUEST_A = "2f3f1848-5f2d-43a4-9885-f92e6216b082";
const REQUEST_B = "9de66279-071d-4878-bffc-3d14f0c31720";

test("manual refresh constants preserve the public cooldown contract", () => {
  assert.equal(MANUAL_REFRESH_HEADER, "x-manual-refresh-id");
  assert.equal(MANUAL_REFRESH_COOLDOWN_MS, 15_000);
  assert.equal(MANUAL_REFRESH_MAX_REQUESTS, 40);
});

test("manual refresh guard admits one UUID and its bounded fan-out", () => {
  let currentTime = 1_000;
  const guard = createManualRefreshGuard({ cooldownMs: 15_000, maxRequests: 3, now: () => currentTime });

  assert.equal(guard.authorize("203.0.113.9", REQUEST_A).allowed, true);
  assert.equal(guard.authorize("203.0.113.9", REQUEST_A).allowed, true);
  assert.equal(guard.authorize("203.0.113.9", REQUEST_A).allowed, true);
  assert.deepEqual(guard.authorize("203.0.113.9", REQUEST_A), {
    allowed: false,
    forceRefresh: false,
    retryAfterSeconds: 15,
    reason: "fanout-limit",
  });

  currentTime += 15_001;
  assert.equal(guard.authorize("203.0.113.9", REQUEST_A).allowed, true);
});

test("manual refresh guard rejects a second UUID until cooldown expires", () => {
  let currentTime = 1_000;
  const guard = createManualRefreshGuard({ cooldownMs: 15_000, maxRequests: 40, now: () => currentTime });

  assert.equal(guard.authorize("203.0.113.9", REQUEST_A).allowed, true);
  assert.deepEqual(guard.authorize("203.0.113.9", REQUEST_B), {
    allowed: false,
    forceRefresh: false,
    retryAfterSeconds: 15,
    reason: "cooldown",
  });
  assert.equal(guard.authorize("198.51.100.4", REQUEST_B).allowed, true);

  currentTime += 15_001;
  assert.equal(guard.authorize("203.0.113.9", REQUEST_B).allowed, true);
});

test("missing refresh ids are ordinary requests and malformed ids are rejected", () => {
  const guard = createManualRefreshGuard();

  assert.deepEqual(guard.authorize("203.0.113.9", ""), {
    allowed: true,
    forceRefresh: false,
    retryAfterSeconds: 0,
    reason: "ordinary",
  });
  assert.deepEqual(guard.authorize("203.0.113.9", "not-a-uuid"), {
    allowed: false,
    forceRefresh: false,
    retryAfterSeconds: 0,
    reason: "invalid-id",
  });
});
