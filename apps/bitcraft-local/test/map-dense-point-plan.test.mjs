import assert from "node:assert/strict";
import test from "node:test";

import { planDensePointDraw } from "../src/pages/map/mapDensePointPlan.mjs";

test("dense point drawing culls first and applies a deterministic budget", () => {
  const points = Array.from({ length: 50_001 }, (_, id) => ({ id, visible: id % 2 === 0 }));
  const plan = planDensePointDraw(points, (point) => point.visible, 25_000);
  assert.equal(plan.visibleCount, 25_001);
  assert.ok(plan.points.length <= 25_000);
  assert.deepEqual(plan.points.slice(0, 3).map((point) => point.id), [0, 4, 8]);
});

test("dense point drawing rejects invalid budgets", () => {
  for (const budget of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => planDensePointDraw([], () => true, budget), /positive safe integer/);
  }
});
