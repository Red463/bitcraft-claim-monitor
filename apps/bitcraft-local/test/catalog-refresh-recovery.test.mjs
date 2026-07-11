import assert from "node:assert/strict";
import test from "node:test";

import { classifyCatalogRefreshError, parseRetryAfterMs } from "../src/server/catalogRefreshRecovery.mjs";

test("parseRetryAfterMs supports seconds and HTTP dates", () => {
  assert.equal(parseRetryAfterMs("12", 1_000), 12_000);
  assert.equal(parseRetryAfterMs("Thu, 01 Jan 1970 00:00:21 GMT", 1_000), 20_000);
  assert.equal(parseRetryAfterMs(null, 1_000), 0);
});

test("catalog refresh recovery retries transient upstream errors with bounded backoff", () => {
  assert.deepEqual(classifyCatalogRefreshError(Object.assign(new Error("HTTP 429"), { statusCode: 429, retryAfterMs: 9_000 }), {
    attemptNumber: 1,
    retryDelaysMs: [1_000, 2_000, 3_000],
  }), { action: "retry", delayMs: 9_000, reason: "rate_limit" });
  assert.deepEqual(classifyCatalogRefreshError(Object.assign(new Error("HTTP 503"), { statusCode: 503 }), {
    attemptNumber: 2,
    retryDelaysMs: [1_000, 2_000, 3_000],
  }), { action: "retry", delayMs: 2_000, reason: "upstream" });
  assert.deepEqual(classifyCatalogRefreshError(new Error("BitJita network request failed"), {
    attemptNumber: 3,
    retryDelaysMs: [1_000, 2_000, 3_000],
  }), { action: "skip", delayMs: 0, reason: "retry_exhausted" });
});

test("catalog refresh recovery skips permanent upstream misses and stops on local errors", () => {
  assert.deepEqual(classifyCatalogRefreshError(Object.assign(new Error("HTTP 404"), { statusCode: 404 }), { attemptNumber: 1 }), {
    action: "skip",
    delayMs: 0,
    reason: "permanent_upstream",
  });
  assert.deepEqual(classifyCatalogRefreshError(new Error("SQLITE_BUSY"), { attemptNumber: 1 }), {
    action: "stop",
    delayMs: 0,
    reason: "local_error",
  });
});
