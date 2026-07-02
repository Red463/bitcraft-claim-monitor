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
const marketActivityEventTypes = new Set(["market_new_listing", ...marketSaleEventTypes]);
const productionActivityEventTypes = new Set(["production_started", "production_completed"]);

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

export type MarketActivityToastSnapshot = {
  claimId: string;
  knownIds: Set<string>;
};

export function isMarketActivityToastEvent(event: AnyRecord): boolean {
  return marketActivityEventTypes.has(String(event.event_type ?? event.eventType ?? ""));
}

export function marketActivityQueueToastDrafts(
  previous: MarketActivityToastSnapshot | null,
  claimId: string,
  events: AnyRecord[],
  settings: MarketActivityToastSettings,
  helpers: MarketActivityToastHelpers,
  limit = 3,
): { snapshot: MarketActivityToastSnapshot; drafts: ToastNoticeDraft[]; seeded: boolean } {
  const notableEvents = events.filter(isMarketActivityToastEvent);
  const knownIds = previous?.claimId === claimId ? previous.knownIds : null;
  const selection = selectUnseenNotificationItems(knownIds, notableEvents, (event) => helpers.key(event), limit);
  const snapshot = { claimId, knownIds: selection.knownIds };
  const toastEvents = selection.seeded ? recentActivityEvents(notableEvents).slice(0, limit).reverse() : selection.unseen;
  if (selection.seeded && toastEvents.length === 0) return { snapshot, drafts: [], seeded: true };
  const drafts = toastEvents
    .map((event) => marketActivityToastDraft(event, settings, helpers))
    .filter((draft): draft is ToastNoticeDraft => draft != null);
  return { snapshot, drafts, seeded: false };
}
export type ProductionActivityToastSettings = {
  production: boolean;
};

export type ProductionActivityToastSnapshot = {
  claimId: string;
  knownIds: Set<string>;
};

