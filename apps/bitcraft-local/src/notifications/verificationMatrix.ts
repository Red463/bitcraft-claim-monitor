import type { ActivePanel } from "../types/app";
import { dealAlertToastDraft, marketActivityToastDraft, productionCraftToastDraft, type ToastNoticeDraft } from "./notificationSources.ts";

export type BrowserNotificationTypeId =
  | "market-listing"
  | "market-sale"
  | "market-deal-alert"
  | "production-started"
  | "production-completed";

export type BrowserNotificationType = {
  id: BrowserNotificationTypeId;
  label: string;
  source: string;
  expectedDestination: ActivePanel;
};

export type NotificationMatrixPage = {
  panel: ActivePanel;
  label: string;
  path: string;
};

export type NotificationVerificationStatus = "verified" | "manual-required" | "unsupported";

export type NotificationVerificationRow = {
  page: NotificationMatrixPage;
  type: BrowserNotificationType;
  status: NotificationVerificationStatus;
};

export const SUPPORTED_BROWSER_NOTIFICATION_TYPES: readonly BrowserNotificationType[] = [
  {
    id: "market-listing",
    label: "Market listing toast",
    source: "/api/local/notification-activity event_type=market_new_listing",
    expectedDestination: "market",
  },
  {
    id: "market-sale",
    label: "Market sale toast",
    source: "/api/local/notification-activity event_type=market_sale or market_sale_confirmed",
    expectedDestination: "market",
  },
  {
    id: "market-deal-alert",
    label: "Market deal alert toast",
    source: "/api/local/market/deal-alerts for the signed-in user",
    expectedDestination: "market",
  },
  {
    id: "production-started",
    label: "Production started toast",
    source: "AppShell production craft queue diff",
    expectedDestination: "production",
  },
  {
    id: "production-completed",
    label: "Production completed toast",
    source: "AppShell production craft queue diff",
    expectedDestination: "production",
  },
];

export type LiveSourceNotificationStatus = "verified" | "required";

export type LiveSourceNotificationCheck = {
  typeId: BrowserNotificationTypeId;
  source: string;
  status: LiveSourceNotificationStatus;
  browserSmokeEvidence: string;
  liveVerification: string;
};

export const LIVE_SOURCE_NOTIFICATION_CHECKS: readonly LiveSourceNotificationCheck[] = [
  {
    typeId: "market-listing",
    source: "/api/local/notification-activity event_type=market_new_listing",
    status: "verified",
    browserSmokeEvidence: "Loopback smoke verified sample market-listing toasts on every routed main-app page.",
    liveVerification: "Verified through the notification-activity polling path with inserted market_new_listing rows, real refresh controls, drawer persistence, unread state, user setting gating, dismissal, and drawer navigation.",
  },
  {
    typeId: "market-sale",
    source: "/api/local/notification-activity event_type=market_sale or market_sale_confirmed",
    status: "verified",
    browserSmokeEvidence: "Loopback smoke verified sample market-sale toasts on every routed main-app page.",
    liveVerification: "Verified through the notification-activity polling path with market sale activity rows, real refresh controls, drawer persistence, unread state, and no page-mounted source dependency.",
  },
  {
    typeId: "market-deal-alert",
    source: "/api/local/market/deal-alerts for the signed-in Discord-linked user",
    status: "required",
    browserSmokeEvidence: "Loopback smoke verified sample market-deal-alert toasts on every routed main-app page.",
    liveVerification: "Still required with a signed-in Discord-linked user and a real deal-alert feed, not only sample smoke drafts.",
  },
  {
    typeId: "production-started",
    source: "Global production craft queue diff in useBrowserNotificationSources",
    status: "required",
    browserSmokeEvidence: "Loopback smoke verified sample production-started toasts on every routed main-app page.",
    liveVerification: "Still required from an actual production queue diff that adds a craft, not only sample smoke drafts.",
  },
  {
    typeId: "production-completed",
    source: "Global production craft queue diff in useBrowserNotificationSources",
    status: "required",
    browserSmokeEvidence: "Loopback smoke verified sample production-completed toasts on every routed main-app page.",
    liveVerification: "Still required from an actual production queue diff that removes/completes a craft, not only sample smoke drafts.",
  },
];

export function liveSourceNotificationChecksForStatus(status: LiveSourceNotificationStatus): LiveSourceNotificationCheck[] {
  return LIVE_SOURCE_NOTIFICATION_CHECKS.filter((check) => check.status === status);
}

export function liveSourceNotificationVerificationComplete(): boolean {
  return liveSourceNotificationChecksForStatus("required").length === 0;
}

export function requiredLiveSourceNotificationTypeIds(): BrowserNotificationTypeId[] {
  return liveSourceNotificationChecksForStatus("required").map((check) => check.typeId);
}

