import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { BEST_SELLER_SORTS, MARKET_INCOME_RANGES, bestSellerSortValue, buildMarketDaily, buildMarketIncomeSummary, buildMarketRangeAnalytics, buildMarketTopItems, formatMarketDay } from "../src/pages/market/marketAnalytics.ts";
import { applySchemaBootstrap } from "../src/server/schemaBootstrap.mjs";
import { buildOperationalHistoryRollups, readOperationalMarketTradeDaily } from "../src/server/operationalHistoryRetention.mjs";

test("buildMarketTopItems aggregates sales by item and sorts by units then value", () => {
  const topItems = buildMarketTopItems([
    { item_name: "Leather", quantity: 2, total_value: 12, occurred_at: "2026-06-27T10:00:00.000Z" },
    { itemName: "Leather", quantity: 3, totalValue: 24, occurred_at: "2026-06-28T10:00:00.000Z" },
    { item_name: "Oak Plank", quantity: 5, total_value: 20, occurred_at: "2026-06-26T10:00:00.000Z" },
    { item_name: "Bronze Ingot", quantity: 1, total_value: 100, occurred_at: "2026-06-25T10:00:00.000Z" },
  ]);

  assert.deepEqual(topItems.map((item) => [item.itemName, item.salesCount, item.unitsSold, item.totalValue, item.avgUnitPrice]), [
    ["Leather", 2, "5", "36", 7.2],
    ["Oak Plank", 1, "5", "20", 4],
    ["Bronze Ingot", 1, "1", "100", 100],
  ]);
  assert.equal(topItems[0].lastSoldAt, "2026-06-28T10:00:00.000Z");
});

test("Best Sellers preserves item and cargo identities with the same numeric id", () => {
  const topItems = buildMarketTopItems([
    { item_id: "42", item_type: "item", item_name: "Timber", quantity: 2, total_value: 12, occurred_at: "2026-08-08T10:00:00.000Z" },
    { item_id: "42", item_type: "cargo", item_name: "Timber", quantity: 3, total_value: 30, occurred_at: "2026-08-08T11:00:00.000Z" },
  ]);

  assert.deepEqual(topItems.map((item) => [item.itemId, item.itemType, item.unitsSold]), [
    ["42", "cargo", "3"],
    ["42", "item", "2"],
  ]);
});

test("market analytics aggregates quantities and revenue exactly above Number.MAX_SAFE_INTEGER", () => {
  const trades = [
    { item_id: "42", item_type: "item", item_name: "Timber", quantity: "9007199254740993", total_value: "9007199254740993", occurred_at: "2026-08-08T10:00:00.000Z" },
    { item_id: "42", item_type: "item", item_name: "Timber", quantity: "2", total_value: "4", occurred_at: "2026-08-08T11:00:00.000Z" },
  ];

  const analytics = buildMarketRangeAnalytics(trades, "2026-08-08T12:00:00.000Z", 7);
  assert.equal(analytics.topItems[0].unitsSold, "9007199254740995");
  assert.equal(analytics.topItems[0].totalValue, "9007199254740997");
  assert.equal(analytics.daily[0].unitsSold, "9007199254740995");
  assert.equal(analytics.daily[0].totalValue, "9007199254740997");
  assert.equal(analytics.totals.confirmedUnits, "9007199254740995");
  assert.equal(analytics.totals.trackedValue, "9007199254740997");

  const summary = buildMarketIncomeSummary(analytics.daily, "2026-08-08", 7);
  assert.equal(summary.unitsSold, "9007199254740995");
  assert.equal(summary.totalValue, "9007199254740997");
});

test("market range analytics uses inclusive UTC day boundaries for one trade source", () => {
  const analytics = buildMarketRangeAnalytics([
    { item_id: "1", item_type: "item", item_name: "Old", quantity: 1, total_value: 100, occurred_at: "2026-08-01T23:59:59.999Z" },
    { item_id: "2", item_type: "item", item_name: "Boundary", quantity: 2, total_value: 20, occurred_at: "2026-08-02T00:00:00.000Z" },
    { item_id: "3", item_type: "cargo", item_name: "Today", quantity: 3, total_value: 30, occurred_at: "2026-08-08T23:59:59.999Z" },
    { item_id: "4", item_type: "item", item_name: "Future", quantity: 4, total_value: 40, occurred_at: "2026-08-09T00:00:00.000Z" },
  ], "2026-08-08T12:00:00.000Z", 7);

  assert.deepEqual(analytics.trades.map((trade) => trade.item_name), ["Boundary", "Today"]);
  assert.deepEqual(analytics.totals, { confirmedSales: 2, confirmedUnits: "5", trackedValue: "50" });
  assert.deepEqual(analytics.daily.map((row) => row.day), ["2026-08-02", "2026-08-08"]);
  assert.deepEqual(analytics.topItems.map((row) => row.itemName), ["Today", "Boundary"]);
});

test("a 365-day market range does not truncate Revenue by Day to 30 buckets", () => {
  const trades = Array.from({ length: 31 }, (_, index) => ({
    item_id: String(index + 1),
    item_type: "item",
    item_name: `Item ${index + 1}`,
    quantity: 1,
    total_value: 1,
    occurred_at: new Date(Date.UTC(2026, 6, index + 1, 12)).toISOString(),
  }));

  const analytics = buildMarketRangeAnalytics(trades, "2026-07-31T23:59:59.999Z", 365);
  assert.equal(analytics.daily.length, 31);
});

