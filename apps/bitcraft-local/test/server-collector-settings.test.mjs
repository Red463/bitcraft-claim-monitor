import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  collectorCurrentTables,
  collectorPrimaryPayloadDomain,
  domainPayloadKeys,
  domainCollectorDefaults,
  normalizeCollectorSettings,
  payloadDomainsForCollectors,
  payloadDomainCollector,
} from "../src/server/collectorSettings.mjs";

test("collector settings normalize saved dashboard configuration safely", () => {
  const settings = normalizeCollectorSettings({
    claim: { enabled: false, intervalSeconds: "5" },
    members: { intervalMs: 45000 },
    research: { intervalSeconds: "99999" },
    market: null,
    unknown: { enabled: false, intervalSeconds: 15 },
  });

  assert.equal(Object.keys(settings).length, Object.keys(domainCollectorDefaults).length);
  assert.deepEqual(settings.claim, { label: "Current settlement", enabled: false, intervalSeconds: 15 });
  assert.deepEqual(settings.members, { label: "Members", enabled: true, intervalSeconds: 45 });
  assert.equal(Object.hasOwn(settings, "research"), false);
  assert.deepEqual(settings.market, { label: "Market", enabled: true, intervalSeconds: 60 });
  assert.equal(Object.hasOwn(settings, "unknown"), false);
});

test("due collectors select only the domain payloads they own", () => {
  assert.deepEqual(payloadDomainsForCollectors(["members", "inventory"]), [
    "members", "inventories",
  ]);
  assert.deepEqual(payloadDomainsForCollectors([]), []);
});

