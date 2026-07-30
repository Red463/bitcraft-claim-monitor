import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

let transitionsModule = null;
try {
  transitionsModule = await import("../src/server/relayMarketTransitions.mjs");
} catch {
  // The first TDD run proves the Relay transition module is absent.
}

const observedAt = "2026-07-30T15:00:00.000Z";

const previous = {
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
      itemId: "9",
      itemType: "cargo",
      itemName: "Stone Slab",
      ownerEntityId: "8",
      ownerUsername: "Mason",
      side: "sell",
      quantity: "3",
      price: "20",
      timestamp: "2026-07-30T14:10:00.000Z",
    },
  ],
};

const current = {
  claimId: "100",
  regionId: "19",
  listings: [
    {
      ...previous.listings[0],
      quantity: "6",
    },
    {
      entityId: "3",
      itemId: "42",
      itemType: "cargo",
      itemName: "Timber Bundle",
      ownerEntityId: "9",
      ownerUsername: "Hauler",
      side: "buy",
      quantity: "2",
      price: "30",
      timestamp: "2026-07-30T14:55:00.000Z",
    },
  ],
};

test("Relay market generation diffs preserve ambiguous closures without inventing sales", () => {
  assert.ok(transitionsModule, "Relay market transition module must exist");

  assert.deepEqual(
    transitionsModule.deriveRelayMarketTransitions({
      previous,
      current,
      observedAt,
    }),
    [
      {
        eventType: "partial_quantity_drop",
        activityType: "market_quantity_drop",
        occurredAt: observedAt,
        sourceKey: "relay_market_event:partial_quantity_drop:1:10->6",
        activitySourceKey: "relay_market_activity:partial_quantity_drop:1:10->6",
        summary: "Quantity dropped: Timber x4 at 5g",
        listing: {
          key: "1",
          itemName: "Timber",
          side: "sell",
          owner: "Builder",
          ownerEntityId: "7",
          itemId: "42",
          itemType: "item",
          quantity: "4",
          price: "5",
          totalValue: "20",
          tier: null,
          rarity: null,
          listedAt: "2026-07-30T14:00:00.000Z",
          tradeId: null,
          raw: current.listings[0],
        },
      },
      {
        eventType: "new_listing",
        activityType: "market_new_listing",
        occurredAt: observedAt,
        sourceKey: "relay_market_event:new_listing:3:0->2",
        activitySourceKey: "relay_market_activity:new_listing:3:0->2",
        summary: "New market listing: Timber Bundle x2 at 30g",
        listing: {
          key: "3",
          itemName: "Timber Bundle",
          side: "buy",
          owner: "Hauler",
          ownerEntityId: "9",
          itemId: "42",
          itemType: "cargo",
          quantity: "2",
          price: "30",
          totalValue: "60",
          tier: null,
          rarity: null,
          listedAt: "2026-07-30T14:55:00.000Z",
          tradeId: null,
          raw: current.listings[1],
        },
      },
      {
        eventType: "removed_or_cancelled",
        activityType: "market_removed_or_cancelled",
        occurredAt: observedAt,
        sourceKey: "relay_market_event:removed_or_cancelled:2:3->0",
        activitySourceKey: "relay_market_activity:removed_or_cancelled:2:3->0",
        summary: "Removed/cancelled: Stone Slab x3 at 20g",
        listing: {
          key: "2",
          itemName: "Stone Slab",
          side: "sell",
          owner: "Mason",
          ownerEntityId: "8",
          itemId: "9",
          itemType: "cargo",
          quantity: "3",
          price: "20",
          totalValue: "60",
          tier: null,
          rarity: null,
          listedAt: "2026-07-30T14:10:00.000Z",
          tradeId: null,
          raw: previous.listings[1],
        },
      },
    ],
  );
});

test("the first Relay market generation establishes a baseline without notification history", () => {
  assert.ok(transitionsModule, "Relay market transition module must exist");
  assert.deepEqual(transitionsModule.deriveRelayMarketTransitions({
    previous: null,
    current,
    observedAt,
  }), []);
});

test("Relay transition history is idempotent and needs no current-listing table", () => {
  assert.ok(transitionsModule, "Relay market transition module must exist");
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE market_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      claim_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      listing_key TEXT NOT NULL,
      item_name TEXT NOT NULL,
      side TEXT,
      owner TEXT,
      owner_entity_id TEXT,
      item_id TEXT,
      item_type TEXT,
      quantity TEXT,
      price TEXT,
      total_value TEXT,
      tier TEXT,
      rarity TEXT,
      occurred_at TEXT NOT NULL,
      trade_id TEXT,
      source_key TEXT,
      raw_json TEXT NOT NULL
    );
    CREATE UNIQUE INDEX idx_market_events_source
      ON market_events (claim_id, source_key)
      WHERE source_key IS NOT NULL;
    CREATE TABLE activity_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      claim_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      summary TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      source_key TEXT
    );
    CREATE UNIQUE INDEX idx_activity_source
      ON activity_events (claim_id, event_type, source_key)
      WHERE source_key IS NOT NULL;
  `);
  const activityInsert = db.prepare(`
    INSERT OR IGNORE INTO activity_events
      (claim_id, event_type, summary, occurred_at, metadata_json, source_key)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  let outboxKicks = 0;
  const writer = transitionsModule.createRelayMarketTransitionWriter(db, {
    addActivity: (claimId, eventType, summary, occurredAt, metadata, sourceKey) => (
      Number(activityInsert.run(
        claimId,
        eventType,
        summary,
        occurredAt,
        JSON.stringify(metadata),
        sourceKey,
      ).changes) > 0
    ),
    processOutbox: () => {
      outboxKicks += 1;
    },
  });

  const first = writer.apply({ claimId: "100", previous, current, observedAt });
  const duplicate = writer.apply({ claimId: "100", previous, current, observedAt });

  assert.deepEqual(first, { derived: 3, inserted: 3, activities: 3 });
  assert.deepEqual(duplicate, { derived: 3, inserted: 0, activities: 0 });
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM market_events").get().count, 3);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM activity_events").get().count, 3);
  assert.equal(
    db.prepare("SELECT event_type FROM market_events WHERE listing_key = '2'").get().event_type,
    "removed_or_cancelled",
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE name = 'market_listings'").get().count,
    0,
  );
  assert.equal(outboxKicks, 1);
});
