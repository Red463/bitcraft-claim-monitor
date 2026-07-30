import assert from "node:assert/strict";
import test from "node:test";

import {
  RELAY_RECONNECT_BASE_DELAYS_MS,
  relayReconnectDelayMs,
} from "../src/server/relayRuntimeBackoff.mjs";

test("Relay reconnect backoff follows 1/2/4/8/16/30 seconds and caps at 30 seconds", () => {
  assert.deepEqual(RELAY_RECONNECT_BASE_DELAYS_MS, [
    1_000,
    2_000,
    4_000,
    8_000,
    16_000,
    30_000,
  ]);
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 7].map((attempt) => relayReconnectDelayMs(attempt, () => 0.5)),
    [1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000],
  );
});

test("Relay reconnect backoff applies bounded plus-or-minus twenty percent jitter", () => {
  assert.equal(relayReconnectDelayMs(1, () => 0), 800);
  assert.equal(relayReconnectDelayMs(1, () => 1), 1_200);
  assert.equal(relayReconnectDelayMs(6, () => 0), 24_000);
  assert.equal(relayReconnectDelayMs(6, () => 1), 36_000);
});
