import assert from "node:assert/strict";
import test from "node:test";

import { formatGoldAmount } from "../src/utils/format.ts";

test("compact gold uses K, M, and B without appending g", () => {
  assert.equal(formatGoldAmount(339_622), "339.6K");
  assert.equal(formatGoldAmount(2_500_000), "2.5M");
  assert.equal(formatGoldAmount(4_000_000_000), "4.0B");
});

test("unabbreviated gold keeps the g suffix", () => {
  assert.equal(formatGoldAmount(999), "999g");
});
