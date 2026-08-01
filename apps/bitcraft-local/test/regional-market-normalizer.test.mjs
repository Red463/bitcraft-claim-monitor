import assert from "node:assert/strict";
import test from "node:test";

import * as normalizers from "../src/server/game-data/normalizers.ts";

test("regional market normalization keeps claim-scoped item and cargo orders exact", () => {
  assert.equal(
    typeof normalizers.normalizeRegionalMarket,
    "function",
    "regional market normalizer must exist",
  );
  const result = normalizers.normalizeRegionalMarket({
    claimId: "1369094286777412590",
    regionId: "19",
    sellRows: [{
      entityId: 500n,
      ownerEntityId: 700n,
      claimEntityId: 1369094286777412590n,
      itemId: 42,
      itemType: 1,
      priceThreshold: 30,
      quantity: 4,
      timestamp: { __timestamp_micros_since_unix_epoch__: 1785408000000000n },
      storedCoins: 0,
    }],
    buyRows: [{
      entityId: 501n,
      ownerEntityId: 701n,
      claimEntityId: 1369094286777412590n,
      itemId: 42,
      itemType: 0,
      priceThreshold: 25,
      quantity: 8,
      timestamp: { microsSinceUnixEpoch: 1785408060000000n },
      storedCoins: 200,
    }],
    usernameRows: [
      { entityId: 700n, username: "Seller" },
      { entityId: 701n, username: "Buyer" },
    ],
    closedRows: [
      {
        entityId: 600n,
        ownerEntityId: 700n,
        claimEntityId: 1369094286777412590n,
        itemStack: {
          itemId: 1,
          itemType: { tag: "Item", value: undefined },
          quantity: 120,
          durability: null,
        },
        timestamp: { __timestamp_micros_since_unix_epoch__: 1785408120000000n },
      },
      {
        entityId: 601n,
        ownerEntityId: 701n,
        claimEntityId: 1369094286777412590n,
        itemStack: {
          itemId: 42,
          itemType: { tag: "Cargo", value: undefined },
          quantity: 2,
          durability: null,
        },
        timestamp: { __timestamp_micros_since_unix_epoch__: 1785408180000000n },
      },
    ],
    marketplaceRows: [{
      buildingEntityId: 900n,
      claimEntityId: 1369094286777412590n,
      coordinates: { x: 123, z: 456, dimension: 1 },
    }],
  });

  assert.deepEqual(result, {
    data: {
      claimId: "1369094286777412590",
      regionId: "19",
      marketplaces: [{
        buildingEntityId: "900",
        claimEntityId: "1369094286777412590",
        locationX: 123,
        locationZ: 456,
        dimension: "1",
      }],
      listings: [
        {
          entityId: "500",
          claimEntityId: "1369094286777412590",
          regionId: "19",
          ownerEntityId: "700",
          ownerUsername: "Seller",
          itemId: "42",
          itemType: "cargo",
          price: "30",
          priceThreshold: "30",
          quantity: "4",
          storedCoins: "0",
          side: "sell",
          timestamp: "2026-07-30T10:40:00.000Z",
          locationX: 123,
          locationZ: 456,
        },
        {
          entityId: "501",
          claimEntityId: "1369094286777412590",
          regionId: "19",
          ownerEntityId: "701",
          ownerUsername: "Buyer",
          itemId: "42",
          itemType: "item",
          price: "25",
          priceThreshold: "25",
          quantity: "8",
          storedCoins: "200",
          side: "buy",
          timestamp: "2026-07-30T10:41:00.000Z",
          locationX: 123,
          locationZ: 456,
        },
      ],
      closedListings: [
        {
          entityId: "600",
          claimEntityId: "1369094286777412590",
          regionId: "19",
          ownerEntityId: "700",
          ownerUsername: "Seller",
          itemId: "1",
          itemType: "item",
          quantity: "120",
          closureKind: "sale_proceeds",
          timestamp: "2026-07-30T10:42:00.000Z",
        },
        {
          entityId: "601",
          claimEntityId: "1369094286777412590",
          regionId: "19",
          ownerEntityId: "701",
          ownerUsername: "Buyer",
          itemId: "42",
          itemType: "cargo",
          quantity: "2",
          closureKind: "returned_item",
          timestamp: "2026-07-30T10:43:00.000Z",
        },
      ],
    },
    warnings: [],
  });
});

test("regional market normalization rejects cross-claim rows and reports optional owner gaps", () => {
  const result = normalizers.normalizeRegionalMarket({
    claimId: "100",
    regionId: "19",
    sellRows: [
      {
        entityId: 1n,
        ownerEntityId: 2n,
        claimEntityId: 100n,
        itemId: 3,
        itemType: 0,
        priceThreshold: 4,
        quantity: 5,
        timestamp: { __timestamp_micros_since_unix_epoch__: 1785408000000000n },
        storedCoins: 0,
      },
      {
        entityId: 9n,
        ownerEntityId: 8n,
        claimEntityId: 999n,
        itemId: 7,
        itemType: 0,
        priceThreshold: 6,
        quantity: 5,
        timestamp: { __timestamp_micros_since_unix_epoch__: 1785408000000000n },
        storedCoins: 0,
      },
    ],
    buyRows: [],
    usernameRows: [],
    closedRows: [
      {
        entityId: 10n,
        ownerEntityId: 11n,
        claimEntityId: 999n,
        itemStack: {
          itemId: 1,
          itemType: { tag: "Item", value: undefined },
          quantity: 5,
        },
        timestamp: { __timestamp_micros_since_unix_epoch__: 1785408000000000n },
      },
      {
        entityId: 12n,
        ownerEntityId: 11n,
        claimEntityId: 100n,
        itemStack: {
          itemId: 1,
          itemType: { tag: "Unknown", value: undefined },
          quantity: 5,
        },
        timestamp: { __timestamp_micros_since_unix_epoch__: 1785408000000000n },
      },
    ],
    marketplaceRows: [],
  });

  assert.equal(result.data.listings.length, 1);
  assert.equal(result.data.closedListings.length, 0);
  assert.equal(result.data.listings[0].ownerUsername, "");
  assert.deepEqual(result.warnings, [
    "Regional market order 1 has no player_username_state row for 2.",
    "Regional sell_order_state omitted cross-claim order 9 for claim 999.",
    "Regional closed_listing_state omitted cross-claim row 10 for claim 999.",
    "Regional closed_listing_state omitted row 1: Unsupported item kind: Unknown",
    "Regional market has no marketplace_state row for claim 100.",
  ]);
});

