import type { AnyRecord } from "../../main-app-data";

export type MarketItemType = "item" | "cargo";
export type MarketItemKey = { itemType: MarketItemType; itemId: string };
export type MarketRefreshProps = {
  refreshSequence: number;
  refreshHeaders: Record<string, string>;
  trackRefresh: <T>(taskKey: string, promise: Promise<T>) => Promise<T>;
};

export type NormalizedMarketOrder = MarketItemKey & {
  orderKey: string;
  side: "sell" | "buy";
  unitPrice: string;
  quantity: string;
  regionId: string | null;
  regionName: string;
  claimId: string;
  claimName: string;
  ownerName: string;
  locationX: number | null;
  locationZ: number | null;
  raw: AnyRecord;
};

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function decimalInteger(value: unknown): string {
  const normalized = String(value ?? "0").trim();
  return /^\d+$/.test(normalized) ? normalized : "0";
}

export function marketItemType(value: unknown): MarketItemType {
  return value === 1 || value === "1" || value === "cargo" ? "cargo" : "item";
}

function normalizeOrder(raw: AnyRecord, side: "sell" | "buy"): NormalizedMarketOrder {
  const itemId = decimalInteger(raw.itemId ?? raw.item_id);
  const regionId = raw.regionId ?? raw.region_id;
  const unitPrice = decimalInteger(raw.price ?? raw.priceThreshold ?? raw.unitPrice);
  return {
    itemType: marketItemType(raw.itemType ?? raw.item_type),
    itemId,
    orderKey: String(raw.entityId ?? raw.orderEntityId ?? raw.id ?? `${side}:${itemId}:${unitPrice}`),
    side,
    unitPrice,
    quantity: decimalInteger(raw.quantity ?? raw.remainingQuantity ?? raw.remainingStock),
    regionId: regionId == null || String(regionId).trim() === ""
      ? null
      : decimalInteger(regionId),
    regionName: String(raw.regionName ?? raw.region_name ?? ""),
    claimId: String(raw.claimEntityId ?? raw.claimId ?? raw.marketClaimId ?? ""),
    claimName: String(raw.claimName ?? raw.marketClaimName ?? ""),
    ownerName: String(raw.ownerUsername ?? raw.ownerName ?? raw.buyerName ?? raw.sellerName ?? ""),
    locationX: finiteNumber(raw.locationX ?? raw.claimLocationX),
    locationZ: finiteNumber(raw.locationZ ?? raw.claimLocationZ),
    raw,
  };
}

export function marketBrowseSearchUrl(options: {
  query: string;
  regionId?: string;
  availableOnly?: boolean;
  hasSell?: boolean;
  hasBuy?: boolean;
  category?: string;
  sort?: string;
}) {
  const search = new URLSearchParams({
    regionId: String(options.regionId ?? "all") || "all",
    q: String(options.query ?? "").trim(),
    availableOnly: String(options.availableOnly === true),
    hasSell: String(options.hasSell === true),
    hasBuy: String(options.hasBuy === true),
  });
  if (options.category) search.set("category", options.category);
  if (options.sort) search.set("sort", options.sort);
  search.set("limit", "50");
  return `/api/local/market/catalog?${search}`;
}

export function marketDealWatchSearchUrl(options: {
  claimId: string;
  regionId: string;
  query: string;
}) {
  const search = new URLSearchParams({
    claimId: String(options.claimId).trim(),
    regionId: String(options.regionId).trim(),
    q: String(options.query).trim(),
    availableOnly: "true",
    hasSell: "true",
    hasBuy: "false",
    limit: "8",
  });
  return `/api/local/market/catalog?${search}`;
}

export function marketRegionScopeUrl(claimId: string) {
  const search = new URLSearchParams({ claimId: String(claimId).trim() });
  return `/api/local/market/regions?${search}`;
}

export function marketBrowseItemUrls(options: {
  itemType: MarketItemType;
  itemId: string | number;
  regionId?: string;
  range: "24h" | "7d" | "30d" | "all";
}) {
  const base = new URLSearchParams({
    regionId: String(options.regionId ?? "all") || "all",
    itemType: options.itemType,
    itemId: decimalInteger(options.itemId),
  });
  const history = new URLSearchParams(base);
  history.set("range", options.range);
  return {
    orderBook: `/api/local/market/order-book?${base}`,
    priceHistory: `/api/local/market/price-history?${history}`,
  };
}

