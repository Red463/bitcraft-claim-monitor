import assert from "node:assert/strict";
import test from "node:test";

import {
  availabilityFlags,
  marketChartPoints,
  nextOptionIndex,
} from "../src/pages/market/marketUi.ts";

test("market availability modes map to the existing catalog contract", () => {
  assert.deepEqual(availabilityFlags("any"), { availableOnly: false, hasSell: false, hasBuy: false });
  assert.deepEqual(availabilityFlags("sell"), { availableOnly: true, hasSell: true, hasBuy: false });
  assert.deepEqual(availabilityFlags("buy"), { availableOnly: true, hasSell: false, hasBuy: true });
  assert.deepEqual(availabilityFlags("both"), { availableOnly: true, hasSell: true, hasBuy: true });
});

test("market chart points stay bounded and place higher prices above lower prices", () => {
  assert.deepEqual(marketChartPoints([], 100, 50), []);

  const rising = marketChartPoints([
    { price: 10, bucket: "2026-08-01" },
    { price: 20, bucket: "2026-08-02" },
  ], 100, 50);
  assert.deepEqual(rising.map(({ x }) => x), [0, 100]);
  assert.ok(rising[1].y < rising[0].y);
  assert.deepEqual(rising.map(({ price }) => price), [10, 20]);
  assert.deepEqual(rising.map(({ label }) => label), ["2026-08-01", "2026-08-02"]);
  assert.ok(rising.every(({ y }) => y >= 0 && y <= 50));

  const constant = marketChartPoints([{ vwap: 7 }, { avgPrice: 7 }], 80, 40);
  assert.deepEqual(constant.map(({ y }) => y), [20, 20]);
});

test("market suggestion navigation wraps and supports boundary keys", () => {
  assert.equal(nextOptionIndex(0, 4, "ArrowUp"), 3);
  assert.equal(nextOptionIndex(3, 4, "ArrowDown"), 0);
  assert.equal(nextOptionIndex(2, 4, "Home"), 0);
  assert.equal(nextOptionIndex(1, 4, "End"), 3);
  assert.equal(nextOptionIndex(-1, 4, "ArrowDown"), 0);
  assert.equal(nextOptionIndex(-1, 0, "ArrowDown"), -1);
});
