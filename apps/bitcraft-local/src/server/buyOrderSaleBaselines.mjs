import {
  marketIdentityKey,
  normalizeMarketItemType,
  parseMarketIdentityKey,
} from "./marketIdentity.mjs";

const DAY_MS = 86_400_000;

function decimal(value) {
  const text = String(value ?? "").trim();
  return /^\d+$/.test(text) ? text : null;
}

export function buyOrderBaselineKey(regionId, itemType, itemId) {
  return marketIdentityKey(regionId, itemType, itemId);
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
  const requestedRegionIds = new Set(regionIds);
  const requestedItems = [...new Map(
    [...itemKeys]
      .map(parseMarketIdentityKey)
      .filter((identity) => identity && requestedRegionIds.has(identity.regionId))
      .map((identity) => [marketIdentityKey(
        identity.regionId,
        identity.itemType,
        identity.itemId,
      ), identity]),
  ).values()];
  if (!requestedItems.length) {
    return { baselines: new Map(), historyObservedSince: null, warnings: [] };
  }
  const requestedStoredItems = requestedItems.flatMap((identity) => (
    (identity.itemType === "cargo" ? ["cargo", "1"] : ["item", "0"])
      .map((storedItemType) => ({ ...identity, storedItemType }))
  ));
  const nowMs = options.nowMs ?? Date.now();
  const cutoff = new Date(nowMs - 7 * DAY_MS).toISOString();
  const now = new Date(nowMs).toISOString();
  const rows = db.prepare(`
    WITH requested_items AS (
      SELECT
        CAST(json_extract(value, '$.regionId') AS TEXT) AS region_id,
        CAST(json_extract(value, '$.storedItemType') AS TEXT) AS item_type,
        CAST(json_extract(value, '$.itemId') AS TEXT) AS item_id
      FROM json_each(?)
    )
    SELECT trade.trade_id AS tradeId, trade.region_id AS regionId,
      trade.item_id AS itemId, trade.item_type AS itemType,
      trade.quantity, trade.total_price AS totalPrice,
      trade.occurred_at AS occurredAt
    FROM requested_items AS requested
    CROSS JOIN market_trades AS trade
      INDEXED BY idx_market_trades_claim_region_item_time
    WHERE trade.claim_id = ?
      AND trade.region_id = requested.region_id
      AND trade.item_id = requested.item_id
      AND trade.item_type = requested.item_type
      AND trade.occurred_at >= ?
      AND trade.occurred_at <= ?
      AND trade.trade_id LIKE 'relay_closed_listing:' || trade.region_id || ':%'
    ORDER BY trade.occurred_at ASC, trade.trade_id ASC
  `).all(
    JSON.stringify(requestedStoredItems),
    claimId,
    cutoff,
    now,
  );
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
      || BigInt(quantity) <= 0n
      || !totalPrice
      || BigInt(totalPrice) <= 0n
    ) {
      warnings.push(`Ignored malformed confirmed trade ${String(row.tradeId)}.`);
      continue;
    }
    const current = baselines.get(key) ?? {
      regionId: String(row.regionId),
      itemType: normalizeMarketItemType(row.itemType),
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
