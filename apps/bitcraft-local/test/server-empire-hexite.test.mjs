import assert from "node:assert/strict";
import test from "node:test";

import {
  HEXITE_CAPSULE_WATCHTOWER_ENERGY_VALUE,
  liveEmpireHexiteProjection,
} from "../src/server/empireHexite.mjs";

test("live Empire Hexite projection publishes an exact treasury minimum immediately", () => {
  assert.deepEqual(liveEmpireHexiteProjection({
    treasury: "90071992547409931234",
    memberCount: 4,
    claimCount: 2,
    observedAt: "2026-07-30T18:00:00.000Z",
  }), {
    estimatedEnergyEquivalent: "90071992547409931234",
    capsuleEnergyCost: null,
    capsuleWatchtowerEnergyValue: HEXITE_CAPSULE_WATCHTOWER_ENERGY_VALUE,
    energy: {
      treasury: "90071992547409931234",
      playerInventories: null,
      sharedClaimInventories: null,
      total: "90071992547409931234",
    },
    capsules: {
      playerInventories: null,
      sharedClaimInventories: null,
      reserveBuildings: null,
      foundry: null,
      readyTotal: null,
    },
    coverage: {
      players: { fresh: 0, reused: 0, missing: 4, total: 4 },
      claims: { fresh: 0, reused: 0, missing: 2, total: 2 },
      foundry: "unavailable",
    },
    status: "partial",
    sweepStartedAt: null,
    calculatedAt: "2026-07-30T18:00:00.000Z",
    refreshing: false,
    errors: [
      "Live regional player and claim inventory joins are not available yet.",
      "Completed Foundry output is not available.",
    ],
  });
});

test("live Empire Hexite projection adds completed global Foundry capsules to the known minimum", () => {
  const projection = liveEmpireHexiteProjection({
    treasury: "5000",
    foundryCapsules: "25",
    memberCount: 4,
    claimCount: 1,
    observedAt: "2026-07-19T09:00:00.000Z",
  });

  assert.equal(projection.estimatedEnergyEquivalent, "30000");
  assert.equal(projection.energy.total, "5000");
  assert.equal(projection.capsules.foundry, "25");
  assert.equal(projection.capsules.readyTotal, "25");
  assert.equal(projection.coverage.foundry, "complete");
  assert.equal(projection.errors.some((error) => /Foundry output is not available/i.test(error)), false);
  assert.equal(projection.errors.some((error) => /inventory joins are not available/i.test(error)), true);
});

test("live Empire Hexite projection never invents invalid counts or amounts", () => {
  const projection = liveEmpireHexiteProjection({
    treasury: "not-an-amount",
    memberCount: -10,
    claimCount: Number.NaN,
    observedAt: "not-a-date",
  });

  assert.equal(projection.estimatedEnergyEquivalent, null);
  assert.equal(projection.energy.treasury, null);
  assert.equal(projection.energy.total, null);
  assert.equal(projection.status, "error");
  assert.match(projection.errors.join("\n"), /treasury amount is unavailable/i);
  assert.deepEqual(projection.coverage.players, { fresh: 0, reused: 0, missing: 0, total: 0 });
  assert.deepEqual(projection.coverage.claims, { fresh: 0, reused: 0, missing: 0, total: 0 });
  assert.equal(projection.calculatedAt, null);
});
