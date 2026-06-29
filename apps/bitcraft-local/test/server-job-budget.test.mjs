import assert from "node:assert/strict";
import test from "node:test";

import { jobBudgetAllowsMore, normalizeJobBudget, selectResumeBatch } from "../src/server/jobBudget.mjs";

test("normalizeJobBudget clamps invalid values to safe defaults", () => {
  assert.deepEqual(normalizeJobBudget({ maxRuntimeMs: -1, batchSize: 0 }, { maxRuntimeMs: 5000, batchSize: 12 }), {
    maxRuntimeMs: 5000,
    batchSize: 12,
  });
});

test("normalizeJobBudget preserves positive integer budgets", () => {
  assert.deepEqual(normalizeJobBudget({ maxRuntimeMs: 1234.8, batchSize: 7.9 }), {
    maxRuntimeMs: 1235,
    batchSize: 7,
  });
});

test("selectResumeBatch starts after the saved cursor and reports the next cursor", () => {
  const result = selectResumeBatch(["a", "b", "c", "d"], {
    cursor: "b",
    batchSize: 1,
    getKey: (value) => value,
  });

  assert.deepEqual(result.items, ["c"]);
  assert.equal(result.startedAfterCursor, true);
  assert.equal(result.nextCursor, "c");
  assert.equal(result.complete, false);
});

test("selectResumeBatch marks complete when the final batch is selected", () => {
  const result = selectResumeBatch(["a", "b", "c", "d"], {
    cursor: "b",
    batchSize: 5,
    getKey: (value) => value,
  });

  assert.deepEqual(result.items, ["c", "d"]);
  assert.equal(result.nextCursor, null);
  assert.equal(result.complete, true);
});

test("selectResumeBatch resets to the first item when the cursor is stale", () => {
  const result = selectResumeBatch(["a", "b", "c"], {
    cursor: "missing",
    batchSize: 2,
    getKey: (value) => value,
  });

  assert.deepEqual(result.items, ["a", "b"]);
  assert.equal(result.startedAfterCursor, false);
  assert.equal(result.nextCursor, "b");
  assert.equal(result.complete, false);
});

test("jobBudgetAllowsMore stops when runtime or batch budget is exhausted", () => {
  const budget = normalizeJobBudget({ maxRuntimeMs: 1000, batchSize: 2 });

  assert.equal(jobBudgetAllowsMore(1000, budget, 0, () => 1500), true);
  assert.equal(jobBudgetAllowsMore(1000, budget, 2, () => 1500), false);
  assert.equal(jobBudgetAllowsMore(1000, budget, 1, () => 2501), false);
});