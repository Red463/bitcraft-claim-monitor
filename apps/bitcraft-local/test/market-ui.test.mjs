import assert from "node:assert/strict";
import test from "node:test";

import {
  availabilityFlags,
  nextOptionIndex,
} from "../src/pages/market/marketUi.ts";

test("market availability modes map to the existing catalog contract", () => {
  assert.deepEqual(availabilityFlags("any"), { availableOnly: false, hasSell: false, hasBuy: false });
  assert.deepEqual(availabilityFlags("sell"), { availableOnly: true, hasSell: true, hasBuy: false });
  assert.deepEqual(availabilityFlags("buy"), { availableOnly: true, hasSell: false, hasBuy: true });
  assert.deepEqual(availabilityFlags("both"), { availableOnly: true, hasSell: true, hasBuy: true });
});

test("market suggestion navigation wraps and supports boundary keys", () => {
  assert.equal(nextOptionIndex(0, 4, "ArrowUp"), 3);
  assert.equal(nextOptionIndex(3, 4, "ArrowDown"), 0);
  assert.equal(nextOptionIndex(2, 4, "Home"), 0);
  assert.equal(nextOptionIndex(1, 4, "End"), 3);
  assert.equal(nextOptionIndex(-1, 4, "ArrowDown"), 0);
  assert.equal(nextOptionIndex(-1, 0, "ArrowDown"), -1);
});
