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

type SettlementListingState = {
  kind: "loading" | "empty" | "no-match" | "error";
  title: string;
  detail?: string;
};

export function settlementListingState({
  loading,
  error,
  totalListings,
  visibleListings,
}: {
  loading: boolean;
  error: unknown;
  totalListings: number;
  visibleListings: number;
}): SettlementListingState | null {
  const errorMessage = String(error ?? "").trim();
  if (errorMessage && totalListings === 0) {
    return { kind: "error", title: "Unable to load live listings", detail: errorMessage };
  }
  if (loading && totalListings === 0) return { kind: "loading", title: "Loading live listings…" };
  if (totalListings === 0) return { kind: "empty", title: "This settlement has no live listings." };
  if (visibleListings === 0) return { kind: "no-match", title: "No listings match the current filters." };
  return null;
}
