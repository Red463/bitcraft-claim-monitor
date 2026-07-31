import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  domainCollectorDefaults,
  normalizeCollectorSettings,
  reconciliationHistoryTables,
} from "../src/server/collectorSettings.mjs";

test("collector settings discard retired current-domain settings while preserving evidence reconcilers", () => {
  const settings = normalizeCollectorSettings({
    claim: { enabled: false, intervalSeconds: "5" },
    members: { intervalMs: 45000 },
    research: { intervalSeconds: "99999" },
    market: null,
    unknown: { enabled: false, intervalSeconds: 15 },
  });

  assert.deepEqual(Object.keys(settings), ["productionContributions", "marketTrades"]);
  assert.equal(Object.hasOwn(settings, "research"), false);
  assert.equal(Object.hasOwn(settings, "market"), false);
  assert.deepEqual(settings.productionContributions, {
    label: "Production contribution reconciliation (blocked upstream mapping)",
    enabled: true,
    intervalSeconds: 300,
  });
  assert.equal(Object.hasOwn(settings, "unknown"), false);
});

test("collector configuration describes only reconciliation history rather than current data", () => {
  const browserDefaults = readFileSync(
    new URL("../src/settingsDefaults.ts", import.meta.url),
    "utf8",
  );
  const adminDisplay = readFileSync(new URL("../src/components/admin/adminDisplay.ts", import.meta.url), "utf8");

  assert.deepEqual(Object.keys(domainCollectorDefaults), ["productionContributions", "marketTrades"]);
  assert.deepEqual(reconciliationHistoryTables, {
    productionContributions: ["production_jobs", "production_contributions"],
    marketTrades: ["market_trades"],
  });
  assert.doesNotMatch(browserDefaults, /\b(?:claim|members|players|professions|production|inventory|mapCatalog|region|empireMembership)\s*:\s*\{\s*label:/);
  assert.doesNotMatch(adminDisplay, /\b(?:claim|members|players|professions|production|inventory|market|research|region|mapCatalog|empireMembership):\s*"/);
});

test("side-effect collector intervals do not monopolize production", () => {
  assert.equal(domainCollectorDefaults.productionContributions.intervalSeconds, 300);
  assert.equal(domainCollectorDefaults.marketTrades.intervalSeconds, 60);
});

test("construction current state has one Relay owner and no scheduled BitJita writer", () => {
  const source = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  const adminDisplay = readFileSync(
    new URL("../src/components/admin/adminDisplay.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /function currentConstructionProjection\(claimId\)/);
  assert.match(source, /currentStateRepository\.read\(String\(claimId\), "construction"\)/);
  assert.match(source, /enrichConstructionWithCatalog/);
  assert.doesNotMatch(source, /fetchBitjita\(`\/claims\/\$\{id\}\/construction`/);
  assert.doesNotMatch(source, /collectorDue\(id, "construction"/);
  assert.doesNotMatch(source, /timedCollectorFetch\(metrics, "construction"/);
  assert.doesNotMatch(adminDisplay, /construction:\s*"Records construction/);
});

test("storage activity runs on the Relay live loop rather than a scheduled collector", () => {
  const source = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

  assert.match(source, /relayStorageActivityService\.sync\(\{/);
  assert.doesNotMatch(source, /collectStorageActivity/);
  assert.doesNotMatch(source, /storageActivityJobBudget/);
  assert.doesNotMatch(source, /collector(?:Attempt|Success|Failure)\("storageActivity"/);
  assert.doesNotMatch(source, /\/logs\/storage/);
  assert.match(source, /relayHttp\.storageLogs\(\{/);
});

test("regional rankings run on a live typed session rather than BitJita pagination or a scheduled collector", () => {
  const source = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

  assert.match(source, /RelayRegionClaimsRuntime/);
  assert.doesNotMatch(source, /function fetchCachedRegionClaims/);
  assert.doesNotMatch(source, /function fetchAllRegionClaims/);
  assert.doesNotMatch(source, /fetchBitjita\("\/regions\/status"/);
  assert.doesNotMatch(source, /fetchBitjita\(`\/stats\/trade-volume/);
  assert.doesNotMatch(source, /url\.pathname === "\/api\/local\/region\/claims"/);
});

test("Empire current state runs on the adaptive regional Relay runtime", () => {
  const source = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

  assert.match(source, /RelayEmpireRuntime/);
  assert.match(source, /relayEmpireRuntime\.reconcile/);
  assert.match(source, /relayEmpireRuntime\.warmActiveRegions/);
  assert.match(source, /currentStateRepository\.read\(currentClaimId\(\), "empires"\)/);
  assert.match(source, /domains\.includes\("empires"\)/);
  assert.doesNotMatch(source, /function regionalEmpire(?:Overview|Details|ClaimMembers|Watchtowers)/);
  assert.doesNotMatch(source, /empireScout(?:Cache|Inflight)/);
});

test("empire membership history is subscription-driven without a scheduled collector", () => {
  const source = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  assert.equal(Object.hasOwn(domainCollectorDefaults, "empireMembership"), false);
  assert.equal(Object.hasOwn(reconciliationHistoryTables, "empireMembership"), false);
  assert.match(source, /onSnapshotCommitted:\s*syncEmpireMembershipFromRelaySnapshot/);
  assert.match(source, /source:\s*"relay-subscription"/);
  assert.doesNotMatch(source, /runEmpireMembershipCollector/);
  assert.doesNotMatch(source, /fetchBitjita\([^\n]*\/empires/);
});

test("collector settings still clamp submitted intervals to the existing bounds", () => {
  const normalized = normalizeCollectorSettings({ productionContributions: { intervalSeconds: 2 } });

  assert.equal(normalized.productionContributions.intervalSeconds, 15);
});

test("only the two explicit evidence reconcilers retain a configurable polling cadence", () => {
  const normalized = normalizeCollectorSettings({
    claim: { enabled: false, intervalSeconds: 15 },
    members: { enabled: false, intervalSeconds: 15 },
    production: { enabled: false, intervalSeconds: 15 },
    market: { enabled: false, intervalSeconds: 15 },
    productionContributions: { enabled: false, intervalSeconds: 2 },
    marketTrades: { enabled: true, intervalSeconds: 99999 },
  });

  assert.deepEqual(Object.keys(domainCollectorDefaults), ["productionContributions", "marketTrades"]);
  assert.deepEqual(Object.keys(normalized), ["productionContributions", "marketTrades"]);
  assert.deepEqual(normalized.productionContributions, {
    label: "Production contribution reconciliation (blocked upstream mapping)",
    enabled: false,
    intervalSeconds: 15,
  });
  assert.deepEqual(normalized.marketTrades, {
    label: "Completed member-sale reconciliation (blocked upstream mapping)",
    enabled: true,
    intervalSeconds: 3600,
  });
});

test("periodic reconciliation has no legacy current-domain writer", () => {
  const source = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  const prepared = readFileSync(new URL("../src/server/preparedStatements.mjs", import.meta.url), "utf8");
  const pollStart = source.indexOf("async function collectServerSnapshot");
  const pollEnd = source.indexOf("function marketHistory", pollStart);
  const polling = source.slice(pollStart, pollEnd);

  assert.ok(pollStart > -1);
  assert.ok(pollEnd > pollStart);
  assert.doesNotMatch(source, /function (?:buildCurrentClaimData|refreshCurrentClaimState|persistDomainPayloads|readDomainPayloadMap|domainRowsToAppData)\b/);
  assert.doesNotMatch(prepared, /\b(?:domainPayloadsByClaim|domainPayload|upsertDomainPayload|updateDomainPayloadError)\b/);
  assert.doesNotMatch(polling, /(?:fetchBitjita|fetchAllClaimListings|settlementProductionCrafts|playerDetailSummaries|upsertDomainPayload)/);
});
test("production lifecycle follows committed Relay crafts while contribution sync keeps its cadence", () => {
  const source = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  const activityStart = source.indexOf("async function runProductionActivityCollector");
  const contributionStart = source.indexOf("async function runProductionContributionCollector");
  const snapshotStart = source.indexOf("async function collectServerSnapshot");
  const activityFunction = source.slice(activityStart, contributionStart);
  const contributionFunction = source.slice(contributionStart, snapshotStart);

  assert.ok(activityStart > -1);
  assert.ok(contributionStart > activityStart);
  assert.ok(snapshotStart > contributionStart);
  assert.match(source, /productionRelayLifecycleCoordinator\?\.onCommit\(event\)/);
  assert.match(source, /settlementRelayTransitionCoordinator\?\.onCommit\(event\)/);
  assert.doesNotMatch(source.slice(snapshotStart), /await runProductionActivityCollector\(claimId, currentData\);/);
  assert.doesNotMatch(source.slice(snapshotStart), /recordSettlementState\(/);
  assert.doesNotMatch(source, /url\.pathname === "\/api\/local\/snapshot"/);
  assert.doesNotMatch(source, /sideEffectCollectorDue\("snapshotHistory"/);
  assert.doesNotMatch(source, /collector(?:Attempt|Success|Failure)\("snapshotHistory"/);
  assert.match(activityFunction, /syncProductionJobActivityForSnapshot/);
  assert.doesNotMatch(activityFunction, /sideEffectCollectorDue\("productionContributions"/);
  assert.match(contributionFunction, /readRelayCraftsForContributionReconciliation/);
  assert.match(contributionFunction, /fetchCraftContributionEvidence/);
  assert.match(contributionFunction, /syncProductionContributionsForSnapshot/);
  assert.match(source, /Live craft contributions were available but none could be persisted/);
  assert.match(source, /import \{[^}]*productionMetrics[^}]*\} from "\.\/src\/server\/productionActivity\.mjs"/);
  assert.match(source, /function craftPrimarySkill\(craft\) \{\s*return productionMetrics\(craft\)\.skillName;/);
  assert.doesNotMatch(source, /return skillId \? skillNames\[skillId\]/);
  assert.doesNotMatch(source, /catch \{\s*return \[\];\s*\}/);
  assert.doesNotMatch(contributionFunction, /syncProductionJobActivityForSnapshot|deliverProductionNotifications|recordProductionJobs/);
});

test("market listing activity is subscription-driven rather than scheduled", () => {
  const source = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /runMarketListingsCollector/);
  assert.doesNotMatch(source, /syncMarketListingsForSnapshot/);
  assert.match(source, /createRelayMarketTransitionWriter/);
  assert.match(source, /onSnapshotCommitted/);
});

test("regional buy orders are subscription-driven with no SQL current cache", () => {
  const source = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  assert.match(source, /RelayRegionalMarketRuntime/);
  assert.match(source, /currentStateRepository\.read\([^,]+,\s*"regional-market"\)/);
  assert.match(source, /relayRegionalMarketRuntime\.reconcile/);
  assert.doesNotMatch(source, /relayRegionalMarketRuntime\.warmActiveRegions/);
  assert.doesNotMatch(source, /\bcurrent\.buyOrders\b/);
  assert.doesNotMatch(source, /const markerKey = "regional_buy_order_(?:collector|state)_retired_at"/);
  assert.doesNotMatch(source, /fetchRegionalBuyOrders/);
  assert.doesNotMatch(source, /fetchRegionalBuyOrderSaleAverages/);
  assert.doesNotMatch(source, /persistRegionalBuyOrdersCurrent/);
  assert.doesNotMatch(source, /persistRegionalSaleAverages/);
  assert.doesNotMatch(source, /market_buy_orders_current/);
  assert.doesNotMatch(source, /market_regional_sale_averages_current/);
  assert.doesNotMatch(source, /existingBuyOrders|buyOrders:\s*\{/);
});

test("collector status reports side-effect attempts without reading current-domain payload rows", () => {
  const source = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  const start = source.indexOf("function collectorStatusPayload");
  const end = source.indexOf("async function syncEmpireMembershipFromRelaySnapshot", start);
  const implementation = source.slice(start, end);

  assert.ok(start > -1);
  assert.ok(end > start);
  assert.doesNotMatch(implementation, /currentClaimId\(\)|domainPayload|lastRunMetrics/);
  assert.match(implementation, /const lastSuccessAt = value\.lastSuccessAt \?\? null;/);
});

test("settlement collection operator copy no longer describes snapshot history", () => {
  const source = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

  for (const legacy of [
    "BitCraft snapshot poll failed",
    "Server snapshot polling failed",
    "Server snapshot polling enabled",
  ]) assert.doesNotMatch(source, new RegExp(legacy));
});
