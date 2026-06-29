import React from "react";
import type { AnyRecord } from "../main-app-data";
import { activityNoticeKey, activitySummary, toastItemFromActivity } from "../pages/activity/activityUtils";
import { craftDisplayName, craftOutputItem } from "../utils/displayHelpers";
import { browserNotificationSourceDrafts, type BrowserNotificationSourceQueueOptions, type BrowserNotificationSourceSnapshots } from "./browserNotificationSourceQueue";
import type { PushToast } from "./useToastNotifications";

export type BrowserNotificationSourcesOptions = BrowserNotificationSourceQueueOptions & {
  productionCraftCatalog?: AnyRecord;
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
  const sourceSnapshotsRef = React.useRef<BrowserNotificationSourceSnapshots | null>(null);

  React.useEffect(() => {
    const result = browserNotificationSourceDrafts(sourceSnapshotsRef.current, {
      appToastSettings,
      claimId,
      dealAlerts,
      hasProductionData,
      notificationActivity,
      productionCrafts,
      userToastSettings,
    }, {
      activity: {
        summary: activitySummary,
        item: toastItemFromActivity,
        key: activityNoticeKey,
      },
      production: {
        displayName: (craftJob) => craftDisplayName(craftJob, productionCraftCatalog),
        item: (craftJob) => craftOutputItem(craftJob, productionCraftCatalog),
      },
    });
    sourceSnapshotsRef.current = result.snapshots;
    for (const draft of result.drafts) {
      pushToast(draft.title, draft.body, draft.kind, draft.item, { occurredAt: draft.occurredAt, sourceKey: draft.sourceKey });
    }
  }, [
    appToastSettings,
    claimId,
    dealAlerts,
    hasProductionData,
    notificationActivity,
    productionCraftCatalog,
    productionCrafts,
    pushToast,
    userToastSettings,
  ]);
}
