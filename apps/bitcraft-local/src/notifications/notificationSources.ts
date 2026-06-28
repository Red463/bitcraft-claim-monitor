import { toNumber, type AnyRecord } from "../main-app-data.ts";
import { formatNumber } from "../utils/format.ts";
import type { CreateToastNoticeInput } from "./toastNotices.ts";

export type ToastNoticeDraft = Omit<CreateToastNoticeInput, "id">;

export type MarketActivityToastSettings = {
  marketListings: boolean;
  marketSales: boolean;
};

export type MarketActivityToastHelpers = {
  summary: (event: AnyRecord) => string;
  item: (event: AnyRecord) => AnyRecord | null;
  key: (event: AnyRecord) => string;
};

const marketSaleEventTypes = new Set(["market_sale", "market_sale_confirmed"]);

export function marketActivityToastDraft(
  event: AnyRecord,
  settings: MarketActivityToastSettings,
  helpers: MarketActivityToastHelpers,
): ToastNoticeDraft | null {
  const eventType = String(event.event_type ?? event.eventType ?? "");
  const isListing = eventType === "market_new_listing";
  const isSale = marketSaleEventTypes.has(eventType);
  if (!isListing && !isSale) return null;
  if (isListing && !settings.marketListings) return null;
  if (isSale && !settings.marketSales) return null;
  return {
    title: isListing ? "New market listing" : "Market sale",
    body: helpers.summary(event),
    kind: "market",
    occurredAt: event.occurred_at ?? event.occurredAt,
    item: helpers.item(event),
    sourceKey: helpers.key(event),
  };
}

export function dealAlertToastDraft(alert: AnyRecord): ToastNoticeDraft {
  const discount = Math.round(toNumber(alert.discountPercent));
  const price = `${formatNumber(alert.unitPrice)}g`;
  const baseline = `${formatNumber(Math.round(toNumber(alert.baselineAverage)))}g ${alert.baselineWindowDays}-day average`;
  const itemName = String(alert.itemName ?? "Unknown item");
  return {
    title: "Market deal found",
    body: `${itemName}: ${price} at ${alert.marketClaimName ?? "a regional market"} (${discount}% below ${baseline})`,
    kind: "market",
    item: {
      name: itemName,
      itemName,
      tier: alert.tier,
      rarity: alert.rarity,
      iconAssetName: alert.iconAssetName,
    },
    occurredAt: alert.createdAt,
    sourceKey: `deal-alert:${alert.id}`,
  };
}
export type ProductionCraftToastStatus = "started" | "completed";

export type ProductionCraftToastHelpers = {
  displayName: (job: AnyRecord) => string;
  item: (job: AnyRecord) => AnyRecord | null;
};

export function productionCraftToastDraft(
  status: ProductionCraftToastStatus,
  claimId: string,
  jobId: string,
  job: AnyRecord,
  helpers: ProductionCraftToastHelpers,
): ToastNoticeDraft {
  const title = status === "started" ? "Craft started" : "Craft completed";
  return {
    title,
    body: `${helpers.displayName(job)} - ${job.buildingName ?? "Settlement production"}`,
    kind: "production",
    item: helpers.item(job),
    sourceKey: `production-${status}:${claimId}:${jobId}`,
  };
}

export function selectUnseenNotificationItems<T>(
  knownIds: Set<string> | null,
  items: T[],
  idForItem: (item: T) => string,
  limit = 3,
): { knownIds: Set<string>; unseen: T[]; seeded: boolean } {
  const ids = items.map((item) => idForItem(item));
  if (knownIds == null) {
    return { knownIds: new Set(ids), unseen: [], seeded: true };
  }
  const unseen = items
    .filter((item) => !knownIds.has(idForItem(item)))
    .slice(0, limit)
    .reverse();
  const nextKnownIds = new Set(knownIds);
  for (const id of ids) nextKnownIds.add(id);
  return { knownIds: nextKnownIds, unseen, seeded: false };
}
