import assert from "node:assert/strict";
import test from "node:test";

let views = null;
try {
  views = await import("../src/server/currentMarketViews.mjs");
} catch {
  // The first TDD run proves the provider-neutral current-market view is absent.
}

const snapshot = {
  claimId: "100",
  regionId: "19",
  listings: [
    {
      entityId: "1",
      itemId: "42",
      itemType: "item",
      itemName: "Timber",
      ownerEntityId: "7",
      ownerUsername: "Builder",
      side: "sell",
      quantity: "10",
      price: "5",
      timestamp: "2026-07-30T14:00:00.000Z",
    },
    {
      entityId: "2",
      itemId: "42",
      itemType: "cargo",
      itemName: "Timber Bundle",
      ownerEntityId: "8",
      ownerUsername: "Hauler",
      side: "buy",
      quantity: "2",
      price: "30",
      timestamp: "2026-07-30T14:30:00.000Z",
    },
  ],
};

test("market history current rows come from the committed Relay generation", () => {
  assert.ok(views, "provider-neutral current-market view module must exist");

  assert.deepEqual(views.currentMarketListings(snapshot, {
    owner: "builder",
    observedAt: "2026-07-30T15:00:00.000Z",
  }), [{
    listing_key: "1",
    item_name: "Timber",
    quantity: 10,
    price: 5,
    total_value: 50,
    owner: "Builder",
    owner_entity_id: "7",
    item_id: "42",
    item_type: "item",
    tier: null,
    rarity: null,
    side: "sell",
    first_seen: "2026-07-30T14:00:00.000Z",
    last_seen: "2026-07-30T15:00:00.000Z",
    raw_json: JSON.stringify(snapshot.listings[0]),
  }]);
});

test("market leaderboard combines live Relay listings with durable confirmed trades", () => {
  assert.ok(views, "provider-neutral current-market view module must exist");

  const result = views.marketLeaderboardFromCurrent({
    snapshot,
    trades: [
      {
        seller_username: "Builder",
        seller_entity_id: "7",
        quantity: 4,
        total_price: 40,
        occurred_at: "2026-07-30T13:00:00.000Z",
      },
      {
        seller_username: "Trader",
        seller_entity_id: "9",
        quantity: 1,
        total_price: 100,
        occurred_at: "2026-07-30T13:30:00.000Z",
      },
    ],
    observedAt: "2026-07-30T15:00:00.000Z",
  });

  assert.deepEqual(result.summary, {
    memberCount: 3,
    activeListings: 2,
    activeListingValue: 110,
    confirmedSales: 2,
    confirmedSaleValue: 140,
    unitsSold: 5,
    lastSaleAt: "2026-07-30T13:30:00.000Z",
  });
  assert.deepEqual(result.members, [
    {
      memberId: "9",
      name: "Trader",
      activeListings: 0,
      activeListingValue: 0,
      confirmedSales: 1,
      confirmedSaleValue: 100,
      unitsSold: 1,
      lastSaleAt: "2026-07-30T13:30:00.000Z",
    },
    {
      memberId: "7",
      name: "Builder",
      activeListings: 1,
      activeListingValue: 50,
      confirmedSales: 1,
      confirmedSaleValue: 40,
      unitsSold: 4,
      lastSaleAt: "2026-07-30T13:00:00.000Z",
    },
    {
      memberId: "8",
      name: "Hauler",
      activeListings: 1,
      activeListingValue: 60,
      confirmedSales: 0,
      confirmedSaleValue: 0,
      unitsSold: 0,
      lastSaleAt: null,
    },
  ]);
});
