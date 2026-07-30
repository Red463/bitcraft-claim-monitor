import assert from "node:assert/strict";
import { test } from "node:test";

import * as globalMarket from "../src/pages/market/globalMarket.ts";

const {
  filterMarketDeals,
  marketFavoriteKeys,
  normalizeMarketOrders,
  normalizeStallsPayload,
} = globalMarket;

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
    ["sell", "cargo", "7", "30", "4"],
    ["buy", "item", "7", "25", "8"],
  ]);
  assert.equal(rows[0].claimName, "");
  assert.equal(rows[1].ownerName, "Buyer");
});

test("global market orders preserve exact decimal prices and quantities until display", () => {
  const [order] = normalizeMarketOrders({
    sellOrders: [{
      entityId: "9007199254740993",
      itemId: "9007199254740997",
      itemType: "item",
      price: "9007199254740993",
      quantity: "9007199254740995",
      regionId: "19",
    }],
  });

  assert.equal(order.orderKey, "9007199254740993");
  assert.equal(order.itemId, "9007199254740997");
  assert.equal(order.unitPrice, "9007199254740993");
  assert.equal(order.quantity, "9007199254740995");
  assert.equal(order.regionId, "19");
});

test("market browse request URLs use only provider-neutral local routes", () => {
  assert.equal(typeof globalMarket.marketBrowseSearchUrl, "function");
  assert.equal(typeof globalMarket.marketBrowseItemUrls, "function");
  assert.equal(globalMarket.marketBrowseSearchUrl({
    query: "timber",
    regionId: "19",
    availableOnly: true,
    hasSell: true,
    hasBuy: false,
    category: "Wood Products",
    sort: "orders",
  }), "/api/local/market/catalog?regionId=19&q=timber&availableOnly=true&hasSell=true&hasBuy=false&category=Wood+Products&sort=orders&limit=50");
  assert.deepEqual(globalMarket.marketBrowseItemUrls({
    itemType: "cargo",
    itemId: "42",
    regionId: "all",
    range: "30d",
  }), {
    orderBook: "/api/local/market/order-book?regionId=all&itemType=cargo&itemId=42",
    priceHistory: "/api/local/market/price-history?regionId=all&itemType=cargo&itemId=42&range=30d",
  });
});

test("market browse surfaces stale and unavailable live-order state", () => {
  assert.equal(typeof globalMarket.marketFreshnessNotice, "function");
  assert.equal(globalMarket.marketFreshnessNotice({
    freshness: "stale",
    ageMs: 65_000,
    warnings: ["socket lost"],
  }), "Live order book is stale (1m old): socket lost");
  assert.equal(globalMarket.marketFreshnessNotice({
    freshness: "unavailable",
    warnings: [],
  }), "Live order book has not loaded yet.");
  assert.equal(globalMarket.marketFreshnessNotice({
    freshness: "fresh",
    ageMs: 900,
    warnings: [],
  }), "Live order book updated just now.");
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

test("favorite parsing rejects malformed entries and preserves exact decimal ids by type", () => {
  assert.deepEqual(marketFavoriteKeys(JSON.stringify([
    { itemType: "item", itemId: 7 },
    { itemType: "cargo", itemId: 7 },
    { itemType: "item", itemId: "9007199254740993" },
    { itemType: "other", itemId: 7 },
    { itemType: "item", itemId: 0 },
  ])), [
    { itemType: "item", itemId: "7" },
    { itemType: "cargo", itemId: "7" },
    { itemType: "item", itemId: "9007199254740993" },
  ]);
  assert.deepEqual(marketFavoriteKeys("not json"), []);
});
