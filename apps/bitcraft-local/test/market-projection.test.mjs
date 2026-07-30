import assert from "node:assert/strict";
import test from "node:test";

let projection = null;
try {
  projection = await import("../src/server/game-data/marketProjection.ts");
} catch {
  // The first TDD run proves the provider-neutral market projection is absent.
}

test("market projection enriches exact item/cargo identities and settlement context", () => {
  assert.ok(projection, "market projection module must exist");
  const result = projection.enrichMarketWithCatalog({
    claimId: "100",
    regionId: "19",
    marketplaces: [{ locationX: 10, locationZ: 20 }],
    listings: [
      { entityId: "1", itemId: "42", itemType: "item", side: "sell", price: "25" },
      { entityId: "2", itemId: "42", itemType: "cargo", side: "buy", price: "30" },
    ],
  }, {
    getEntity: (key) => ({
      "items:42": {
        name: "Timber",
        tier: 2,
        rarity: "Common",
        iconAssetName: "timber.png",
      },
      "cargo:42": {
        name: "Timber Package",
        tier: 3,
        rarity: "Uncommon",
        iconAssetName: "timber-package.png",
      },
    })[key] ?? null,
    claim: { name: "Timbersteel Trade", regionId: "19" },
  });

  assert.deepEqual(result, {
    data: {
      claimId: "100",
      regionId: "19",
      marketplaces: [{ locationX: 10, locationZ: 20 }],
      listings: [
        {
          entityId: "1",
          itemId: "42",
          itemType: "item",
          side: "sell",
          price: "25",
          itemName: "Timber",
          itemTier: 2,
          itemRarityStr: "Common",
          iconAssetName: "timber.png",
          claimName: "Timbersteel Trade",
          regionName: "",
        },
        {
          entityId: "2",
          itemId: "42",
          itemType: "cargo",
          side: "buy",
          price: "30",
          itemName: "Timber Package",
          itemTier: 3,
          itemRarityStr: "Uncommon",
          iconAssetName: "timber-package.png",
          claimName: "Timbersteel Trade",
          regionName: "",
        },
      ],
    },
    warnings: [],
  });
});

test("market projection preserves live orders when a catalog row is unavailable", () => {
  assert.ok(projection, "market projection module must exist");
  const result = projection.enrichMarketWithCatalog({
    listings: [{ entityId: "1", itemId: "99", itemType: "item" }],
  }, {
    getEntity: () => null,
    claim: null,
  });
  assert.equal(result.data.listings[0].itemName, "Item #99");
  assert.deepEqual(result.warnings, [
    "Market order 1 references unavailable catalog item items:99.",
  ]);
});
