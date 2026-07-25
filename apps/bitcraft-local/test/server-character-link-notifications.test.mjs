import assert from "node:assert/strict";
import test from "node:test";

import {
  characterLinkAssignedDm,
  characterLinkAssignmentCorrectiveDm,
  characterLinkUnassignedDm,
} from "../src/server/characterLinkNotifications.mjs";

const details = {
  projectName: "Timbersteel Claim Monitor",
  administrator: "Owner",
  characterName: "Timber Tester",
  characterPlayerId: "12345678",
};

function payloadText(payload) {
  return JSON.stringify(payload);
}

test("assigned-character DMs identify the project, administrator, character, and privacy controls", () => {
  const payload = characterLinkAssignedDm(details);
  const text = payloadText(payload);

  assert.match(text, /Timbersteel Claim Monitor/);
  assert.match(text, /Owner/);
  assert.match(text, /Timber Tester/);
  assert.match(text, /12345678/);
  assert.match(text, /assigned and approved/i);
  assert.match(text, /Settings.*Privacy & Data/);
  assert.deepEqual(payload.allowed_mentions, { parse: [] });
});

test("unassignment DMs explain the completed removal and available privacy controls", () => {
  const payload = characterLinkUnassignedDm(details);
  const text = payloadText(payload);

  assert.match(text, /Timbersteel Claim Monitor/);
  assert.match(text, /Owner/);
  assert.match(text, /Timber Tester/);
  assert.match(text, /12345678/);
  assert.match(text, /removed/i);
  assert.match(text, /Settings.*Privacy & Data/);
  assert.deepEqual(payload.allowed_mentions, { parse: [] });
});

test("corrective DMs make clear that a notified assignment did not complete", () => {
  const payload = characterLinkAssignmentCorrectiveDm(details);
  const text = payloadText(payload);

  assert.match(text, /Timbersteel Claim Monitor/);
  assert.match(text, /Timber Tester/);
  assert.match(text, /12345678/);
  assert.match(text, /did not complete/i);
  assert.match(text, /not linked/i);
  assert.deepEqual(payload.allowed_mentions, { parse: [] });
});
