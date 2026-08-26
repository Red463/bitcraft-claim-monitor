import type { ActivePanel } from "../types/app";

export type SurfaceMode = "operations" | "market" | "map" | "public" | "admin";

export function surfaceModeForPanel(panel: ActivePanel): SurfaceMode {
  switch (panel) {
    case "market":
    case "settlement-market":
      return "market";
    case "map":
      return "map";
    case "publiccrafts":
    case "craftcalc":
    case "sync":
      return "public";
    case "admin":
      return "admin";
    default:
      return "operations";
  }
}
