import assert from "node:assert/strict";
import test from "node:test";

const {
  normalizeAndPairSiegeNotifications,
} = await import(
  new URL("../src/server/game-data/siegeNotifications.ts", import.meta.url).href
);

const replacements = ["Ancient Dominion's Watchtower", "N:{0}, E:{1}|~8197|~8027"];

function description(tag, id) {
  return {
    id,
    notificationType: { tag },
    priority: 1,
    showOnLogin: true,
    text: `${tag} template`,
  };
}

function notification(entityId, empireEntityId, tag, timestamp = 1785430800) {
  return {
    entityId,
    empireEntityId,
    notificationType: { tag },
    textReplacement: [...replacements],
    timestamp,
  };
}

test("pairs an exact SuccessfulSiege and FailedDefense as an attacker win", () => {
  const result = normalizeAndPairSiegeNotifications(
    [
      description("SuccessfulSiege", 1),
      description("FailedDefense", 2),
    ],
    [
      notification(9007199254740993n, 8000001n, "SuccessfulSiege"),
      notification(9007199254740994n, 7000001n, "FailedDefense"),
    ],
  );

  assert.equal(result.outcomes.length, 1);
  assert.equal(result.notifications[0].entityId, "9007199254740993");
  assert.equal(result.outcomes[0].outcome, "attacker_won");
  assert.equal(result.outcomes[0].attackerEmpireEntityId, "8000001");
  assert.equal(result.outcomes[0].defenderEmpireEntityId, "7000001");
});

test("pairs an exact FailedSiege and SuccessfulDefense as a defender win", () => {
  const result = normalizeAndPairSiegeNotifications(
    [
      description("FailedSiege", 1),
      description("SuccessfulDefense", 2),
    ],
    [
      notification(11n, 8000001n, "FailedSiege"),
      notification(12n, 7000001n, "SuccessfulDefense"),
    ],
  );

  assert.equal(result.outcomes.length, 1);
  assert.equal(result.outcomes[0].outcome, "defender_won");
  assert.equal(result.outcomes[0].attackerEmpireEntityId, "8000001");
  assert.equal(result.outcomes[0].defenderEmpireEntityId, "7000001");
});

test("keeps an unmatched outcome notification partial instead of inventing an outcome", () => {
  const result = normalizeAndPairSiegeNotifications(
    [description("SuccessfulSiege", 1)],
    [notification(11n, 8000001n, "SuccessfulSiege")],
  );

  assert.equal(result.outcomes.length, 0);
  assert.match(result.warnings[0], /unmatched/i);
});

test("does not infer cancellation or an outcome from a siege mark", () => {
  const result = normalizeAndPairSiegeNotifications(
    [description("MarkedForSiege", 1)],
    [notification(11n, 8000001n, "MarkedForSiege")],
  );

  assert.equal(result.outcomes.length, 0);
  assert.equal(result.notifications[0].kind, "marked");
  assert.equal(result.warnings.some((warning) => /cancel/i.test(warning)), false);
});

test("normalizes started attack and defense roles without creating a terminal outcome", () => {
  const result = normalizeAndPairSiegeNotifications(
    [
      description("StartedSiege", 1),
      description("StartedDefense", 2),
    ],
    [
      notification(11n, 8000001n, "StartedSiege"),
      notification(12n, 7000001n, "StartedDefense"),
    ],
  );

  assert.deepEqual(
    result.notifications.map((row) => row.kind),
    ["started_attack", "started_defense"],
  );
  assert.deepEqual(result.notifications[0].replacements, replacements);
  assert.equal(result.notifications[0].occurredAt, "2026-07-30T17:00:00.000Z");
  assert.deepEqual(result.outcomes, []);
  assert.deepEqual(result.warnings, []);
});

test("rejects every row sharing a duplicate notification ID", () => {
  const result = normalizeAndPairSiegeNotifications(
    [
      description("SuccessfulSiege", 1),
      description("FailedDefense", 2),
    ],
    [
      notification(11n, 8000001n, "SuccessfulSiege"),
      notification(11n, 7000001n, "FailedDefense"),
    ],
  );

  assert.deepEqual(result.notifications, []);
  assert.deepEqual(result.outcomes, []);
  assert.match(result.warnings[0], /duplicate.*11/i);
});

test("rejects a valid row when a malformed row reuses its notification ID", () => {
  const malformedDuplicate = notification(11n, 7000001n, "FailedDefense");
  malformedDuplicate.textReplacement = [];
  const result = normalizeAndPairSiegeNotifications(
    [
      description("SuccessfulSiege", 1),
      description("FailedDefense", 2),
    ],
    [
      notification(11n, 8000001n, "SuccessfulSiege"),
      malformedDuplicate,
    ],
  );

  assert.deepEqual(result.notifications, []);
  assert.deepEqual(result.outcomes, []);
  assert.equal(result.warnings.some((warning) => /duplicate.*11/i.test(warning)), true);
});

