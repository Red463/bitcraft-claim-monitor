import assert from "node:assert/strict";
import test from "node:test";
import {
  buildProfessionCapability,
  prioritizeSettlementNeeds,
  tierRequiredLevel,
} from "../src/pages/professionCapability.ts";

test("tierRequiredLevel follows live profession tier boundaries", () => {
  assert.deepEqual(Array.from({ length: 10 }, (_, index) => tierRequiredLevel(index + 1)), [1, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
});

test("one next-tier member creates next-tier dependency risk", () => {
  const result = buildProfessionCapability({ id: 3, name: "Carpentry", settlementTier: 5, members: [{ name: "Modular", level: 62 }, { name: "Mosswick", level: 52 }] });
  assert.equal(result.nextOutlook, "ready");
  assert.equal(result.dependencyRisk, "high");
  assert.equal(result.nextCapableCount, 1);
  assert.match(result.explanation, /T6 ready, but relies on Modular/i);
});

test("multiple qualified members are resilient", () => {
  const result = buildProfessionCapability({ id: 5, name: "Mining", settlementTier: 5, members: [{ name: "A", level: 51 }, { name: "B", level: 50 }] });
  assert.equal(result.dependencyRisk, "gap");
  assert.match(result.explanation, /T5 baseline is covered by 2 members/i);
  assert.match(result.explanation, /No member supports T6 yet/i);
});

test("next-tier-ready explanation names both tiers", () => {
  const result = buildProfessionCapability({ id: 11, name: "Farming", settlementTier: 5, members: [{ name: "A", level: 64 }, { name: "B", level: 55 }, { name: "C", level: 52 }, { name: "D", level: 50 }] });
  assert.match(result.explanation, /T6 ready, but relies on A/i);
  assert.match(result.explanation, /T5 baseline is covered by 4 members/i);
});

test("next-tier outlook is based only on profession capability", () => {
  assert.equal(buildProfessionCapability({ id: 3, name: "Carpentry", settlementTier: 5, members: [{ name: "A", level: 60 }] }).nextOutlook, "ready");
  assert.equal(buildProfessionCapability({ id: 3, name: "Carpentry", settlementTier: 5, members: [{ name: "A", level: 55 }] }).nextOutlook, "developing");
  assert.equal(buildProfessionCapability({ id: 3, name: "Carpentry", settlementTier: 10, members: [{ name: "A", level: 100 }] }).nextOutlook, "maximum-tier");
});

test("missing settlement tier suppresses readiness claims", () => {
  const result = buildProfessionCapability({ id: 3, name: "Carpentry", settlementTier: 0, members: [{ name: "A", level: 100 }] });
  assert.equal(result.currentStatus, "unknown");
  assert.equal(result.nextOutlook, "unknown");
});

test("settlement needs prioritize next-tier gaps before next-tier dependencies", () => {
  const rows = [
    buildProfessionCapability({ id: 1, name: "Carpentry", settlementTier: 5, members: [{ name: "A", level: 40 }] }),
    buildProfessionCapability({ id: 2, name: "Mining", settlementTier: 5, members: [{ name: "B", level: 60 }] }),
    buildProfessionCapability({ id: 3, name: "Farming", settlementTier: 5, members: [{ name: "C", level: 60 }, { name: "D", level: 65 }] }),
  ];
  assert.deepEqual(prioritizeSettlementNeeds(rows).map((need) => need.kind), ["next-gap", "next-dependency"]);
});
