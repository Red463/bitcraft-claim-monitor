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

function exactDecimalInteger(value) {
  const normalized = String(value ?? "").trim();
  return /^\d+$/.test(normalized) ? normalized : null;
}

function exactHalfDecimal(value) {
  const normalized = String(value ?? "").trim();
  return /^\d+(?:\.5)?$/.test(normalized) ? normalized : null;
}

function formatExactDecimal(value) {
  const exact = exactHalfDecimal(value);
  if (!exact) return Math.round(toNumber(value)).toLocaleString();
  const [whole, fraction] = exact.split(".");
  const formatted = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction ? `${formatted}.${fraction}` : formatted;
}

function formatGold(value) {
  return `${formatExactDecimal(value)}g`;
}

export function publicDealAlertRow(row) {
  if (!row) return null;
  const raw = safeJson(row.raw_json, {});
  const baselineKind = String(raw?.baseline?.kind ?? "").trim();
  const liveMedian = baselineKind === "current-sell-median";
  const exactQuantity = exactDecimalInteger(raw?.listing?.quantity);
  const exactUnitPrice = exactDecimalInteger(raw?.listing?.price ?? raw?.listing?.priceThreshold);
  const exactBaseline = exactHalfDecimal(raw?.baseline?.unitPrice);
  const exactTotalValue = exactQuantity && exactUnitPrice
    ? (BigInt(exactQuantity) * BigInt(exactUnitPrice)).toString()
    : null;
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
    quantity: liveMedian && exactQuantity ? exactQuantity : toNumber(row.quantity),
    unitPrice: liveMedian && exactUnitPrice ? exactUnitPrice : toNumber(row.unit_price),
    totalValue: liveMedian && exactTotalValue ? exactTotalValue : toNumber(row.total_value),
    baselineWindowDays: toNumber(row.baseline_window_days),
    baselineAverage: liveMedian && exactBaseline ? exactBaseline : toNumber(row.baseline_average),
    salesCount: toNumber(row.sales_count),
    ...(baselineKind ? {
      baselineKind,
      sampleCount: toNumber(raw?.baseline?.sampleCount ?? row.sales_count),
    } : {}),
    discountPercent: toNumber(row.discount_percent),
    dmStatus: row.dm_status,
    dmError: row.dm_error,
    createdAt: row.created_at,
    readAt: row.read_at,
    raw,
  };
}

export function dealAlertDiscordPayload(alert) {
  const discount = Math.round(toNumber(alert.discountPercent));
  const liveMedian = alert.baselineKind === "current-sell-median";
  const sampleCount = toNumber(alert.sampleCount);
  const baseline = liveMedian
    ? `${formatGold(alert.baselineAverage)} live median (${sampleCount.toLocaleString()} listings)`
    : `${formatGold(alert.baselineAverage)} ${alert.baselineWindowDays}-day average`;
  return {
    embeds: [{
      author: { name: "Timbersteel Trade" },
      title: "Market Deal Found",
      description: liveMedian
        ? `**${alert.itemName}** is listed ${discount}% below the current regional sell-order median.`
        : `**${alert.itemName}** is listed ${discount}% below the confirmed regional average.`,
      color: 0x4ee28a,
      fields: [
        { name: "Listing price", value: formatGold(alert.unitPrice), inline: true },
        { name: "Baseline", value: baseline, inline: true },
        { name: "Quantity", value: formatExactDecimal(alert.quantity), inline: true },
        { name: "Market", value: String(alert.marketClaimName ?? "Unknown settlement"), inline: true },
        { name: "Region", value: `R${alert.regionId}`, inline: true },
      ],
      timestamp: alert.createdAt,
      footer: { text: "Deal watch alert" },
    }],
  };
}
