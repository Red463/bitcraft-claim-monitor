import assert from "node:assert/strict";
import test from "node:test";

let leaderboardModule = null;
try {
  leaderboardModule = await import("../src/server/craftContributionLeaderboard.mjs");
} catch {
  // The focused red run proves the exact leaderboard projection is absent.
}

test("craft contribution leaderboard aggregates and ranks exact decimal strings", () => {
  assert.ok(leaderboardModule, "expected the exact craft contribution leaderboard projection");
  const projected = leaderboardModule.projectCraftContributionLeaderboard([
    {
      craft_entity_id: "craft-b",
      contributor_entity_id: "2",
      contributor_name: "B",
      attribution_confidence: "authoritative",
      profession: "Forestry",
      contributed_progress: "9007199254740992",
      contributed_xp: "9007199254740992.25",
      contribution_count: "1",
      last_contributed_at: "2026-08-08T10:00:00.000Z",
    },
    {
      craft_entity_id: "craft-a-1",
      contributor_entity_id: "1",
      contributor_name: "A",
      attribution_confidence: "matched_action",
      profession: "Forestry",
      contributed_progress: "9007199254740992",
      contributed_xp: "9007199254740992.5",
      contribution_count: "9007199254740992",
      last_contributed_at: "2026-08-08T11:00:00.000Z",
    },
    {
      craft_entity_id: "craft-a-2",
      contributor_entity_id: "1",
      contributor_name: "A",
      attribution_confidence: "owner_fallback",
      profession: "Forestry",
      contributed_progress: "1",
      contributed_xp: "0.75",
      contribution_count: "1",
      last_contributed_at: "2026-08-08T12:00:00.000Z",
    },
  ]);

  assert.equal(projected.summary.totalProgress, "18014398509481985");
  assert.equal(projected.summary.totalXp, "18014398509481985.5");
  assert.equal(projected.contributors[0].name, "A");
  assert.equal(projected.contributors[0].totalProgress, "9007199254740993");
  assert.equal(projected.contributors[0].totalXp, "9007199254740993.25");
  assert.equal(projected.contributors[0].contributionCount, "9007199254740993");
  assert.equal(projected.professions[0].topContributor, "A");
  assert.equal(projected.recent[0].totalProgress, "9007199254740992");
});

test("craft contribution leaderboard excludes historic unknown rows", () => {
  assert.ok(leaderboardModule, "expected the exact craft contribution leaderboard projection");
  const projected = leaderboardModule.projectCraftContributionLeaderboard([
    {
      craft_entity_id: "known",
      contributor_entity_id: "1",
      contributor_name: "Known",
      attribution_confidence: "authoritative",
      profession: "Forestry",
      contributed_progress: "2",
      contributed_xp: "3.5",
      contribution_count: "1",
    },
    {
      craft_entity_id: "unknown",
      contributor_entity_id: null,
      contributor_name: "Unknown contributor",
      attribution_confidence: "unknown",
      profession: "Forestry",
      contributed_progress: "999",
      contributed_xp: "999",
      contribution_count: "1",
    },
  ]);

  assert.equal(projected.summary.totalProgress, "2");
  assert.deepEqual(projected.contributors.map((row) => row.name), ["Known"]);
});
