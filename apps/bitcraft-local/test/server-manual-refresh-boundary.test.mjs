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
  assert.match(server, /relayActiveRegions\(\{/);
  assert.match(server, /refresh\.forceRefresh && relayEmpireStarted/);
  assert.match(server, /relayEmpireRuntime\.warmActiveRegions\(\)/);
  assert.match(server, /empireOverviewView\(/);
  assert.match(server, /empireDetailsView\(/);
  assert.match(server, /empireClaimMembersView\(/);
  assert.match(server, /empireWatchtowersView\(/);
  assert.match(server, /domains\.includes\("region-claims"\)[\s\S]{0,500}relayRegionClaimsRuntime\.reconcile\(\{[\s\S]{0,100}force:\s*true/);
  assert.match(
    server,
    /new RelayRegionClaimsRuntime\(\{[\s\S]{0,200}reconnectDelayMs:\s*relayReconnectDelayMs/,
    "regional claims must use the shared jittered reconnect policy in production",
  );
});

test("every live page aggregate admits the guarded manual refresh identifier", () => {
  for (const route of [
    "/api/local/game-data",
    "/api/local/player-data",
    "/api/local/regions/active",
    "/api/local/empires",
    "/api/local/empires/details",
    "/api/local/empires/claim-members",
    "/api/local/empires/watchtowers",
    "/api/local/market/history",
    "/api/local/leaderboard",
    "/api/local/history",
  ]) {
    const routeIndex = server.indexOf(`url.pathname === "${route}"`);
    assert.notEqual(routeIndex, -1, `missing ${route}`);
    const boundary = server.indexOf("\n    if (req.method", routeIndex + 10);
    const handler = server.slice(routeIndex, boundary === -1 ? routeIndex + 1800 : boundary);
    assert.match(handler, /manualRefreshAccess\(req, res\)/, `${route} should use the manual refresh guard`);
  }
});

test("manual refresh identifiers are not added to the BitJita upstream URL", () => {
  assert.doesNotMatch(server, /upstream\.searchParams\.set\([^\n]*manual-refresh/i);
  assert.doesNotMatch(server, /x-manual-refresh-id[^\n]*x-app-identifier/);
});
