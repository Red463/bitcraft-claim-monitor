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

function formatDealInteger(value: unknown): string {
  const exact = String(value ?? "").trim();
  if (!/^\d+(?:\.5)?$/.test(exact)) return formatNumber(value);
  const [whole, fraction] = exact.split(".");
  const formatted = BigInt(whole).toLocaleString();
  return fraction ? `${formatted}.${fraction}` : formatted;
}

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
  const item = helpers.item(event);
  return {
    title: isListing ? "New market listing" : "Market sale",
    body: helpers.summary(event),
    kind: "market",
    destination: "settlement-market",
    occurredAt: event.occurred_at ?? event.occurredAt,
    item,
    sourceKey: helpers.key(event),
    soundType: isListing ? "marketListings" : "marketSales",
    ...marketToastMeta(event, item),
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

function parseActivityMetadata(event: AnyRecord): AnyRecord {
  const metadata = event.metadata_json ?? event.metadataJson;
  if (metadata && typeof metadata === "object") return metadata as AnyRecord;
  try {
    return JSON.parse(String(metadata ?? "{}"));
  } catch {
    return {};
  }
}

function usefulMarketLabel(...values: unknown[]): string | null {
  for (const value of values) {
    if (value == null) continue;
    const normalized = String(value).trim();
    if (!normalized) continue;
    if (/^unknown(?:\s+(?:seller|buyer|item|settlement))?$/i.test(normalized)) continue;
    return normalized;
  }
  return null;
}

function marketToastMeta(event: AnyRecord, item: AnyRecord | null): { metaLabel?: string } {
  const metadata = parseActivityMetadata(event);
  const raw = metadata.raw && typeof metadata.raw === "object" ? metadata.raw as AnyRecord : {};
  const sellerName = usefulMarketLabel(
    metadata.sellerName,
    metadata.sellerUsername,
    metadata.ownerUsername,
    metadata.ownerName,
    metadata.owner,
    raw.sellerName,
    raw.sellerUsername,
    raw.ownerUsername,
    raw.ownerName,
    raw.owner,
  );
  const itemName = usefulMarketLabel(metadata.itemName, metadata.item_name, raw.itemName, raw.name, event.itemName, item?.itemName, item?.name);
  const label = sellerName ?? itemName;
  return label ? { metaLabel: label } : {};
}
function stripCraftSummaryPrefix(summary: unknown): string | null {
  const value = firstNonEmptyString(summary);
  if (!value) return null;
  return value.replace(/^Craft (?:started|completed):\s*/i, "").trim() || value;
}

function formatProductionToastTime(value: unknown): string {
  const date = new Date(String(value ?? ""));
  if (!Number.isFinite(date.getTime())) return "now";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function productionToastCrafterName(details: AnyRecord): string | null {
  const raw = details.raw && typeof details.raw === "object" ? details.raw as AnyRecord : {};
  return firstNonEmptyString(details.crafterName, details.crafterUsername, details.ownerUsername, details.playerUsername, details.userName, raw.crafterName, raw.crafterUsername, raw.ownerUsername, raw.playerUsername, raw.userName);
}

function productionToastMeta(details: AnyRecord): { metaLabel?: string } {
  const crafterName = productionToastCrafterName(details);
  return crafterName ? { metaLabel: crafterName } : {};
}
function productionToastCraftCount(details: AnyRecord): number | null {
  const raw = details.raw && typeof details.raw === "object" ? details.raw as AnyRecord : {};
  const rawOutput = Array.isArray(raw.craftedItem) ? raw.craftedItem[0] ?? {} : {};
  const value = details.craftCount ?? details.quantity ?? raw.craftCount ?? raw.quantity ?? rawOutput.quantity;
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? count : null;
}

function productionToastBody(_status: ProductionCraftToastStatus, details: AnyRecord, _occurredAt: unknown, fallbackName?: unknown): string {
  const raw = details.raw && typeof details.raw === "object" ? details.raw as AnyRecord : {};
  const itemName = firstNonEmptyString(details.itemName, details.label, details.name, raw.itemName, raw.name, fallbackName, "Craft");
  const quantity = productionToastCraftCount(details);
  const itemLabel = quantity ? `${quantity.toLocaleString()}x ${itemName}` : itemName;
  const crafterName = productionToastCrafterName(details);
  const buildingName = firstNonEmptyString(details.buildingName, details.structureName, raw.buildingName, raw.structureName, "Settlement production");
  return `${itemLabel}${crafterName ? ` by ${crafterName}` : ""} at ${buildingName}`;
}

function productionActivitySourceKey(event: AnyRecord, metadata: AnyRecord, helpers: MarketActivityToastHelpers): string {
  const eventType = String(event.event_type ?? event.eventType ?? "");
  const raw = metadata.raw && typeof metadata.raw === "object" ? metadata.raw as AnyRecord : {};
  const explicitMetadataKey = firstNonEmptyString(metadata.sourceKey, metadata.source_key);
  if (explicitMetadataKey?.startsWith(`${eventType}:`)) return explicitMetadataKey;
  const craftKey = firstNonEmptyString(metadata.key, metadata.jobKey, metadata.craftKey, raw.key, raw.entityId, raw.id, raw.craftId);
  if (craftKey) return `${eventType}:${craftKey}`;
  return firstNonEmptyString(helpers.key(event), `${eventType}:${event.id ?? event.occurred_at ?? event.summary ?? "unknown"}`) as string;
}
export function productionActivityToastDraft(
  event: AnyRecord,
  settings: ProductionActivityToastSettings,
  helpers: MarketActivityToastHelpers,
): ToastNoticeDraft | null {
  const eventType = String(event.event_type ?? event.eventType ?? "");
  if (!isProductionActivityToastEvent(event)) return null;
  if (!settings.production) return null;
  const occurredAt = firstNonEmptyString(event.occurred_at, event.occurredAt) ?? new Date().toISOString();
  const status = eventType === "production_started" ? "started" : "completed";
  const metadata = parseActivityMetadata(event);
  return {
    title: status === "started" ? "Craft started" : "Craft completed",
    body: productionToastBody(status, metadata, occurredAt, stripCraftSummaryPrefix(helpers.summary(event))),
    ...productionToastMeta(metadata),
    kind: "production",
    occurredAt,
    item: helpers.item(event),
    sourceKey: productionActivitySourceKey(event, metadata, helpers),
    soundType: status === "started" ? "productionStarted" : "productionCompleted",
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
  const selection = selectUnseenNotificationItems(knownIds, notableEvents, (event) => productionActivitySourceKey(event, parseActivityMetadata(event), helpers), limit);
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
  const liveMedian = alert.baselineKind === "current-sell-median";
  const price = `${liveMedian ? formatDealInteger(alert.unitPrice) : formatNumber(alert.unitPrice)}g`;
  const baselinePrice = `${liveMedian ? formatDealInteger(alert.baselineAverage) : formatNumber(Math.round(toNumber(alert.baselineAverage)))}g`;
  const sampleCount = Math.max(0, Math.round(toNumber(alert.sampleCount)));
  const baseline = liveMedian
    ? `${baselinePrice} live median from ${sampleCount} ${sampleCount === 1 ? "listing" : "listings"}`
    : `${baselinePrice} ${alert.baselineWindowDays}-day average`;
  const itemName = String(alert.itemName ?? "Unknown item");
  const metaLabel = usefulMarketLabel(alert.sellerName, alert.sellerUsername, alert.ownerUsername, alert.ownerName, alert.owner, itemName);
  return {
    title: "Market deal found",
    body: `${itemName}: ${price} at ${alert.marketClaimName ?? "a regional market"} (${discount}% below ${baseline})`,
    kind: "market",
    destination: "market",
    item: {
      name: itemName,
      itemName,
      tier: alert.tier,
      rarity: alert.rarity,
      iconAssetName: alert.iconAssetName,
    },
    occurredAt: alert.createdAt,
    sourceKey: `deal-alert:${alert.id}`,
    soundType: "dealAlerts",
    ...(metaLabel ? { metaLabel } : {}),
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
  occurredAt: string = new Date().toISOString(),
): ToastNoticeDraft {
  const title = status === "started" ? "Craft started" : "Craft completed";
  return {
    title,
    body: productionToastBody(status, job, occurredAt, helpers.displayName(job)),
    kind: "production",
    item: helpers.item(job) ?? (job.toastItem && typeof job.toastItem === "object" ? job.toastItem as AnyRecord : null),
    occurredAt,
    ...productionToastMeta(job),
    sourceKey: `production_${status === "started" ? "started" : "completed"}:${productionCraftJobKey(job)}`,
    soundType: status === "started" ? "productionStarted" : "productionCompleted",
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

function stableCraftPart(value: unknown, fallback = ""): string {
  return String(value ?? fallback).trim().toLowerCase().replace(/\s+/g, " ");
}

export function productionCraftJobKey(job: AnyRecord): string {
  const storedKey = firstNonEmptyString(job.key);
  if (storedKey) return storedKey;
  const output = Array.isArray(job.craftedItem) ? job.craftedItem[0] ?? {} : {};
  const raw = job.raw && typeof job.raw === "object" ? job.raw as AnyRecord : {};
  const rawOutput = Array.isArray(raw.craftedItem) ? raw.craftedItem[0] ?? {} : {};
  const claim = stableCraftPart(job.claimEntityId ?? job.claimId ?? raw.claimEntityId ?? raw.claimId, "claim");
  const structure = stableCraftPart(
    job.buildingEntityId ?? job.structureEntityId ?? job.stationEntityId ?? job.craftingStationEntityId ?? job.buildingId ?? raw.buildingEntityId ?? raw.structureEntityId ?? raw.stationEntityId ?? raw.craftingStationEntityId ?? raw.buildingId ?? job.buildingName ?? job.structureName ?? raw.buildingName ?? raw.structureName,
  );
  const recipe = stableCraftPart(job.recipeId ?? job.recipeEntityId ?? job.recipe_entity_id ?? job.craftingRecipeId ?? raw.recipeId ?? raw.recipeEntityId ?? raw.recipe_entity_id ?? raw.craftingRecipeId ?? job.recipeName ?? job.name ?? raw.recipeName ?? raw.name);
  const outputItem = stableCraftPart(output.item_id ?? output.itemId ?? output.id ?? job.outputItemId ?? job.itemId ?? rawOutput.item_id ?? rawOutput.itemId ?? rawOutput.id ?? raw.outputItemId ?? raw.itemId);
  const outputType = stableCraftPart(output.item_type ?? output.itemType ?? job.outputItemType ?? job.itemType ?? rawOutput.item_type ?? rawOutput.itemType ?? raw.outputItemType ?? raw.itemType);
  const visibility = job.isPublic === false || raw.isPublic === false ? "private" : "public";
  if (structure && (recipe || outputItem)) return ["craft", claim, structure, recipe || "recipe", outputItem || "output", outputType || "item", visibility].join("|");
  return firstNonEmptyString(job.entityId, job.id, job.craftId, raw.entityId, raw.id, raw.craftId) ?? ["craft", claim, recipe || outputItem || "unknown", visibility].join("|");
}

export function productionCraftQueueToastDrafts(
  previous: ProductionCraftQueueSnapshot | null,
  claimId: string,
  jobs: AnyRecord[],
  helpers: ProductionCraftToastHelpers,
  options: ProductionCraftQueueToastOptions = {},
): { snapshot: ProductionCraftQueueSnapshot; drafts: ToastNoticeDraft[]; seeded: boolean } {
  const currentJobs = new Map<string, AnyRecord>(jobs.map((job) => [productionCraftJobKey(job), { ...job, toastItem: helpers.item(job) }]));
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

