import assert from "node:assert/strict";
import test from "node:test";

let views = null;
try {
  views = await import("../src/server/regionalMarketViews.mjs");
} catch {
  // The first TDD run proves the provider-neutral regional market view is absent.
}

const snapshot = {
  orders: [{
    entityId: "501",
    claimEntityId: "100",
    claimName: "Timbersteel Trade",
    regionId: "19",
    ownerEntityId: "701",
    ownerUsername: "Buyer One",
    itemId: "43",
    itemType: "cargo",
    price: "25",
    quantity: "8",
    storedCoins: "200",
    timestamp: "2026-07-30T12:01:00.000Z",
  }, {
    entityId: "502",
    claimEntityId: "101",
    claimName: "Other Market",
    regionId: "7",
    ownerEntityId: "702",
    ownerUsername: "Buyer Two",
    itemId: "44",
    itemType: "item",
    price: "12",
    quantity: "3",
    storedCoins: "36",
    timestamp: "2026-07-30T12:02:00.000Z",
  }],
};

test("regional market view filters and enriches the live generation without SQL current tables", () => {
  assert.ok(views, "regional market views module must exist");
  const result = views.regionalBuyOrdersView(snapshot, {
    regionId: "19",
    search: "timber",
    page: 1,
    pageSize: 25,
    sort: "unitPrice",
    direction: "desc",
    observedAt: "2026-07-30T12:03:00.000Z",
    getEntity: (key) => key === "cargo:43"
      ? { name: "Timber Package", tier: 3, rarity: "Uncommon", iconAssetName: "timber.png" }
      : null,
  });
  assert.equal(result.total, 1);
  assert.deepEqual(result.rows[0], {
    orderKey: "501",
    regionId: "19",
    regionName: "R19",
    marketClaimId: "100",
    marketClaimName: "Timbersteel Trade",
    buyerEntityId: "701",
    buyerName: "Buyer One",
    itemId: "43",
    itemType: "cargo",
    itemName: "Timber Package",
    tier: 3,
    rarity: "Uncommon",
    rarityStr: "Uncommon",
    iconAssetName: "timber.png",
    quantity: "8",
    unitPrice: "25",
    totalValue: "200",
    storedCoins: "200",
    listedAt: "2026-07-30T12:01:00.000Z",
    firstSeen: "2026-07-30T12:01:00.000Z",
    lastSeen: "2026-07-30T12:03:00.000Z",
    averageUnitPrice: null,
    salesCount: 0,
    premiumPercent: null,
    opportunityEligible: false,
  });
  assert.deepEqual(result.opportunities, []);
});

test("regional market view preserves exact decimal quantities and sorts before paging", () => {
  assert.ok(views, "regional market views module must exist");
  const result = views.regionalBuyOrdersView({
    orders: [
      ...snapshot.orders,
      { ...snapshot.orders[0], entityId: "503", price: "9007199254740993", quantity: "2" },
    ],
  }, {
    regionId: "all",
    page: 1,
    pageSize: 25,
    sort: "unitPrice",
    direction: "desc",
    getEntity: () => null,
  });
  assert.equal(result.rows[0].orderKey, "503");
  assert.equal(result.rows[0].unitPrice, "9007199254740993");
  assert.equal(result.rows[0].totalValue, "18014398509481986");
});

test("regional market view enforces the current allowed scope and uses each region receive time", () => {
  assert.ok(views, "regional market views module must exist");
  const currentData = {
    activeRegionIds: ["7", "19"],
    orders: snapshot.orders,
    regions: [{
      regionId: "7",
      count: 1,
      receivedAt: "2026-07-30T11:00:00.000Z",
      warnings: [],
    }, {
      regionId: "19",
      count: 1,
      receivedAt: "2026-07-30T12:03:00.000Z",
      warnings: [],
    }],
  };
  const result = views.regionalBuyOrdersView(currentData, {
    regionId: "all",
    allowedRegionIds: ["19"],
    observedAt: "2026-07-30T12:10:00.000Z",
    page: 1,
    pageSize: 25,
    getEntity: () => null,
  });
  assert.deepEqual(result.rows.map((row) => row.regionId), ["19"]);
  assert.equal(result.rows[0].lastSeen, "2026-07-30T12:03:00.000Z");
  assert.equal(result.unfilteredRegionRows, 1);

  const status = views.regionalMarketStatus({
    data: currentData,
    confidence: "authoritative",
    lastError: null,
    warnings: ["Relay regional market has not loaded region 7 yet."],
  }, {
    regionId: "all",
    allowedRegionIds: ["19"],
    nowMs: Date.parse("2026-07-30T12:03:30.000Z"),
    staleAfterMs: 60_000,
    runtimeHealth: { running: false, pool: null },
  });
  assert.equal(status.freshness, "fresh");
  assert.equal(status.ageMs, 30_000);
  assert.doesNotMatch(status.warnings.join(" "), /region 7/i);
});

