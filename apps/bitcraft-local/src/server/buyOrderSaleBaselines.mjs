const DAY_MS = 86_400_000;

function decimal(value) {
  const text = String(value ?? "").trim();
  return /^\d+$/.test(text) ? text : null;
}

function normalizedItemType(value) {
  return value === 1 || value === "1" || String(value).toLowerCase() === "cargo"
    ? "cargo"
    : "item";
}

export function buyOrderBaselineKey(regionId, itemType, itemId) {
  return `${decimal(regionId) ?? "0"}:${normalizedItemType(itemType)}:${decimal(itemId) ?? "0"}`;
}

export function readBuyOrderSaleBaselines(db, options = {}) {
  const claimId = String(options.claimId ?? "").trim();
  const regionIds = [...new Set(
    (options.allowedRegionIds ?? []).map(String).filter((id) => /^\d+$/.test(id)),
  )];
  const itemKeys = options.itemKeys instanceof Set
    ? options.itemKeys
    : new Set(options.itemKeys ?? []);
  if (!claimId || !regionIds.length || !itemKeys.size) {
    return { baselines: new Map(), historyObservedSince: null, warnings: [] };
  }
  const nowMs = options.nowMs ?? Date.now();
  const cutoff = new Date(nowMs - 7 * DAY_MS).toISOString();
  const now = new Date(nowMs).toISOString();
  const placeholders = regionIds.map(() => "?").join(", ");
  const rows = db.prepare(`
    SELECT trade_id AS tradeId, region_id AS regionId, item_id AS itemId,
      item_type AS itemType, quantity, total_price AS totalPrice,
      occurred_at AS occurredAt
    FROM market_trades
    WHERE claim_id = ?
      AND region_id IN (${placeholders})
      AND occurred_at >= ?
      AND occurred_at <= ?
      AND trade_id LIKE 'relay_closed_listing:' || region_id || ':%'
    ORDER BY occurred_at ASC, trade_id ASC
  `).all(claimId, ...regionIds, cutoff, now);
  const baselines = new Map();
  const warnings = [];
  for (const row of rows) {
    const key = buyOrderBaselineKey(row.regionId, row.itemType, row.itemId);
    if (!itemKeys.has(key)) continue;
    const occurredAt = String(row.occurredAt);
    const occurredAtMs = Date.parse(occurredAt);
    const quantity = decimal(row.quantity);
    const totalPrice = decimal(row.totalPrice);
    if (
      !Number.isFinite(occurredAtMs)
      || new Date(occurredAtMs).toISOString() !== occurredAt
      || occurredAtMs < nowMs - 7 * DAY_MS
      || occurredAtMs > nowMs
      || !quantity
      || quantity === "0"
      || !totalPrice
    ) {
      warnings.push(`Ignored malformed confirmed trade ${String(row.tradeId)}.`);
      continue;
    }
    const current = baselines.get(key) ?? {
      regionId: String(row.regionId),
      itemType: normalizedItemType(row.itemType),
      itemId: String(row.itemId),
      salesCount: 0,
      unitsSold: "0",
      totalValue: "0",
      observedSince: occurredAt,
      lastSoldAt: occurredAt,
    };
    current.salesCount += 1;
    current.unitsSold = (BigInt(current.unitsSold) + BigInt(quantity)).toString();
    current.totalValue = (BigInt(current.totalValue) + BigInt(totalPrice)).toString();
    current.lastSoldAt = occurredAt;
    baselines.set(key, current);
  }
  const observed = [...baselines.values()].map((row) => row.observedSince).sort();
  return {
    baselines,
    historyObservedSince: observed[0] ?? null,
    warnings,
  };
}
