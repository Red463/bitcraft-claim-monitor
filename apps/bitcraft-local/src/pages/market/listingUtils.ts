import { parseDateValue, type AnyRecord } from "../../main-app-data.ts";

export function safeDisplayJson(value: unknown): AnyRecord {
  try {
    const parsed = JSON.parse(String(value ?? "{}"));
    return parsed && typeof parsed === "object" ? parsed as AnyRecord : {};
  } catch {
    return {};
  }
}

export function displayItemName(value: unknown): string | null {
  const text = String(value ?? "").trim();
  if (!text || text.toLowerCase() === "unknown item") return null;
  return text;
}

export function listingTrackingKey(listing: AnyRecord): string {
  return String(listing.entityId ?? listing.id ?? listing.marketListingId ?? listing.listingId ?? "");
}

/*
 * BitJita active market listings expose their original listing time as
 * `timestamp`; persisted first-seen time is used for older/fallback payloads.
 */
export function listingDate(listing: AnyRecord, firstSeen: unknown): unknown {
  return listing.timestamp ?? firstSeen;
}
export function liveDaysSince(value: unknown): string {
  const date = parseDateValue(value);
  if (!date) return "-";
  const elapsed = Date.now() - date.getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) return "-";
  const days = Math.floor(elapsed / (24 * 60 * 60 * 1000));
  return days === 0 ? "<1 day" : `${days} day${days === 1 ? "" : "s"}`;
}
