import assert from "node:assert/strict";
import test from "node:test";

import { compareSortValues, sortComparable } from "../src/utils/tableSort.ts";

test("sortComparable parses common table number labels", () => {
  assert.equal(sortComparable("1,250g"), 1250);
  assert.equal(sortComparable("73%"), 73);
  assert.equal(sortComparable("-"), "");
});

test("compareSortValues sorts numeric-looking table values in both directions", () => {
  const values = ["10g", "2g", "1,000g"];
  assert.deepEqual([...values].sort((a, b) => compareSortValues(a, b, "asc")), ["2g", "10g", "1,000g"]);
  assert.deepEqual([...values].sort((a, b) => compareSortValues(a, b, "desc")), ["1,000g", "10g", "2g"]);
});
test("compareSortValues sorts localized date-time labels chronologically", () => {
  const values = ["30/05/2026, 10:38:01", "22/06/2026, 16:43:34", "29/06/2026, 04:51:21"];

  assert.deepEqual([...values].sort((a, b) => compareSortValues(a, b, "asc")), [
    "30/05/2026, 10:38:01",
    "22/06/2026, 16:43:34",
    "29/06/2026, 04:51:21",
  ]);
  assert.deepEqual([...values].sort((a, b) => compareSortValues(a, b, "desc")), [
    "29/06/2026, 04:51:21",
    "22/06/2026, 16:43:34",
    "30/05/2026, 10:38:01",
  ]);
});
