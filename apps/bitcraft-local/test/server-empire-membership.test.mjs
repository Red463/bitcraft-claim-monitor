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

test("departures require two complete omissions and recovery cancels suspicion", () => {
  const { db, repository: repo } = repository();
  const roster = normalizeEmpireMembershipRoster(initialPayload, "empire-1");
  repo.syncRoster({ ...roster, observedAt: "2026-07-24T12:00:00.000Z" });

  const aliceOnly = {
    ...roster,
    members: roster.members.filter((member) => member.playerEntityId === "player-1"),
  };
  repo.syncRoster({ ...aliceOnly, observedAt: "2026-07-24T12:01:00.000Z" });
  assert.equal(
    db.prepare("SELECT missing_checks FROM empire_membership_periods WHERE player_entity_id = 'player-2'").get()
      .missing_checks,
    1,
  );

  repo.syncRoster({ ...roster, observedAt: "2026-07-24T12:02:00.000Z" });
  assert.equal(
    db.prepare("SELECT missing_checks FROM empire_membership_periods WHERE player_entity_id = 'player-2'").get()
      .missing_checks,
    0,
  );

  repo.syncRoster({ ...aliceOnly, observedAt: "2026-07-24T12:03:00.000Z" });
  repo.syncRoster({ ...aliceOnly, observedAt: "2026-07-24T12:04:00.000Z" });
  const departed = db
    .prepare("SELECT * FROM empire_membership_periods WHERE player_entity_id = 'player-2'")
    .get();
  assert.equal(departed.observed_left_at, "2026-07-24T12:03:00.000Z");
  assert.equal(departed.departure_confirmed_at, "2026-07-24T12:04:00.000Z");
  assert.equal(departed.end_reason, "departure");
  db.close();
});

test("a confirmed return creates a rejoin and hides the old departure", () => {
  const { db, repository: repo } = repository();
  const roster = normalizeEmpireMembershipRoster(initialPayload, "empire-1");
  const aliceOnly = {
    ...roster,
    members: roster.members.filter((member) => member.playerEntityId === "player-1"),
  };
  repo.syncRoster({ ...roster, observedAt: "2026-07-01T12:00:00.000Z" });
  repo.syncRoster({ ...aliceOnly, observedAt: "2026-07-02T12:00:00.000Z" });
  repo.syncRoster({ ...aliceOnly, observedAt: "2026-07-02T12:01:00.000Z" });
  repo.syncRoster({ ...roster, observedAt: "2026-07-03T12:00:00.000Z" });

  const periods = db
    .prepare("SELECT * FROM empire_membership_periods WHERE player_entity_id = 'player-2' ORDER BY id")
    .all();
  assert.equal(periods.length, 2);
  assert.equal(periods[1].rejoin, 1);
  assert.equal(periods[1].observed_joined_at, "2026-07-03T12:00:00.000Z");
  assert.equal(repo.adminView({ now: "2026-07-24T12:00:00.000Z" }).departedMembers.length, 0);
  db.close();
});

test("changing empire ends the prior session without recording departures", () => {
  const { db, repository: repo } = repository();
  const cairn = normalizeEmpireMembershipRoster(initialPayload, "empire-1");
  repo.syncRoster({ ...cairn, observedAt: "2026-07-24T12:00:00.000Z" });
  repo.syncRoster({
    empireId: "empire-2",
    empireName: "Second Empire",
    members: [{ playerEntityId: "player-9", playerName: "Nina" }],
    observedAt: "2026-07-24T13:00:00.000Z",
  });

  const oldRows = db
    .prepare("SELECT end_reason, observed_left_at FROM empire_membership_periods WHERE empire_id = 'empire-1'")
    .all();
  assert.equal(
    oldRows.every((row) => row.end_reason === "tracking_ended" && row.observed_left_at === null),
    true,
  );
  assert.equal(repo.adminView({ now: "2026-07-24T13:01:00.000Z" }).tracking.empireId, "empire-2");
  db.close();
});

test("stopping tracking is idempotent and does not invent departures", () => {
  const { db, repository: repo } = repository();
  const roster = normalizeEmpireMembershipRoster(initialPayload, "empire-1");
  repo.syncRoster({ ...roster, observedAt: "2026-07-24T12:00:00.000Z" });

  assert.deepEqual(repo.stopTracking({ observedAt: "2026-07-24T13:00:00.000Z" }), {
    stopped: true,
    endedPeriods: 2,
  });
  assert.deepEqual(repo.stopTracking({ observedAt: "2026-07-24T13:01:00.000Z" }), {
    stopped: false,
    endedPeriods: 0,
  });
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM empire_membership_periods WHERE end_reason = 'tracking_ended' AND observed_left_at IS NULL",
      )
      .get().count,
    2,
  );
  db.close();
});

test("weekly cleanup removes only ended periods older than 365 days", () => {
  const { db, repository: repo } = repository();
  const roster = normalizeEmpireMembershipRoster(initialPayload, "empire-1");
  repo.syncRoster({ ...roster, observedAt: "2025-07-01T00:00:00.000Z" });
  repo.stopTracking({ observedAt: "2025-07-02T00:00:00.000Z" });
  const result = repo.syncRoster({ ...roster, observedAt: "2026-07-24T00:00:00.000Z" });
  assert.equal(result.pruned, 2);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS count FROM empire_membership_periods WHERE period_ended_at IS NULL").get()
      .count,
    2,
  );
  db.close();
});

test("admin view reports current states and latest absent departures", () => {
  const { db, repository: repo } = repository();
  const roster = normalizeEmpireMembershipRoster(initialPayload, "empire-1");
  const aliceOnly = {
    ...roster,
    members: roster.members.filter((member) => member.playerEntityId === "player-1"),
  };
  repo.syncRoster({ ...roster, observedAt: "2026-06-01T12:00:00.000Z" });
  repo.syncRoster({ ...aliceOnly, observedAt: "2026-07-20T12:00:00.000Z" });
  repo.syncRoster({ ...aliceOnly, observedAt: "2026-07-20T12:01:00.000Z" });
  repo.syncRoster({
    ...aliceOnly,
    members: [
      ...aliceOnly.members,
      { playerEntityId: "player-3", playerName: "Cara" },
    ],
    observedAt: "2026-07-21T12:00:00.000Z",
  });

  const view = repo.adminView({ now: "2026-07-24T12:00:00.000Z" });
  assert.equal(view.tracking.empireName, "Cairn");
  assert.deepEqual(view.summary, {
    currentMembers: 2,
    joinedLast30Days: 1,
    departedLast30Days: 1,
    rejoinsLast30Days: 0,
  });
  assert.deepEqual(
    view.currentMembers.map((member) => [member.playerName, member.membershipStatus]),
    [
      ["Cara", "joined"],
      ["Alice", "initial"],
    ],
  );
  assert.deepEqual(
    view.departedMembers.map((member) => [member.playerName, member.observedLeftAt, member.previousStatus]),
    [["Bob", "2026-07-20T12:00:00.000Z", "joined"]],
  );
  assert.equal(view.retentionDays, 365);
  db.close();
});
