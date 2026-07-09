import type { AnyRecord } from "../main-app-data";
import { itemKey, itemName, type NeedCell } from "./craftPlanningNeedsBoard.ts";

function toQuantity(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function itemIdentity(item: AnyRecord) {
  return itemKey(item);
}

export type GroupedNeedSource = {
  key: string;
  label: string;
  type: string;
  quantity: number;
  entries: AnyRecord[];
};

export type GroupedNeedUsage = {
  key: string;
  output: AnyRecord;
  recipeName: string;
  buildingName: string | null;
  selectedRecipeId: string | null;
  alternatives: AnyRecord[];
  requiredQuantity: number;
  craftCount: number;
  quantityPerCraft: number;
  entries: AnyRecord[];
};

export type NeedSourceRoute = AnyRecord & {
  key: string;
  output: AnyRecord;
  inputs: AnyRecord[];
};

export function groupNeedCellSources(cell: NeedCell): GroupedNeedSource[] {
  const grouped = new Map<string, GroupedNeedSource>();
  for (const item of cell.items ?? []) {
    const sources = Array.isArray(item.sources) ? item.sources : [];
    for (const source of sources) {
      const label = String(source.label ?? source.type ?? "Source");
      const type = String(source.type ?? "Source");
      const key = `${type}|${label}`;
      const current: GroupedNeedSource = grouped.get(key) ?? { key, label, type, quantity: 0, entries: [] };
      current.quantity += toQuantity(source.quantity);
      current.entries.push(source);
      grouped.set(key, current);
    }
  }
  return [...grouped.values()].sort((a, b) => b.quantity - a.quantity || a.label.localeCompare(b.label));
}

export function groupNeedCellRecipeUsages(cell: NeedCell): GroupedNeedUsage[] {
  const grouped = new Map<string, GroupedNeedUsage>();
  for (const item of cell.items ?? []) {
    const usages = Array.isArray(item.recipeUsages) ? item.recipeUsages : [];
    for (const usage of usages) {
      const output = usage.output && typeof usage.output === "object" ? usage.output : {};
      const key = String(usage.outputKey ?? itemIdentity(output) ?? itemName(output));
      const current: GroupedNeedUsage = grouped.get(key) ?? {
        key,
        output: { ...output, quantity: 0 },
        recipeName: String(usage.recipeName ?? "Selected recipe"),
        buildingName: usage.buildingName == null ? null : String(usage.buildingName),
        selectedRecipeId: usage.selectedRecipeId == null ? null : String(usage.selectedRecipeId),
        alternatives: Array.isArray(usage.alternatives) ? usage.alternatives : [],
        requiredQuantity: 0,
        craftCount: 0,
        quantityPerCraft: toQuantity(usage.quantityPerCraft),
        entries: [],
      };
      current.output = { ...current.output, ...output, quantity: toQuantity(current.output.quantity) + toQuantity(output.quantity) };
      current.requiredQuantity += toQuantity(usage.requiredQuantity);
      current.craftCount += toQuantity(usage.craftCount);
      current.entries.push(usage);
      if (!current.alternatives.length && Array.isArray(usage.alternatives)) current.alternatives = usage.alternatives;
      grouped.set(key, current);
    }
  }
  return [...grouped.values()].sort((a, b) => b.requiredQuantity - a.requiredQuantity || itemName(a.output).localeCompare(itemName(b.output)));
}

export function groupNeedCellSourceRoutes(cell: NeedCell, steps: AnyRecord[] = []): NeedSourceRoute[] {
  const keys = new Set((cell.items ?? []).map(itemIdentity));
  const routes = [];
  const seen = new Set<string>();
  for (const step of steps) {
    const output = step.output && typeof step.output === "object" ? step.output : {};
    const key = itemIdentity(output);
    if (!keys.has(key) || seen.has(`${key}|${step.selectedRecipeId ?? step.id ?? step.recipeName ?? "route"}`)) continue;
    seen.add(`${key}|${step.selectedRecipeId ?? step.id ?? step.recipeName ?? "route"}`);
    routes.push({
      ...step,
      key,
      output,
      inputs: Array.isArray(step.inputs) ? step.inputs : [],
    });
  }
  return routes;
}
