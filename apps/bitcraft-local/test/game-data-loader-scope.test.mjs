import assert from "node:assert/strict";
import test from "node:test";

import {
  beginGameDataScope,
  cacheGameDataForNavigation,
  clearPreviousClaimNavigationCache,
  completeGameDataScope,
  completeEmptyGameDataScope,
} from "../src/api/gameDataLoader.ts";
import { createPageNavigationCache } from "../src/api/pageNavigationCache.ts";

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

test("navigation cache keeps the complete scoped payload and clears only a confirmed previous claim", () => {
  const cache = createPageNavigationCache({ maxBytes: 100_000, now: () => 0 });
  const priorPayload = {
    inventories: [{ itemType: 0, itemId: "7" }, { itemType: 1, itemId: "7" }],
    domainStatus: { inventories: { generation: "9", coherence: "complete" } },
    responseMeta: { newestGeneration: "9", coherence: "complete" },
  };
  cacheGameDataForNavigation(cache, "claim-a:inventory", "claim-a", "inventory", priorPayload, 321);
  cacheGameDataForNavigation(cache, "claim-b:inventory", "claim-b", "inventory", { claimId: "claim-b" }, 321);

  assert.equal(cache.get("claim-a:inventory")?.data, priorPayload);
  clearPreviousClaimNavigationCache(cache, "claim-a", "claim-b");
  assert.equal(cache.get("claim-a:inventory"), undefined);
  assert.ok(cache.get("claim-b:inventory"));

  clearPreviousClaimNavigationCache(cache, "claim-b", "claim-b");
  assert.ok(cache.get("claim-b:inventory"), "a non-switch does not discard the active claim");
});
