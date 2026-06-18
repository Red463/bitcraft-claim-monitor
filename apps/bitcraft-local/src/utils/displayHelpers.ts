import type { AnyRecord } from "../main-app-data";

export function craftDisplayName(job: AnyRecord, craftsPayload?: AnyRecord): string {
  const item = craftOutputItem(job, craftsPayload);
  return String(item?.name ?? job.recipeName ?? `${job.buildingName ?? "Settlement"} craft`);
}

export function craftOutputItem(job: AnyRecord, craftsPayload?: AnyRecord): AnyRecord | null {
  const output = job.craftedItem?.[0] ?? {};
  const itemId = String(output.item_id ?? output.itemId ?? job.outputItemId ?? job.itemId ?? "");
  const item = [...(craftsPayload?.items ?? []), ...(craftsPayload?.cargos ?? [])].find((candidate: AnyRecord) => String(candidate.id) === itemId);
  if (item) return { ...item, itemType: output.item_type ?? output.itemType ?? item.itemType };
  if (!itemId && !job.recipeName && !job.name) return null;
  return {
    id: itemId,
    itemId,
    itemType: output.item_type ?? output.itemType ?? job.outputItemType ?? job.itemType,
    name: job.recipeName ?? job.name ?? "Craft",
    tier: job.tier ?? job.itemTier,
    iconAssetName: job.iconAssetName,
  };
}

export function safeDisplayJson(value: unknown): AnyRecord {
  try {
    const parsed = JSON.parse(String(value ?? "{}"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function listingTrackingKey(listing: AnyRecord): string {
  return String(listing.entityId ?? listing.id ?? listing.marketListingId ?? listing.listingId ?? "");
}