test("regional market view counts region rows before applying text search", () => {
  assert.ok(views, "regional market views module must exist");
  const result = views.regionalBuyOrdersView(snapshot, {
    regionId: "all",
    allowedRegionIds: ["7", "19"],
    search: "timbersteel",
    page: 1,
    pageSize: 25,
    getEntity: () => null,
  });
  assert.equal(result.total, 1);
  assert.equal(result.unfilteredRegionRows, 2);
});

test("regional market status reports per-region age and disconnected sessions as stale", () => {
  assert.ok(views, "regional market views module must exist");
  const current = {
    data: {
      activeRegionIds: ["7", "19"],
      orders: snapshot.orders,
      regions: [{
        regionId: "19",
        count: 1,
        receivedAt: "2026-07-30T12:00:00.000Z",
        warnings: [],
      }],
    },
    confidence: "partial",
    lastError: null,
    warnings: ["Relay regional market has not loaded region 7 yet."],
  };
  const disconnected = views.regionalMarketStatus(current, {
    regionId: "19",
    nowMs: Date.parse("2026-07-30T12:00:30.000Z"),
    staleAfterMs: 60_000,
    runtimeHealth: {
      running: true,
      pool: {
        sessions: [{
          regionId: "19",
          health: { connected: false, lastError: "socket lost" },
        }],
      },
    },
  });
  assert.equal(disconnected.freshness, "stale");
  assert.equal(disconnected.ageMs, 30_000);
  assert.match(disconnected.warnings.join(" "), /disconnected/i);

  const connectedWithError = views.regionalMarketStatus(current, {
    regionId: "19",
    nowMs: Date.parse("2026-07-30T12:00:30.000Z"),
    staleAfterMs: 60_000,
    runtimeHealth: {
      running: true,
      pool: {
        sessions: [{
          regionId: "19",
          health: { connected: true, lastError: "detail subscription reset" },
        }],
      },
    },
  });
  assert.equal(connectedWithError.freshness, "stale");
  assert.match(connectedWithError.warnings.join(" "), /detail subscription reset/);

  const aged = views.regionalMarketStatus(current, {
    regionId: "19",
    nowMs: Date.parse("2026-07-30T12:02:00.000Z"),
    staleAfterMs: 60_000,
    runtimeHealth: { running: false, pool: null },
  });
  assert.equal(aged.freshness, "stale");
  assert.equal(aged.ageMs, 120_000);
  assert.match(aged.warnings.join(" "), /older than/i);

  const neverLoaded = views.regionalMarketStatus(current, {
    regionId: "7",
    nowMs: Date.parse("2026-07-30T12:00:30.000Z"),
    staleAfterMs: 60_000,
    runtimeHealth: { running: false, pool: null },
  });
  assert.equal(neverLoaded.freshness, "unavailable");
  assert.equal(neverLoaded.confidence, "partial");
});

