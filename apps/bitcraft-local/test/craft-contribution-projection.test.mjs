import assert from "node:assert/strict";
import test from "node:test";

import {
  projectCraftContributionEnvelope,
  projectCraftContributions,
} from "../src/server/craftContributionProjection.mjs";

test("durable contribution history projects exact per-craft browser rows", () => {
  assert.deepEqual(projectCraftContributions([{
    craft_entity_id: "1369094287428103662",
    contributor_entity_id: "576460752388321942",
    contributor_name: "Mosswick",
    contributed_progress: "9007199254740993",
    contributed_xp: "18014398509481986",
    contribution_count: "12",
    first_contributed_at: "2026-08-01T08:00:00.000Z",
    last_contributed_at: "2026-08-01T09:00:00.000Z",
  }]), {
    "1369094287428103662": [{
      contributorEntityId: "576460752388321942",
      contributorUsername: "Mosswick",
      totalProgressContributed: "9007199254740993",
      totalXpContributed: "18014398509481986",
      contributionCount: "12",
      firstContributedAt: "2026-08-01T08:00:00.000Z",
      lastContributedAt: "2026-08-01T09:00:00.000Z",
    }],
  });
});

test("malformed durable contribution rows fail instead of inventing identifiers or amounts", () => {
  assert.throws(() => projectCraftContributions([{
    craft_entity_id: "craft",
    contributor_entity_id: "1",
    contributed_progress: "2",
    contributed_xp: "3",
    contribution_count: "1",
  }]), /craft entity id/i);
});

test("integral legacy REAL totals normalize without losing exact integer semantics", () => {
  const projected = projectCraftContributions([{
    craft_entity_id: "1369094287428103662",
    contributor_entity_id: "576460752388321942",
    contributor_name: "Mosswick",
    contributed_progress: "24.0",
    contributed_xp: "48.000",
    contribution_count: "1.0",
  }]);

  assert.equal(projected["1369094287428103662"][0].totalProgressContributed, "24");
  assert.equal(projected["1369094287428103662"][0].totalXpContributed, "48");
  assert.equal(projected["1369094287428103662"][0].contributionCount, "1");
  assert.throws(() => projectCraftContributions([{
    craft_entity_id: "1",
    contributor_entity_id: "2",
    contributed_progress: "24.5",
    contributed_xp: "48",
    contribution_count: "1",
  }]), /contributed progress/i);
});

test("non-integral legacy totals become explicit partial evidence", () => {
  const envelope = projectCraftContributionEnvelope([{
    craft_entity_id: "1",
    contributor_entity_id: "2",
    contributed_progress: "24.5",
    contributed_xp: "48",
    contribution_count: "1",
  }]);

  assert.deepEqual(envelope.data, {});
  assert.equal(envelope.warnings.length, 1);
  assert.match(envelope.warnings[0], /row 0 is unavailable.*contributed progress/i);
});
