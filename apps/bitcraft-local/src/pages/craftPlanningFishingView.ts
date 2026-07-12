import type { AnyRecord } from "../main-app-data";
import type { NeedCell, NeedGroup, NeedRow } from "./craftPlanningNeedsBoard.ts";

export type FishingRoutePreference = "ocean" | "lake";

type PersonalFishingRoute = {
  available?: boolean;
  input?: AnyRecord;
  guaranteedYield?: number;
  stockQuantity?: number;
  trackedQuantity?: number;
  needed?: number;
  usage?: AnyRecord;
  sources?: AnyRecord[];
  activeCraftSources?: AnyRecord[];
};

type PersonalFishingTier = {
  tier?: number;
  routes?: Partial<Record<FishingRoutePreference, PersonalFishingRoute>>;
};

export type PersonalFishingView = {
  tiers?: PersonalFishingTier[];
};

export function normalizeFishingRoutePreference(value: unknown): FishingRoutePreference {
  return value === "lake" ? "lake" : "ocean";
}

function routeName(preference: FishingRoutePreference) {
  return preference === "lake" ? "Lake Fish" : "Ocean Fish";
}

function unavailableResult(board: NeedGroup[], preference: FishingRoutePreference) {
  return {
    board,
    available: false,
    reason: `Verified ${routeName(preference)} route unavailable`,
  };
}

