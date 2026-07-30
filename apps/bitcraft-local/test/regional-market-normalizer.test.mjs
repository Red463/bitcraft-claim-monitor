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
    marketplaceRows: [],
  });

  assert.equal(result.data.listings.length, 1);
  assert.equal(result.data.listings[0].ownerUsername, "");
  assert.deepEqual(result.warnings, [
    "Regional market order 1 has no player_username_state row for 2.",
    "Regional sell_order_state omitted cross-claim order 9 for claim 999.",
    "Regional market has no marketplace_state row for claim 100.",
  ]);
});
