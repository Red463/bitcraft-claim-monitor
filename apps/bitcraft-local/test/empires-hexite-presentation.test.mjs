import assert from "node:assert/strict";
import test from "node:test";

import { describeHexiteReserves, presentHexiteReserves } from "../src/pages/empires/hexitePresentation.ts";
import { compareOptionalSortValues } from "../src/utils/tableSort.ts";

test("Hexite presentation distinguishes queued and scanning states from zero", () => {
  assert.deepEqual(presentHexiteReserves({ status: "pending", refreshing: false }), {
    primary: "Queued",
    secondary: "Awaiting first sweep",
    detail: "Foundry Capsules unavailable",
    sortValue: null,
    tone: "muted",
  });
  assert.equal(presentHexiteReserves({ status: "pending", refreshing: true }).primary, "Scanning");
  assert.doesNotMatch(describeHexiteReserves({ status: "pending" }), /0 HE/);
  assert.match(describeHexiteReserves({ status: "pending" }), /not available until the scan completes/i);
  assert.equal(presentHexiteReserves({ status: "error", estimatedEnergyEquivalent: null }).primary, "Unavailable");
  assert.equal(presentHexiteReserves({ status: "error", estimatedEnergyEquivalent: null }).sortValue, null);
});

test("Hexite presentation formats the estimate, ready Capsules, coverage, and age", () => {
  const presentation = presentHexiteReserves({
    status: "partial",
    refreshing: false,
    estimatedEnergyEquivalent: 5_484,
    calculatedAt: "2026-07-18T10:00:00.000Z",
    capsules: { readyTotal: 43 },
    coverage: {
      players: { fresh: 1, reused: 1, missing: 1, total: 3 },
      claims: { fresh: 1, reused: 0, missing: 0, total: 1 },
      foundry: "unavailable",
    },
  }, Date.parse("2026-07-18T12:00:00.000Z"));

  assert.equal(presentation.primary, "≈ 5,484 HE");
  assert.equal(presentation.secondary, "(43 capsules ready)");
  assert.equal(presentation.detail, "Partial · 75% scanned · 2h ago");
  assert.equal(presentation.sortValue, 5_484);
  assert.equal(presentation.tone, "warn");
});

test("optional table values keep unavailable Hexite estimates last in either direction", () => {
  const values = [null, 10, 2];
  assert.deepEqual([...values].sort((a, b) => compareOptionalSortValues(a, b, "asc")), [2, 10, null]);
  assert.deepEqual([...values].sort((a, b) => compareOptionalSortValues(a, b, "desc")), [10, 2, null]);
});
