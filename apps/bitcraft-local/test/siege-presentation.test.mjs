import assert from "node:assert/strict";
import test from "node:test";

import {
  activeSiegeParticipants,
  groupSiegeParticipants,
  siegeParticipantKey,
  siegeDurationLabel,
} from "../src/pages/empires/siegePresentation.ts";

const tower = {
  activeSiegeParticipants: [
    { active: true, attacker: false, empireName: "Lucky Neko Company", startTimestamp: "2026-07-18T23:55:20.000Z" },
    { active: true, attacker: true, empireName: "Verdant", startTimestamp: "2026-07-18T23:55:20.000Z" },
    { active: false, attacker: true, empireName: "Historical" },
  ],
};

test("activeSiegeParticipants keeps only active records", () => {
  assert.deepEqual(activeSiegeParticipants(tower).map((entry) => entry.empireName), ["Lucky Neko Company", "Verdant"]);
});

test("groupSiegeParticipants separates roles and uses the earliest valid start", () => {
  const grouped = groupSiegeParticipants({
    ...tower,
    activeSiegeParticipants: [
      ...tower.activeSiegeParticipants,
      { active: true, attacker: true, empireName: "Second attacker", startTimestamp: "2026-07-19T00:05:20.000Z" },
      { active: true, attacker: null, empireName: "Unresolved participant", startTimestamp: "2026-07-19T00:10:20.000Z" },
    ],
  });

  assert.deepEqual(grouped.attackers.map((entry) => entry.empireName), ["Verdant", "Second attacker"]);
  assert.deepEqual(grouped.defenders.map((entry) => entry.empireName), ["Lucky Neko Company"]);
  assert.deepEqual(grouped.unknown.map((entry) => entry.empireName), ["Unresolved participant"]);
  assert.equal(grouped.startedAt, "2026-07-18T23:55:20.000Z");
});

test("groupSiegeParticipants keeps one proven defender alongside every attacker", () => {
  const grouped = groupSiegeParticipants({
    activeSiegeParticipants: [
      { active: true, attacker: true, empireEntityId: "11", empireName: "Attacker one" },
      { active: true, attacker: true, empireEntityId: "12", empireName: "Attacker two" },
      { active: true, attacker: false, empireEntityId: "10", empireName: "Defender" },
    ],
  });
  assert.deepEqual(grouped.attackers.map((entry) => entry.empireEntityId), ["11", "12"]);
  assert.deepEqual(grouped.defenders.map((entry) => entry.empireEntityId), ["10"]);
  assert.deepEqual(grouped.unknown, []);
});

test("same-Empire attacker rows retain unique stable React identities", () => {
  assert.notEqual(
    siegeParticipantKey({ entityId: "501", empireEntityId: "11" }, "attacker", 0),
    siegeParticipantKey({ entityId: "502", empireEntityId: "11" }, "attacker", 1),
  );
  assert.equal(
    siegeParticipantKey({ entityId: "501", empireEntityId: "11" }, "attacker", 9),
    "attacker:501",
  );
});

test("siegeDurationLabel is deterministic and handles missing values", () => {
  assert.equal(siegeDurationLabel("2026-07-18T23:55:20.000Z", Date.parse("2026-07-19T15:40:20.000Z")), "15h 45m");
  assert.equal(siegeDurationLabel(null, Date.now()), "Unavailable");
  assert.equal(siegeDurationLabel("not-a-date", Date.now()), "Unavailable");
});
