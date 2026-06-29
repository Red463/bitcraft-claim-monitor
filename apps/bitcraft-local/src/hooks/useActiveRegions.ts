import React from "react";

import type { AnyRecord } from "../main-app-data";

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
};

export function activeRegionLabel(region: ActiveRegion, settlementRegionId?: string): string {
  const suffixes = [
    String(region.regionId) === String(settlementRegionId ?? "") ? "settlement" : "",
    region.source === "admin" ? "manual" : "",
  ].filter(Boolean);
  return `R${region.regionId}${region.regionName ? ` - ${region.regionName}` : ""}${suffixes.length ? ` (${suffixes.join(", ")})` : ""}`;
}

export function useActiveRegions(includeRegionId?: string): ActiveRegion[] {
  const [regions, setRegions] = React.useState<ActiveRegion[]>([]);
  React.useEffect(() => {
    const controller = new AbortController();
    const include = includeRegionId && /^\d+$/.test(String(includeRegionId)) ? `?include=${encodeURIComponent(String(includeRegionId))}` : "";
    fetch(`${LOCAL_API}/regions/active${include}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`active regions HTTP ${response.status}`)))
      .then((payload) => {
        const rows = Array.isArray(payload.regions) ? payload.regions : [];
        setRegions(rows.map((region: AnyRecord) => ({
          ...region,
          regionId: String(region.regionId ?? ""),
        })).filter((region: ActiveRegion) => /^\d+$/.test(region.regionId)));
      })
      .catch(() => {
        if (!controller.signal.aborted && includeRegionId) setRegions([{ regionId: String(includeRegionId), regionName: `Region ${includeRegionId}`, source: "fallback" }]);
      });
    return () => controller.abort();
  }, [includeRegionId]);
  return regions;
}
