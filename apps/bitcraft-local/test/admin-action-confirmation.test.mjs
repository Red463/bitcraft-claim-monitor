import assert from "node:assert/strict";
import test from "node:test";
import { validateAdminActionConfirmation } from "../src/components/admin/adminActionConfirmation.ts";

test("destructive confirmation metadata requires target, impact, and explicit reversibility", () => {
  assert.equal(validateAdminActionConfirmation({ title: "Delete data", target: "Usage analytics", impact: "Deletes all rows.", reversible: false, confirmLabel: "Delete data", tone: "danger", onConfirm() {} }), true);
  assert.equal(validateAdminActionConfirmation({ title: "", target: "Usage analytics", impact: "Deletes all rows.", reversible: false, confirmLabel: "Delete", tone: "danger", onConfirm() {} }), false);
  assert.equal(validateAdminActionConfirmation({ title: "Delete", target: "", impact: "", reversible: false, confirmLabel: "Delete", tone: "danger", onConfirm() {} }), false);
});