test("collector domain maps preserve current refresh and cache ownership", () => {
  assert.equal(collectorPrimaryPayloadDomain.production, "crafts");
  assert.equal(collectorPrimaryPayloadDomain.mapCatalog, "skills");
  assert.equal(payloadDomainCollector.tradeVolume, undefined);
  assert.equal(payloadDomainCollector.research, undefined);
  assert.equal(payloadDomainCollector.recruitment, undefined);
  assert.equal(collectorPrimaryPayloadDomain.research, undefined);
  assert.equal(Object.hasOwn(domainCollectorDefaults, "research"), false);
  assert.equal(Object.hasOwn(domainCollectorDefaults, "construction"), false);
  assert.equal(Object.hasOwn(domainCollectorDefaults, "storageActivity"), false);
  assert.equal(collectorPrimaryPayloadDomain.construction, undefined);
  assert.equal(payloadDomainCollector.construction, undefined);
  assert.equal(domainPayloadKeys.includes("construction"), false);
  assert.equal(domainPayloadKeys.includes("layout"), false);
  assert.equal(payloadDomainCollector.layout, undefined);
  assert.equal(domainPayloadKeys.includes("regionStatus"), false);
  assert.equal(domainPayloadKeys.includes("tradeVolume"), false);
  assert.equal(payloadDomainCollector.regionStatus, undefined);
  assert.equal(payloadDomainCollector.tradeVolume, undefined);
  assert.equal(Object.hasOwn(domainCollectorDefaults, "region"), false);
  assert.equal(collectorCurrentTables.storageActivity, undefined);
  const browserDefaults = readFileSync(
    new URL("../src/settingsDefaults.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(browserDefaults, /storageActivity/);
  assert.doesNotMatch(browserDefaults, /construction:\s*\{\s*label:\s*"Construction"/);
  assert.equal(payloadDomainCollector.regionalBuyOrders, undefined);
  assert.deepEqual(collectorCurrentTables.market, ["market_trades"]);
  assert.equal(collectorCurrentTables.marketListings, undefined);
  assert.deepEqual(collectorCurrentTables.productionContributions, ["production_jobs", "production_contributions"]);
  assert.equal(collectorCurrentTables.buyOrders, undefined);
  assert.equal(Object.hasOwn(domainCollectorDefaults, "buyOrders"), false);
  assert.equal(Object.hasOwn(collectorCurrentTables, "snapshotHistory"), false);
});

test("side-effect collector intervals do not monopolize production", () => {
  assert.equal(domainCollectorDefaults.marketListings, undefined);
  assert.equal(domainCollectorDefaults.productionContributions.intervalSeconds, 300);
  assert.equal(Object.hasOwn(domainCollectorDefaults, "snapshotHistory"), false);
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

test("empire membership tracking has an independent bounded cadence", () => {
  assert.deepEqual(domainCollectorDefaults.empireMembership, {
    label: "Empire membership history",
    intervalSeconds: 60,
  });
  const normalized = normalizeCollectorSettings({
    empireMembership: { enabled: true, intervalSeconds: 5 },
  });
  assert.deepEqual(normalized.empireMembership, {
    label: "Empire membership history",
    enabled: true,
    intervalSeconds: 15,
  });
  assert.equal(Object.hasOwn(collectorCurrentTables, "empireMembership"), false);
});

test("collector settings still clamp submitted intervals to the existing bounds", () => {
  const normalized = normalizeCollectorSettings({ productionContributions: { intervalSeconds: 2 } });

  assert.equal(normalized.productionContributions.intervalSeconds, 15);
});
test("production activity and settlement state rows are not gated by contribution sync cadence", () => {
  const source = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  const activityStart = source.indexOf("async function runProductionActivityCollector");
  const contributionStart = source.indexOf("async function runProductionContributionCollector");
  const snapshotStart = source.indexOf("async function collectServerSnapshot");
  const activityFunction = source.slice(activityStart, contributionStart);
  const contributionFunction = source.slice(contributionStart, snapshotStart);

  assert.ok(activityStart > -1);
  assert.ok(contributionStart > activityStart);
  assert.ok(snapshotStart > contributionStart);
  assert.match(source, /await runProductionActivityCollector\(claimId, currentData\);\s*await runProductionContributionCollector\(claimId, currentData, force\);/);
  assert.match(source, /recordSettlementState\(\{/);
  assert.doesNotMatch(source, /sideEffectCollectorDue\("snapshotHistory"/);
  assert.doesNotMatch(source, /collector(?:Attempt|Success|Failure)\("snapshotHistory"/);
  assert.match(activityFunction, /syncProductionJobActivityForSnapshot/);
  assert.doesNotMatch(activityFunction, /sideEffectCollectorDue\("productionContributions"/);
  assert.match(contributionFunction, /syncProductionContributionsForSnapshot/);
  assert.match(contributionFunction, /currentData\.contributions/);
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
  assert.match(source, /delete current\.buyOrders/);
  assert.doesNotMatch(source, /const markerKey = "regional_buy_order_(?:collector|state)_retired_at"/);
  assert.doesNotMatch(source, /fetchRegionalBuyOrders/);
  assert.doesNotMatch(source, /fetchRegionalBuyOrderSaleAverages/);
  assert.doesNotMatch(source, /persistRegionalBuyOrdersCurrent/);
  assert.doesNotMatch(source, /persistRegionalSaleAverages/);
  assert.doesNotMatch(source, /market_buy_orders_current/);
  assert.doesNotMatch(source, /market_regional_sale_averages_current/);
  assert.doesNotMatch(source, /existingBuyOrders|buyOrders:\s*\{/);
});

test("collector status resolves the claim once without rebuilding all public settings per collector", () => {
  const source = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  const start = source.indexOf("function collectorStatusPayload");
  const end = source.indexOf("function claimEmpireId", start);
  const implementation = source.slice(start, end);

  assert.ok(start > -1);
  assert.ok(end > start);
  assert.match(implementation, /const claimId = currentClaimId\(\);/);
  assert.match(implementation, /statements\.domainPayload\.get\(claimId, domain\)/);
  assert.doesNotMatch(implementation, /getSettings\(\)\.claimId/);
});

test("settlement collection operator copy no longer describes snapshot history", () => {
  const source = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

  for (const legacy of [
    "BitCraft snapshot poll failed",
    "Server snapshot polling failed",
    "Server snapshot polling enabled",
  ]) assert.doesNotMatch(source, new RegExp(legacy));
});
