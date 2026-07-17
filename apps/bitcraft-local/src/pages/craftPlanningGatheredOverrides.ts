import type { AnyRecord } from "../main-app-data";
import { itemKey } from "./craftPlanningNeedsBoard.ts";

export type GatheredCellState = "none" | "mixed" | "all";

export function cellItemKeys(items: AnyRecord[]): string[] {
  return [...new Set((Array.isArray(items) ? items : []).map(itemKey).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

export function gatheredCellState(cellKeys: string[], gatheredItemKeys: string[]): GatheredCellState {
  if (!cellKeys.length) return "none";
  const gathered = new Set(gatheredItemKeys);
  const count = cellKeys.filter((key) => gathered.has(key)).length;
  if (count === 0) return "none";
  return count === cellKeys.length ? "all" : "mixed";
}

export function setCellGathered(
  gatheredItemKeys: string[],
  cellKeys: string[],
  enabled: boolean,
): string[] {
  const next = new Set(gatheredItemKeys);
  for (const key of cellKeys) {
    if (enabled) next.add(key);
    else next.delete(key);
  }
  return [...next].sort((left, right) => left.localeCompare(right));
}
