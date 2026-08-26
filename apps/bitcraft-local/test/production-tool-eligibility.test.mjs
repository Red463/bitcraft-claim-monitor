import assert from "node:assert/strict";
import test from "node:test";

const { evaluateCraftEligibility } = await import(
  new URL("../src/pages/production/toolEligibility.ts", import.meta.url).href,
);

test("production eligibility requires skill before inspecting Toolbelt", () => {
  assert.deepEqual(evaluateCraftEligibility({
    skillName: "Forestry",
    requiredLevel: 25,
    memberLevel: 20,
    toolRequirement: { toolType: 7, level: 4, power: 30 },
    expectedTool: "Logging Tool",
    tools: null,
    toolbeltUnavailable: false,
  }), {
    ok: false,
    text: "Needs Forestry Lv 25 (has 20)",
  });
});

test("production eligibility reports loading and unavailable Toolbelt honestly", () => {
  const base = {
    skillName: "Forestry",
    requiredLevel: 20,
    memberLevel: 25,
    toolRequirement: { toolType: 7, level: 4, power: 30 },
    expectedTool: "Logging Tool",
    tools: null,
  };
  assert.deepEqual(evaluateCraftEligibility({ ...base, toolbeltUnavailable: false }), {
    ok: false,
    pending: true,
    text: "Checking Toolbelt...",
  });
  assert.deepEqual(evaluateCraftEligibility({ ...base, toolbeltUnavailable: true }), {
    ok: false,
    pending: true,
    text: "Toolbelt unavailable",
  });
});

test("production eligibility uses Relay tool type, tier, and power", () => {
  const base = {
    skillName: "Forestry",
    requiredLevel: 20,
    memberLevel: 25,
    toolRequirement: { toolType: 7, level: 4, power: 30 },
    expectedTool: "Logging Tool",
    toolbeltUnavailable: false,
  };
  assert.deepEqual(evaluateCraftEligibility({
    ...base,
    tools: [{ name: "Steel Axe", toolType: 7, tier: 3, toolPower: 35 }],
  }), {
    ok: true,
    text: "Can craft - Forestry Lv 25 - Steel Axe (35 power)",
  });
  assert.deepEqual(evaluateCraftEligibility({
    ...base,
    tools: [{ name: "Weak Axe", toolType: 7, tier: 3, toolPower: 20 }],
  }), {
    ok: false,
    text: "Needs T3+ Logging Tool with 30+ power in Toolbelt",
  });
});
