export type SortDirection = "asc" | "desc";

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
