import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  collectorCurrentTables,
  collectorPrimaryPayloadDomain,
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
  assert.deepEqual(settings.claim, { label: "Claim", enabled: false, intervalSeconds: 15 });
  assert.deepEqual(settings.members, { label: "Members", enabled: true, intervalSeconds: 45 });
  assert.deepEqual(settings.research, { label: "Research", enabled: true, intervalSeconds: 3600 });
  assert.deepEqual(settings.market, { label: "Market", enabled: true, intervalSeconds: 60 });
  assert.equal(Object.hasOwn(settings, "unknown"), false);
});

test("due collectors select only the domain payloads they own", () => {
  assert.deepEqual(payloadDomainsForCollectors(["members", "inventory"]), [
    "members", "inventories", "recruitment", "layout",
  ]);
  assert.deepEqual(payloadDomainsForCollectors([]), []);
});

test("collector domain maps preserve current refresh and cache ownership", () => {
  assert.equal(collectorPrimaryPayloadDomain.production, "crafts");
  assert.equal(collectorPrimaryPayloadDomain.mapCatalog, "skills");
  assert.equal(payloadDomainCollector.tradeVolume, "market");
  assert.equal(payloadDomainCollector.regionalBuyOrders, "buyOrders");
  assert.deepEqual(collectorCurrentTables.market, ["market_listings", "market_trades"]);
  assert.deepEqual(collectorCurrentTables.marketListings, ["market_listings", "market_events", "market_trades"]);
  assert.deepEqual(collectorCurrentTables.productionContributions, ["production_jobs", "production_contributions"]);
  assert.deepEqual(collectorCurrentTables.buyOrders, ["market_buy_orders_current", "market_regional_sale_averages_current"]);
});

test("snapshot and side-effect collector intervals do not monopolize production", () => {
  assert.equal(domainCollectorDefaults.snapshotHistory.intervalSeconds, 60);
  assert.equal(domainCollectorDefaults.marketListings.intervalSeconds, 60);
  assert.equal(domainCollectorDefaults.productionContributions.intervalSeconds, 300);
  assert.equal(normalizeCollectorSettings({}).snapshotHistory.intervalSeconds, 60);
});

test("collector settings still clamp submitted intervals to the existing bounds", () => {
  const normalized = normalizeCollectorSettings({ snapshotHistory: { intervalSeconds: 2 } });

  assert.equal(normalized.snapshotHistory.intervalSeconds, 15);
});
test("production activity rows are not gated by contribution sync cadence", () => {
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
  assert.match(source, /if \(sideEffectCollectorDue\("snapshotHistory", force\)\) \{/);
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

test("market listing activity sync fetches live listings when the side-effect collector runs", () => {
  const source = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  const marketStart = source.indexOf("async function runMarketListingsCollector");
  const productionStart = source.indexOf("async function runProductionActivityCollector");
  const marketFunction = source.slice(marketStart, productionStart);

  assert.ok(marketStart > -1);
  assert.ok(productionStart > marketStart);
  assert.match(marketFunction, /fetchAllClaimListings\(claimId, \{ cache: false \}\)/);
  assert.match(marketFunction, /syncMarketListingsForSnapshot\(claimId, marketPayload,/);
  assert.doesNotMatch(marketFunction, /currentData\.market \?\? \{ listings: \[\] \}/);
});

test("collector status resolves the claim once without rebuilding all public settings per collector", () => {
  const source = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  const start = source.indexOf("function collectorStatusPayload");
  const end = source.indexOf("let snapshotQueue", start);
  const implementation = source.slice(start, end);

  assert.ok(start > -1);
  assert.ok(end > start);
  assert.match(implementation, /const claimId = currentClaimId\(\);/);
  assert.match(implementation, /statements\.domainPayload\.get\(claimId, domain\)/);
  assert.doesNotMatch(implementation, /getSettings\(\)\.claimId/);
});
