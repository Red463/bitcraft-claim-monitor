import React from "react";

import { toNumber, type AnyRecord } from "../main-app-data";
import type { ActivePanel, LocalHistoryState, NotificationActivityState } from "../types/app";

const LOCAL_API = "/api/local";

/**
 * Loads locally recorded history that BitJita does not provide directly.
 *
 * Live page data still comes from BitJita/proxy calls, but activity history,
 * snapshots, dashboard trend data, and market history are built from SQLite
 * records captured by the local server.
 */
export function useLocalHistory(refreshToken: number, claimId: string, activePanel: ActivePanel): LocalHistoryState {
  const [state, setState] = React.useState<LocalHistoryState>({ market: null, activity: [], activityTotal: 0, snapshots: [], dashboard: null, error: null, refreshToken: 0 });

  React.useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const include = ["activity", activePanel === "market" ? "market" : "", activePanel === "dashboard" ? "snapshots,dashboard" : ""].filter(Boolean).join(",");
        const activityLimit = activePanel === "activity" ? 2000 : activePanel === "dashboard" ? 40 : 60;
        const response = await fetch(`${LOCAL_API}/history?claimId=${encodeURIComponent(claimId)}&include=${encodeURIComponent(include)}&activityLimit=${activityLimit}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`local history HTTP ${response.status}`);
        const history = await response.json();
        const activity = history.activity ?? {};
        const snapshots = history.snapshots ?? {};
        setState((prev) => ({
          market: history.market ?? (activePanel === "market" ? null : prev.market),
          activity: activity.events ?? [],
          activityTotal: toNumber(activity.total ?? activity.events?.length),
          snapshots: snapshots.snapshots ?? (activePanel === "dashboard" ? [] : prev.snapshots),
          dashboard: history.dashboard ?? (activePanel === "dashboard" ? null : prev.dashboard),
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
  }, [activePanel, claimId, refreshToken]);

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