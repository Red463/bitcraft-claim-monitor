import assert from "node:assert/strict";
import test from "node:test";

const { CraftActionEvidenceCache } = await import(
  new URL("../src/server/game-data/craftActionEvidence.ts", import.meta.url).href,
);

const target = {
  craftEntityId: "9001",
  buildingEntityId: "7001",
  recipeId: "3001",
};

function action(overrides = {}) {
  return {
    autoId: 91n,
    entityId: 101n,
    startTime: 1_000n,
    duration: 100n,
    target: 7001n,
    recipeId: 3001n,
    actionType: { tag: "Craft" },
    lastActionResult: { tag: "Success" },
    clientCancel: false,
    wasConsumed: false,
    ...overrides,
  };
}

test("retains the latest valid action through deletion and its original tolerance window", () => {
  const cache = new CraftActionEvidenceCache();
  cache.upsert(action(), 1_050);
  cache.upsert(action({ duration: 120n }), 1_060);
  cache.retainDeleted(action({ duration: 120n }), 1_070);

  assert.deepEqual(cache.matches(target, 1_125), [{
    playerEntityId: "101",
    buildingEntityId: "7001",
    recipeId: "3001",
    autoId: "91",
    startTimeMs: 1_000,
    expiresAtMs: 6_120,
  }]);
  assert.deepEqual(cache.matches(target, 6_121), []);
});

test("matches exact action targets only and preserves two-player ambiguity", () => {
  const cache = new CraftActionEvidenceCache();
  cache.upsert(action(), 1_001);
  cache.upsert(action({ autoId: 92n, entityId: 202n }), 1_001);
  cache.upsert(action({ autoId: 93n, target: 7002n }), 1_001);

  assert.deepEqual(cache.matches(target, 1_050).map((row) => row.playerEntityId), ["101", "202"]);
  assert.deepEqual(cache.matches({ ...target, buildingEntityId: "7002" }, 1_050).map((row) => row.autoId), ["93"]);
});

test("invalid action updates invalidate prior evidence by Relay auto id", () => {
  const cache = new CraftActionEvidenceCache();
  cache.upsert(action(), 1_001);
  cache.upsert(action({ wasConsumed: true }), 1_002);

  assert.deepEqual(cache.matches(target, 1_050), []);
});
