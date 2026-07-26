export type SortDirection = "asc" | "desc";

export type IndexedRow<Row> = { row: Row; index: number };

function localizedDateTimeMs(text: string): number | null {
  const match = text.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return null;
  const [, dayText, monthText, yearText, hourText = "0", minuteText = "0", secondText = "0"] = match;
  const year = yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const timestamp = Date.UTC(year, month - 1, day, hour, minute, second);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  ) return null;
  return timestamp;
}

export function sortComparable(value: unknown): string | number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value ?? "").trim();
  if (!text || text === "-") return "";
  const numeric = Number(text.replace(/,/g, "").replace(/[g%]$/i, ""));
  if (Number.isFinite(numeric) && /[0-9]/.test(text)) return numeric;
  const dateTime = localizedDateTimeMs(text);
  if (dateTime != null) return dateTime;
  return text.toLowerCase();
}

export function compareSortValues(left: unknown, right: unknown, direction: SortDirection): number {
  const a = sortComparable(left);
  const b = sortComparable(right);
  const order = direction === "asc" ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return (a - b) * order;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" }) * order;
}

export function compareOptionalSortValues(left: unknown, right: unknown, direction: SortDirection): number {
  const leftMissing = left == null || String(left).trim() === "";
  const rightMissing = right == null || String(right).trim() === "";
  if (leftMissing && rightMissing) return 0;
  if (leftMissing) return 1;
  if (rightMissing) return -1;
  return compareSortValues(left, right, direction);
}

export function sortIndexedRows<Row>(
  rows: ReadonlyArray<IndexedRow<Row>>,
  sortValue: (row: Row, index: number) => unknown,
  direction: SortDirection,
): Array<IndexedRow<Row>> {
  return [...rows].sort((left, right) => {
    const result = compareOptionalSortValues(sortValue(left.row, left.index), sortValue(right.row, right.index), direction);
    return result || left.index - right.index;
  });
}

export function windowIndexedRows<Row>(
  rows: ReadonlyArray<IndexedRow<Row>>,
  offset = 0,
  limit?: number,
): Array<IndexedRow<Row>> {
  const start = Math.max(0, Math.trunc(offset));
  if (limit == null) return rows.slice(start);
  return rows.slice(start, start + Math.max(0, Math.trunc(limit)));
}
