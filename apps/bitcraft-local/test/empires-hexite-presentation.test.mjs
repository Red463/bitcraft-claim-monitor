import assert from "node:assert/strict";
import test from "node:test";

import {
  describeHexiteReserveMetric,
  describeHexiteReserves,
  presentHexiteReserveMetric,
  presentHexiteReserves,
} from "../src/pages/empires/hexitePresentation.ts";
import { compareOptionalSortValues } from "../src/utils/tableSort.ts";

test("Hexite metric presentations distinguish queued and scanning states from zero", () => {
  for (const metric of ["energy", "capsules", "watchtower"]) {
    assert.deepEqual(presentHexiteReserveMetric({ status: "pending", refreshing: false }, metric), {
      primary: "Queued",
      secondary: "Awaiting first sweep",
      detail: "Foundry Capsules unavailable",
      sortValue: null,
      tone: "muted",
    });
    assert.equal(presentHexiteReserveMetric({ status: "pending", refreshing: true }, metric).primary, "Scanning");
    assert.equal(
      presentHexiteReserveMetric({ status: "error", estimatedEnergyEquivalent: null }, metric).primary,
      "Unavailable",
    );
    assert.equal(
      presentHexiteReserveMetric({ status: "error", estimatedEnergyEquivalent: null }, metric).sortValue,
      null,
    );
  }

  assert.doesNotMatch(describeHexiteReserves({ status: "pending" }), /0 HE/);
  assert.match(describeHexiteReserves({ status: "pending" }), /not available until the scan completes/i);
});

test("Hexite metric presentations separate stored energy, Capsules, and Watchtower value", () => {
  const calculated = {
    status: "partial",
    refreshing: false,
    estimatedEnergyEquivalent: 44_184,
    capsuleEnergyCost: 100,
    capsuleWatchtowerEnergyValue: 1_000,
    calculatedAt: "2026-07-18T10:00:00.000Z",
    energy: {
      treasury: 1_059,
      playerInventories: 109,
      sharedClaimInventories: 16,
      total: 1_184,
    },
    capsules: { readyTotal: 43, reserveBuildings: 37 },
    coverage: {
      players: { fresh: 1, reused: 1, missing: 1, total: 3 },
      claims: { fresh: 1, reused: 0, missing: 0, total: 1 },
      foundry: "unavailable",
    },
  };
  const now = Date.parse("2026-07-18T12:00:00.000Z");

  const energy = presentHexiteReserveMetric(calculated, "energy", now);
  assert.equal(energy.primary, "1,184 HE");
  assert.equal(energy.secondary, "Loose energy stored");
  assert.equal(energy.sortValue, 1_184);

  const capsules = presentHexiteReserveMetric(calculated, "capsules", now);
  assert.equal(capsules.primary, "43");
  assert.equal(capsules.secondary, "37 in Hexite Reserves");
  assert.equal(capsules.sortValue, 43);

  const watchtower = presentHexiteReserveMetric(calculated, "watchtower", now);
  assert.equal(watchtower.primary, "≈ 44,184 energy");
  assert.equal(watchtower.secondary, "43 capsules × 1,000");
  assert.equal(watchtower.detail, "Partial · 75% scanned · 2h ago");
  assert.equal(watchtower.sortValue, 44_184);
  assert.equal(watchtower.tone, "warn");
  assert.deepEqual(presentHexiteReserves(calculated, now), watchtower);

  assert.match(describeHexiteReserveMetric(calculated, "energy"), /1,184 HE stored/);
  assert.match(describeHexiteReserveMetric(calculated, "capsules"), /37 in Hexite Reserves/);
  assert.match(describeHexiteReserveMetric(calculated, "watchtower"), /cost 100 HE to craft/);
  assert.match(describeHexiteReserveMetric(calculated, "watchtower"), /provide 1,000 Watchtower energy/);
});

test("optional table values keep unavailable Hexite estimates last in either direction", () => {
  const values = [null, 10, 2];
  assert.deepEqual([...values].sort((a, b) => compareOptionalSortValues(a, b, "asc")), [2, 10, null]);
  assert.deepEqual([...values].sort((a, b) => compareOptionalSortValues(a, b, "desc")), [10, 2, null]);
});
