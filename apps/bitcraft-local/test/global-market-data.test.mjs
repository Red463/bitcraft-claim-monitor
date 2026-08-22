import assert from "node:assert/strict";
import { test } from "node:test";

import * as globalMarket from "../src/pages/market/globalMarket.ts";

const {
  bestMarketDealPotential,
  filterMarketDeals,
  marketFavoriteQuoteRows,
  marketFavoriteQuotesRequest,
  marketFavoriteKeys,
  normalizeMarketOrders,
} = globalMarket;

test("bestMarketDealPotential does not add overlapping route capacity", () => {
  assert.equal(typeof bestMarketDealPotential, "function");
  assert.equal(bestMarketDealPotential([
    { routeKey: "sell-1:buy-1", totalPotential: "9007199254740993" },
    { routeKey: "sell-1:buy-2", totalPotential: "8000000000000000" },
    { routeKey: "sell-2:buy-2", totalPotential: "7" },
  ]), "9007199254740993");
});

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

test("Deal Watch item search is scoped to live Relay sell orders", () => {
  assert.equal(typeof globalMarket.marketDealWatchSearchUrl, "function");
  assert.equal(typeof globalMarket.marketRegionScopeUrl, "function");
  assert.equal(globalMarket.marketDealWatchSearchUrl({
    claimId: "1369094286777412590",
    regionId: "19",
    query: "Leather & Hide",
  }), "/api/local/market/catalog?claimId=1369094286777412590&regionId=19&q=Leather+%26+Hide&availableOnly=true&hasSell=true&hasBuy=false&limit=8");
  assert.equal(
    globalMarket.marketRegionScopeUrl("1369094286777412590"),
    "/api/local/market/regions?claimId=1369094286777412590",
  );
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

test("favorite quote request and response mapping preserve typed decimal identities", () => {
  const favorites = [
    { itemType: "item", itemId: "30" },
    { itemType: "cargo", itemId: "30" },
    { itemType: "item", itemId: "9007199254740993" },
  ];
  assert.deepEqual(marketFavoriteQuotesRequest("19", favorites), {
    url: "/api/local/market/favorite-quotes",
    body: JSON.stringify({ regionId: "19", items: favorites }),
  });
  assert.deepEqual(marketFavoriteQuoteRows(favorites, {
    quotes: {
      "item:30": { bestSell: "9007199254740995", bestBuy: "9007199254740994", sellCount: 2, buyCount: 1 },
      "cargo:30": { bestSell: "17", bestBuy: null, sellCount: 1, buyCount: 0 },
    },
  }).map((row) => ({
    key: `${row.itemType}:${row.itemId}`,
    bestSell: row.bestSell,
    bestBuy: row.bestBuy,
    sellCount: row.sellCount,
    buyCount: row.buyCount,
  })), [
    { key: "item:30", bestSell: "9007199254740995", bestBuy: "9007199254740994", sellCount: 2, buyCount: 1 },
    { key: "cargo:30", bestSell: "17", bestBuy: null, sellCount: 1, buyCount: 0 },
    { key: "item:9007199254740993", bestSell: null, bestBuy: null, sellCount: 0, buyCount: 0 },
  ]);
});
