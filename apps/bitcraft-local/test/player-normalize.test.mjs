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

test("normalizePlayer preserves provider-neutral durations and advances an ISO sign-in session", () => {
  const originalNow = Date.now;
  Date.now = () => Date.parse("2026-07-29T20:45:00.000Z");
  try {
    const player = normalizePlayer({
      playerEntityId: "1369094286756659093",
      username: "Modular",
      signedIn: true,
      signInTimestamp: "2026-07-29T20:30:00.000Z",
      sessionSeconds: 30,
      timePlayedSeconds: 7200,
      timeSignedInSeconds: 3600,
    });
    assert.equal(player.sessionSeconds, 900);
    assert.equal(player.timePlayedSeconds, 7200);
    assert.equal(player.timeSignedInSeconds, 3600);
  } finally {
    Date.now = originalNow;
  }
});

test("normalizePlayer treats BitJita online aliases as signed in", () => {
  assert.equal(normalizePlayer({ username: "Mosswick", online: true }).signedIn, true);
  assert.equal(normalizePlayer({ username: "Oddfawn", isOnline: true }).signedIn, true);
});


test("normalizePlayer preserves current region data from BitJita player payloads", () => {
  const player = normalizePlayer({ username: "Modular", regionId: 19, locationX: 27352, locationZ: 25177 });

  assert.equal(player.regionId, "19");
  assert.equal(player.locationX, 27352);
  assert.equal(player.locationZ, 25177);
  assert.equal(normalizePlayer({ username: "Mosswick", currentRegionName: "Kragfen" }).regionName, "Kragfen");
});
test("formatPlaytime renders long player durations in days and hours", () => {
  assert.equal(formatPlaytime(1_670_400), "19d 8h");
  assert.equal(formatPlaytime(7_260), "2h 1m");
  assert.equal(formatPlaytime(null), "Unavailable");
});

