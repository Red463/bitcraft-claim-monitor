import assert from "node:assert/strict";
import test from "node:test";

let presentationModule = null;
try {
  presentationModule = await import("../src/pages/production/passiveCraftPresentation.ts");
} catch {
  // The focused red run proves the partial-quantity presentation helper is absent.
}

test("passive craft quantity displays missing evidence as unavailable instead of zero", () => {
  assert.ok(presentationModule, "expected passive craft presentation helpers");
  assert.equal(presentationModule.passiveCraftQuantityLabel(null), "Unavailable");
  assert.equal(presentationModule.passiveCraftQuantityLabel(undefined), "Unavailable");
  assert.equal(presentationModule.passiveCraftQuantityLabel("0"), "0");
  assert.equal(presentationModule.passiveCraftQuantityLabel("9007199254740993"), "9,007,199,254,740,993");
});

test("member passive craft quantity never describes missing evidence as zero crafted", () => {
  assert.ok(presentationModule, "expected passive craft presentation helpers");
  assert.equal(presentationModule.memberPassiveCraftQuantityLabel(null), "Unavailable");
  assert.equal(presentationModule.memberPassiveCraftQuantityLabel(undefined), "Unavailable");
  assert.equal(presentationModule.memberPassiveCraftQuantityLabel("0"), "0 crafted");
  assert.equal(presentationModule.memberPassiveCraftQuantityLabel("12"), "12 crafted");
});
