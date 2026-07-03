import type { AnyRecord } from "../main-app-data";
import type { ActivePanel } from "../types/app";

export type ToastKind = "market" | "production";

export const NOTIFICATION_CLAIMS_STORAGE_KEY = "claim-monitor.notifications.claims";

export type ToastNotice = {
  id: string;
  title: string;
  body: string;
  kind: ToastKind;
  occurredAt?: string;
  read?: boolean;
  destination?: ActivePanel;
  item?: AnyRecord | null;
  sourceKey?: string;
  metaLabel?: string;
};

export type CreateToastNoticeInput = {
  id: string;
  title: string;
  body: string;
  kind: ToastKind;
  occurredAt?: string;
  item?: AnyRecord | null;
  sourceKey?: string;
  metaLabel?: string;
};


type NotificationStorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type ClaimNotificationSourceKeyOptions = {
  storage?: NotificationStorageLike;
  nowMs?: number;
  ttlMs?: number;
  maxClaims?: number;
};

function toastClockTime(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function claimTimeMs(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatToastMetaLine(notice: Pick<ToastNotice, "kind" | "occurredAt" | "metaLabel">, _options: { now?: string } = {}): string {
  if (notice.kind !== "production") return "";
  return [notice.metaLabel, toastClockTime(notice.occurredAt)].filter(Boolean).join(" - ");
}

export function claimNotificationSourceKey(sourceKey: string | undefined, options: ClaimNotificationSourceKeyOptions = {}): boolean {
  if (!sourceKey) return true;
  const storage = options.storage ?? (typeof window !== "undefined" ? window.localStorage : null);
  if (!storage) return true;
  const nowMs = options.nowMs ?? Date.now();
  const ttlMs = options.ttlMs ?? 24 * 60 * 60 * 1000;
  const maxClaims = options.maxClaims ?? 500;
  try {
    const rawClaims = JSON.parse(storage.getItem(NOTIFICATION_CLAIMS_STORAGE_KEY) ?? "{}");
    const claims = rawClaims && typeof rawClaims === "object" && !Array.isArray(rawClaims) ? rawClaims as Record<string, unknown> : {};
    const freshEntries = Object.entries(claims)
      .map(([key, value]) => [key, claimTimeMs(value)] as const)
      .filter(([, claimedAt]) => claimedAt > 0 && nowMs - claimedAt <= ttlMs)
      .sort((a, b) => b[1] - a[1])
      .slice(0, Math.max(0, maxClaims - 1));
    if (freshEntries.some(([key]) => key === sourceKey)) {
      storage.setItem(NOTIFICATION_CLAIMS_STORAGE_KEY, JSON.stringify(Object.fromEntries(freshEntries.map(([key, value]) => [key, new Date(value).toISOString()]))));
      return false;
    }
    const nextClaims = Object.fromEntries(freshEntries.map(([key, value]) => [key, new Date(value).toISOString()]));
    nextClaims[sourceKey] = new Date(nowMs).toISOString();
    storage.setItem(NOTIFICATION_CLAIMS_STORAGE_KEY, JSON.stringify(nextClaims));
    return true;
  } catch {
    try {
      storage.removeItem(NOTIFICATION_CLAIMS_STORAGE_KEY);
    } catch {
      // Ignore storage cleanup failures; notifications should still work.
    }
    return true;
  }
}
export function destinationForToastKind(kind: ToastKind): ActivePanel {
  return kind === "market" ? "market" : "production";
}

export function createToastNotice(input: CreateToastNoticeInput): ToastNotice {
  return {
    id: input.id,
    title: input.title,
    body: input.body,
    kind: input.kind,
    occurredAt: input.occurredAt,
    read: false,
    destination: destinationForToastKind(input.kind),
    item: input.item ?? null,
    sourceKey: input.sourceKey,
    ...(input.metaLabel ? { metaLabel: input.metaLabel } : {}),
  };
}

export function notificationDedupeKey(notice: ToastNotice): string {
  return notice.sourceKey ? `source:${notice.sourceKey}` : `legacy:${notice.kind}:${notice.title}:${notice.body}`;
}

export function dedupeNotifications(notices: ToastNotice[]): ToastNotice[] {
  const seen = new Set<string>();
  return notices.filter((notice) => {
    const key = notificationDedupeKey(notice);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export function appendToastStack(current: ToastNotice[], notice: ToastNotice, limit = 4): ToastNotice[] {
  return [...current, notice].slice(-limit);
}

export function appendNotificationLog(current: ToastNotice[], notice: ToastNotice, limit = 80): ToastNotice[] {
  return dedupeNotifications([notice, ...current]).slice(0, limit);
}

export function markNotificationsRead(notices: ToastNotice[]): ToastNotice[] {
  return notices.map((notice) => ({ ...notice, read: true }));
}