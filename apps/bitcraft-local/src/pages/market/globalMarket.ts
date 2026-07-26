import type { AnyRecord } from "../../main-app-data";

export type MarketItemType = "item" | "cargo";
export type MarketItemKey = { itemType: MarketItemType; itemId: number };
export type MarketRefreshProps = {
  refreshSequence: number;
  refreshHeaders: Record<string, string>;
  trackRefresh: <T>(taskKey: string, promise: Promise<T>) => Promise<T>;
};

export type NormalizedMarketOrder = MarketItemKey & {
  orderKey: string;
  side: "sell" | "buy";
  unitPrice: number;
  quantity: number;
  regionId: number | null;
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

export function marketItemType(value: unknown): MarketItemType {
  return value === 1 || value === "1" || value === "cargo" ? "cargo" : "item";
}

function normalizeOrder(raw: AnyRecord, side: "sell" | "buy"): NormalizedMarketOrder {
  const itemId = finiteNumber(raw.itemId ?? raw.item_id) ?? 0;
  const unitPrice = finiteNumber(raw.price ?? raw.priceThreshold ?? raw.unitPrice) ?? 0;
  const quantity = finiteNumber(raw.quantity ?? raw.remainingQuantity ?? raw.remainingStock) ?? 0;
  return {
    itemType: marketItemType(raw.itemType ?? raw.item_type),
    itemId,
    orderKey: String(raw.entityId ?? raw.orderEntityId ?? raw.id ?? `${side}:${itemId}:${unitPrice}`),
    side,
    unitPrice,
    quantity,
    regionId: finiteNumber(raw.regionId ?? raw.region_id),
    regionName: String(raw.regionName ?? raw.region_name ?? ""),
    claimId: String(raw.claimEntityId ?? raw.claimId ?? raw.marketClaimId ?? ""),
    claimName: String(raw.claimName ?? raw.marketClaimName ?? ""),
    ownerName: String(raw.ownerUsername ?? raw.ownerName ?? raw.buyerName ?? raw.sellerName ?? ""),
    locationX: finiteNumber(raw.locationX ?? raw.claimLocationX),
    locationZ: finiteNumber(raw.locationZ ?? raw.claimLocationZ),
    raw,
  };
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

function normalizeTradeItem(raw: AnyRecord, itemType: MarketItemType) {
  return {
    itemType,
    itemId: finiteNumber(raw.itemId ?? raw.item_id) ?? 0,
    itemName: String(raw.itemName ?? raw.name ?? "Unknown item"),
    iconAssetName: raw.iconAssetName ?? raw.itemIconAssetName ?? null,
    quantity: finiteNumber(raw.quantity) ?? 0,
    raw,
  };
}

export function normalizeStallsPayload(payload: AnyRecord) {
  const stalls = (Array.isArray(payload?.stalls) ? payload.stalls : []).map((stall: AnyRecord) => ({
    ...stall,
    entityId: String(stall.entityId ?? stall.id ?? ""),
    ownerName: String(stall.ownerName ?? ""),
    nickname: String(stall.nickname ?? ""),
    claimName: String(stall.claimName ?? ""),
    regionName: String(stall.regionName ?? ""),
    regionId: finiteNumber(stall.regionId),
    orderCount: finiteNumber(stall.orderCount) ?? 0,
    locationX: finiteNumber(stall.locationX),
    locationZ: finiteNumber(stall.locationZ),
    orders: (Array.isArray(stall.orders) ? stall.orders : []).map((order: AnyRecord) => ({
      ...order,
      entityId: String(order.entityId ?? order.id ?? ""),
      remainingStock: finiteNumber(order.remainingStock) ?? 0,
      offers: [
        ...(Array.isArray(order.offerItems) ? order.offerItems.map((entry: AnyRecord) => normalizeTradeItem(entry, "item")) : []),
        ...(Array.isArray(order.offerCargo) ? order.offerCargo.map((entry: AnyRecord) => normalizeTradeItem(entry, "cargo")) : []),
      ],
      requires: [
        ...(Array.isArray(order.requiredItems) ? order.requiredItems.map((entry: AnyRecord) => normalizeTradeItem(entry, "item")) : []),
        ...(Array.isArray(order.requiredCargo) ? order.requiredCargo.map((entry: AnyRecord) => normalizeTradeItem(entry, "cargo")) : []),
      ],
    })),
  }));
  return {
    stalls,
    totalStalls: finiteNumber(payload?.totalStalls) ?? stalls.length,
    totalOrders: finiteNumber(payload?.totalOrders) ?? 0,
    page: finiteNumber(payload?.page) ?? 1,
    totalPages: finiteNumber(payload?.totalPages) ?? 1,
    limit: finiteNumber(payload?.limit) ?? 20,
  };
}

export function marketFavoriteKeys(value: string | null): MarketItemKey[] {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed.flatMap((entry): MarketItemKey[] => {
      const itemType = entry?.itemType;
      const itemId = finiteNumber(entry?.itemId);
      if ((itemType !== "item" && itemType !== "cargo") || !itemId || itemId < 1) return [];
      const key = `${itemType}:${itemId}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ itemType, itemId }];
    });
  } catch {
    return [];
  }
}