test("cross-region market normalization preserves both sell and buy order sides", () => {
  assert.equal(
    typeof normalizers.normalizeRegionalOrders,
    "function",
    "cross-region market normalizer must exist",
  );
  const result = normalizers.normalizeRegionalOrders({
    regionId: "19",
    sellRows: [{
      entityId: 601n,
      ownerEntityId: 801n,
      claimEntityId: 100n,
      itemId: 43,
      itemType: 1,
      priceThreshold: 31,
      quantity: 5,
      timestamp: { __timestamp_micros_since_unix_epoch__: 1785408180000000n },
      storedCoins: 0,
    }],
    buyRows: [{
      entityId: 602n,
      ownerEntityId: 802n,
      claimEntityId: 101n,
      itemId: 43,
      itemType: 0,
      priceThreshold: 25,
      quantity: 8,
      timestamp: { __timestamp_micros_since_unix_epoch__: 1785408240000000n },
      storedCoins: 200,
    }],
    claimRows: [
      { entityId: 100n, name: "Timbersteel Trade" },
      { entityId: 101n, name: "Other Market" },
    ],
    usernameRows: [
      { entityId: 801n, username: "Seller One" },
      { entityId: 802n, username: "Buyer One" },
    ],
    marketplaceRows: [{
      buildingEntityId: 9001n,
      claimEntityId: 100n,
      coordinates: { x: -12, z: 34, dimension: 19n },
    }, {
      buildingEntityId: 9002n,
      claimEntityId: 101n,
      coordinates: { x: 45, z: -67, dimension: 19n },
    }],
  });

  assert.deepEqual(
    result.data.orders.map((order) => ({
      entityId: order.entityId,
      side: order.side,
      itemType: order.itemType,
      claimName: order.claimName,
      ownerUsername: order.ownerUsername,
      price: order.price,
      quantity: order.quantity,
      locationX: order.locationX,
      locationZ: order.locationZ,
      dimension: order.dimension,
    })),
    [{
      entityId: "601",
      side: "sell",
      itemType: "cargo",
      claimName: "Timbersteel Trade",
      ownerUsername: "Seller One",
      price: "31",
      quantity: "5",
      locationX: -12,
      locationZ: 34,
      dimension: "19",
    }, {
      entityId: "602",
      side: "buy",
      itemType: "item",
      claimName: "Other Market",
      ownerUsername: "Buyer One",
      price: "25",
      quantity: "8",
      locationX: 45,
      locationZ: -67,
      dimension: "19",
    }],
  );
  assert.deepEqual(result.warnings, []);
});

test("cross-region market normalization preserves exact closed-listing evidence", () => {
  assert.equal(
    typeof normalizers.normalizeRegionalClosedListings,
    "function",
    "cross-region closed-listing normalizer must exist",
  );
  const result = normalizers.normalizeRegionalClosedListings({
    regionId: "19",
    closedRows: [{
      entityId: 700n,
      ownerEntityId: 801n,
      claimEntityId: 100n,
      itemStack: {
        itemId: 1,
        itemType: { tag: "Item", value: undefined },
        quantity: 155,
      },
      timestamp: { __timestamp_micros_since_unix_epoch__: 1785408300000000n },
    }, {
      entityId: 701n,
      ownerEntityId: 802n,
      claimEntityId: 101n,
      itemStack: {
        itemId: 43,
        itemType: { tag: "Cargo", value: undefined },
        quantity: 4,
      },
      timestamp: { __timestamp_micros_since_unix_epoch__: 1785408360000000n },
    }],
    claimRows: [
      { entityId: 100n, name: "Timbersteel Trade" },
      { entityId: 101n, name: "Other Market" },
    ],
    usernameRows: [
      { entityId: 801n, username: "Seller One" },
      { entityId: 802n, username: "Seller Two" },
    ],
  });

  assert.deepEqual(result, {
    data: {
      closedListings: [{
        entityId: "700",
        claimEntityId: "100",
        claimName: "Timbersteel Trade",
        regionId: "19",
        ownerEntityId: "801",
        ownerUsername: "Seller One",
        itemId: "1",
        itemType: "item",
        quantity: "155",
        closureKind: "sale_proceeds",
        timestamp: "2026-07-30T10:45:00.000Z",
      }, {
        entityId: "701",
        claimEntityId: "101",
        claimName: "Other Market",
        regionId: "19",
        ownerEntityId: "802",
        ownerUsername: "Seller Two",
        itemId: "43",
        itemType: "cargo",
        quantity: "4",
        closureKind: "returned_item",
        timestamp: "2026-07-30T10:46:00.000Z",
      }],
    },
    warnings: [],
  });
});
