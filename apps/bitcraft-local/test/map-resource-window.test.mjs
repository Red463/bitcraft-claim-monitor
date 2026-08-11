import assert from "node:assert/strict";
import test from "node:test";

import {
  RESOURCE_FINDER_BATCH_SIZE,
  nextResourceLimit,
  visibleResourceMatches,
} from "../src/pages/map/resourceFinderWindow.mjs";

test("resource finder reveals deterministic batches without losing the catalog", () => {
  const rows = Array.from({ length: 205 }, (_, id) => ({ id }));
  assert.equal(RESOURCE_FINDER_BATCH_SIZE, 80);
  assert.deepEqual(
    visibleResourceMatches(rows, 80).map((row) => row.id),
    Array.from({ length: 80 }, (_, id) => id),
  );
  assert.equal(nextResourceLimit(80, rows.length), 160);
  assert.equal(nextResourceLimit(160, rows.length), 205);
  assert.equal(nextResourceLimit(205, rows.length), 205);
});