export function marketFreshnessNotice(payload: AnyRecord | null | undefined): string {
  const freshness = String(payload?.freshness ?? "").toLowerCase();
  const ageMs = Number(payload?.ageMs);
  const age = Number.isFinite(ageMs) && ageMs >= 0
    ? ageMs < 1_000
      ? "just now"
      : ageMs < 60_000
        ? `${Math.floor(ageMs / 1_000)}s old`
        : `${Math.floor(ageMs / 60_000)}m old`
    : "";
  const warnings = Array.isArray(payload?.warnings)
    ? payload.warnings.map(String).filter(Boolean)
    : [];
  if (freshness === "unavailable") return "Live order book has not loaded yet.";
  if (freshness === "stale") {
    return `Live order book is stale${age ? ` (${age})` : ""}${warnings.length ? `: ${warnings[0]}` : "."}`;
  }
  if (freshness === "fresh") return `Live order book updated ${age || "recently"}.`;
  return "";
}

export function normalizeMarketOrders(payload: AnyRecord): NormalizedMarketOrder[] {
  const sells = Array.isArray(payload?.sellOrders) ? payload.sellOrders : [];
  const buys = Array.isArray(payload?.buyOrders) ? payload.buyOrders : [];
  return [
    ...sells.map((row: AnyRecord) => normalizeOrder(row, "sell")),
    ...buys.map((row: AnyRecord) => normalizeOrder(row, "buy")),
  ];
}

export function filterMarketDeals<T extends AnyRecord>(deals: T[], regionIds: string[]): T[] {
  const selected = new Set(regionIds.map(String).filter(Boolean));
  if (!selected.size) return deals;
  return deals.filter((deal) => selected.has(String(deal.buyRegionId ?? deal.buy_region_id ?? "")) && selected.has(String(deal.sellRegionId ?? deal.sell_region_id ?? "")));
}

export function bestMarketDealPotential(deals: AnyRecord[]): string {
  return deals.reduce((best, deal) => {
    const normalized = decimalInteger(deal.totalPotential);
    const value = BigInt(normalized);
    return value > best ? value : best;
  }, 0n).toString();
}

export function marketFavoriteKeys(value: string | null): MarketItemKey[] {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed.flatMap((entry): MarketItemKey[] => {
      const itemType = entry?.itemType;
      const itemId = decimalInteger(entry?.itemId);
      if ((itemType !== "item" && itemType !== "cargo") || itemId === "0") return [];
      const key = `${itemType}:${itemId}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ itemType, itemId }];
    });
  } catch {
    return [];
  }
}

export function marketFavoriteQuotesRequest(regionId: string, items: MarketItemKey[]) {
  return {
    url: "/api/local/market/favorite-quotes",
    body: JSON.stringify({
      regionId: String(regionId).trim() || "all",
      items,
    }),
  };
}

export function marketFavoriteQuoteRows(items: MarketItemKey[], payload: AnyRecord): AnyRecord[] {
  const quotes = payload?.quotes && typeof payload.quotes === "object" && !Array.isArray(payload.quotes)
    ? payload.quotes as AnyRecord
    : {};
  const itemMetadata = payload?.items && typeof payload.items === "object" && !Array.isArray(payload.items)
    ? payload.items as AnyRecord
    : {};
  return items.map((favorite) => {
    const key = `${favorite.itemType}:${favorite.itemId}`;
    const quote = quotes[key];
    const metadata = itemMetadata[key] && typeof itemMetadata[key] === "object" && !Array.isArray(itemMetadata[key])
      ? itemMetadata[key] as AnyRecord
      : {};
    const bestSell = quote?.bestSell == null ? null : decimalInteger(quote.bestSell);
    const bestBuy = quote?.bestBuy == null ? null : decimalInteger(quote.bestBuy);
    const sellCount = Math.max(0, Math.floor(Number(quote?.sellCount) || 0));
    const buyCount = Math.max(0, Math.floor(Number(quote?.buyCount) || 0));
    return {
      ...metadata,
      ...favorite,
      itemName: String(metadata.name ?? metadata.itemName ?? `${favorite.itemType === "cargo" ? "Cargo" : "Item"} ${favorite.itemId}`),
      bestSell,
      bestBuy,
      sellCount,
      buyCount,
      currentOrderCount: sellCount + buyCount,
    };
  });
}
