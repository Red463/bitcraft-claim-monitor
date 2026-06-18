// Buy-order helpers keep market tool behaviour consistent between the server
// collector and the frontend table. BitJita has used several field names for the
// same concepts over time, so normalization accepts the known variants here.
export type NormalizedBuyOrder = {
  id: string;
  itemId: string;
  itemType: number;
  unitPrice: number;
  quantity: number;
  totalValue: number;
  storedCoins: number;
  listedAt: string | number | null;
  claimName: string;
  claimEntityId: string;
  ownerUsername: string;
  regionId: string;
  regionName: string;
  locationX: number;
  locationZ: number;
};

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value.replaceAll(",", ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toText(value: unknown, fallback = ""): string {
  return value == null ? fallback : String(value);
}

function timestampMs(value: unknown): number {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return 0;
    if (value > 1_000_000_000_000_000) return Math.floor(value / 1000);
    if (value > 1_000_000_000_000) return value;
    if (value > 1_000_000_000) return value * 1000;
    return 0;
  }
  if (typeof value === "string") {
    const normalized = value.includes(" ") && !value.includes("T") ? value.replace(" ", "T") : value;
    const parsed = Date.parse(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function normalizeBuyOrder(order: Record<string, unknown>, itemTypeFallback = 0): NormalizedBuyOrder {
  // priceThreshold is the important BitJita buy-order field: it is the maximum
  // unit price the buyer is willing to pay, which the app presents as unit price.
  const unitPrice = toNumber(order.priceThreshold ?? order.unitPrice ?? order.price);
  const quantity = toNumber(order.quantity);
  const totalValue = unitPrice * quantity;
  const listedAt = order.createdAt ?? order.updatedAt ?? order.timestamp ?? null;
  return {
    id: toText(order.entityId ?? order.id ?? `${order.claimEntityId ?? "order"}-${order.itemId ?? ""}-${listedAt ?? ""}`),
    itemId: toText(order.itemId ?? order.item_id),
    itemType: toNumber(order.itemType ?? order.item_type ?? itemTypeFallback),
    unitPrice,
    quantity,
    totalValue,
    storedCoins: toNumber(order.storedCoins),
    listedAt: listedAt as string | number | null,
    claimName: toText(order.claimName, "Unknown settlement"),
    claimEntityId: toText(order.claimEntityId),
    ownerUsername: toText(order.ownerUsername, "Unknown buyer"),
    regionId: toText(order.regionId),
    regionName: toText(order.regionName),
    locationX: toNumber(order.claimLocationX),
    locationZ: toNumber(order.claimLocationZ),
  };
}

export function sortBuyOrdersByBestPrice(orders: NormalizedBuyOrder[]) {
  // The default "best" sort favours highest price first, then deeper demand, then
  // newest listing where timestamps are available.
  return [...orders].sort((a, b) => b.unitPrice - a.unitPrice || b.quantity - a.quantity || timestampMs(b.listedAt) - timestampMs(a.listedAt));
}

export function buyOrderAgeDays(order: NormalizedBuyOrder): number | null {
  const listedMs = timestampMs(order.listedAt);
  if (!listedMs) return null;
  return Math.max(0, Math.floor((Date.now() - listedMs) / 86_400_000));
}
