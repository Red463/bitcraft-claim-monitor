import assert from "node:assert/strict";
import test from "node:test";

import { dealAlertDiscordPayload, publicDealAlertRow } from "../src/server/dealAlerts.mjs";

test("publicDealAlertRow maps database rows to public deal alert payloads", () => {
  assert.equal(publicDealAlertRow(null), null);

  const row = {
    id: 7,
    watch_id: 3,
    user_id: 9,
    discord_id: "discord-user",
    claim_id: "claim-1",
    region_id: "19",
    item_id: "30",
    item_type: "0",
    item_name: "Leather",
    tier: 2,
    rarity: "Common",
    icon_asset_name: "leather.png",
    listing_key: "listing-1",
    market_claim_id: "market-1",
    market_claim_name: "Timbersteel Trade",
    seller_name: "Seller",
    quantity: "2",
    unit_price: "6",
    total_value: "12",
    baseline_window_days: "7",
    baseline_average: "10",
    sales_count: "5",
    discount_percent: "40.2",
    dm_status: "sent",
    dm_error: null,
    created_at: "2026-06-28T10:00:00.000Z",
    read_at: null,
    raw_json: JSON.stringify({ listing: { entityId: "listing-1" }, baseline: { source: "priceStats.avg7d" } }),
  };

  assert.deepEqual(publicDealAlertRow(row), {
    id: 7,
    watchId: 3,
    userId: 9,
    discordId: "discord-user",
    claimId: "claim-1",
    regionId: "19",
    itemId: "30",
    itemType: "0",
    itemName: "Leather",
    tier: 2,
    rarity: "Common",
    iconAssetName: "leather.png",
    listingKey: "listing-1",
    marketClaimId: "market-1",
    marketClaimName: "Timbersteel Trade",
    sellerName: "Seller",
    quantity: 2,
    unitPrice: 6,
    totalValue: 12,
    baselineWindowDays: 7,
    baselineAverage: 10,
    salesCount: 5,
    discountPercent: 40.2,
    dmStatus: "sent",
    dmError: null,
    createdAt: "2026-06-28T10:00:00.000Z",
    readAt: null,
    raw: { listing: { entityId: "listing-1" }, baseline: { source: "priceStats.avg7d" } },
  });
});

test("publicDealAlertRow falls back to empty raw metadata for invalid JSON", () => {
  assert.deepEqual(publicDealAlertRow({ raw_json: "{" })?.raw, {});
});

test("dealAlertDiscordPayload preserves the current market deal DM shape", () => {
  const payload = dealAlertDiscordPayload({
    itemName: "Leather",
    discountPercent: 40.2,
    baselineAverage: 10,
    baselineWindowDays: 7,
    unitPrice: 6,
    quantity: 2,
    marketClaimName: "Timbersteel Trade",
    regionId: "19",
    createdAt: "2026-06-28T10:00:00.000Z",
  });

  assert.deepEqual(payload, {
    embeds: [{
      author: { name: "Timbersteel Trade" },
      title: "Market Deal Found",
      description: "**Leather** is listed 40% below the confirmed regional average.",
      color: 0x4ee28a,
      fields: [
        { name: "Listing price", value: "6g", inline: true },
        { name: "Baseline", value: "10g 7-day average", inline: true },
        { name: "Quantity", value: "2", inline: true },
        { name: "Market", value: "Timbersteel Trade", inline: true },
        { name: "Region", value: "R19", inline: true },
      ],
      timestamp: "2026-06-28T10:00:00.000Z",
      footer: { text: "Deal watch alert" },
    }],
  });
});