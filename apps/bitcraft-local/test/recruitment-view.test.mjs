import assert from "node:assert/strict";
import test from "node:test";

let viewModule = null;
try {
  viewModule = await import(
    new URL("../src/pages/recruitmentView.ts", import.meta.url).href,
  );
} catch {
  // The first TDD run proves the provider-neutral recruitment view model is absent.
}

test("recruitment view presents the live stock, skill gate, and approval mode", () => {
  assert.ok(viewModule, "recruitment view module must exist");
  assert.deepEqual(viewModule.recruitmentSummary({
    isRecruiting: true,
    recruitment: [{
      entityId: "1369094286821318198",
      remainingStock: "19",
      requiredSkillId: "1",
      requiredSkillLevel: "1",
      requiredApproval: false,
      requiredSkill: { id: "1", name: "Forestry" },
    }],
  }), {
    isRecruiting: true,
    remainingStock: "19",
    statusLabel: "19 available",
    requirementLabel: "Forestry level 1",
    approvalLabel: "Open entry",
  });
});

test("recruitment view presents an unavailable posting without fabricating requirements", () => {
  assert.ok(viewModule, "recruitment view module must exist");
  assert.deepEqual(viewModule.recruitmentSummary({
    isRecruiting: false,
    recruitment: [],
  }), {
    isRecruiting: false,
    remainingStock: "0",
    statusLabel: "Closed",
    requirementLabel: "No active recruitment posting",
    approvalLabel: "Unavailable",
  });
});
