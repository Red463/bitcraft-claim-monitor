import assert from "node:assert/strict";
import test from "node:test";

import { summarizeMapPlayerEvidence } from "../scripts/map-player-live-evidence.mjs";

test("player evidence proves direct identity, overworld dimension, and fixed-point scale", () => {
  assert.deepEqual(summarizeMapPlayerEvidence({
    requestedPlayerIds: ["9007199254740993"],
    players: [{
      playerEntityId: "9007199254740993",
      locationX: 27_361_000,
      locationZ: 23_715_000,
      dimension: "1",
    }],
  }), {
    requestedPlayerCount: 1,
    matchedPlayerCount: 1,
    bounds: { minX: 27_361, minZ: 23_715, maxX: 27_361, maxZ: 23_715 },
    players: [{
      playerEntityId: "9007199254740993",
      raw: { x: 27_361_000, z: 23_715_000, dimension: "1" },
      map: { x: 27_361, z: 23_715 },
    }],
  });
});

test("player evidence fails closed for a missing selected identity", () => {
  assert.throws(() => summarizeMapPlayerEvidence({
    requestedPlayerIds: ["101", "102"],
    players: [{ playerEntityId: "101", locationX: 1_000, locationZ: 2_000, dimension: "1" }],
  }), /requested player 102.*no direct mobile/i);
});

test("player evidence rejects non-overworld and out-of-bounds mobile coordinates", () => {
  assert.throws(() => summarizeMapPlayerEvidence({
    requestedPlayerIds: ["101"],
    players: [{ playerEntityId: "101", locationX: 1_000, locationZ: 2_000, dimension: "2" }],
  }), /dimension.*overworld/i);
  assert.throws(() => summarizeMapPlayerEvidence({
    requestedPlayerIds: ["101"],
    players: [{ playerEntityId: "101", locationX: 38_400_001, locationZ: 2_000, dimension: "1" }],
  }), /outside.*world bounds/i);
});
