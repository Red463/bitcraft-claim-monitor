import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { applySchemaBootstrap } from "../src/server/schemaBootstrap.mjs";
import {
  createEmpireMembershipRepository,
  normalizeEmpireMembershipRoster,
} from "../src/server/empireMembership.mjs";

function repository() {
  const db = new DatabaseSync(":memory:");
  applySchemaBootstrap(db);
  return { db, repository: createEmpireMembershipRepository(db) };
}

const initialPayload = {
  empire: { entityId: "empire-1", name: "Cairn" },
  members: [
    { entityId: "player-1", playerName: "Alice" },
    { playerEntityId: "player-2", username: "Bob" },
  ],
};

test("normalization requires a complete non-empty matching roster", () => {
  assert.deepEqual(normalizeEmpireMembershipRoster(initialPayload, "empire-1"), {
    empireId: "empire-1",
    empireName: "Cairn",
    members: [
      { playerEntityId: "player-1", playerName: "Alice" },
      { playerEntityId: "player-2", playerName: "Bob" },
    ],
  });
  assert.throws(() => normalizeEmpireMembershipRoster({}, "empire-1"), /member roster/i);
  assert.throws(
    () => normalizeEmpireMembershipRoster({ empire: { entityId: "empire-1" }, members: [] }, "empire-1"),
    /empty/i,
  );
  assert.throws(
    () => normalizeEmpireMembershipRoster({ ...initialPayload, partial: true }, "empire-1"),
    /partial/i,
  );
  assert.throws(() => normalizeEmpireMembershipRoster(initialPayload, "empire-2"), /does not match/i);
});

test("first synchronization establishes an initial roster without join dates", () => {
  const { db, repository: repo } = repository();
  const roster = normalizeEmpireMembershipRoster(initialPayload, "empire-1");
  const result = repo.syncRoster({ ...roster, observedAt: "2026-07-24T12:00:00.000Z" });
  const rows = db.prepare("SELECT * FROM empire_membership_periods ORDER BY player_entity_id").all();

  assert.equal(result.initialRoster, true);
  assert.equal(result.created, 2);
  assert.deepEqual(
    rows.map((row) => ({
      player: row.player_entity_id,
      initial: row.initial_roster,
      joined: row.observed_joined_at,
      ended: row.period_ended_at,
    })),
    [
      { player: "player-1", initial: 1, joined: null, ended: null },
      { player: "player-2", initial: 1, joined: null, ended: null },
    ],
  );
  db.close();
});

test("unchanged rosters update in place and preserve the baseline", () => {
  const { db, repository: repo } = repository();
  const roster = normalizeEmpireMembershipRoster(initialPayload, "empire-1");
  repo.syncRoster({ ...roster, observedAt: "2026-07-24T12:00:00.000Z" });
  const result = repo.syncRoster({
    ...roster,
    members: roster.members.map((member) =>
      member.playerEntityId === "player-1" ? { ...member, playerName: "Alice Renamed" } : member,
    ),
    observedAt: "2026-07-24T12:01:00.000Z",
  });

  assert.equal(result.created, 0);
  assert.equal(result.updated, 2);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM empire_membership_periods").get().count, 2);
  assert.equal(
    db.prepare("SELECT player_name FROM empire_membership_periods WHERE player_entity_id = 'player-1'").get()
      .player_name,
    "Alice Renamed",
  );
  db.close();
});
