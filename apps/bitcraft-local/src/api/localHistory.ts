import React from "react";

import { toNumber } from "../main-app-data";
import type { ActivePanel, LocalHistoryState } from "../types/app";

const LOCAL_API = "/api/local";

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
