import assert from "node:assert/strict";
import test from "node:test";

import { localHistoryIncludeForPanel } from "../src/api/localHistoryInclude.ts";

test("dashboard local history includes market data for the income chart", () => {
  assert.equal(localHistoryIncludeForPanel("dashboard"), "activity,market,dashboard");
});

test("only Settlement Market requests the claim-scoped market history slice", () => {
  assert.equal(localHistoryIncludeForPanel("market"), "activity");
  assert.equal(localHistoryIncludeForPanel("settlement-market"), "activity,market");
});
