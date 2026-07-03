import type { AnyRecord } from "../main-app-data";
import type { ActivePanel } from "../types/app";

export type ToastKind = "market" | "production";

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