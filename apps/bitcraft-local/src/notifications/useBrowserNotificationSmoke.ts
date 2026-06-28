import React from "react";
import type { ActivePanel } from "../types/app";
import {
  installBrowserNotificationSmokeBridge,
  isLocalNotificationSmokeHost,
  smokeBrowserNotificationDraft,
  smokeNotificationTypeFromSearch,
} from "./browserSmoke";
import type { ToastNotice } from "./toastNotices";
import type { PushToast } from "./useToastNotifications";

function pushSmokeNotice(pushToast: PushToast, notice: ToastNotice) {
  pushToast(notice.title, notice.body, notice.kind, notice.item, {
    occurredAt: notice.occurredAt,
    sourceKey: notice.sourceKey,
  });
}

export function useBrowserNotificationSmoke({ active, pushToast }: { active: ActivePanel; pushToast: PushToast }) {
  React.useEffect(() => installBrowserNotificationSmokeBridge({
    hostname: window.location.hostname,
    target: {
      addEventListener: (type, listener) => window.addEventListener(type, listener as EventListener),
      removeEventListener: (type, listener) => window.removeEventListener(type, listener as EventListener),
    },
    pushNotice: (notice) => pushSmokeNotice(pushToast, notice),
    nextRunId: () => `${active}:${Date.now()}-${Math.random().toString(16).slice(2)}`,
  }), [active, pushToast]);

  React.useEffect(() => {
    const typeId = smokeNotificationTypeFromSearch(window.location.search);
    if (!typeId || !isLocalNotificationSmokeHost(window.location.hostname)) return;
    const params = new URLSearchParams(window.location.search);
    const runId = params.get("smokeRun") ?? `${active}:${Date.now()}-${Math.random().toString(16).slice(2)}`;
    pushSmokeNotice(pushToast, smokeBrowserNotificationDraft(typeId, runId));
    params.delete("smokeNotification");
    params.delete("smokeRun");
    const nextSearch = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`);
  }, [active, pushToast]);
}
