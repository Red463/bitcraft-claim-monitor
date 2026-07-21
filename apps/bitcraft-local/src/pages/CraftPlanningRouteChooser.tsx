import type { AnyRecord } from "../main-app-data";
import { formatNumber } from "../utils/format";
import { itemName } from "./craftPlanningNeedsBoard";
import { acquisitionRouteKind, acquisitionRouteLabel, acquisitionRouteMetrics } from "./craftPlanningRoutePresentation.mjs";

type Props = {
  routes: AnyRecord[];
  selectedRecipeId: string;
  output: AnyRecord;
  missingQuantity: number;
  multiplier: number;
  canManage: boolean;
  pendingRecipeId: string | null;
  onSelect: (recipeId: string) => void;
};

function routeWorkLabel(route: AnyRecord, output: AnyRecord, missingQuantity: number, multiplier: number) {
  const metrics = acquisitionRouteMetrics(route, { missingQuantity, multiplier });
  if (metrics.status === "unavailable") return { primary: "Yield calculation unavailable", secondary: "Validated probability data is not available for this route." };
  if (metrics.basis === "node") {
    return {
      primary: metrics.plannedUnits === 0 ? "No additional nodes needed" : `Plan for ${formatNumber(metrics.plannedUnits)} full nodes`,
      secondary: `About ${formatNumber(metrics.expectedPerUnit, Number(metrics.expectedPerUnit) < 1 ? 3 : 1)} ${itemName(output)} per full node`,
    };
  }
  if (metrics.basis === "progress") {
    const progressKind = route.gatheringMode === "prospecting" ? "extraction progress" : "node progress";
    return {
      primary: metrics.plannedUnits === 0 ? "No additional progress needed" : `Plan for ${formatNumber(metrics.plannedUnits)} ${progressKind}`,
      secondary: metrics.progressPerExpectedItem
        ? `About 1 ${itemName(output)} per ${formatNumber(metrics.progressPerExpectedItem)} ${progressKind}`
        : `Expected output per ${progressKind}`,
    };
  }
  return {
    primary: metrics.plannedUnits === 0 ? "No additional crafts needed" : `Plan for ${formatNumber(metrics.plannedUnits)} recipe completions`,
    secondary: `${route.probabilityStatus === "expected" ? "About" : "Guaranteed"} ${formatNumber(metrics.expectedPerUnit, Number(metrics.expectedPerUnit) < 1 ? 3 : 1)} ${itemName(output)} per craft`,
  };
}

export function CraftPlanningRouteChooser({ routes, selectedRecipeId, output, missingQuantity, multiplier, canManage, pendingRecipeId, onSelect }: Props) {
  if (routes.length < 2) return null;
  return (
    <fieldset className="craft-plan-route-options" aria-busy={pendingRecipeId !== null}>
      <legend>Choose acquisition route</legend>
      {routes.map((route, index) => {
        const recipeId = String(route.id ?? "");
        const selected = recipeId === selectedRecipeId;
        const pending = recipeId === pendingRecipeId;
        const descriptionId = `craft-plan-route-option-${index}`;
        const work = routeWorkLabel(route, output, missingQuantity, multiplier);
        return (
          <label className={`craft-plan-route-option${selected ? " is-selected" : ""}${pending ? " is-pending" : ""}`} aria-busy={pending} key={recipeId || index}>
            <input
              type="radio"
              name={`craft-plan-route-${String(output.kind ?? output.itemType ?? "item")}-${String(output.id ?? "output")}`}
              value={recipeId}
              checked={selected}
              disabled={!canManage || pendingRecipeId !== null}
              aria-describedby={descriptionId}
              onChange={() => onSelect(recipeId)}
            />
            <span className="craft-plan-route-option-kind">{acquisitionRouteKind(route)}</span>
            <strong>{acquisitionRouteLabel(route, output)}</strong>
            <span className="craft-plan-route-option-work">{work.primary}</span>
            <small id={descriptionId}>{work.secondary}</small>
            {selected ? <em>Selected for plan</em> : null}
          </label>
        );
      })}
    </fieldset>
  );
}
