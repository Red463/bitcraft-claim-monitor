import assert from "node:assert/strict";
import test from "node:test";

import { createPageRefreshCycle, createPageRefreshTaskCoordinator } from "../src/refresh/pageRefresh.mjs";
import * as localHistoryModule from "../src/api/localHistory.ts";
import { localHistoryIncludeForPanel } from "../src/api/localHistoryInclude.ts";

test("dashboard local history includes market data for the income chart", () => {
  assert.equal(localHistoryIncludeForPanel("dashboard"), "activity,market,dashboard");
});

test("local history ownership is exact for Activity and Settlement Market", () => {
  assert.equal(localHistoryIncludeForPanel("activity"), "activity");
  assert.equal(localHistoryIncludeForPanel("settlement-market"), "market");
});

test("pages without a history projection neither fetch nor enroll a refresh task", () => {
  for (const panel of ["market", "members", "map", "craftcalc", "sync"]) {
    assert.equal(localHistoryIncludeForPanel(panel), "", panel);
  }

  let fetchCalls = 0;
  const cycle = createPageRefreshCycle("members", 1, "initial", { createId: () => "members-initial" });
  const coordinator = createPageRefreshTaskCoordinator();
  coordinator.beginCycle(cycle);
  assert.equal(typeof localHistoryModule.localHistoryRequestForPanel, "function");
  const request = localHistoryModule.localHistoryRequestForPanel({
    activePanel: "members",
    claimId: "20",
    pageRefreshCycle: cycle,
    fetch: async () => {
      fetchCalls += 1;
      throw new Error("unused history fetch must not start");
    },
  });
  if (request) void coordinator.trackPromise(cycle.id, "local-history", request);
  coordinator.seal(cycle.id);

  assert.equal(request, null);
  assert.equal(fetchCalls, 0);
  assert.equal(coordinator.snapshot().status, "complete");
  assert.equal(coordinator.snapshot().lastSuccessfulAt != null, true);
});

test("owned history refreshes update only returned projections without clearing same-scope data", () => {
  assert.equal(typeof localHistoryModule.mergeLocalHistoryState, "function");
  const previous = {
    market: { listings: ["old-market"] },
    activity: ["old-activity"],
    activityTotal: 1,
    dashboard: { trend: "old-dashboard" },
    error: "old-error",
    refreshToken: 4,
  };

  assert.deepEqual(localHistoryModule.mergeLocalHistoryState(previous, {
    activity: { events: ["new-activity"], total: 1 },
  }), {
    market: { listings: ["old-market"] },
    activity: ["new-activity"],
    activityTotal: 1,
    dashboard: { trend: "old-dashboard" },
    error: null,
    refreshToken: 5,
  });
  assert.deepEqual(localHistoryModule.mergeLocalHistoryState(previous, {
    market: { listings: ["new-market"] },
  }), {
    market: { listings: ["new-market"] },
    activity: ["old-activity"],
    activityTotal: 1,
    dashboard: { trend: "old-dashboard" },
    error: null,
    refreshToken: 5,
  });
});
