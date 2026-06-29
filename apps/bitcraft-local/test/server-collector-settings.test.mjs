import assert from "node:assert/strict";
import test from "node:test";

import {
  collectorCurrentTables,
  collectorPrimaryPayloadDomain,
  domainCollectorDefaults,
  normalizeCollectorSettings,
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

test("collector domain maps preserve current refresh and cache ownership", () => {
  assert.equal(collectorPrimaryPayloadDomain.production, "crafts");
  assert.equal(collectorPrimaryPayloadDomain.mapCatalog, "skills");
  assert.equal(payloadDomainCollector.tradeVolume, "market");
  assert.equal(payloadDomainCollector.regionalBuyOrders, "buyOrders");
  assert.deepEqual(collectorCurrentTables.market, ["market_listings", "market_trades"]);
  assert.deepEqual(collectorCurrentTables.buyOrders, ["market_buy_orders_current", "market_regional_sale_averages_current"]);
});
