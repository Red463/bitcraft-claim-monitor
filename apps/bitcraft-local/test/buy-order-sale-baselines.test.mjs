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
    tradeId: "relay_closed_listing:19:a", claimId: "claim", regionId: "19", itemId: "43",
    itemType: "cargo", quantity: "9007199254740993",
    totalPrice: "180143985094819860", occurredAt: "2026-07-31T12:00:00.000Z",
  });
  insert(db, {
    tradeId: "relay_closed_listing:19:b", claimId: "claim", regionId: "19", itemId: "43",
    itemType: "cargo", quantity: "7", totalPrice: "147",
    occurredAt: "2026-08-01T11:00:00.000Z",
  });
  insert(db, {
    tradeId: "relay_closed_listing:19:wrong-type", claimId: "claim", regionId: "19", itemId: "43",
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
  insert(db, { ...valid, tradeId: "relay_closed_listing:19:valid" });
  insert(db, { ...valid, tradeId: "relay_closed_listing:19:old", occurredAt: "2026-07-24T11:59:59.999Z" });
  insert(db, { ...valid, tradeId: "relay_closed_listing:19:other-claim", claimId: "other" });
  insert(db, { ...valid, tradeId: "relay_closed_listing:20:other-region", regionId: "20" });
  insert(db, { ...valid, tradeId: "relay_closed_listing:19:unrequested", itemId: "44" });
  insert(db, { ...valid, tradeId: "relay_closed_listing:unknown:no-region", regionId: null });

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
  insert(db, { ...sale, tradeId: "relay_closed_listing:19:valid", quantity: "2", totalPrice: "20" });
  insert(db, { ...sale, tradeId: "relay_closed_listing:19:malformed", quantity: "not-a-number", totalPrice: "30" });

  const result = readBuyOrderSaleBaselines(db, {
    claimId: "claim",
    allowedRegionIds: ["19"],
    itemKeys: new Set([buyOrderBaselineKey("19", "cargo", "43")]),
    nowMs: Date.parse("2026-08-01T12:00:00.000Z"),
  });

  assert.equal(result.baselines.get("19:cargo:43").salesCount, 1);
  assert.deepEqual(result.warnings, ["Ignored malformed confirmed trade relay_closed_listing:19:malformed."]);
});

test("uses only authoritative Relay sale closure trades", () => {
  const db = database();
  const sale = {
    claimId: "claim", regionId: "19", itemId: "43", itemType: "cargo",
    quantity: "2", totalPrice: "20", occurredAt: "2026-08-01T11:00:00.000Z",
  };
  insert(db, { ...sale, tradeId: "relay_closed_listing:19:authoritative" });
  insert(db, { ...sale, tradeId: "legacy-market-trade", quantity: "99", totalPrice: "990" });

  const result = readBuyOrderSaleBaselines(db, {
    claimId: "claim",
    allowedRegionIds: ["19"],
    itemKeys: new Set([buyOrderBaselineKey("19", "cargo", "43")]),
    nowMs: Date.parse("2026-08-01T12:00:00.000Z"),
  });

  assert.equal(result.baselines.get("19:cargo:43").unitsSold, "2");
  assert.equal(result.baselines.get("19:cargo:43").totalValue, "20");
});

test("excludes future sales and warns on non-canonical timestamps", () => {
  const db = database();
  const sale = {
    claimId: "claim", regionId: "19", itemId: "43", itemType: "cargo",
    quantity: "2", totalPrice: "20",
  };
  insert(db, {
    ...sale, tradeId: "relay_closed_listing:19:valid",
    occurredAt: "2026-08-01T11:00:00.000Z",
  });
  insert(db, {
    ...sale, tradeId: "relay_closed_listing:19:future",
    occurredAt: "2026-08-01T12:00:00.001Z",
  });
  insert(db, {
    ...sale, tradeId: "relay_closed_listing:19:bad-time",
    occurredAt: "2026-08-01T11:00:00.000Y",
  });

  const result = readBuyOrderSaleBaselines(db, {
    claimId: "claim",
    allowedRegionIds: ["19"],
    itemKeys: new Set([buyOrderBaselineKey("19", "cargo", "43")]),
    nowMs: Date.parse("2026-08-01T12:00:00.000Z"),
  });

  assert.equal(result.baselines.get("19:cargo:43").salesCount, 1);
  assert.deepEqual(result.warnings, [
    "Ignored malformed confirmed trade relay_closed_listing:19:bad-time.",
  ]);
});
