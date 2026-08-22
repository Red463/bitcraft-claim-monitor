import React from "react";

import { toNumber, type AnyRecord } from "../main-app-data.ts";
import type { PageRefreshCycle } from "../refresh/pageRefresh.mjs";
import { pageRefreshHeaders } from "../refresh/pageRefresh.mjs";
import type { ActivePanel, LocalHistoryState, NotificationActivityState } from "../types/app.ts";
import { localHistoryIncludeForPanel } from "./localHistoryInclude.ts";

const LOCAL_API = "/api/local";

export function localHistoryRequestForPanel({
  claimId,
  activePanel,
  pageRefreshCycle,
  fetch: fetcher = globalThis.fetch,
  signal,
}: {
  claimId: string;
  activePanel: ActivePanel;
  pageRefreshCycle: PageRefreshCycle | null;
  fetch?: typeof fetch;
  signal?: AbortSignal;
}): Promise<AnyRecord> | null {
  if (!pageRefreshCycle || pageRefreshCycle.page !== activePanel) return null;
  const include = localHistoryIncludeForPanel(activePanel);
  if (!include) return null;
  const activityLimit = activePanel === "activity" ? 2000 : activePanel === "dashboard" ? 40 : 60;
  return fetcher(`${LOCAL_API}/history?claimId=${encodeURIComponent(claimId)}&include=${encodeURIComponent(include)}&activityLimit=${activityLimit}`, {
    headers: pageRefreshHeaders(pageRefreshCycle, activePanel),
    signal,
  }).then(async (response) => {
    if (!response.ok) throw new Error(`local history HTTP ${response.status}`);
    return response.json();
  });
}

export function mergeLocalHistoryState(previous: LocalHistoryState, history: AnyRecord): LocalHistoryState {
  const activity = history.activity;
  const hasActivityEvents = activity != null && Object.prototype.hasOwnProperty.call(activity, "events");
  return {
    market: history.market ?? previous.market,
    activity: hasActivityEvents ? activity.events ?? [] : previous.activity,
    activityTotal: hasActivityEvents
      ? toNumber(activity.total ?? activity.events?.length)
      : previous.activityTotal,
    dashboard: history.dashboard ?? previous.dashboard,
    error: null,
    refreshToken: previous.refreshToken + 1,
  };
}

/**
 * Loads locally recorded history that the live Relay generation does not retain.
 *
 * Live page data comes from provider-neutral local routes, while activity history,
 * dashboard trend data, and market history are built from SQLite records
 * captured by the local server.
 */
export function useLocalHistory(
  claimId: string,
  activePanel: ActivePanel,
  pageRefreshCycle: PageRefreshCycle | null,
  trackPageRefreshPromise: <T>(taskKey: string, promise: Promise<T>) => Promise<T> = (_taskKey, promise) => promise,
): LocalHistoryState {
  const [state, setState] = React.useState<LocalHistoryState>({
    market: null,
    activity: [],
    activityTotal: 0,
    dashboard: null,
    error: null,
    refreshToken: 0,
  });

  React.useEffect(() => {
    if (!localHistoryIncludeForPanel(activePanel)) return;
    const controller = new AbortController();
    const request = localHistoryRequestForPanel({ claimId, activePanel, pageRefreshCycle, signal: controller.signal });
    if (!request) return;
    async function load(historyRequest: Promise<AnyRecord>) {
      try {
        const history = await historyRequest;
        setState((prev) => mergeLocalHistoryState(prev, history));
      } catch (err) {
        if (controller.signal.aborted) return;
        setState((prev) => ({ ...prev, error: err instanceof Error ? err.message : String(err) }));
        throw err;
      }
    }
    void trackPageRefreshPromise("local-history", load(request)).catch(() => {});
    return () => {
      controller.abort();
    };
  }, [activePanel, claimId, pageRefreshCycle?.sequence, trackPageRefreshPromise]);

  return state;
}

export function useNotificationActivity(refreshToken: number, claimId: string): NotificationActivityState {
  const [state, setState] = React.useState<NotificationActivityState>({ events: [], total: 0, error: null, refreshToken: 0 });

  React.useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`${LOCAL_API}/notification-activity?claimId=${encodeURIComponent(claimId)}&limit=120`, { signal: controller.signal });
        if (!response.ok) throw new Error(`notification activity HTTP ${response.status}`);
        const payload = await response.json();
        // This endpoint is intentionally page-independent so market/activity
        // toast notifications continue to work no matter which page is open.
        setState((prev) => ({
          events: payload.events ?? [],
          total: toNumber(payload.total ?? payload.events?.length),
          error: null,
          refreshToken: prev.refreshToken + 1,
        }));
      } catch (err) {
        if (!controller.signal.aborted) {
          setState((prev) => ({ ...prev, error: err instanceof Error ? err.message : String(err) }));
        }
      }
    }
    load();
    return () => {
      controller.abort();
    };
  }, [claimId, refreshToken]);

  return state;
}

export type DealAlertsState = {
  alerts: AnyRecord[];
  unread: number;
  error: string | null;
  refreshToken: number;
};

export function useDealAlerts(refreshToken: number): DealAlertsState {
  const [state, setState] = React.useState<DealAlertsState>({ alerts: [], unread: 0, error: null, refreshToken: 0 });

  React.useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`${LOCAL_API}/market/deal-alerts?limit=80`, { signal: controller.signal });
        if (response.status === 401) {
          setState((prev) => ({ ...prev, alerts: [], unread: 0, error: null, refreshToken: prev.refreshToken + 1 }));
          return;
        }
        if (!response.ok) throw new Error(`deal alerts HTTP ${response.status}`);
        const payload = await response.json();
        setState((prev) => ({
          alerts: payload.alerts ?? [],
          unread: toNumber(payload.unread),
          error: null,
          refreshToken: prev.refreshToken + 1,
        }));
      } catch (err) {
        if (!controller.signal.aborted) setState((prev) => ({ ...prev, error: err instanceof Error ? err.message : String(err) }));
      }
    }
    load();
    return () => controller.abort();
  }, [refreshToken]);

  return state;
}

