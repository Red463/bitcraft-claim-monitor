import assert from "node:assert/strict";
import test from "node:test";

import { BEST_SELLER_SORTS, bestSellerSortValue, buildMarketDaily, buildMarketTopItems, formatMarketDay } from "../src/pages/market/marketAnalytics.ts";

test("buildMarketTopItems aggregates sales by item and sorts by units then value", () => {
  const topItems = buildMarketTopItems([
    { item_name: "Leather", quantity: 2, total_value: 12, occurred_at: "2026-06-27T10:00:00.000Z" },
    { itemName: "Leather", quantity: 3, totalValue: 24, occurred_at: "2026-06-28T10:00:00.000Z" },
    { item_name: "Oak Plank", quantity: 5, total_value: 20, occurred_at: "2026-06-26T10:00:00.000Z" },
    { item_name: "Bronze Ingot", quantity: 1, total_value: 100, occurred_at: "2026-06-25T10:00:00.000Z" },
  ]);

  assert.deepEqual(topItems.map((item) => [item.itemName, item.salesCount, item.unitsSold, item.totalValue, item.avgUnitPrice]), [
    ["Leather", 2, 5, 36, 7.2],
    ["Oak Plank", 1, 5, 20, 4],
    ["Bronze Ingot", 1, 1, 100, 100],
  ]);
  assert.equal(topItems[0].lastSoldAt, "2026-06-28T10:00:00.000Z");
});

test("buildMarketDaily groups sales into chronological day buckets", () => {
  const daily = buildMarketDaily([
    { quantity: 2, total_value: 12, occurred_at: "2026-06-28T10:00:00.000Z" },
    { quantity: 3, totalValue: 30, occurredAt: "2026-06-28T15:00:00.000Z" },
    { quantity: 1, total_value: 9, occurred_at: "2026-06-27T10:00:00.000Z" },
  ]);

  assert.deepEqual(daily, [
    { day: "2026-06-27", salesCount: 1, unitsSold: 1, totalValue: 9 },
    { day: "2026-06-28", salesCount: 2, unitsSold: 5, totalValue: 42 },
  ]);
});

test("formatMarketDay formats ISO days and preserves unknown labels", () => {
  assert.match(formatMarketDay("2026-06-28"), /28|Jun/);
  assert.equal(formatMarketDay("Unknown"), "Unknown");
});

test("best seller sort helpers expose stable ranking options and values", () => {
  assert.deepEqual(BEST_SELLER_SORTS, [
    { key: "units", label: "Units sold" },
    { key: "revenue", label: "Revenue" },
    { key: "sales", label: "Sales" },
    { key: "average", label: "Avg price" },
    { key: "recent", label: "Recent" },
  ]);
  const row = {
    unitsSold: "12",
    totalValue: "240",
    salesCount: "3",
    avgUnitPrice: "20",
    lastSoldAt: "2026-06-28T12:30:00.000Z",
  };

  assert.equal(bestSellerSortValue(row, "units"), 12);
  assert.equal(bestSellerSortValue(row, "revenue"), 240);
  assert.equal(bestSellerSortValue(row, "sales"), 3);
  assert.equal(bestSellerSortValue(row, "average"), 20);
  assert.equal(bestSellerSortValue(row, "recent"), new Date("2026-06-28T12:30:00.000Z").getTime());
});
