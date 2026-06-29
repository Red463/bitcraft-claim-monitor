import type { AnyRecord } from "../main-app-data.ts";
import {
  dealAlertQueueToastDrafts,
  marketActivityQueueToastDrafts,
  productionCraftQueueToastDrafts,
  type MarketActivityToastHelpers,
  type MarketActivityToastSnapshot,
  type ProductionCraftQueueSnapshot,
  type ProductionCraftToastHelpers,
  type ToastNoticeDraft,
} from "./notificationSources.ts";

export type ToastGateSettings = {
  marketListings: boolean;
  marketSales: boolean;
  production: boolean;
};

export type NotificationActivitySource = {
  events: AnyRecord[];
  refreshToken: number;
};

export type DealAlertSource = {
  alerts: AnyRecord[];
  refreshToken: number;
};

export type BrowserNotificationSourceQueueOptions = {
  claimId: string;
  appToastSettings: ToastGateSettings;
  userToastSettings: ToastGateSettings;
  notificationActivity: NotificationActivitySource;
  dealAlerts: DealAlertSource;
  productionCrafts: AnyRecord[];
  hasProductionData: boolean;
};

export type BrowserNotificationSourceHelpers = {
  activity: MarketActivityToastHelpers;
  production: ProductionCraftToastHelpers;
};

export type BrowserNotificationSourceSnapshots = {
  activity: MarketActivityToastSnapshot | null;
  dealAlerts: Set<string> | null;
  production: ProductionCraftQueueSnapshot | null;
};

export type BrowserNotificationSourceDraftResult = {
  snapshots: BrowserNotificationSourceSnapshots;
  drafts: ToastNoticeDraft[];
};

const emptySnapshots: BrowserNotificationSourceSnapshots = {
  activity: null,
  dealAlerts: null,
  production: null,
};

export function browserNotificationSourceDrafts(
  previous: BrowserNotificationSourceSnapshots | null,
  options: BrowserNotificationSourceQueueOptions,
  helpers: BrowserNotificationSourceHelpers,
): BrowserNotificationSourceDraftResult {
  const snapshots: BrowserNotificationSourceSnapshots = { ...(previous ?? emptySnapshots) };
  const drafts: ToastNoticeDraft[] = [];

  if (options.notificationActivity.refreshToken) {
    const result = marketActivityQueueToastDrafts(snapshots.activity, options.claimId, options.notificationActivity.events, {
      marketListings: options.appToastSettings.marketListings && options.userToastSettings.marketListings,
      marketSales: options.appToastSettings.marketSales && options.userToastSettings.marketSales,
    }, helpers.activity);
    snapshots.activity = result.snapshot;
    drafts.push(...result.drafts);
  }

  if (options.dealAlerts.refreshToken) {
    const result = dealAlertQueueToastDrafts(snapshots.dealAlerts, options.dealAlerts.alerts);
    snapshots.dealAlerts = result.knownIds;
    const marketToastsEnabled = (options.appToastSettings.marketListings || options.appToastSettings.marketSales)
      && (options.userToastSettings.marketListings || options.userToastSettings.marketSales);
    if (marketToastsEnabled) drafts.push(...result.drafts);
  }

  if (options.hasProductionData) {
    const result = productionCraftQueueToastDrafts(snapshots.production, options.claimId, options.productionCrafts, helpers.production, {
      enabled: options.appToastSettings.production && options.userToastSettings.production,
    });
    snapshots.production = result.snapshot;
    drafts.push(...result.drafts);
  }

  return { snapshots, drafts };
}
