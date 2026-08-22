import type { ActivePanel } from "../types/app";

export function localHistoryIncludeForPanel(activePanel: ActivePanel): string {
  if (activePanel === "dashboard") return "activity,market,dashboard";
  if (activePanel === "activity") return "activity";
  if (activePanel === "settlement-market") return "market";
  return "";
}
