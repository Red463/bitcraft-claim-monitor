export type SortDirection = "asc" | "desc";

export function sortComparable(value: unknown): string | number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value ?? "").trim();
  if (!text || text === "-") return "";
  const numeric = Number(text.replace(/,/g, "").replace(/[g%]$/i, ""));
  if (Number.isFinite(numeric) && /[0-9]/.test(text)) return numeric;
  return text.toLowerCase();
}

export function compareSortValues(left: unknown, right: unknown, direction: SortDirection): number {
  const a = sortComparable(left);
  const b = sortComparable(right);
  const order = direction === "asc" ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return (a - b) * order;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" }) * order;
}