test("rejects malformed decimal notification and empire IDs", () => {
  const badEntity = notification("01", 8000001n, "SuccessfulSiege");
  const badEmpire = notification(12n, "-1", "FailedDefense");
  const result = normalizeAndPairSiegeNotifications(
    [
      description("SuccessfulSiege", 1),
      description("FailedDefense", 2),
    ],
    [badEntity, badEmpire],
  );

  assert.deepEqual(result.notifications, []);
  assert.deepEqual(result.outcomes, []);
  assert.equal(result.warnings.filter((warning) => /decimal integer/i.test(warning)).length, 2);
});

test("rejects non-two-element replacements and unknown enum variants", () => {
  const shortReplacements = notification(11n, 8000001n, "SuccessfulSiege");
  shortReplacements.textReplacement = ["watchtower only"];
  const unknown = notification(12n, 7000001n, "CancelledSiege");
  const result = normalizeAndPairSiegeNotifications(
    [description("SuccessfulSiege", 1)],
    [shortReplacements, unknown],
  );

  assert.deepEqual(result.notifications, []);
  assert.deepEqual(result.outcomes, []);
  assert.match(result.warnings[0], /exactly two string replacements/i);
  assert.match(result.warnings[1], /unsupported type CancelledSiege/i);
});

test("rejects invalid and overflowing seconds without coercion", () => {
  const beforeSupportedRange = notification(11n, 8000001n, "SuccessfulSiege", -1);
  const overflowing = notification(
    12n,
    7000001n,
    "FailedDefense",
    Number.MAX_SAFE_INTEGER,
  );
  const wrongType = notification(13n, 7000002n, "FailedDefense");
  wrongType.timestamp = "1785430800";
  const result = normalizeAndPairSiegeNotifications(
    [
      description("SuccessfulSiege", 1),
      description("FailedDefense", 2),
    ],
    [beforeSupportedRange, overflowing, wrongType],
  );

  assert.deepEqual(result.notifications, []);
  assert.deepEqual(result.outcomes, []);
  assert.equal(result.warnings.filter((warning) => /timestamp/i.test(warning)).length, 3);
});

test("does not pair counterpart rows with different timestamps or replacements", () => {
  const differentTimestamp = normalizeAndPairSiegeNotifications(
    [
      description("SuccessfulSiege", 1),
      description("FailedDefense", 2),
    ],
    [
      notification(11n, 8000001n, "SuccessfulSiege", 1785430800),
      notification(12n, 7000001n, "FailedDefense", 1785430801),
    ],
  );
  const differentReplacements = notification(14n, 7000001n, "FailedDefense");
  differentReplacements.textReplacement[1] = "N:{0}, E:{1}|~8198|~8027";
  const differentTuple = normalizeAndPairSiegeNotifications(
    [
      description("SuccessfulSiege", 1),
      description("FailedDefense", 2),
    ],
    [
      notification(13n, 8000001n, "SuccessfulSiege"),
      differentReplacements,
    ],
  );

  assert.deepEqual(differentTimestamp.outcomes, []);
  assert.deepEqual(differentTuple.outcomes, []);
  assert.equal(differentTimestamp.warnings.filter((warning) => /unmatched/i.test(warning)).length, 2);
  assert.equal(differentTuple.warnings.filter((warning) => /unmatched/i.test(warning)).length, 2);
});

test("rejects an ambiguous counterpart group", () => {
  const result = normalizeAndPairSiegeNotifications(
    [
      description("SuccessfulSiege", 1),
      description("FailedDefense", 2),
    ],
    [
      notification(11n, 8000001n, "SuccessfulSiege"),
      notification(12n, 8000002n, "SuccessfulSiege"),
      notification(13n, 7000001n, "FailedDefense"),
    ],
  );

  assert.deepEqual(result.outcomes, []);
  assert.match(result.warnings[0], /ambiguous/i);
});

test("rejects conflicting exact outcome pairs sharing one event key", () => {
  const result = normalizeAndPairSiegeNotifications(
    [
      description("SuccessfulSiege", 1),
      description("FailedDefense", 2),
      description("FailedSiege", 3),
      description("SuccessfulDefense", 4),
    ],
    [
      notification(11n, 8000001n, "SuccessfulSiege"),
      notification(12n, 7000001n, "FailedDefense"),
      notification(13n, 8000001n, "FailedSiege"),
      notification(14n, 7000001n, "SuccessfulDefense"),
    ],
  );

  assert.deepEqual(result.outcomes, []);
  assert.match(result.warnings[0], /ambiguous/i);
});

test("rejects a notification whose siege description is unavailable", () => {
  const result = normalizeAndPairSiegeNotifications(
    [description("FailedDefense", 2)],
    [notification(11n, 8000001n, "SuccessfulSiege")],
  );

  assert.deepEqual(result.notifications, []);
  assert.deepEqual(result.outcomes, []);
  assert.match(result.warnings[0], /description.*SuccessfulSiege/i);
});
