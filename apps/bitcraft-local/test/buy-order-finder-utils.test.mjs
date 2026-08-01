import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buyOrderQueryFromLocation,
  buyOrderSearchTransition,
  formatExactDecimalInteger,
  sumExactDecimalIntegers,
} from "../src/pages/market/buyOrderFinderUtils.ts";

test("buy-order query parsing follows URL changes without treating plus as a literal", () => {
  assert.equal(buyOrderQueryFromLocation("?tab=buy-orders&buyQ=Timber+Package"), "Timber Package");
  assert.equal(buyOrderQueryFromLocation("?tab=buy-orders"), "");
});

test("buy-order location transitions detect external search changes", () => {
  assert.deepEqual(
    buyOrderSearchTransition("Timber Package", "?tab=buy-orders&buyQ=Iron+Ore"),
    { changed: true, search: "Iron Ore" },
  );
  assert.deepEqual(
    buyOrderSearchTransition("Iron Ore", "?tab=buy-orders&buyQ=Iron+Ore"),
    { changed: false, search: "Iron Ore" },
  );
});

test("buy-order integer formatting preserves values above Number.MAX_SAFE_INTEGER", () => {
  assert.equal(formatExactDecimalInteger("9007199254740993"), "9,007,199,254,740,993");
  assert.equal(formatExactDecimalInteger("0009007199254740993"), "9,007,199,254,740,993");
});

test("buy-order metric sums remain exact above Number.MAX_SAFE_INTEGER", () => {
  assert.equal(
    sumExactDecimalIntegers(["9007199254740993", "9007199254740994", "invalid"]),
    "18014398509481987",
  );
  assert.equal(
    formatExactDecimalInteger(sumExactDecimalIntegers(["9007199254740993", "9007199254740994"])),
    "18,014,398,509,481,987",
  );
});
