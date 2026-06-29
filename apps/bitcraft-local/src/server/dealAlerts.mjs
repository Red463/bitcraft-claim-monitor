function toNumber(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function safeJson(value, fallback = {}) {
  try {
    return JSON.parse(value ?? JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function formatGold(value) {
  return `${Math.round(toNumber(value)).toLocaleString()}g`;
}

export function publicDealAlertRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    watchId: row.watch_id,
    userId: row.user_id,
    discordId: row.discord_id,
    claimId: row.claim_id,
    regionId: row.region_id,
    itemId: row.item_id,
    itemType: row.item_type,
    itemName: row.item_name,
    tier: row.tier,
    rarity: row.rarity,
    iconAssetName: row.icon_asset_name,
    listingKey: row.listing_key,
    marketClaimId: row.market_claim_id,
    marketClaimName: row.market_claim_name,
    sellerName: row.seller_name,
    quantity: toNumber(row.quantity),
    unitPrice: toNumber(row.unit_price),
    totalValue: toNumber(row.total_value),
    baselineWindowDays: toNumber(row.baseline_window_days),
    baselineAverage: toNumber(row.baseline_average),
    salesCount: toNumber(row.sales_count),
    discountPercent: toNumber(row.discount_percent),
    dmStatus: row.dm_status,
    dmError: row.dm_error,
    createdAt: row.created_at,
    readAt: row.read_at,
    raw: safeJson(row.raw_json, {}),
  };
}

export function dealAlertDiscordPayload(alert) {
  const discount = Math.round(toNumber(alert.discountPercent));
  const baseline = `${formatGold(alert.baselineAverage)} ${alert.baselineWindowDays}-day average`;
  return {
    embeds: [{
      author: { name: "Timbersteel Trade" },
      title: "Market Deal Found",
      description: `**${alert.itemName}** is listed ${discount}% below the confirmed regional average.`,
      color: 0x4ee28a,
      fields: [
        { name: "Listing price", value: formatGold(alert.unitPrice), inline: true },
        { name: "Baseline", value: baseline, inline: true },
        { name: "Quantity", value: toNumber(alert.quantity).toLocaleString(), inline: true },
        { name: "Market", value: String(alert.marketClaimName ?? "Unknown settlement"), inline: true },
        { name: "Region", value: `R${alert.regionId}`, inline: true },
      ],
      timestamp: alert.createdAt,
      footer: { text: "Deal watch alert" },
    }],
  };
}