export function isProductionActivityToastEvent(event: AnyRecord): boolean {
  return productionActivityEventTypes.has(String(event.event_type ?? event.eventType ?? ""));
}
function activityOccurredMs(event: AnyRecord): number {
  const ms = new Date(String(event.occurred_at ?? event.occurredAt ?? "")).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function recentActivityEvents(events: AnyRecord[], maxAgeMs = 5 * 60 * 1000, nowMs = Date.now()): AnyRecord[] {
  return events.filter((event) => {
    const occurredMs = activityOccurredMs(event);
    return occurredMs > 0 && nowMs - occurredMs >= 0 && nowMs - occurredMs <= maxAgeMs;
  });
}

export function productionActivityToastDraft(
  event: AnyRecord,
  settings: ProductionActivityToastSettings,
  helpers: MarketActivityToastHelpers,
): ToastNoticeDraft | null {
  const eventType = String(event.event_type ?? event.eventType ?? "");
  if (!isProductionActivityToastEvent(event)) return null;
  if (!settings.production) return null;
  return {
    title: eventType === "production_started" ? "Craft started" : "Craft completed",
    body: helpers.summary(event),
    kind: "production",
    occurredAt: event.occurred_at ?? event.occurredAt,
    item: helpers.item(event),
    sourceKey: helpers.key(event),
  };
}

export function productionActivityQueueToastDrafts(
  previous: ProductionActivityToastSnapshot | null,
  claimId: string,
  events: AnyRecord[],
  settings: ProductionActivityToastSettings,
  helpers: MarketActivityToastHelpers,
  limit = 3,
): { snapshot: ProductionActivityToastSnapshot; drafts: ToastNoticeDraft[]; seeded: boolean } {
  const notableEvents = events.filter(isProductionActivityToastEvent);
  const knownIds = previous?.claimId === claimId ? previous.knownIds : null;
  const selection = selectUnseenNotificationItems(knownIds, notableEvents, (event) => helpers.key(event), limit);
  const snapshot = { claimId, knownIds: selection.knownIds };
  const toastEvents = selection.seeded ? recentActivityEvents(notableEvents).slice(0, limit).reverse() : selection.unseen;
  if (selection.seeded && toastEvents.length === 0) return { snapshot, drafts: [], seeded: true };
  const drafts = toastEvents
    .map((event) => productionActivityToastDraft(event, settings, helpers))
    .filter((draft): draft is ToastNoticeDraft => draft != null);
  return { snapshot, drafts, seeded: false };
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
function dealAlertId(alert: AnyRecord): string | null {
  const id = alert.id;
  if (id == null) return null;
  const normalized = String(id).trim();
  return normalized ? normalized : null;
}

function dealAlertKnownId(alert: AnyRecord, scopeKey = ""): string | null {
  const id = dealAlertId(alert);
  if (!id) return null;
  const normalizedScope = String(scopeKey).trim();
  return normalizedScope ? `${normalizedScope}:${id}` : id;
}

export function dealAlertQueueToastDrafts(
  knownIds: Set<string> | null,
  alerts: AnyRecord[],
  limit = 3,
  scopeKey = "",
): { knownIds: Set<string>; drafts: ToastNoticeDraft[]; seeded: boolean } {
  const identifiableAlerts = alerts.filter((alert) => dealAlertKnownId(alert, scopeKey) != null);
  const selection = selectUnseenNotificationItems(knownIds, identifiableAlerts, (alert) => dealAlertKnownId(alert, scopeKey) as string, limit);
  if (selection.seeded) return { knownIds: selection.knownIds, drafts: [], seeded: true };
  return {
    knownIds: selection.knownIds,
    drafts: selection.unseen.map((alert) => dealAlertToastDraft(alert)),
    seeded: false,
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
    sourceKey: `production_${status === "started" ? "started" : "completed"}:${jobId}`,
  };
}

export type ProductionCraftQueueSnapshot = {
  claimId: string;
  jobs: Map<string, AnyRecord>;
};

export type ProductionCraftQueueToastOptions = {
  enabled?: boolean;
  maxStarted?: number;
  maxCompleted?: number;
};

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (value == null) continue;
    const normalized = String(value).trim();
    if (normalized) return normalized;
  }
  return null;
}

export function productionCraftJobKey(job: AnyRecord): string {
  return firstNonEmptyString(
    job.entityId,
    job.id,
    job.craftId,
    `${job.buildingName ?? "Settlement production"}-${job.recipeId ?? job.itemId ?? job.name ?? "craft"}`,
  ) as string;
}

export function productionCraftQueueToastDrafts(
  previous: ProductionCraftQueueSnapshot | null,
  claimId: string,
  jobs: AnyRecord[],
  helpers: ProductionCraftToastHelpers,
  options: ProductionCraftQueueToastOptions = {},
): { snapshot: ProductionCraftQueueSnapshot; drafts: ToastNoticeDraft[]; seeded: boolean } {
  const currentJobs = new Map<string, AnyRecord>(jobs.map((job) => [productionCraftJobKey(job), job]));
  const snapshot = { claimId, jobs: currentJobs };
  if (!previous || previous.claimId !== claimId) return { snapshot, drafts: [], seeded: true };
  if (options.enabled === false) return { snapshot, drafts: [], seeded: false };

  const maxStarted = options.maxStarted ?? 2;
  const maxCompleted = options.maxCompleted ?? 2;
  const started = [...currentJobs.entries()].filter(([id]) => !previous.jobs.has(id)).slice(0, maxStarted);
  const completed = [...previous.jobs.entries()].filter(([id]) => !currentJobs.has(id)).slice(0, maxCompleted);
  const drafts = [
    ...started.map(([id, job]) => productionCraftToastDraft("started", claimId, id, job, helpers)),
    ...completed.map(([id, job]) => productionCraftToastDraft("completed", claimId, id, job, helpers)),
  ];
  return { snapshot, drafts, seeded: false };
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
