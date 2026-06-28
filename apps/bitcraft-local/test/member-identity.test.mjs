import assert from "node:assert/strict";
import test from "node:test";

import { memberDisplayName, memberTrackingId, memberTrackingKeys } from "../src/utils/memberIdentity.ts";

test("memberTrackingId accepts documented and observed member id fields", () => {
  assert.equal(memberTrackingId({ playerEntityId: "player-1" }), "player-1");
  assert.equal(memberTrackingId({ player_entity_id: "player-2" }), "player-2");
  assert.equal(memberTrackingId({ playerId: "player-3" }), "player-3");
  assert.equal(memberTrackingId({ player_id: "player-4" }), "player-4");
  assert.equal(memberTrackingId({ entityId: "player-5" }), "player-5");
  assert.equal(memberTrackingId({ entity_id: "player-6" }), "player-6");
  assert.equal(memberTrackingId({ id: "player-7" }), "player-7");
  assert.equal(memberTrackingId(null), "");
});

test("memberDisplayName falls back through public player name fields", () => {
  assert.equal(memberDisplayName({ userName: "Timber" }), "Timber");
  assert.equal(memberDisplayName({ username: "Steel" }), "Steel");
  assert.equal(memberDisplayName({ playerUsername: "Oak" }), "Oak");
  assert.equal(memberDisplayName({ name: "Ash" }), "Ash");
  assert.equal(memberDisplayName(undefined), "");
});

test("memberTrackingKeys returns normalized unique id and name keys", () => {
  assert.deepEqual(memberTrackingKeys({ playerEntityId: "Player-1", userName: "Tester" }), ["player-1", "tester"]);
  assert.deepEqual(memberTrackingKeys({ playerEntityId: "Same", userName: "same" }), ["same"]);
});
