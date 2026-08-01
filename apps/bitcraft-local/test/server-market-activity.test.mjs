import assert from "node:assert/strict";
import test from "node:test";

import {
  gameTimestampIso,
  listingKey,
  marketEventSourceKey,
  normalizeListing,
  tradeMatchesListing,
} from "../src/server/marketActivity.mjs";

test("market activity helpers normalize listing identity and timestamps", () => {
  assert.equal(listingKey({ entityId: "listing-1", itemName: "Ignored" }), "listing-1");
  assert.equal(listingKey({ itemName: "Bronze Ingot", ownerUsername: "Tester", quantity: 12, price: 4 }), "Bronze Ingot|Tester|sell|12|4");

  assert.equal(gameTimestampIso("2026-05-20T12:00:00.000Z"), "2026-05-20T12:00:00.000Z");
  assert.equal(gameTimestampIso("1716206400"), "2024-05-20T12:00:00.000Z");
  assert.equal(gameTimestampIso("1716206400000000"), "2024-05-20T12:00:00.000Z");
  assert.equal(gameTimestampIso("not-a-date"), null);
});

test("market activity helpers normalize live listings defensively", () => {
  const raw = {
    marketListingId: "fallback-listing",
    itemName: "Oak Plank",
    side: "sell",
    ownerUsername: "Tester",
    ownerEntityId: "player-1",
    itemId: 20,
    itemType: "0",
    quantity: "8",
    price: "6",
    itemTier: 2,
    itemRarityStr: "Common",
    timestamp: "2026-05-20T12:00:00.000Z",
  };

  assert.deepEqual(normalizeListing(raw), {
    key: "fallback-listing",
    itemName: "Oak Plank",
    side: "sell",
    owner: "Tester",
    ownerEntityId: "player-1",
    itemId: 20,
    itemType: "0",
    quantity: 8,
    price: 6,
    totalValue: 48,
    tier: 2,
    rarity: "Common",
    listedAt: "2026-05-20T12:00:00.000Z",
    tradeId: null,
    raw,
  });
});

test("market activity helpers preserve trade matching and event source keys", () => {
  const listing = {
    key: "listing-1",
    itemId: "30",
    itemType: "0",
    ownerEntityId: "seller-1",
    quantity: 5,
    totalValue: 50,
  };

  assert.equal(tradeMatchesListing({ orderEntityId: "listing-1" }, listing), true);
  assert.equal(tradeMatchesListing({ itemId: "30", itemType: "0", sellerEntityId: "seller-1" }, listing), true);
  assert.equal(tradeMatchesListing({ itemId: "30", itemType: "0", sellerEntityId: "other-seller" }, listing), false);

  assert.equal(marketEventSourceKey("new_listing", listing), "market_event:new_listing:listing-1");
  assert.equal(marketEventSourceKey("partial_sale", { ...listing, tradeId: "trade-1" }), "market_event:partial_sale:listing-1:trade-1");
  assert.equal(marketEventSourceKey("partial_quantity_drop", listing), "market_event:partial_quantity_drop:listing-1:5:50");
});
