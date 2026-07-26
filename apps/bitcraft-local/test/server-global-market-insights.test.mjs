import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

import {
  buildMarketOverview,
  chunkMarketItemKeys,
  collectMarketSnapshots,
  marketSnapshotRows,
  selectMarketMovers,
  snapshotRetentionCutoff,
} from "../src/server/globalMarketInsights.mjs";
import { schemaBootstrapSql } from "../src/server/schemaBootstrap.mjs";

test("market insight batching preserves item and cargo identity in groups of 100", () => {
  const keys = [
    ...Array.from({ length: 101 }, (_, index) => ({ itemType: "item", itemId: index + 1 })),
    { itemType: "cargo", itemId: 1 },
  ];
  const chunks = chunkMarketItemKeys(keys, 100);

  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].itemIds.length, 100);
  assert.deepEqual(chunks[0].cargoIds, []);
  assert.deepEqual(chunks[1], { itemIds: [101], cargoIds: [1] });
});

test("market snapshots normalize bulk prices without merging item and cargo ids", () => {
  const rows = marketSnapshotRows("2026-07-26T12:00:00.000Z", {
    data: {
      items: {
        1: { vwap24h: 20, vwap7d: 10, volume24h: 30, lowestSellPrice: 19, highestBuyPrice: 18 },
      },
      cargo: {
        1: { vwap24h: 40, vwap7d: 35, volume24h: 4, lowestSellPrice: 44, highestBuyPrice: 38 },
      },
    },
  }, new Map([
    ["item:1", { name: "Iron Ingot", iconAssetName: "iron" }],
    ["cargo:1", { name: "Iron Package", iconAssetName: "package" }],
  ]));

  assert.deepEqual(rows.map((row) => [row.itemType, row.itemId, row.itemName]), [
    ["item", 1, "Iron Ingot"],
    ["cargo", 1, "Iron Package"],
  ]);
});

test("market snapshot collection keeps successful batches after a partial upstream failure", async () => {
  const keys = Array.from({ length: 3 }, (_, index) => ({ itemType: "item", itemId: index + 1 }));
  const result = await collectMarketSnapshots({
    keys,
    capturedAt: "2026-07-26T12:00:00.000Z",
    batchSize: 1,
    catalog: new Map(keys.map((key) => [`item:${key.itemId}`, { name: `Item ${key.itemId}` }])),
    fetchBatch: async (batch) => {
      const id = batch.itemIds[0];
      if (id === 2) throw new Error("HTTP 503");
      return { data: { items: { [id]: { vwap24h: id * 10, volume24h: 1 } } } };
    },
  });

  assert.deepEqual(result.snapshots.map((row) => row.itemId), [1, 3]);
  assert.deepEqual(result.failures, ["HTTP 503"]);
});

test("market movers use prior-day VWAP when available and warm-up baseline otherwise", () => {
  const current = [
    { itemType: "item", itemId: 1, itemName: "Iron", vwap24h: 150, vwap7d: 120, volume24h: 50 },
    { itemType: "cargo", itemId: 2, itemName: "Timber", vwap24h: 80, vwap7d: 100, volume24h: 20 },
  ];
  const prior = [
    { itemType: "item", itemId: 1, vwap24h: 100 },
    { itemType: "cargo", itemId: 2, vwap24h: 100 },
  ];

  assert.deepEqual(selectMarketMovers(current, prior, 5), {
    baseline: "prior-24h",
    movers: [
      { ...current[0], baselinePrice: 100, changePercent: 50 },
      { ...current[1], baselinePrice: 100, changePercent: -20 },
    ],
  });
  assert.deepEqual(selectMarketMovers(current, [], 1), {
    baseline: "7d-vwap",
    movers: [
      { ...current[0], baselinePrice: 120, changePercent: 25 },
    ],
  });
});

test("market overview scopes regional modules, keeps movers global, and marks old aggregates stale", () => {
  const generatedAt = "2026-07-26T10:00:00.000Z";
  const overview = buildMarketOverview({
    generatedAt,
    regionId: "7",
    currentRows: [
      { itemType: "item", itemId: 1, itemName: "Iron", vwap24h: 150, vwap7d: 100, volume24h: 50 },
    ],
    priorRows: [],
    topDeals: [
      { sourceRegionId: 7, destinationRegionId: 8, unitProfit: 10 },
      { sourceRegionId: 9, destinationRegionId: 10, unitProfit: 20 },
    ],
    mostTraded: [{ regionId: 7, itemId: 1 }, { regionId: 8, itemId: 2 }],
    hubs: [{ regionId: 7, claimName: "Northport" }, { regionId: 8, claimName: "Southport" }],
    recentActivity: [{ regionId: 7, itemId: 1 }, { regionId: 8, itemId: 2 }],
    nowMs: Date.parse("2026-07-26T11:00:00.000Z"),
  });

  assert.equal(overview.stale, true);
  assert.equal(overview.moverBaseline, "7d-vwap");
  assert.equal(overview.topDeals.length, 1);
  assert.equal(overview.movers.length, 1);
  assert.equal(overview.mostTraded.length, 1);
  assert.equal(overview.hubs.length, 1);
  assert.equal(overview.recentActivity.length, 1);
});

test("global market snapshots are idempotent and retain a bounded 14-day history", () => {
  assert.equal(snapshotRetentionCutoff("2026-07-26T12:00:00.000Z"), "2026-07-12T12:00:00.000Z");
  const db = new DatabaseSync(":memory:");
  db.exec(schemaBootstrapSql);
  const insert = db.prepare(`
    INSERT OR REPLACE INTO global_market_price_snapshots (
      captured_at, item_type, item_id, item_name, volume24h
    ) VALUES (?, ?, ?, ?, ?)
  `);
  insert.run("2026-07-26T12:00:00.000Z", "item", 1, "Iron", 10);
  insert.run("2026-07-26T12:00:00.000Z", "item", 1, "Iron", 20);
  const result = db.prepare("SELECT COUNT(*) AS count, MAX(volume24h) AS volume FROM global_market_price_snapshots").get();
  assert.equal(result.count, 1);
  assert.equal(result.volume, 20);
  db.close();
});
