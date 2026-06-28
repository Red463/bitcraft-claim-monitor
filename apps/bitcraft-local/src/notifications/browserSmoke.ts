import { createToastNotice, type ToastNotice } from "./toastNotices.ts";
import {
  SUPPORTED_BROWSER_NOTIFICATION_TYPES,
  sampleBrowserNotificationDraft,
  type BrowserNotificationTypeId,
} from "./verificationMatrix.ts";

export const BROWSER_NOTIFICATION_SMOKE_EVENT = "bitcraft:notification-smoke";

const localSmokeHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const browserNotificationTypeIds = new Set<string>(SUPPORTED_BROWSER_NOTIFICATION_TYPES.map((type) => type.id));

export function isLocalNotificationSmokeHost(hostname: string): boolean {
  return localSmokeHosts.has(hostname.trim().toLowerCase());
}

export function isBrowserNotificationSmokeType(value: unknown): value is BrowserNotificationTypeId {
  return typeof value === "string" && browserNotificationTypeIds.has(value);
}

export function smokeNotificationTypeFromSearch(search: string): BrowserNotificationTypeId | null {
  const params = new URLSearchParams(search);
  const typeId = params.get("smokeNotification");
  return isBrowserNotificationSmokeType(typeId) ? typeId : null;
}
export function smokeBrowserNotificationDraft(typeId: BrowserNotificationTypeId, runId: string): ToastNotice {
  const draft = sampleBrowserNotificationDraft(typeId);
  const sourceKey = `${draft.sourceKey ?? typeId}:smoke:${typeId}:${runId}`;
  return createToastNotice({
    id: `smoke-${typeId}-${runId}`,
    ...draft,
    sourceKey,
  });
}
export type BrowserNotificationSmokeTarget = {
  addEventListener: (type: string, listener: (event: { detail?: unknown }) => void) => void;
  removeEventListener: (type: string, listener: (event: { detail?: unknown }) => void) => void;
};

export type BrowserNotificationSmokeBridgeOptions = {
  hostname: string;
  target: BrowserNotificationSmokeTarget;
  pushNotice: (notice: ToastNotice) => void;
  nextRunId: () => string;
};

function smokeEventTypeId(detail: unknown): BrowserNotificationTypeId | null {
  if (!detail || typeof detail !== "object" || !("typeId" in detail)) return null;
  const typeId = (detail as { typeId?: unknown }).typeId;
  return isBrowserNotificationSmokeType(typeId) ? typeId : null;
}

export function installBrowserNotificationSmokeBridge(options: BrowserNotificationSmokeBridgeOptions): () => void {
  if (!isLocalNotificationSmokeHost(options.hostname)) return () => undefined;

  const listener = (event: { detail?: unknown }) => {
    const typeId = smokeEventTypeId(event.detail);
    if (!typeId) return;
    options.pushNotice(smokeBrowserNotificationDraft(typeId, options.nextRunId()));
  };

  options.target.addEventListener(BROWSER_NOTIFICATION_SMOKE_EVENT, listener);
  return () => options.target.removeEventListener(BROWSER_NOTIFICATION_SMOKE_EVENT, listener);
}
