import assert from "node:assert/strict";
import test from "node:test";

import { snapshotActivityChanges, snapshotSummary } from "../src/server/snapshotPlanning.mjs";

test("snapshotSummary derives the cheap settlement snapshot row fields", () => {
  const payload = {
    claimId: "12345678",
    claim: { supplies: "125.5", treasury: "450" },
    membersCount: "7",
    buildingsCount: "4",
    market: { listings: [{ id: 1 }, { id: 2 }] },
  };

  assert.deepEqual(snapshotSummary(payload), {
    claimId: "12345678",
    supplies: 125.5,
    treasury: 450,
    membersCount: 7,
    buildingsCount: 4,
    marketCount: 2,
  });
});

test("snapshotActivityChanges emits baseline when no previous snapshot exists", () => {
  assert.deepEqual(snapshotActivityChanges(null, {
    supplies: 10,
    treasury: 20,
    membersCount: 3,
    buildingsCount: 2,
    marketCount: 1,
  }), [{ type: "baseline", summary: "Baseline snapshot saved", metadata: { membersCount: 3, buildingsCount: 2, marketCount: 1 } }]);
});

test("snapshotActivityChanges emits only changed scalar settlement fields", () => {
  const previous = { supplies: 100, treasury: 20, members_count: 3, buildings_count: 2, market_count: 5 };
  const next = { supplies: 90, treasury: 35, membersCount: 3, buildingsCount: 4, marketCount: 5 };

  assert.deepEqual(snapshotActivityChanges(previous, next), [
    { type: "supplies", summary: "-10 supplies", metadata: { before: 100, after: 90 } },
    { type: "treasury", summary: "+15g to treasury", metadata: { before: 20, after: 35 } },
    { type: "buildings", summary: "+2 buildings", metadata: { before: 2, after: 4 } },
  ]);
});
