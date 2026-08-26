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

test("live-order deal alerts expose and label their current median baseline", () => {
  const row = publicDealAlertRow({
    baseline_window_days: 0,
    baseline_average: "10",
    sales_count: 3,
    raw_json: JSON.stringify({
      listing: {
        price: "90071992547409931",
        quantity: "90071992547409933",
      },
      baseline: {
        kind: "current-sell-median",
        unitPrice: "90071992547409999",
        sampleCount: 3,
      },
    }),
  });
  assert.equal(row.baselineKind, "current-sell-median");
  assert.equal(row.sampleCount, 3);
  assert.equal(row.unitPrice, "90071992547409931");
  assert.equal(row.quantity, "90071992547409933");
  assert.equal(row.baselineAverage, "90071992547409999");
  assert.equal(
    row.totalValue,
    (90071992547409931n * 90071992547409933n).toString(),
  );

  const payload = dealAlertDiscordPayload({
    itemName: "Leather",
    discountPercent: 40,
    baselineAverage: 10,
    baselineWindowDays: 0,
    baselineKind: "current-sell-median",
    sampleCount: 3,
    unitPrice: 6,
    quantity: 2,
    marketClaimName: "Timbersteel Trade",
    regionId: "19",
    createdAt: "2026-07-30T12:00:00.000Z",
  });
  assert.equal(
    payload.embeds[0].description,
    "**Leather** is listed 40% below the current regional sell-order median.",
  );
  assert.deepEqual(payload.embeds[0].fields[1], {
    name: "Baseline",
    value: "10g live median (3 listings)",
    inline: true,
  });

  const exactHalfRow = publicDealAlertRow({
    baseline_average: 90071992547410000,
    raw_json: JSON.stringify({
      baseline: {
        kind: "current-sell-median",
        unitPrice: "90071992547409999.5",
        sampleCount: 4,
      },
    }),
  });
  assert.equal(exactHalfRow.baselineAverage, "90071992547409999.5");
  const exactHalfPayload = dealAlertDiscordPayload({
    itemName: "Exact Cargo",
    discountPercent: 10,
    baselineAverage: exactHalfRow.baselineAverage,
    baselineKind: exactHalfRow.baselineKind,
    sampleCount: exactHalfRow.sampleCount,
    unitPrice: "81064793292668999",
    quantity: "1",
    marketClaimName: "Timbersteel Trade",
    regionId: "19",
  });
  assert.equal(
    exactHalfPayload.embeds[0].fields[1].value,
    "90,071,992,547,409,999.5g live median (4 listings)",
  );
});
