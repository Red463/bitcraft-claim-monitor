import type { AnyRecord } from "../main-app-data";

export const NEED_COLUMNS = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "Materials"];

const SECTION_ORDER = [
  "Carpentry",
  "Construction",
  "Cooking",
  "Farming",
  "Fishing",
  "Foraging",
  "Forestry",
  "Hunting",
  "Leatherworking",
  "Masonry",
  "Mining",
  "Scholar",
  "Smithing",
  "Tailoring",
  "Other",
];

const FALLBACK_TIER_PREFIX_PATTERN = /^(Rough|Basic|Simple|Sturdy|Fine|Exquisite|Advanced|Peerless)\s+/i;

export type NeedCell = {
  item: AnyRecord;
  items: AnyRecord[];
  name: string;
  missing: number;
  required: number;
  available: number;
  inProgress: number;
};

export type NeedRow = {
  name: string;
  maxMissing: number;
  cells: Map<string, NeedCell>;
};

export type NeedGroup = {
  section: string;
  rows: NeedRow[];
};

export function itemKey(item: AnyRecord) {
  const id = item.key ?? item.itemKey ?? item.id ?? item.itemId ?? item.entityId ?? item.name ?? item.label;
  const kind = item.kind ?? item.itemKind ?? item.itemType ?? "item";
  return String(item.key ?? `${kind}:${id}`);
}

export function itemName(item: AnyRecord) {
  return String(item.name ?? item.label ?? item.itemName ?? item.key ?? "Unknown item");
}

function itemTag(item: AnyRecord) {
  const tag = String(item.tag ?? item.itemTag ?? item.categoryTag ?? "").trim();
  return tag || null;
}

function itemTier(item: AnyRecord) {
  const value = Number(item.tier ?? item.itemTier ?? item.tierLevel);
  return Number.isFinite(value) && value >= 1 && value <= 10 ? value : null;
}

function rowNameForNeed(item: AnyRecord) {
  const tag = itemTag(item);
  if (tag) return tag;
  return itemName(item).trim().replace(FALLBACK_TIER_PREFIX_PATTERN, "") || itemName(item);
}

function columnForNeed(item: AnyRecord) {
  const tier = itemTier(item);
  return tier ? `T${tier}` : "Materials";
}

function sortSectionName(a: string, b: string) {
  const ai = SECTION_ORDER.indexOf(a);
  const bi = SECTION_ORDER.indexOf(b);
  if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  return a.localeCompare(b);
}

export function buildNeedsBoard(materials: AnyRecord[], targets: AnyRecord[]): NeedGroup[] {
  const targetKeys = new Set(targets.map(itemKey));
  const groups = new Map<string, Map<string, NeedRow>>();

  for (const material of materials) {
    const missing = Number(material.missing) || 0;
    if (missing <= 0 || material.isTarget || targetKeys.has(itemKey(material))) continue;
    const section = String(material.section ?? "Other");
    const rowName = rowNameForNeed(material);
    const column = columnForNeed(material);
    if (!groups.has(section)) groups.set(section, new Map());
    const rows = groups.get(section)!;
    if (!rows.has(rowName)) rows.set(rowName, { name: rowName, maxMissing: 0, cells: new Map() });
    const row = rows.get(rowName)!;
    const existing = row.cells.get(column);
    const required = Number(material.required) || 0;
    const available = Number(material.available) || 0;
    const inProgress = Number(material.inProgress) || 0;
    if (existing) {
      existing.items.push(material);
      existing.missing += missing;
      existing.required += required;
      existing.available += available;
      existing.inProgress += inProgress;
    } else {
      row.cells.set(column, { item: material, items: [material], name: itemName(material), missing, required, available, inProgress });
    }
    row.maxMissing = Math.max(row.maxMissing, missing);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => sortSectionName(a, b))
    .map(([section, rows]) => ({
      section,
      rows: [...rows.values()].sort((a, b) => b.maxMissing - a.maxMissing || a.name.localeCompare(b.name)),
    }));
}
