import assert from "node:assert/strict";
import test from "node:test";

import {
  beginGameDataScope,
  completeGameDataScope,
  completeEmptyGameDataScope,
} from "../src/api/gameDataLoader.ts";

test("game data never retains data across page or claim scopes", () => {
  const dashboardA = { claimId: "claim-a", panel: "dashboard" };
  const membersA = { claimId: "claim-a", panel: "members" };

  let state = completeGameDataScope(
    { data: null, error: null, loading: true, scopeKey: "claim-a:dashboard" },
    "claim-a:dashboard",
    dashboardA,
  );
  assert.deepEqual(state, {
    data: dashboardA,
    error: null,
    loading: false,
    scopeKey: "claim-a:dashboard",
  });

  state = beginGameDataScope(state, "claim-a:members");
  assert.deepEqual(state, {
    data: null,
    error: null,
    loading: true,
    scopeKey: "claim-a:members",
  });

  state = beginGameDataScope({
    data: dashboardA,
    error: "previous refresh failed",
    loading: false,
    scopeKey: "claim-a:dashboard",
  }, "claim-a:dashboard");
  assert.deepEqual(state, {
    data: dashboardA,
    error: null,
    loading: true,
    scopeKey: "claim-a:dashboard",
  });

  state = beginGameDataScope(state, "claim-b:dashboard");
  assert.deepEqual(state, {
    data: null,
    error: null,
    loading: true,
    scopeKey: "claim-b:dashboard",
  });

  state = beginGameDataScope(state, "claim-a:members", { data: membersA });
  assert.deepEqual(state, {
    data: membersA,
    error: null,
    loading: true,
    scopeKey: "claim-a:members",
  });
});

test("late fetch results cannot replace the current scope", () => {
  const membersState = {
    data: { claimId: "claim-a", panel: "members" },
    error: null,
    loading: true,
    scopeKey: "claim-a:members",
  };

  assert.deepEqual(
    completeGameDataScope(membersState, "claim-a:dashboard", { claimId: "claim-a", panel: "dashboard" }),
    membersState,
  );
});

test("an empty-domain panel replaces populated data and settles in its requested scope", () => {
  const state = completeEmptyGameDataScope({
    data: { claimId: "claim-a", panel: "dashboard" },
    error: null,
    loading: false,
    scopeKey: "claim-a:dashboard",
  }, "claim-a:planning");

  assert.deepEqual(state, {
    data: null,
    error: null,
    loading: false,
    scopeKey: "claim-a:planning",
  });
  assert.equal(Boolean(state.loading || state.error), false, "an empty-domain panel can render instead of staying on a skeleton");
});
