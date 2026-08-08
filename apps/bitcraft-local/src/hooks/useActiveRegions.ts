import React from "react";

import type { AnyRecord } from "../main-app-data";
import { usePageRefresh } from "../refresh/ManualRefreshContext";
import { pageRefreshHeaders } from "../refresh/pageRefresh.mjs";

const LOCAL_API = "/api/local";

export type ActiveRegion = {
  regionId: string;
  regionName?: string;
  active?: boolean;
  syncing?: boolean;
  signedInPlayers?: number;
  playersInQueue?: number;
  updatedAt?: string | null;
  source?: string;
  relayReady?: boolean | null;
  freshness?: string;
  warnings?: string[];
};

export function activeRegionLabel(region: ActiveRegion, settlementRegionId?: string): string {
  const suffixes = [
    String(region.regionId) === String(settlementRegionId ?? "") ? "settlement" : "",
    region.source === "admin" ? "manual" : "",
  ].filter(Boolean);
  return `R${region.regionId}${region.regionName ? ` - ${region.regionName}` : ""}${suffixes.length ? ` (${suffixes.join(", ")})` : ""}`;
}

export function useActiveRegions(includeRegionId?: string, claimId?: string, scopeKey?: string): ActiveRegion[] {
  const scopeIdentity = `${String(claimId ?? "")}|${String(includeRegionId ?? "")}|${String(scopeKey ?? "")}`;
  const [state, setState] = React.useState<{ scopeIdentity: string; regions: ActiveRegion[] }>({
    scopeIdentity,
    regions: [],
  });
  const { cycle, trackPromise } = usePageRefresh();
  React.useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    const include = includeRegionId && /^\d+$/.test(String(includeRegionId)) ? `?include=${encodeURIComponent(String(includeRegionId))}` : "";
    const refresh = fetch(`${LOCAL_API}/regions/active${include}`, {
      headers: cycle ? pageRefreshHeaders(cycle, cycle.page) : {},
      signal: controller.signal,
    })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`active regions HTTP ${response.status}`)));
    void trackPromise("active-regions", refresh)
      .then((payload) => {
        if (disposed) return;
        const rows = Array.isArray(payload.regions) ? payload.regions : [];
        setState({
          scopeIdentity,
          regions: rows.map((region: AnyRecord) => ({
            ...region,
            regionId: String(region.regionId ?? ""),
          })).filter((region: ActiveRegion) => /^\d+$/.test(region.regionId)),
        });
      })
      .catch(() => {
        if (!controller.signal.aborted && !disposed) {
          setState((current) => ({
            scopeIdentity,
            regions: current.scopeIdentity === scopeIdentity && current.regions.length
              ? current.regions
              : includeRegionId
                ? [{ regionId: String(includeRegionId), regionName: `Region ${includeRegionId}`, source: "fallback" }]
                : [],
          }));
        }
      });
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [cycle?.sequence, scopeIdentity, trackPromise]);
  return state.scopeIdentity === scopeIdentity ? state.regions : [];
}
