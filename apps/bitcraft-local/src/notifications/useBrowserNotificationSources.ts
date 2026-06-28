import React from "react";
import type { AnyRecord } from "../main-app-data";
import { activityNoticeKey, activitySummary, toastItemFromActivity } from "../pages/activity/activityUtils";
import { craftDisplayName, craftOutputItem } from "../utils/displayHelpers";
import {
  dealAlertQueueToastDrafts,
  marketActivityQueueToastDrafts,
  productionCraftQueueToastDrafts,
  type MarketActivityToastSnapshot,
  type ProductionCraftQueueSnapshot,
} from "./notificationSources";
import type { PushToast } from "./useToastNotifications";

type ToastGateSettings = {
  marketListings: boolean;
  marketSales: boolean;
  production: boolean;
};

type NotificationActivitySource = {
  events: AnyRecord[];
  refreshToken: number;
};

type DealAlertSource = {
  alerts: AnyRecord[];
  refreshToken: number;
};

export type BrowserNotificationSourcesOptions = {
  claimId: string;
  appToastSettings: ToastGateSettings;
  userToastSettings: ToastGateSettings;
  notificationActivity: NotificationActivitySource;
  dealAlerts: DealAlertSource;
  productionCrafts: AnyRecord[];
  productionCraftCatalog?: AnyRecord;
  hasProductionData: boolean;
  pushToast: PushToast;
};

export function useBrowserNotificationSources(options: BrowserNotificationSourcesOptions) {
  const {
    appToastSettings,
    claimId,
    dealAlerts,
    hasProductionData,
    notificationActivity,
    productionCraftCatalog,
    productionCrafts,
    pushToast,
    userToastSettings,
  } = options;
  const activityNoticeIdsRef = React.useRef<MarketActivityToastSnapshot | null>(null);
  const dealAlertIdsRef = React.useRef<Set<string> | null>(null);
  const craftQueueRef = React.useRef<ProductionCraftQueueSnapshot | null>(null);

  React.useEffect(() => {
    if (!notificationActivity.refreshToken) return;
    const result = marketActivityQueueToastDrafts(activityNoticeIdsRef.current, claimId, notificationActivity.events, {
      marketListings: appToastSettings.marketListings && userToastSettings.marketListings,
      marketSales: appToastSettings.marketSales && userToastSettings.marketSales,
    }, {
      summary: activitySummary,
      item: toastItemFromActivity,
      key: activityNoticeKey,
    });
    activityNoticeIdsRef.current = result.snapshot;
    for (const draft of result.drafts) {
      pushToast(draft.title, draft.body, draft.kind, draft.item, { occurredAt: draft.occurredAt, sourceKey: draft.sourceKey });
    }
  }, [
    appToastSettings.marketListings,
    appToastSettings.marketSales,
    claimId,
    notificationActivity.events,
    notificationActivity.refreshToken,
    pushToast,
    userToastSettings.marketListings,
    userToastSettings.marketSales,
  ]);

  React.useEffect(() => {
    if (!dealAlerts.refreshToken) return;
    const result = dealAlertQueueToastDrafts(dealAlertIdsRef.current, dealAlerts.alerts);
    dealAlertIdsRef.current = result.knownIds;
    for (const draft of result.drafts) {
      pushToast(draft.title, draft.body, draft.kind, draft.item, { occurredAt: draft.occurredAt, sourceKey: draft.sourceKey });
    }
  }, [dealAlerts.alerts, dealAlerts.refreshToken, pushToast]);

  React.useEffect(() => {
    if (!hasProductionData) return;
    const result = productionCraftQueueToastDrafts(craftQueueRef.current, claimId, productionCrafts, {
      displayName: (craftJob) => craftDisplayName(craftJob, productionCraftCatalog),
      item: (craftJob) => craftOutputItem(craftJob, productionCraftCatalog),
    }, {
      enabled: appToastSettings.production && userToastSettings.production,
    });
    craftQueueRef.current = result.snapshot;
    for (const draft of result.drafts) {
      pushToast(draft.title, draft.body, draft.kind, draft.item, { sourceKey: draft.sourceKey });
    }
  }, [
    appToastSettings.production,
    claimId,
    hasProductionData,
    productionCraftCatalog,
    productionCrafts,
    pushToast,
    userToastSettings.production,
  ]);
}
