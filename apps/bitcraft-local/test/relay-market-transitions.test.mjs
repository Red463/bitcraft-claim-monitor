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

function sellOrder(overrides = {}) {
  return {
    entityId: "10",
    itemId: "42",
    itemType: "item",
    itemName: "Timber",
    ownerEntityId: "7",
    ownerUsername: "Builder",
    side: "sell",
    quantity: "10",
    price: "5",
    timestamp: "2026-07-30T14:00:00.000Z",
    ...overrides,
  };
}

function closedListing(overrides = {}) {
  return {
    entityId: "600",
    claimEntityId: "100",
    regionId: "19",
    ownerEntityId: "7",
    ownerUsername: "Builder",
    itemId: "1",
    itemType: "item",
    quantity: "50",
    closureKind: "sale_proceeds",
    timestamp: "2026-07-30T14:59:00.000Z",
    ...overrides,
  };
}

test("a unique Hex Coin closure confirms an exact full or partial sell-order transition", () => {
  assert.ok(transitionsModule, "Relay market transition module must exist");
  const full = transitionsModule.deriveRelayMarketTransitions({
    previous: {
      claimId: "100",
      regionId: "19",
      listings: [sellOrder()],
      closedListings: [],
    },
    current: {
      claimId: "100",
      regionId: "19",
      listings: [],
      closedListings: [closedListing()],
    },
    observedAt,
  });
  assert.equal(full.length, 1);
  assert.deepEqual(full[0], {
    eventType: "sale_confirmed",
    activityType: "market_sale_confirmed",
    occurredAt: "2026-07-30T14:59:00.000Z",
    sourceKey: "relay_market_event:sale_confirmed:19:600",
    activitySourceKey: "relay_market_activity:sale_confirmed:19:600",
    summary: "Confirmed sale: Timber x10 at 5g",
    listing: {
      key: "10",
      itemName: "Timber",
      side: "sell",
      owner: "Builder",
      ownerEntityId: "7",
      itemId: "42",
      itemType: "item",
      quantity: "10",
      price: "5",
      totalValue: "50",
      tier: null,
      rarity: null,
      listedAt: "2026-07-30T14:00:00.000Z",
      tradeId: "relay_closed_listing:19:600",
      raw: sellOrder(),
    },
    evidence: closedListing(),
  });

  const partial = transitionsModule.deriveRelayMarketTransitions({
    previous: {
      claimId: "100",
      regionId: "19",
      listings: [sellOrder()],
      closedListings: [],
    },
    current: {
      claimId: "100",
      regionId: "19",
      listings: [sellOrder({ quantity: "6" })],
      closedListings: [closedListing({ quantity: "20" })],
    },
    observedAt,
  });
  assert.equal(partial.length, 1);
  assert.equal(partial[0].eventType, "sale_confirmed");
  assert.equal(partial[0].listing.quantity, "4");
  assert.equal(partial[0].listing.totalValue, "20");
});

test("returned item or cargo evidence confirms a non-sale without crossing item kinds", () => {
  const cargoOrder = sellOrder({
    entityId: "11",
    itemId: "42",
    itemType: "cargo",
    itemName: "Timber Bundle",
    quantity: "3",
    price: "20",
  });
  const transitions = transitionsModule.deriveRelayMarketTransitions({
    previous: {
      claimId: "100",
      regionId: "19",
      listings: [sellOrder({ entityId: "12", quantity: "3" }), cargoOrder],
      closedListings: [],
    },
    current: {
      claimId: "100",
      regionId: "19",
      listings: [sellOrder({ entityId: "12", quantity: "3" })],
      closedListings: [closedListing({
        entityId: "601",
        itemId: "42",
        itemType: "cargo",
        quantity: "3",
        closureKind: "returned_item",
      })],
    },
    observedAt,
  });

  assert.equal(transitions.length, 1);
  assert.equal(transitions[0].eventType, "listing_returned");
  assert.equal(transitions[0].activityType, "market_listing_returned");
  assert.equal(transitions[0].listing.key, "11");
  assert.equal(transitions[0].listing.tradeId, null);
  assert.equal(transitions[0].evidence.entityId, "601");
});

test("ambiguous sale proceeds remain removed-or-cancelled instead of inventing trades", () => {
  const transitions = transitionsModule.deriveRelayMarketTransitions({
    previous: {
      claimId: "100",
      regionId: "19",
      listings: [
        sellOrder({ entityId: "20" }),
        sellOrder({ entityId: "21" }),
      ],
      closedListings: [],
    },
    current: {
      claimId: "100",
      regionId: "19",
      listings: [],
      closedListings: [closedListing()],
    },
    observedAt,
  });

  assert.equal(transitions.length, 2);
  assert.deepEqual(
    transitions.map((entry) => entry.eventType),
    ["removed_or_cancelled", "removed_or_cancelled"],
  );
  assert.equal(transitions.some((entry) => entry.listing.tradeId), false);
});