function finiteNonNegative(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function projectedCell(route: PersonalFishingRoute): NeedCell | null {
  if (!route.input || typeof route.input !== "object") return null;
  const needed = finiteNonNegative(route.needed);
  const stockQuantity = finiteNonNegative(route.stockQuantity);
  const trackedQuantity = finiteNonNegative(route.trackedQuantity);
  if (needed == null || stockQuantity == null || trackedQuantity == null) return null;
  const name = String(route.input.name ?? route.input.label ?? route.input.key ?? "").trim();
  if (!name) return null;
  const item = {
    ...route.input,
    sources: Array.isArray(route.sources) ? route.sources : [],
    activeCraftSources: Array.isArray(route.activeCraftSources) ? route.activeCraftSources : [],
    ...(route.usage && typeof route.usage === "object" ? { recipeUsages: [route.usage] } : {}),
  };
  return {
    item,
    items: [item],
    name,
    missing: needed,
    required: needed + stockQuantity + trackedQuantity,
    available: stockQuantity,
    inProgress: trackedQuantity,
    plannedOutput: 0,
  };
}

function cloneRow(row: NeedRow): NeedRow {
  return { ...row, cells: new Map(row.cells) };
}

function rowMaxMissing(row: NeedRow) {
  return [...row.cells.values()].reduce((max, cell) => Math.max(max, cell.missing > 0 ? cell.missing : cell.required), 0);
}

function newFishingRow(name: string): NeedRow {
  return {
    name,
    apiName: name,
    overrideKey: `tag:${name}`,
    apiSection: "Fishing",
    sectionOverride: null,
    rowNameOverride: null,
    maxMissing: 0,
    cells: new Map(),
  };
}

function isCanonicalFishingRow(row: NeedRow, canonicalName: string) {
  return row.apiName === canonicalName || row.overrideKey === `tag:${canonicalName}`;
}

function isPlannerTierColumn(column: string) {
  return /^T(?:[1-9]|10)$/.test(column);
}

function recalculateFishingGroup(group: NeedGroup, rows: NeedRow[]): NeedGroup {
  const cells = rows.flatMap((row) => [...row.cells.values()]);
  const required = cells.reduce((sum, cell) => sum + cell.required, 0);
  const covered = cells.reduce((sum, cell) => sum + Math.min(cell.required, cell.available + cell.inProgress + cell.plannedOutput), 0);
  return {
    ...group,
    rows,
    required,
    covered,
    completion: required > 0 ? Math.round((covered / required) * 1000) / 10 : 100,
  };
}

export function applyPersonalFishingView(
  board: NeedGroup[],
  view: PersonalFishingView | null | undefined,
  preference: FishingRoutePreference,
): { board: NeedGroup[]; available: boolean; reason: string | null } {
  const fishingIndex = board.findIndex((group) => group.section === "Fishing");
  if (fishingIndex < 0 || !Array.isArray(view?.tiers) || view.tiers.length === 0) {
    return unavailableResult(board, preference);
  }

  const projections = new Map<string, NeedCell>();
  for (const tier of view.tiers) {
    const tierNumber = tier?.tier;
    const route = tier?.routes?.[preference];
    const guaranteedYield = route?.guaranteedYield;
    const cell = route?.available === true && typeof tierNumber === "number" && Number.isInteger(tierNumber) && tierNumber >= 1 && tierNumber <= 10
      && typeof guaranteedYield === "number" && Number.isFinite(guaranteedYield) && guaranteedYield > 0
      ? projectedCell(route)
      : null;
    if (!cell || projections.has(`T${tierNumber}`)) return unavailableResult(board, preference);
    projections.set(`T${tierNumber}`, cell);
  }

  const fishing = board[fishingIndex];
  const selectedName = routeName(preference);
  const otherName = routeName(preference === "lake" ? "ocean" : "lake");
  const canonicalRows = board.flatMap((group, groupIndex) => group.rows
    .filter((row) => isCanonicalFishingRow(row, selectedName) || isCanonicalFishingRow(row, otherName))
    .map((row) => ({ row, groupIndex })));
  if (canonicalRows.some(({ groupIndex }) => groupIndex !== fishingIndex)) {
    return unavailableResult(board, preference);
  }
  const authoritativeTierColumns = new Set(canonicalRows.flatMap(({ row }) => [...row.cells.keys()].filter(isPlannerTierColumn)));
  if ([...authoritativeTierColumns].some((column) => !projections.has(column))) {
    return unavailableResult(board, preference);
  }
  const existingSelected = fishing.rows.find((row) => isCanonicalFishingRow(row, selectedName));
  if (existingSelected) {
    for (const [column, projected] of projections) {
      const authoritative = existingSelected.cells.get(column);
      if (!authoritative) continue;
      const authoritativeItem = authoritative.items.find((item) => item.key === projected.item.key) ?? (authoritative.items.length === 1 ? authoritative.items[0] : null);
      if (!authoritativeItem) continue;
      projected.item = {
        ...projected.item,
        sources: projected.item.sources.length ? projected.item.sources : Array.isArray(authoritativeItem.sources) ? authoritativeItem.sources : [],
        activeCraftSources: projected.item.activeCraftSources.length ? projected.item.activeCraftSources : Array.isArray(authoritativeItem.activeCraftSources) ? authoritativeItem.activeCraftSources : [],
        recipeUsages: projected.item.recipeUsages,
      };
      projected.items = [projected.item];
    }
  }
  const selectedRow = cloneRow(existingSelected ?? newFishingRow(selectedName));
  selectedRow.cells = new Map(projections);
  selectedRow.maxMissing = rowMaxMissing(selectedRow);

  let rows: NeedRow[];
  if (existingSelected) {
    rows = fishing.rows
      .filter((row) => !isCanonicalFishingRow(row, otherName))
      .map((row) => row === existingSelected ? selectedRow : row);
  } else {
    const alternativeIndex = fishing.rows.findIndex((row) => isCanonicalFishingRow(row, otherName));
    rows = fishing.rows.filter((row) => !isCanonicalFishingRow(row, otherName));
    if (alternativeIndex >= 0) rows.splice(Math.min(alternativeIndex, rows.length), 0, selectedRow);
    else rows.push(selectedRow);
  }

  const transformedFishing = recalculateFishingGroup(fishing, rows);
  const transformedBoard = board.map((group, index) => index === fishingIndex ? transformedFishing : group);
  return { board: transformedBoard, available: true, reason: null };
}
