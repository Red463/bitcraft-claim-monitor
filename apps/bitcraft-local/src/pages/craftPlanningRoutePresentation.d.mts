export type AcquisitionRouteMetrics = {
  status: "available" | "unavailable";
  basis?: "node" | "progress" | "craft";
  expectedPerUnit?: number;
  exactUnits?: number;
  plannedUnits?: number;
  totalProgress?: number | null;
  progressPerExpectedItem?: number | null;
  totalActions?: number | null;
};

export function acquisitionRouteKind(route: Record<string, unknown>): "Gathering" | "Gathering byproduct" | "Prospecting" | "Crafting" | "Craft byproduct" | "Logistics";
export function acquisitionRouteLabel(route: Record<string, unknown>, output?: Record<string, unknown>): string;
export function acquisitionRouteMetrics(route: Record<string, unknown>, options?: { missingQuantity?: number; multiplier?: number }): AcquisitionRouteMetrics;
