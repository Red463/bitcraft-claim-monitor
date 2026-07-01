import type { AnyRecord } from "../../main-app-data";

export type WatchtowerFilter = {
  id: string;
  label: string;
  count: number;
};

export type PresentedWatchtower = AnyRecord & {
  displayName: string;
  rawNickname: string;
  shortTowerId: string;
};

const GENERIC_WATCHTOWER_NAMES = new Set([
  "fallen empire's watchtower",
  "fallen empire’s watchtower",
  "watchtower",
]);

function numericCoordinate(row: AnyRecord, key: "locationX" | "locationZ") {
  const value = row[key];
  if (value == null || value === "") return Number.POSITIVE_INFINITY;
  const number = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : Number.POSITIVE_INFINITY;
}

function shortTowerId(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const cleaned = text.replace(/^tower[-_:]?/i, "");
  return cleaned.length > 8 ? cleaned.slice(-8) : cleaned;
}

function isGenericWatchtowerName(value: unknown) {
  return GENERIC_WATCHTOWER_NAMES.has(String(value ?? "").trim().toLowerCase());
}

export function coordinateText(row: AnyRecord): string {
  const x = row.locationX ?? row.x;
  const z = row.locationZ ?? row.z;
  if (x == null || x === "" || z == null || z === "") return "-";
  const xNumber = Number(String(x).replace(/,/g, ""));
  const zNumber = Number(String(z).replace(/,/g, ""));
  if (!Number.isFinite(xNumber) || !Number.isFinite(zNumber)) return "-";
  return `${xNumber.toLocaleString(undefined, { maximumFractionDigits: 0 })}, ${zNumber.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function mapCoordinateLabel(row: AnyRecord): string {
  return `Map coords ${coordinateText(row)}`;
}

export function presentWatchtowerRows(rows: AnyRecord[]): PresentedWatchtower[] {
  const byEmpire = new Map<string, AnyRecord[]>();
  for (const row of rows) {
    const empireId = String(row.empireId ?? "");
    byEmpire.set(empireId, [...(byEmpire.get(empireId) ?? []), row]);
  }

  const presented: PresentedWatchtower[] = [];
  for (const empireRows of byEmpire.values()) {
    const sorted = [...empireRows].sort((a, b) => (
      numericCoordinate(a, "locationX") - numericCoordinate(b, "locationX") ||
      numericCoordinate(a, "locationZ") - numericCoordinate(b, "locationZ") ||
      String(a.towerId ?? a.id ?? "").localeCompare(String(b.towerId ?? b.id ?? ""))
    ));
    sorted.forEach((row, index) => {
      const nickname = String(row.nickname ?? "").trim();
      presented.push({
        ...row,
        displayName: `Watchtower #${index + 1}`,
        rawNickname: nickname && !isGenericWatchtowerName(nickname) ? nickname : "",
        shortTowerId: shortTowerId(row.towerId ?? row.id),
      });
    });
  }

  return presented;

}

export function buildWatchtowerEmpireFilters(empires: AnyRecord[], rows: AnyRecord[]): WatchtowerFilter[] {
  const counts = new Map<string, number>();
  const names = new Map<string, string>();
  for (const empire of empires) {
    const id = String(empire.entityId ?? empire.empireId ?? "");
    if (id) names.set(id, String(empire.name ?? empire.empireName ?? `Empire ${id}`));
  }
  for (const row of rows) {
    const id = String(row.empireId ?? "");
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
    if (!names.has(id)) names.set(id, String(row.empireName ?? `Empire ${id}`));
  }
  const filters = [...counts.entries()]
    .map(([id, count]) => ({ id, label: names.get(id) ?? `Empire ${id}`, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return [{ id: "all", label: "All empires", count: rows.length }, ...filters];
}

export function filterWatchtowerRows(rows: PresentedWatchtower[], selectedEmpireId: string): PresentedWatchtower[] {
  if (!selectedEmpireId || selectedEmpireId === "all") return rows;
  const filtered = rows.filter((row) => String(row.empireId ?? "") === selectedEmpireId);
  return filtered.length ? filtered : rows;
}