test("buildMarketDaily groups sales into chronological day buckets", () => {
  const daily = buildMarketDaily([
    { quantity: 2, total_value: 12, occurred_at: "2026-06-28T10:00:00.000Z" },
    { quantity: 3, totalValue: 30, occurredAt: "2026-06-28T15:00:00.000Z" },
    { quantity: 1, total_value: 9, occurred_at: "2026-06-27T10:00:00.000Z" },
  ]);

  assert.deepEqual(daily, [
    { day: "2026-06-27", salesCount: 1, unitsSold: "1", totalValue: "9" },
    { day: "2026-06-28", salesCount: 2, unitsSold: "5", totalValue: "42" },
  ]);
});

test("buildMarketIncomeSummary totals confirmed daily market sales and plots cumulative income", () => {
  const summary = buildMarketIncomeSummary([
    { day: "2026-06-27", salesCount: 1, unitsSold: 2, totalValue: 12 },
    { day: "2026-06-29", salesCount: 2, unitsSold: 5, totalValue: 42 },
  ], "2026-06-30");

  assert.equal(summary.totalValue, "54");
  assert.equal(summary.salesCount, 3);
  assert.equal(summary.unitsSold, "7");
  assert.deepEqual(summary.trend, [
    { at: "2026-06-27", value: 12 },
    { at: "2026-06-28", value: 12 },
    { at: "2026-06-29", value: 54 },
    { at: "2026-06-30", value: 54 },
  ]);
});

test("market income ranges expose stable dashboard choices", () => {
  assert.deepEqual(MARKET_INCOME_RANGES, [
    { id: "7", label: "7D", days: 7 },
    { id: "30", label: "30D", days: 30 },
    { id: "365", label: "1Y", days: 365 },
  ]);
});

test("buildMarketIncomeSummary totals only the selected seven-day period", () => {
  const summary = buildMarketIncomeSummary([
    { day: "2026-06-01", salesCount: 1, unitsSold: 1, totalValue: 100 },
    { day: "2026-06-24", salesCount: 1, unitsSold: 2, totalValue: 10 },
    { day: "2026-06-25", salesCount: 1, unitsSold: 3, totalValue: 20 },
  ], "2026-06-25", 7);

  assert.equal(summary.partialRange, false);
  assert.equal(summary.requestedStartDay, "2026-06-19");
  assert.equal(summary.availableStartDay, "2026-06-01");
  assert.equal(summary.totalValue, "30");
  assert.equal(summary.salesCount, 2);
  assert.equal(summary.unitsSold, "5");
  assert.deepEqual(summary.trend[0], { at: "2026-06-19", value: 0 });
  assert.deepEqual(summary.trend.at(-1), { at: "2026-06-25", value: 30 });
});

test("buildMarketIncomeSummary does not invent observations before stored history", () => {
  const summary = buildMarketIncomeSummary([
    { day: "2026-06-24", salesCount: 1, unitsSold: 2, totalValue: 10 },
    { day: "2026-06-25", salesCount: 1, unitsSold: 3, totalValue: 20 },
  ], "2026-06-25", 30);

  assert.equal(summary.partialRange, true);
  assert.equal(summary.requestedStartDay, "2026-05-27");
  assert.equal(summary.availableStartDay, "2026-06-24");
  assert.deepEqual(summary.trend, [
    { at: "2026-06-24", value: 10 },
    { at: "2026-06-25", value: 30 },
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

test("rollup-backed market daily history matches retained raw fixture results", () => {
  const db = new DatabaseSync(":memory:");
  applySchemaBootstrap(db);
  const rows = [
    { tradeId: "a", quantity: "9007199254740993", total: "9007199254740995", at: "2026-08-20T01:00:00.000Z" },
    { tradeId: "b", quantity: "2", total: "4", at: "2026-08-20T02:00:00.000Z" },
    { tradeId: "c", quantity: "3", total: "9", at: "2026-08-21T02:00:00.000Z" },
  ];
  const insert = db.prepare(`
    INSERT INTO market_trades (
      trade_id, claim_id, item_id, item_type, item_name, quantity, unit_price,
      total_price, occurred_at, imported_at, raw_json
    ) VALUES (?, 'claim-a', '42', '0', 'Timber', ?, '1', ?, ?, ?, '{}')
  `);
  for (const row of rows) insert.run(row.tradeId, row.quantity, row.total, row.at, row.at);
  buildOperationalHistoryRollups(db, { beforeDay: "2026-08-22", sourceTables: ["market_trades"] });

  const expected = buildMarketDaily(rows.map((row) => ({ quantity: row.quantity, total_value: row.total, occurred_at: row.at })));
  const actual = readOperationalMarketTradeDaily(db, { claimId: "claim-a", startDay: "2026-08-20", endDay: "2026-08-21" });
  assert.deepEqual(actual.daily, expected);
  assert.equal(actual.observedSince, "2026-08-20T01:00:00.000Z");
  db.close();
});
