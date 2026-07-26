import assert from "node:assert/strict";
import { test } from "node:test";

import {
  filterMarketDeals,
  marketFavoriteKeys,
  normalizeMarketOrders,
  normalizeStallsPayload,
} from "../src/pages/market/globalMarket.ts";

test("global market orders keep item and cargo identity and normalize nullable fields", () => {
  const rows = normalizeMarketOrders({
    sellOrders: [{
      entityId: "sell-1",
      itemId: "7",
      itemType: 1,
      price: "30",
      quantity: "4",
      regionId: 12,
      claimName: null,
    }],
    buyOrders: [{
      entityId: "buy-1",
      itemId: 7,
      itemType: 0,
      priceThreshold: "25",
      quantity: "8",
      regionId: 14,
      ownerUsername: "Buyer",
    }],
  });

  assert.deepEqual(rows.map((row) => [row.side, row.itemType, row.itemId, row.unitPrice, row.quantity]), [
    ["sell", "cargo", 7, 30, 4],
    ["buy", "item", 7, 25, 8],
  ]);
  assert.equal(rows[0].claimName, "");
  assert.equal(rows[1].ownerName, "Buyer");
});

test("deal region filtering requires both route endpoints inside the selected set", () => {
  const deals = [
    { id: "same", buyRegionId: 12, sellRegionId: 12 },
    { id: "cross", buyRegionId: 12, sellRegionId: 14 },
    { id: "other", buyRegionId: 14, sellRegionId: 14 },
  ];
  assert.deepEqual(filterMarketDeals(deals, ["12"]).map((deal) => deal.id), ["same"]);
  assert.deepEqual(filterMarketDeals(deals, ["12", "14"]).map((deal) => deal.id), ["same", "cross", "other"]);
  assert.deepEqual(filterMarketDeals(deals, []).map((deal) => deal.id), ["same", "cross", "other"]);
});

test("stall normalization preserves item-for-item and cargo-for-cargo offers", () => {
  const payload = normalizeStallsPayload({
    stalls: [{
      entityId: "stall-1",
      ownerName: "Trader",
      regionId: 11,
      orderCount: 2,
      orders: [{
        entityId: "order-1",
        remainingStock: "9",
        offerItems: [{ itemId: 1, itemName: "Iron", quantity: "3" }],
        requiredItems: [{ itemId: 2, itemName: "Wood", quantity: "4" }],
        offerCargo: [{ itemId: 1, itemName: "Iron Package", quantity: "1" }],
        requiredCargo: [{ itemId: 2, itemName: "Wood Package", quantity: "2" }],
      }],
    }],
    totalStalls: 1,
    totalOrders: 2,
    page: 1,
    totalPages: 1,
    limit: 20,
  });

  assert.deepEqual(payload.stalls[0].orders[0].offers.map((entry) => entry.itemType), ["item", "cargo"]);
  assert.deepEqual(payload.stalls[0].orders[0].requires.map((entry) => entry.itemType), ["item", "cargo"]);
  assert.equal(payload.stalls[0].orders[0].remainingStock, 9);
});

test("favorite parsing rejects malformed entries and keeps matching numeric ids by type", () => {
  assert.deepEqual(marketFavoriteKeys(JSON.stringify([
    { itemType: "item", itemId: 7 },
    { itemType: "cargo", itemId: 7 },
    { itemType: "other", itemId: 7 },
    { itemType: "item", itemId: 0 },
  ])), [
    { itemType: "item", itemId: 7 },
    { itemType: "cargo", itemId: 7 },
  ]);
  assert.deepEqual(marketFavoriteKeys("not json"), []);
});
