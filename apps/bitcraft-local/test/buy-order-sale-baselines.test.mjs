import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  buyOrderBaselineKey,
  readBuyOrderSaleBaselines,
} from "../src/server/buyOrderSaleBaselines.mjs";

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE market_trades (
      trade_id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL,
      region_id TEXT,
      item_id TEXT,
      item_type TEXT,
      quantity TEXT NOT NULL,
      total_price TEXT NOT NULL,
      occurred_at TEXT NOT NULL
    );
  `);
  return db;
}

function insert(db, row) {
  db.prepare(`
    INSERT INTO market_trades (
      trade_id, claim_id, region_id, item_id, item_type,
      quantity, total_price, occurred_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.tradeId, row.claimId, row.regionId, row.itemId, row.itemType,
    row.quantity, row.totalPrice, row.occurredAt,
  );
}

test("aggregates exact same-region typed seven-day baselines", () => {
  const db = database();
  insert(db, {
    tradeId: "a", claimId: "claim", regionId: "19", itemId: "43",
    itemType: "cargo", quantity: "9007199254740993",
    totalPrice: "180143985094819860", occurredAt: "2026-07-31T12:00:00.000Z",
  });
  insert(db, {
    tradeId: "b", claimId: "claim", regionId: "19", itemId: "43",
    itemType: "cargo", quantity: "7", totalPrice: "147",
    occurredAt: "2026-08-01T11:00:00.000Z",
  });
  insert(db, {
    tradeId: "wrong-type", claimId: "claim", regionId: "19", itemId: "43",
    itemType: "item", quantity: "1", totalPrice: "999",
    occurredAt: "2026-08-01T11:00:00.000Z",
  });
  const result = readBuyOrderSaleBaselines(db, {
    claimId: "claim",
    allowedRegionIds: ["19"],
    itemKeys: new Set([buyOrderBaselineKey("19", "cargo", "43")]),
    nowMs: Date.parse("2026-08-01T12:00:00.000Z"),
  });
  assert.deepEqual(
    result.baselines.get("19:cargo:43"),
    {
      regionId: "19",
      itemType: "cargo",
      itemId: "43",
      salesCount: 2,
      unitsSold: "9007199254741000",
      totalValue: "180143985094820007",
      observedSince: "2026-07-31T12:00:00.000Z",
      lastSoldAt: "2026-08-01T11:00:00.000Z",
    },
  );
});

test("excludes rows outside the bounded requested sale scope", () => {
  const db = database();
  const now = Date.parse("2026-08-01T12:00:00.000Z");
  const valid = {
    claimId: "claim", regionId: "19", itemId: "43", itemType: "cargo",
    quantity: "2", totalPrice: "20", occurredAt: "2026-08-01T11:00:00.000Z",
  };
  insert(db, { ...valid, tradeId: "valid" });
  insert(db, { ...valid, tradeId: "old", occurredAt: "2026-07-24T11:59:59.999Z" });
  insert(db, { ...valid, tradeId: "other-claim", claimId: "other" });
  insert(db, { ...valid, tradeId: "other-region", regionId: "20" });
  insert(db, { ...valid, tradeId: "unrequested", itemId: "44" });
  insert(db, { ...valid, tradeId: "no-region", regionId: null });

  const result = readBuyOrderSaleBaselines(db, {
    claimId: "claim",
    allowedRegionIds: ["19"],
    itemKeys: new Set([buyOrderBaselineKey("19", "cargo", "43")]),
    nowMs: now,
  });

  assert.deepEqual(result.baselines.get("19:cargo:43"), {
    regionId: "19", itemType: "cargo", itemId: "43", salesCount: 1,
    unitsSold: "2", totalValue: "20",
    observedSince: "2026-08-01T11:00:00.000Z",
    lastSoldAt: "2026-08-01T11:00:00.000Z",
  });
  assert.equal(result.historyObservedSince, "2026-08-01T11:00:00.000Z");
});

test("skips malformed quantities and totals with a warning", () => {
  const db = database();
  const sale = {
    claimId: "claim", regionId: "19", itemId: "43", itemType: "cargo",
    occurredAt: "2026-08-01T11:00:00.000Z",
  };
  insert(db, { ...sale, tradeId: "valid", quantity: "2", totalPrice: "20" });
  insert(db, { ...sale, tradeId: "malformed", quantity: "not-a-number", totalPrice: "30" });

  const result = readBuyOrderSaleBaselines(db, {
    claimId: "claim",
    allowedRegionIds: ["19"],
    itemKeys: new Set([buyOrderBaselineKey("19", "cargo", "43")]),
    nowMs: Date.parse("2026-08-01T12:00:00.000Z"),
  });

  assert.equal(result.baselines.get("19:cargo:43").salesCount, 1);
  assert.deepEqual(result.warnings, ["Ignored malformed confirmed trade malformed."]);
});
