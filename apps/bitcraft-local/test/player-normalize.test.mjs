import assert from "node:assert/strict";
import test from "node:test";

import { formatPlaytime } from "../src/utils/format.ts";
import { normalizePlayer } from "../src/utils/normalize.ts";

test("normalizePlayer preserves BitJita total played and signed-in durations", () => {
  const player = normalizePlayer({
    entityId: "player-1",
    username: "Modular",
    timePlayed: 1_670_400,
    totalSignedIn: 4_147_200,
  });

  assert.equal(player.timePlayedSeconds, 1_670_400);
  assert.equal(player.timeSignedInSeconds, 4_147_200);
});

test("normalizePlayer treats BitJita online aliases as signed in", () => {
  assert.equal(normalizePlayer({ username: "Mosswick", online: true }).signedIn, true);
  assert.equal(normalizePlayer({ username: "Oddfawn", isOnline: true }).signedIn, true);
});

test("formatPlaytime renders long player durations in days and hours", () => {
  assert.equal(formatPlaytime(1_670_400), "19d 8h");
  assert.equal(formatPlaytime(7_260), "2h 1m");
  assert.equal(formatPlaytime(null), "Unavailable");
});
