import { toNumber, type AnyRecord } from "../../main-app-data.ts";
import { formatNumber } from "../../utils/format.ts";

export function signedDelta(after: unknown, before: unknown, suffix = ""): string {
  const delta = toNumber(after) - toNumber(before);
  const sign = delta >= 0 ? "+" : "-";
  return `${sign}${formatNumber(Math.abs(delta))}${suffix}`;
}

export function activitySummary(item: AnyRecord): string {
  if (item.event_type === "storage") return item.summary ?? "-";
  const metadata = activityMetadata(item);
  if (metadata.before != null && metadata.after != null) {
    if (item.event_type === "treasury") return `${signedDelta(metadata.after, metadata.before, "g")} to treasury`;
    if (item.event_type === "supplies") return `${signedDelta(metadata.after, metadata.before)} supplies`;
    if (item.event_type === "members") return `${signedDelta(metadata.after, metadata.before)} members`;
    if (item.event_type === "buildings") return `${signedDelta(metadata.after, metadata.before)} structures`;
    if (item.event_type === "market") return `${signedDelta(metadata.after, metadata.before)} market listings`;
  }
  return item.summary ?? "-";
}

export function activityMetadata(item: AnyRecord): AnyRecord {
  try {
    return JSON.parse(item.metadata_json ?? item.metadataJson ?? "{}");
  } catch {
    return {};
  }
}

export function activityActorName(item: AnyRecord): string {
  const metadata = activityMetadata(item);
  if (metadata.actorName) return String(metadata.actorName);
  if (!String(item.event_type ?? "").includes("market")) return "";
  return String(metadata.ownerUsername ?? metadata.owner ?? metadata.sellerUsername ?? "");
}

export function activityContainerName(item: AnyRecord): string {
  return String(activityMetadata(item).containerName ?? "");
}

export function compactActivity(items: AnyRecord[]): AnyRecord[] {
  const output: AnyRecord[] = [];
  let treasuryGroup: AnyRecord[] = [];
  const flush = () => {
    if (!treasuryGroup.length) return;
    if (treasuryGroup.length === 1) {
      output.push(treasuryGroup[0]);
      treasuryGroup = [];
      return;
    }
    const first = treasuryGroup[0];
    const last = treasuryGroup[treasuryGroup.length - 1];
    const total = treasuryGroup.reduce((sum, item) => {
      try {
        const meta = JSON.parse(item.metadata_json ?? "{}");
        return sum + (toNumber(meta.after) - toNumber(meta.before));
      } catch {
        return sum;
      }
    }, 0);
    output.push({ id: `treasury-${first.id}-${last.id}`, event_type: "treasury", occurred_at: first.occurred_at, summary: `${total >= 0 ? "+" : "-"}${formatNumber(Math.abs(total))}g to treasury across ${treasuryGroup.length} refreshes` });
    treasuryGroup = [];
  };
  for (const item of items) {
    if (item.event_type === "treasury") treasuryGroup.push(item);
    else {
      flush();
      output.push(item);
    }
  }
  flush();
  return output;
}

export function diffSnapshot(prev: AnyRecord, curr: AnyRecord): string[] {
  const changes = [];
  for (const key of ["members", "buildings", "market"]) {
    if (prev[key] !== curr[key]) changes.push(`${key} changed from ${prev[key]} to ${curr[key]}`);
  }
  if (toNumber(prev.claim?.supplies) !== toNumber(curr.claim?.supplies)) changes.push(`Supplies changed to ${formatNumber(curr.claim?.supplies)}`);
  if (toNumber(prev.claim?.treasury) !== toNumber(curr.claim?.treasury)) changes.push(`Treasury changed to ${formatNumber(curr.claim?.treasury)}g`);
  return changes.length ? changes : ["No tracked changes detected"];
}

export function toastItemFromActivity(event: AnyRecord): AnyRecord | null {
  const metadata = activityMetadata(event);
  const raw = metadata.raw && typeof metadata.raw === "object" ? metadata.raw as AnyRecord : {};
  const itemName = metadata.itemName ?? metadata.item_name ?? raw.itemName ?? raw.name ?? event.item_name;
  const itemId = metadata.itemId ?? metadata.item_id ?? raw.itemId ?? raw.item_id;
  const iconAssetName = metadata.iconAssetName ?? metadata.icon_asset_name ?? raw.iconAssetName ?? raw.icon_asset_name ?? raw.iconAddress ?? raw.icon_address;
  if (!itemName && !itemId && !iconAssetName) return null;
  const tier = metadata.tier ?? metadata.itemTier ?? raw.tier ?? raw.itemTier;
  const rarity = metadata.rarity ?? metadata.itemRarityStr ?? raw.rarity ?? raw.itemRarityStr;
  return {
    id: itemId,
    itemId,
    itemType: metadata.itemType ?? metadata.item_type ?? raw.itemType ?? raw.item_type,
    name: itemName ?? "Market item",
    itemName: itemName ?? "Market item",
    tier,
    itemTier: tier,
    rarity,
    itemRarityStr: rarity,
    iconAssetName,
  };
}

export function activityNoticeKey(event: AnyRecord): string {
  const explicitKey = event.source_key ?? event.sourceKey;
  if (explicitKey != null) {
    const normalized = String(explicitKey).trim();
    if (normalized) return normalized;
  }
  return `activity:${event.id ?? `${event.event_type}:${event.occurred_at ?? event.occurredAt}:${event.summary}`}`;
}
export function sanitizeActivityLog(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => String(item).replaceAll("\u00c2\u00b7", "-").replaceAll("\u00e2\u20ac\u201d", "-"))
    .filter((item) => !/changed from \d+ to 0$/.test(item) && !/changed from 0 to \d+$/.test(item))
    .slice(0, 100);
}
