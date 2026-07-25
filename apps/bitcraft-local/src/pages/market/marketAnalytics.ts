import { parseDateValue, toNumber, type AnyRecord } from "../../main-app-data.ts";
import { timestampMs } from "../../utils/format.ts";

export type BestSellerSortKey = "units" | "revenue" | "sales" | "average" | "recent";
export type MarketIncomeRangeDays = 7 | 30 | 365;

export const BEST_SELLER_SORTS: Array<{ key: BestSellerSortKey; label: string }> = [
  { key: "units", label: "Units sold" },
  { key: "revenue", label: "Revenue" },
  { key: "sales", label: "Sales" },
  { key: "average", label: "Avg price" },
  { key: "recent", label: "Recent" },
];

export const MARKET_INCOME_RANGES = [
  { id: "7", label: "7D", days: 7 },
  { id: "30", label: "30D", days: 30 },
  { id: "365", label: "1Y", days: 365 },
] as const;

export function bestSellerSortValue(row: AnyRecord, sort: BestSellerSortKey): number {
  switch (sort) {
    case "revenue":
      return toNumber(row.totalValue);
    case "sales":
      return toNumber(row.salesCount);
    case "average":
      return toNumber(row.avgUnitPrice);
    case "recent":
      return timestampMs(row.lastSoldAt);
    case "units":
    default:
      return toNumber(row.unitsSold);
  }
}

export function buildMarketTopItems(events: AnyRecord[]) {
  const grouped = new Map<string, { itemName: string; salesCount: number; unitsSold: number; totalValue: number; lastSoldAt: string }>();
  for (const event of events) {
    const itemName = String(event.item_name ?? event.itemName ?? "Unknown Item");
    const current = grouped.get(itemName) ?? { itemName, salesCount: 0, unitsSold: 0, totalValue: 0, lastSoldAt: "" };
    current.salesCount += 1;
    current.unitsSold += toNumber(event.quantity);
    current.totalValue += toNumber(event.total_value ?? event.totalValue);
    current.lastSoldAt = String(current.lastSoldAt && current.lastSoldAt > String(event.occurred_at) ? current.lastSoldAt : event.occurred_at ?? "");
    grouped.set(itemName, current);
  }
  return [...grouped.values()]
    .map((item) => ({ ...item, avgUnitPrice: item.unitsSold ? item.totalValue / item.unitsSold : 0 }))
    .sort((a, b) => b.unitsSold - a.unitsSold || b.totalValue - a.totalValue)
    .slice(0, 20);
}

export function buildMarketDaily(events: AnyRecord[]) {
  const grouped = new Map<string, { day: string; salesCount: number; unitsSold: number; totalValue: number }>();
  for (const event of events) {
    const occurredAt = event.occurred_at ?? event.occurredAt;
    const parsed = parseDateValue(occurredAt);
    const day = parsed ? parsed.toISOString().slice(0, 10) : String(occurredAt ?? "").slice(0, 10) || "Unknown";
    const current = grouped.get(day) ?? { day, salesCount: 0, unitsSold: 0, totalValue: 0 };
    current.salesCount += 1;
    current.unitsSold += toNumber(event.quantity);
    current.totalValue += toNumber(event.total_value ?? event.totalValue);
    grouped.set(day, current);
  }
  return [...grouped.values()].sort((a, b) => a.day.localeCompare(b.day)).slice(-30);
}

export function buildMarketIncomeSummary(
  dailyRows: AnyRecord[],
  endAt?: string | Date | null,
  rangeDays: MarketIncomeRangeDays = 7,
  lifetimeTotal?: number,
) {
  const rows = [...dailyRows]
    .map((row) => ({
      day: String(row.day ?? ""),
      salesCount: toNumber(row.salesCount ?? row.sales_count),
      unitsSold: toNumber(row.unitsSold ?? row.units_sold),
      totalValue: toNumber(row.totalValue ?? row.total_value),
    }))
    .filter((row) => row.day)
    .sort((a, b) => a.day.localeCompare(b.day));
  const rowByDay = new Map(rows.map((row) => [row.day, row]));
  const firstDay = rows[0]?.day;
  const lastSaleDay = rows[rows.length - 1]?.day;
  const requestedEndDay = parseDateValue(endAt)?.toISOString().slice(0, 10);
  const lastDay = requestedEndDay && lastSaleDay && requestedEndDay > lastSaleDay ? requestedEndDay : lastSaleDay;
  const selectedRangeDays = MARKET_INCOME_RANGES.some((range) => range.days === rangeDays) ? rangeDays : 7;
  const requestedStart = lastDay ? new Date(`${lastDay}T00:00:00.000Z`) : null;
  requestedStart?.setUTCDate(requestedStart.getUTCDate() - (selectedRangeDays - 1));
  const requestedStartDay = requestedStart?.toISOString().slice(0, 10) ?? null;
  const plottedStartDay = firstDay && requestedStartDay && firstDay > requestedStartDay ? firstDay : requestedStartDay;
  const cumulativeTrend: Array<{ at: string; value: number }> = [];
  const totalValue = rows.reduce((total, row) => total + row.totalValue, 0);
  const resolvedLifetimeTotal = typeof lifetimeTotal === "number" && Number.isFinite(lifetimeTotal) ? lifetimeTotal : totalValue;
  const plottedIncome = plottedStartDay
    ? rows.filter((row) => row.day >= plottedStartDay && (!lastDay || row.day <= lastDay)).reduce((total, row) => total + row.totalValue, 0)
    : 0;
  let runningTotal = Math.max(0, resolvedLifetimeTotal - plottedIncome);

  if (plottedStartDay && lastDay) {
    const cursor = new Date(`${plottedStartDay}T00:00:00.000Z`);
    const end = new Date(`${lastDay}T00:00:00.000Z`);
    while (cursor <= end) {
      const day = cursor.toISOString().slice(0, 10);
      runningTotal += toNumber(rowByDay.get(day)?.totalValue);
      cumulativeTrend.push({ at: day, value: runningTotal });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  return {
    totalValue,
    salesCount: rows.reduce((total, row) => total + row.salesCount, 0),
    unitsSold: rows.reduce((total, row) => total + row.unitsSold, 0),
    trend: cumulativeTrend,
    requestedStartDay,
    availableStartDay: firstDay ?? null,
    partialRange: Boolean(firstDay && requestedStartDay && firstDay > requestedStartDay),
  };
}

export function formatMarketDay(value: string): string {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
