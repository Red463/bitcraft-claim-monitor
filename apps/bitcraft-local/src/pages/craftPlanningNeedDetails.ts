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
      const rawLabel = String(source.label ?? source.type ?? "Source");
      const type = String(source.type ?? "Source");
      const playerName = String(source.playerName ?? "").trim();
      const label = playerName && !rawLabel.toLocaleLowerCase().includes(playerName.toLocaleLowerCase()) ? `${playerName} — ${rawLabel}` : rawLabel;
      const key = `${type}|${playerName}|${rawLabel}`;
      const current: GroupedNeedSource = grouped.get(key) ?? { key, label, type, quantity: 0, entries: [] };
      current.quantity += toQuantity(source.quantity);
      current.entries.push(source);
      grouped.set(key, current);
    }
  }
  return [...grouped.values()].sort((a, b) => b.quantity - a.quantity || a.label.localeCompare(b.label));
}

export function groupNeedCellActiveCrafts(cell: NeedCell): AnyRecord[] {
  const crafts = new Map<string, AnyRecord>();
  for (const item of cell.items ?? []) {
    for (const source of Array.isArray(item.activeCraftSources) ? item.activeCraftSources : []) {
      const key = String(source.craftId ?? source.sourceId ?? `${source.playerName}:${source.buildingName}`);
      const current = crafts.get(key);
      crafts.set(key, current ? {
        ...current,
        quantity: toQuantity(current.quantity) + toQuantity(source.quantity),
        expectedQuantity: toQuantity(current.expectedQuantity) + toQuantity(source.expectedQuantity),
        guaranteedQuantity: toQuantity(current.guaranteedQuantity) + toQuantity(source.guaranteedQuantity),
      } : { ...source });
    }
  }
  return [...crafts.values()].sort((a, b) => Number(b.completed === true) - Number(a.completed === true) || String(a.playerName ?? "").localeCompare(String(b.playerName ?? "")));
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
  const routes: NeedSourceRoute[] = [];
  const seen = new Set<string>();

  function addRoute(route: AnyRecord, fallbackOutput: AnyRecord = {}) {
    const output = route.output && typeof route.output === "object" ? route.output : fallbackOutput;
    const key = itemIdentity(output);
    const routeKey = String(key) + "|" + String(route.selectedRecipeId ?? route.id ?? route.recipeName ?? "route");
    if (!keys.has(key) || seen.has(routeKey)) return;
    seen.add(routeKey);
    routes.push({
      ...route,
      key,
      output,
      inputs: Array.isArray(route.inputs) ? route.inputs : [],
    });
  }

  for (const item of cell.items ?? []) {
    for (const route of Array.isArray(item.sourceRoutes) ? item.sourceRoutes : []) {
      const routeOutput = route.output && typeof route.output === "object" ? route.output : item;
      const routeOutputKey = itemIdentity(routeOutput);
      const calculated = steps.find((step) => {
        const stepOutput = step.output && typeof step.output === "object" ? step.output : {};
        return itemIdentity(stepOutput) === routeOutputKey
          && String(step.selectedRecipeId ?? step.id ?? "") === String(route.selectedRecipeId ?? route.id ?? "");
      });
      addRoute(calculated ? { ...route, ...calculated, output: calculated.output ?? routeOutput, inputs: calculated.inputs ?? route.inputs } : route, item);
    }
  }
  for (const step of steps) addRoute(step);
  return routes;
}
