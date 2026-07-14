import type { FishingRoutePreference } from "./craftPlanningFishingView";

type EffortState = "ready" | "partial" | "unavailable" | "empty";

export type EffortAggregate = {
  state: EffortState;
  baselineEffort: number | null;
  remainingEffort: number | null;
  completion: number | null;
};

export type EffortProgressSummary = {
  state: EffortState;
  overall?: EffortAggregate;
  sections?: Record<string, EffortAggregate>;
  fishingVariants?: Partial<Record<FishingRoutePreference, {
    overall: EffortAggregate;
    sections: Record<string, EffortAggregate>;
  }>>;
  warnings?: string[];
};

export type CraftPlanningEffortView = {
  state: EffortState;
  route: FishingRoutePreference;
  overall: EffortAggregate;
  sections: Record<string, EffortAggregate>;
  warnings: string[];
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function finite(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function aggregate(value: unknown): EffortAggregate {
  const source = record(value);
  const completion = finite(source.completion);
  const state = source.state === "ready" && completion != null ? "ready" : "unavailable";
  return {
    state,
    baselineEffort: finite(source.baselineEffort),
    remainingEffort: finite(source.remainingEffort),
    completion: state === "ready" ? completion : null,
  };
}

export function selectCraftPlanningEffortView(summary: unknown, route: FishingRoutePreference): CraftPlanningEffortView {
  const root = record(summary);
  const variants = record(root.fishingVariants);
  const variant = record(variants[route]);
  const baseSections = record(root.sections);
  const variantSections = record(variant.sections);
  const hasSelectedVariant = Object.keys(variant).length > 0;
  const hasFishing = Object.prototype.hasOwnProperty.call(baseSections, "Fishing");
  const sectionEntries = Object.entries({ ...baseSections, ...variantSections })
    .map(([name, value]) => [name, aggregate(value)]);
  const validStates = new Set<EffortState>(["ready", "partial", "unavailable", "empty"]);
  const state = validStates.has(String(root.state) as EffortState)
    ? String(root.state) as EffortState
    : "unavailable";
  return {
    state,
    route,
    overall: aggregate(hasSelectedVariant ? variant.overall : hasFishing ? null : root.overall),
    sections: Object.fromEntries(sectionEntries),
    warnings: Array.isArray(root.warnings) ? root.warnings.map(String).slice(0, 25) : [],
  };
}
