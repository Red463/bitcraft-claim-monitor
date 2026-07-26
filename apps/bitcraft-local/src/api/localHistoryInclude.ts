import type { ActivePanel } from "../types/app";

export function localHistoryIncludeForPanel(activePanel: ActivePanel): string {
  return [
    "activity",
    activePanel === "settlement-market" || activePanel === "dashboard" ? "market" : "",
    activePanel === "dashboard" ? "dashboard" : "",
  ]
    .filter(Boolean)
    .join(",");
}