test("regional market catalog view joins live order counts to item and cargo identities", () => {
  assert.equal(
    typeof views.regionalMarketCatalogView,
    "function",
    "regional market catalog view must exist",
  );
  const result = views.regionalMarketCatalogView({
    activeRegionIds: ["7", "19"],
    orders: [
      ...snapshot.orders,
      {
        ...snapshot.orders[0],
        entityId: "503",
        side: "sell",
        regionId: "19",
      },
    ],
  }, [{
    catalogKey: "cargo:43",
    kind: "cargo",
    targetId: "43",
    name: "Timber Package",
    tag: "Wood",
    tier: 3,
    rarity: "Uncommon",
    iconAssetName: "timber.png",
  }, {
    catalogKey: "items:44",
    kind: "items",
    targetId: "44",
    name: "Leather Strap",
    tag: "Leather",
    tier: 2,
    rarity: "Common",
    iconAssetName: "leather.png",
  }], {
    regionId: "19",
    allowedRegionIds: ["7", "19"],
    query: "timber",
    availableOnly: true,
    hasSell: true,
    hasBuy: true,
    limit: 12,
  });

  assert.deepEqual(result.categories, ["Wood"]);
  assert.deepEqual(result.items, [{
    id: "43",
    itemId: "43",
    itemType: "cargo",
    name: "Timber Package",
    category: "Wood",
    tag: "Wood",
    tier: 3,
    rarity: "Uncommon",
    rarityStr: "Uncommon",
    iconAssetName: "timber.png",
    sellOrders: 1,
    buyOrders: 1,
    orderCount: 2,
    hasSellOrders: true,
    hasBuyOrders: true,
  }]);
});

test("regional market catalog applies live-order filters before its response limit", () => {
  const catalogRows = Array.from({ length: 75 }, (_, index) => ({
    kind: "items",
    targetId: String(index + 1),
    name: `Timber ${String(index + 1).padStart(3, "0")}`,
  }));
  const result = views.regionalMarketCatalogView({
    orders: [{
      entityId: "900",
      side: "sell",
      regionId: "19",
      itemType: "item",
      itemId: "75",
    }],
  }, catalogRows, {
    query: "timber",
    regionId: "19",
    availableOnly: true,
    hasSell: true,
    limit: 12,
  });

  assert.deepEqual(result.items.map((item) => item.itemId), ["75"]);
});

test("market response freshness includes the older global catalog dependency", () => {
  const orderStatus = {
    freshness: "fresh",
    confidence: "authoritative",
    ageMs: 500,
    warnings: [],
  };
  assert.deepEqual(views.combinedMarketStatus(orderStatus, {
    receivedAt: "2026-07-30T11:58:00.000Z",
  }, {
    nowMs: Date.parse("2026-07-30T12:00:00.000Z"),
    staleAfterMs: 60_000,
  }), {
    freshness: "stale",
    confidence: "partial",
    ageMs: 120_000,
    warnings: ["Relay global catalog is older than 60 seconds."],
  });

  assert.deepEqual(views.combinedMarketStatus(orderStatus, null, {
    nowMs: Date.parse("2026-07-30T12:00:00.000Z"),
    staleAfterMs: 60_000,
  }), {
    freshness: "unavailable",
    confidence: "unknown",
    ageMs: null,
    warnings: ["Relay global catalog has not loaded yet."],
  });
});

test("regional market order-book view preserves exact prices and scopes regions", () => {
  assert.equal(
    typeof views.regionalMarketOrderBookView,
    "function",
    "regional market order-book view must exist",
  );
  const result = views.regionalMarketOrderBookView({
    activeRegionIds: ["7", "19"],
    orders: [
      {
        ...snapshot.orders[0],
        entityId: "9007199254740993",
        side: "sell",
        price: "9007199254740993",
        quantity: "2",
      },
      snapshot.orders[1],
    ],
  }, {
    catalogKey: "cargo:43",
    kind: "cargo",
    targetId: "43",
    name: "Timber Package",
    tag: "Wood",
    tier: 3,
    rarity: "Uncommon",
    iconAssetName: "timber.png",
  }, {
    itemType: "cargo",
    itemId: "43",
    regionId: "19",
    allowedRegionIds: ["7", "19"],
  });

  assert.equal(result.sellOrders.length, 1);
  assert.equal(result.buyOrders.length, 0);
  assert.equal(result.sellOrders[0].entityId, "9007199254740993");
  assert.equal(result.sellOrders[0].price, "9007199254740993");
  assert.equal(result.sellOrders[0].quantity, "2");
  assert.deepEqual(result.item, {
    id: "43",
    itemId: "43",
    itemType: "cargo",
    name: "Timber Package",
    category: "Wood",
    tag: "Wood",
    tier: 3,
    rarity: "Uncommon",
    rarityStr: "Uncommon",
    iconAssetName: "timber.png",
  });
});