test("closed-listing evidence never confirms an equal-value order from another market", () => {
  const transitions = transitionsModule.deriveRelayMarketTransitions({
    previous: {
      claimId: "1369094286777412590",
      regionId: "19",
      listings: [
        sellOrder({ entityId: "22", claimEntityId: "100", regionId: "19" }),
        sellOrder({ entityId: "23", claimEntityId: "101", regionId: "19" }),
      ],
      closedListings: [],
    },
    current: {
      claimId: "1369094286777412590",
      regionId: "19",
      listings: [],
      closedListings: [closedListing({ claimEntityId: "100" })],
    },
    observedAt,
  });

  assert.deepEqual(
    transitions.map((entry) => [entry.listing.key, entry.eventType]),
    [["22", "sale_confirmed"], ["23", "removed_or_cancelled"]],
  );
});

test("sale correlation uses exact BigInt arithmetic for values beyond Number precision", () => {
  const hugePrice = "9007199254740993";
  const transitions = transitionsModule.deriveRelayMarketTransitions({
    previous: {
      claimId: "100",
      regionId: "19",
      listings: [sellOrder({ entityId: "30", quantity: "3", price: hugePrice })],
      closedListings: [],
    },
    current: {
      claimId: "100",
      regionId: "19",
      listings: [],
      closedListings: [closedListing({
        entityId: "602",
        quantity: (BigInt(hugePrice) * 3n).toString(),
      })],
    },
    observedAt,
  });

  assert.equal(transitions.length, 1);
  assert.equal(transitions[0].eventType, "sale_confirmed");
  assert.equal(transitions[0].listing.price, hugePrice);
  assert.equal(transitions[0].listing.totalValue, "27021597764222979");
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
    CREATE TABLE market_trades (
      trade_id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL,
      order_entity_id TEXT,
      seller_entity_id TEXT,
      seller_username TEXT,
      purchaser_entity_id TEXT,
      purchaser_username TEXT,
      item_id TEXT,
      item_type TEXT,
      item_name TEXT NOT NULL,
      quantity TEXT NOT NULL,
      unit_price TEXT NOT NULL,
      total_price TEXT NOT NULL,
      tier TEXT,
      rarity TEXT,
      occurred_at TEXT NOT NULL,
      imported_at TEXT NOT NULL,
      raw_json TEXT NOT NULL
    );
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

  assert.deepEqual(first, { derived: 3, inserted: 3, trades: 0, activities: 3 });
  assert.deepEqual(duplicate, { derived: 3, inserted: 0, trades: 0, activities: 0 });
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

  const soldPrevious = {
    claimId: "100",
    regionId: "19",
    listings: [sellOrder({
      entityId: "90",
      quantity: "3",
      price: "9007199254740993",
    })],
    closedListings: [],
  };
  const soldCurrent = {
    claimId: "100",
    regionId: "19",
    listings: [],
    closedListings: [closedListing({
      entityId: "690",
      quantity: "27021597764222979",
    })],
  };
  const sold = writer.apply({
    claimId: "100",
    previous: soldPrevious,
    current: soldCurrent,
    observedAt,
  });
  const soldDuplicate = writer.apply({
    claimId: "100",
    previous: soldPrevious,
    current: soldCurrent,
    observedAt,
  });
  assert.deepEqual(sold, { derived: 1, inserted: 1, trades: 1, activities: 1 });
  assert.deepEqual(
    soldDuplicate,
    { derived: 1, inserted: 0, trades: 0, activities: 0 },
  );
  assert.deepEqual(
    { ...db.prepare(`
      SELECT trade_id, order_entity_id, seller_entity_id, item_id, item_type,
             quantity, unit_price, total_price, occurred_at
      FROM market_trades
    `).get() },
    {
      trade_id: "relay_closed_listing:19:690",
      order_entity_id: "90",
      seller_entity_id: "7",
      item_id: "42",
      item_type: "item",
      quantity: "3",
      unit_price: "9007199254740993",
      total_price: "27021597764222979",
      occurred_at: "2026-07-30T14:59:00.000Z",
    },
  );
  assert.deepEqual(
    { ...db.prepare(`
      SELECT event_type, trade_id, quantity, price, total_value
      FROM market_events
      WHERE listing_key = '90'
    `).get() },
    {
      event_type: "sale_confirmed",
      trade_id: "relay_closed_listing:19:690",
      quantity: "3",
      price: "9007199254740993",
      total_value: "27021597764222979",
    },
  );
  assert.equal(outboxKicks, 2);
});
