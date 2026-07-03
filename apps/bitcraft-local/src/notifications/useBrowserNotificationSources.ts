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
  const [visibilityToken, setVisibilityToken] = React.useState(0);

  React.useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState !== "hidden") setVisibilityToken((value) => value + 1);
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  React.useEffect(() => {
    if (document.visibilityState === "hidden") return;
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
      pushToast(draft.title, draft.body, draft.kind, draft.item, { occurredAt: draft.occurredAt, sourceKey: draft.sourceKey, metaLabel: draft.metaLabel, soundType: draft.soundType });
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
    visibilityToken,
  ]);
}
