import assert from "node:assert/strict";
import test from "node:test";
import { classifyAdminCondition, scheduledJobTimingLabel } from "../src/components/admin/adminStatusPresentation.ts";

test("admin conditions are classified by operational severity", () => {
  assert.equal(classifyAdminCondition({ configured: true, ok: false, critical: true }), "action");
  assert.equal(classifyAdminCondition({ configured: false, optional: true }), "degraded");
  assert.equal(classifyAdminCondition({ ok: true }), "healthy");
  assert.equal(classifyAdminCondition({ ok: false, localDevelopment: true }), "degraded");
});

test("disabled schedulers never advertise a stale next run", () => {
  assert.equal(scheduledJobTimingLabel({ nextRunAt: "2026-01-01T00:00:00Z" }, false), "Not scheduled while disabled");
  assert.equal(scheduledJobTimingLabel({}, true), "Not scheduled");
});
