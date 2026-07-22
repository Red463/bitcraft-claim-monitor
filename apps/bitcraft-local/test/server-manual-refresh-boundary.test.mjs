import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

test("server admits manual refreshes through one guarded request header", () => {
  assert.match(server, /manualRefreshGuard\.mjs/);
  assert.match(server, /createManualRefreshGuard\(\)/);
  assert.match(server, /function manualRefreshAccess\(req, res\)/);
  assert.match(server, /req\.headers\[MANUAL_REFRESH_HEADER\]/);
  assert.match(server, /source:\s*"manual-refresh-guard"/);
  assert.match(server, /"retry-after"/);
});

test("server propagates a request-scoped bypass to live aggregate caches", () => {
  assert.match(server, /fetchUpstreamCached\(upstream,\s*\{\s*forceRefresh\s*\}\)/);
  assert.match(server, /dashboardData\([^\n]+\{\s*forceRefresh\s*\}/);
  assert.match(server, /computedCompactCraftPlanResponse\([^\n]+\{\s*forceRefresh,\s*refreshId\s*\}/);
  assert.match(server, /computedCraftPlanResponse\([^\n]+\{\s*forceRefresh,\s*refreshId\s*\}/);
  assert.match(server, /settlementProductionCrafts\(\{\s*\.\.\.body,\s*forceRefresh\s*\}\)/);
  assert.match(server, /passiveCraftSummaries\(\{\s*\.\.\.body,\s*forceRefresh\s*\}\)/);
  assert.match(server, /playerDetailSummaries\(\{\s*\.\.\.body,\s*forceRefresh\s*\}\)/);
});

test("manual refresh identifiers are not added to the BitJita upstream URL", () => {
  assert.doesNotMatch(server, /upstream\.searchParams\.set\([^\n]*manual-refresh/i);
  assert.doesNotMatch(server, /x-manual-refresh-id[^\n]*x-app-identifier/);
});
