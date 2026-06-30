import type { ActivePanel } from "../types/app";

export function localHistoryIncludeForPanel(activePanel: ActivePanel): string {
  return [
    "activity",
    activePanel === "market" || activePanel === "dashboard" ? "market" : "",
    activePanel === "dashboard" ? "snapshots,dashboard" : "",
  ]
    .filter(Boolean)
    .join(",");
}
