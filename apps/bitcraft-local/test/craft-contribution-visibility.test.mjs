import assert from "node:assert/strict";
import test from "node:test";

let visibilityModule = null;
try {
  visibilityModule = await import("../src/server/craftContributionVisibility.mjs");
} catch {
  // The red run proves the player/admin visibility seam is absent.
}

test("unknown contribution aggregates are excluded from player views and counted for admins", () => {
  assert.ok(visibilityModule, "expected the contribution visibility module");
  const partition = visibilityModule.partitionCraftContributionRows([
    { contribution_key: "known", contributor_entity_id: "10", attribution_confidence: "authoritative", contributed_progress: "2" },
    { contribution_key: "unknown", contributor_entity_id: null, attribution_confidence: "unknown", contributed_progress: "100" },
  ]);

  assert.deepEqual(partition.playerRows.map((row) => row.contribution_key), ["known"]);
  assert.deepEqual(partition.adminDiagnostics, { unknownAttributionCount: 1 });
});
