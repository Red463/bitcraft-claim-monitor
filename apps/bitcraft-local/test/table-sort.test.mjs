import assert from "node:assert/strict";
import test from "node:test";

import { compareSortValues, sortComparable } from "../src/utils/tableSort.ts";
import * as tableSort from "../src/utils/tableSort.ts";

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

test("compareSortValues preserves exact ordering for decimal integers beyond Number safety", () => {
  const values = [
    "9007199254740995",
    "9007199254740993",
    "9007199254740994",
  ];

  assert.deepEqual([...values].sort((a, b) => compareSortValues(a, b, "asc")), [
    "9007199254740993",
    "9007199254740994",
    "9007199254740995",
  ]);
  assert.deepEqual([...values].sort((a, b) => compareSortValues(a, b, "desc")), [
    "9007199254740995",
    "9007199254740994",
    "9007199254740993",
  ]);
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

test("sortIndexedRows uses raw values instead of formatted time labels", () => {
  assert.equal(typeof tableSort.sortIndexedRows, "function");
  const rows = [
    { row: { name: "Two hours", playtime: 7_200, label: "2h 0m" }, index: 0 },
    { row: { name: "One day", playtime: 86_400, label: "1d 0h" }, index: 1 },
    { row: { name: "Ten hours", playtime: 36_000, label: "10h 0m" }, index: 2 },
  ];

  const ascending = tableSort.sortIndexedRows(rows, (row) => row.playtime, "asc");
  const descending = tableSort.sortIndexedRows(rows, (row) => row.playtime, "desc");

  assert.deepEqual(ascending.map(({ row }) => row.name), ["Two hours", "Ten hours", "One day"]);
  assert.deepEqual(descending.map(({ row }) => row.name), ["One day", "Ten hours", "Two hours"]);
});

test("windowIndexedRows selects the requested page after rows are sorted", () => {
  const rows = [40, 10, 30, 20].map((price, index) => ({ row: { price }, index }));
  const sorted = tableSort.sortIndexedRows(rows, (row) => row.price, "asc");

  assert.deepEqual(
    tableSort.windowIndexedRows(sorted, 1, 2).map(({ row }) => row.price),
    [20, 30],
  );
  assert.deepEqual(
    tableSort.windowIndexedRows(sorted).map(({ row }) => row.price),
    [10, 20, 30, 40],
  );
});
