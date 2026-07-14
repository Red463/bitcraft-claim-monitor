import assert from "node:assert/strict";
import test from "node:test";

import { selectCraftPlanningEffortView } from "../src/pages/craftPlanningEffortView.ts";

test("effort view selects matching Fishing and overall aggregates", () => {
  const selected = selectCraftPlanningEffortView({
    state: "ready",
    overall: { state: "ready", baselineEffort: 100, remainingEffort: 50, completion: 50 },
    sections: { Carpentry: { state: "ready", baselineEffort: 20, remainingEffort: 5, completion: 75 } },
    fishingVariants: { lake: {
      overall: { state: "ready", baselineEffort: 80, remainingEffort: 30.96, completion: 61.3 },
      sections: { Fishing: { state: "ready", baselineEffort: 50, remainingEffort: 21.4, completion: 57.2 } },
    } },
  }, "lake");
  assert.equal(selected.overall.completion, 61.3);
  assert.equal(selected.sections.Fishing.completion, 57.2);
  assert.equal(selected.sections.Carpentry.completion, 75);
  assert.equal(selected.route, "lake");
});

test("effort view preserves unavailable states", () => {
  const selected = selectCraftPlanningEffortView({ state: "unavailable", warnings: ["Catalog refresh required"] }, "ocean");
  assert.equal(selected.overall.completion, null);
  assert.equal(selected.state, "unavailable");
  assert.deepEqual(selected.warnings, ["Catalog refresh required"]);
});

test("effort view preserves valid empty progress as complete", () => {
  const selected = selectCraftPlanningEffortView({
    state: "empty",
    overall: { state: "empty", baselineEffort: 0, remainingEffort: 0, completion: 100 },
    sections: {},
  }, "ocean");
  assert.equal(selected.state, "empty");
  assert.equal(selected.overall.state, "empty");
  assert.equal(selected.overall.completion, 100);
});

test("effort view makes Fishing unavailable when the selected route has no aggregate", () => {
  const selected = selectCraftPlanningEffortView({
    state: "ready",
    overall: { state: "ready", baselineEffort: 100, remainingEffort: 40, completion: 60 },
    sections: { Fishing: { state: "ready", baselineEffort: 100, remainingEffort: 40, completion: 60 } },
    fishingVariants: { ocean: {
      overall: { state: "ready", baselineEffort: 100, remainingEffort: 40, completion: 60 },
      sections: { Fishing: { state: "ready", baselineEffort: 100, remainingEffort: 40, completion: 60 } },
    } },
    warnings: ["Root warning"],
  }, "lake");
  assert.equal(selected.overall.completion, null);
  assert.equal(selected.sections.Fishing.completion, null);
});

test("effort view prefers selected Fishing route warnings", () => {
  const selected = selectCraftPlanningEffortView({
    state: "partial",
    sections: { Fishing: { state: "unavailable", completion: null } },
    fishingVariants: { lake: {
      overall: { state: "unavailable", completion: null },
      sections: { Fishing: { state: "unavailable", completion: null } },
      warnings: ["Lake route weight is unavailable"],
    } },
    warnings: ["Root warning"],
  }, "lake");
  assert.deepEqual(selected.warnings, ["Lake route weight is unavailable"]);
});
