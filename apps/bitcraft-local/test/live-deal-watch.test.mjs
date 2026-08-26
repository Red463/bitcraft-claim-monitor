import assert from "node:assert/strict";
import test from "node:test";

let evaluateLiveDealWatches = () => ({ checks: [], opportunities: [] });
let sameEnabledDealWatchRevision = () => false;
try {
  ({ evaluateLiveDealWatches, sameEnabledDealWatchRevision } = await import("../src/server/liveDealWatch.mjs"));
} catch {
  // The RED run proves the live Deal Watch evaluator does not exist yet.
}

test("deal watch delivery eligibility rejects disabled, deleted, or threshold-changed watches", () => {
  const expected = watch({ thresholdPercent: 30 });
  assert.equal(sameEnabledDealWatchRevision(expected, { ...expected, enabled: 1 }), true);
  assert.equal(sameEnabledDealWatchRevision(expected, { ...expected, enabled: 0 }), false);
  assert.equal(sameEnabledDealWatchRevision(expected, { ...expected, enabled: 1, threshold_percent: 35 }), false);
  assert.equal(sameEnabledDealWatchRevision(expected, null), false);
});

function sell(entityId, price, options = {}) {
  return {
    entityId,
    claimEntityId: options.claimEntityId ?? "4001",
    claimName: options.claimName ?? "Timbersteel Market",
    regionId: options.regionId ?? "19",
    ownerEntityId: options.ownerEntityId ?? `${entityId}01`,
    ownerUsername: options.ownerUsername ?? `Seller ${entityId}`,
    itemId: options.itemId ?? "30",
    itemType: options.itemType ?? "item",
    price,
    quantity: options.quantity ?? "2",
    side: "sell",
  };
}

function watch(options = {}) {
  return {
    id: options.id ?? 7,
    user_id: options.userId ?? 8,
    discord_id: options.discordId ?? "222222222222222222",
    claim_id: options.claimId ?? "1369094286777412590",
    region_id: options.regionId ?? "19",
    item_id: options.itemId ?? "30",
    item_type: options.itemType ?? "0",
    item_name: options.itemName ?? "Leather",
    threshold_percent: options.thresholdPercent ?? 30,
  };
}

test("live deal watches match exact item type and region against the current sell median", () => {
  assert.notEqual(evaluateLiveDealWatches.name, "");
  const result = evaluateLiveDealWatches({
    orders: [
      sell("101", "6"),
      sell("102", "10"),
      sell("103", "14"),
      sell("104", "1", { itemType: "cargo" }),
      sell("105", "1", { regionId: "9" }),
      { ...sell("106", "1"), side: "buy" },
    ],
  }, [watch()], {
    minActiveListings: 3,
    observedAt: "2026-07-30T12:00:00.000Z",
  });

  assert.deepEqual(result.checks, [{
    watchId: 7,
    baseline: {
      kind: "current-sell-median",
      unitPrice: "10",
      sampleCount: 3,
      observedAt: "2026-07-30T12:00:00.000Z",
    },
    error: null,
  }]);
  assert.deepEqual(result.opportunities.map((entry) => ({
    watchId: entry.watchId,
    listingKey: entry.listingKey,
    unitPrice: entry.unitPrice,
    totalValue: entry.totalValue,
    baselineUnitPrice: entry.baseline.unitPrice,
    sampleCount: entry.baseline.sampleCount,
    discountPercent: entry.discountPercent,
  })), [{
    watchId: 7,
    listingKey: "relay:19:101",
    unitPrice: "6",
    totalValue: "12",
    baselineUnitPrice: "10",
    sampleCount: 3,
    discountPercent: 40,
  }]);
});

test("live deal watches preserve decimal integers beyond Number safety", () => {
  const result = evaluateLiveDealWatches({
    orders: [
      sell("201", "9007199254740993", { quantity: "9007199254740993" }),
      sell("202", "18014398509481986"),
      sell("203", "27021597764222979"),
    ],
  }, [watch({ thresholdPercent: 50 })], {
    minActiveListings: 3,
    observedAt: "2026-07-30T12:00:00.000Z",
  });

  assert.equal(result.opportunities[0].unitPrice, "9007199254740993");
  assert.equal(result.opportunities[0].totalValue, "81129638414606699710187514626049");
  assert.equal(result.opportunities[0].baseline.unitPrice, "18014398509481986");
  assert.equal(result.opportunities[0].discountPercent, 50);
});

test("live deal watches retain an exact half-unit median for an even sample", () => {
  const result = evaluateLiveDealWatches({
    orders: [
      sell("211", "4"),
      sell("212", "7"),
      sell("213", "8"),
      sell("214", "11"),
    ],
  }, [watch({ thresholdPercent: 30 })], {
    minActiveListings: 4,
    observedAt: "2026-07-30T12:00:00.000Z",
  });

  assert.equal(result.checks[0].baseline.unitPrice, "7.5");
  assert.deepEqual(result.opportunities.map((row) => row.unitPrice), ["4"]);
});

test("live deal watches report unavailable instead of fabricating a thin baseline", () => {
  const result = evaluateLiveDealWatches({
    orders: [
      sell("301", "6"),
      sell("302", "10"),
    ],
  }, [watch()], {
    minActiveListings: 3,
    observedAt: "2026-07-30T12:00:00.000Z",
  });

  assert.deepEqual(result.opportunities, []);
  assert.deepEqual(result.checks, [{
    watchId: 7,
    baseline: null,
    error: "Not enough active regional sell listings (3+ required; found 2)",
  }]);
});

test("live deal watches do not alert from an expired regional last-good snapshot", () => {
  const result = evaluateLiveDealWatches({
    regions: [{
      regionId: "19",
      receivedAt: "2026-07-30T11:58:00.000Z",
    }],
    orders: [
      sell("401", "6"),
      sell("402", "10"),
      sell("403", "14"),
    ],
  }, [watch()], {
    minActiveListings: 3,
    maxRegionAgeMs: 60_000,
    nowMs: Date.parse("2026-07-30T12:00:00.000Z"),
  });

  assert.deepEqual(result.opportunities, []);
  assert.equal(result.checks[0].baseline, null);
  assert.match(result.checks[0].error, /stale/i);
});

test("live deal watch evidence uses the matched region observation time", () => {
  const result = evaluateLiveDealWatches({
    regions: [
      { regionId: "19", receivedAt: "2026-07-30T11:59:59.000Z" },
      { regionId: "9", receivedAt: "2026-07-30T11:59:40.000Z" },
    ],
    orders: [
      sell("501", "6", { regionId: "9" }),
      sell("502", "10", { regionId: "9" }),
      sell("503", "14", { regionId: "9" }),
    ],
  }, [watch({ regionId: "9" })], {
    minActiveListings: 3,
    maxRegionAgeMs: 60_000,
    nowMs: Date.parse("2026-07-30T12:00:00.000Z"),
    observedAt: "2026-07-30T11:59:59.000Z",
  });

  assert.equal(result.checks[0].baseline.observedAt, "2026-07-30T11:59:40.000Z");
});
