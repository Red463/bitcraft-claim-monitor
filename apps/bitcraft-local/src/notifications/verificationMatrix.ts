import type { ActivePanel } from "../types/app";

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
