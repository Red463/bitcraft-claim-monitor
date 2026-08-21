import assert from "node:assert/strict";
import test from "node:test";

import { adminLoadingStage } from "../src/components/admin/adminLoadingState.ts";

test("admin authentication never exposes signed-out content while the request is pending", () => {
  assert.equal(adminLoadingStage({ authLoading: true, delayElapsed: false }), "pending-hidden");
  assert.equal(adminLoadingStage({ authLoading: true, delayElapsed: true }), "pending-visible");
  assert.equal(adminLoadingStage({ authLoading: false, delayElapsed: false }), "settled");
  assert.equal(adminLoadingStage({ authLoading: false, delayElapsed: true }), "settled");
});