export const NOTIFICATION_MATRIX_PAGES: readonly NotificationMatrixPage[] = [
  { panel: "admin", label: "Admin", path: "/?page=admin" },
  { panel: "dashboard", label: "Dashboard", path: "/?page=dashboard" },
  { panel: "leaderboard", label: "Leaderboard", path: "/?page=leaderboard" },
  { panel: "members", label: "Members", path: "/?page=members" },
  { panel: "skills", label: "Professions", path: "/?page=skills" },
  { panel: "production", label: "Production", path: "/?page=production" },
  { panel: "inventory", label: "Inventory", path: "/?page=inventory" },
  { panel: "construction", label: "Construction", path: "/?page=construction" },
  { panel: "research", label: "Research", path: "/?page=research" },
  { panel: "market", label: "Market", path: "/?page=market" },
  { panel: "empire", label: "Region", path: "/?page=empire" },
  { panel: "empires", label: "Empires", path: "/?page=empires" },
  { panel: "map", label: "Map", path: "/?page=map" },
  { panel: "activity", label: "Activity", path: "/?page=activity" },
  { panel: "publiccrafts", label: "Public Craft Finder", path: "/?page=publiccrafts" },
  { panel: "craftcalc", label: "Craft Calculator", path: "/?page=craftcalc" },
  { panel: "sync", label: "Sync", path: "/?page=sync" },
];

export const BOT_NOTIFICATION_EXCEPTION = {
  route: "/bot",
  supported: false,
  reason: "Dedicated bot dashboard mounts BotControlApp without DashboardApp notification chrome.",
} as const;

export function verificationRowsForStatus(status: NotificationVerificationStatus): NotificationVerificationRow[] {
  return NOTIFICATION_MATRIX_PAGES.flatMap((page) => (
    SUPPORTED_BROWSER_NOTIFICATION_TYPES.map((type) => ({ page, type, status }))
  ));
}

export function pageScopedBrowserNotificationDraft(panel: ActivePanel, typeId: BrowserNotificationTypeId): ToastNoticeDraft {
  const draft = sampleBrowserNotificationDraft(typeId);
  return {
    ...draft,
    sourceKey: `matrix:${panel}:${typeId}:${draft.sourceKey}`,
  };
}

export function sampleBrowserNotificationDraft(typeId: BrowserNotificationTypeId): ToastNoticeDraft {
  if (typeId === "market-listing") {
    const draft = marketActivityToastDraft(
      {
        id: "matrix-market-listing",
        event_type: "market_new_listing",
        occurred_at: "2026-06-28T10:00:00.000Z",
        summary: "New market listing: Matrix Plank",
        metadata_json: JSON.stringify({ itemName: "Matrix Plank", itemId: 1001, tier: 2 }),
      },
      { marketListings: true, marketSales: true },
      {
        summary: (event) => String(event.summary ?? ""),
        item: (event) => JSON.parse(String(event.metadata_json ?? "{}")),
        key: (event) => `activity:${event.id}`,
      },
    );
    if (!draft) throw new Error("Market listing sample did not produce a notification draft");
    return draft;
  }

  if (typeId === "market-sale") {
    const draft = marketActivityToastDraft(
      {
        id: "matrix-market-sale",
        event_type: "market_sale_confirmed",
        occurred_at: "2026-06-28T10:05:00.000Z",
        summary: "Market sale confirmed: Matrix Plank",
        metadata_json: JSON.stringify({ itemName: "Matrix Plank", itemId: 1001, tier: 2 }),
      },
      { marketListings: true, marketSales: true },
      {
        summary: (event) => String(event.summary ?? ""),
        item: (event) => JSON.parse(String(event.metadata_json ?? "{}")),
        key: (event) => `activity:${event.id}`,
      },
    );
    if (!draft) throw new Error("Market sale sample did not produce a notification draft");
    return draft;
  }

  if (typeId === "market-deal-alert") {
    return dealAlertToastDraft({
      id: "matrix-deal-alert",
      itemName: "Matrix Hide",
      unitPrice: 6,
      marketClaimName: "Timbersteel Trade",
      discountPercent: 40,
      baselineAverage: 10,
      baselineWindowDays: 7,
      tier: 3,
      createdAt: "2026-06-28T10:10:00.000Z",
    });
  }

  if (typeId === "production-started") {
    return productionCraftToastDraft(
      "started",
      "matrix-claim",
      "matrix-craft-started",
      { entityId: "matrix-craft-started", buildingName: "Matrix Workshop", itemName: "Matrix Beam", tier: 4 },
      {
        displayName: (job) => String(job.itemName ?? "Matrix craft"),
        item: (job) => ({ itemName: job.itemName, tier: job.tier }),
      },
    );
  }

  return productionCraftToastDraft(
    "completed",
    "matrix-claim",
    "matrix-craft-completed",
    { entityId: "matrix-craft-completed", buildingName: "Matrix Workshop", itemName: "Matrix Beam", tier: 4 },
    {
      displayName: (job) => String(job.itemName ?? "Matrix craft"),
      item: (job) => ({ itemName: job.itemName, tier: job.tier }),
    },
  );
}
