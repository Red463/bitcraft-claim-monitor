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

function exactInteger(value: unknown): bigint {
  const normalized = typeof value === "bigint"
    ? value.toString()
    : String(value ?? "0").replaceAll(",", "").trim();
  return /^\d+$/.test(normalized) ? BigInt(normalized) : 0n;
}

function compareExact(left: bigint, right: bigint): number {
  return left === right ? 0 : left > right ? 1 : -1;
}

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
  const grouped = new Map<string, { itemId: string | null; itemType: "item" | "cargo" | null; itemName: string; salesCount: number; unitsSold: bigint; totalValue: bigint; lastSoldAt: string }>();
  for (const event of events) {
    const itemName = String(event.item_name ?? event.itemName ?? "Unknown Item");
    const itemId = String(event.item_id ?? event.itemId ?? "").trim() || null;
    const rawItemType = String(event.item_type ?? event.itemType ?? "").trim().toLowerCase();
    const itemType = rawItemType === "cargo" || rawItemType === "1"
      ? "cargo"
      : rawItemType === "item" || rawItemType === "0" ? "item" : null;
    const key = itemId && itemType ? `${itemType}:${itemId}` : `name:${itemName}`;
    const current = grouped.get(key) ?? { itemId, itemType, itemName, salesCount: 0, unitsSold: 0n, totalValue: 0n, lastSoldAt: "" };
    current.salesCount += 1;
    current.unitsSold += exactInteger(event.quantity);
    current.totalValue += exactInteger(event.total_value ?? event.totalValue);
    current.lastSoldAt = String(current.lastSoldAt && current.lastSoldAt > String(event.occurred_at) ? current.lastSoldAt : event.occurred_at ?? "");
    grouped.set(key, current);
  }
  return [...grouped.values()]
    .sort((a, b) => compareExact(b.unitsSold, a.unitsSold) || compareExact(b.totalValue, a.totalValue))
    .map((item) => ({
      ...item,
      unitsSold: item.unitsSold.toString(),
      totalValue: item.totalValue.toString(),
      avgUnitPrice: item.unitsSold ? Number(item.totalValue) / Number(item.unitsSold) : 0,
    }))
    .slice(0, 20);
}

export function buildMarketRangeAnalytics(
  trades: AnyRecord[],
  endAt: string | Date | null | undefined,
  rangeDays: MarketIncomeRangeDays,
) {
  const selectedRangeDays = MARKET_INCOME_RANGES.some((range) => range.days === rangeDays)
    ? rangeDays
    : 7;
  const end = parseDateValue(endAt) ?? new Date();
  const endDay = end.toISOString().slice(0, 10);
  const start = new Date(`${endDay}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - (selectedRangeDays - 1));
  const startDay = start.toISOString().slice(0, 10);
  const selectedTrades = trades.filter((trade) => {
    const occurredAt = parseDateValue(trade.occurred_at ?? trade.occurredAt ?? trade.timestamp);
    if (!occurredAt) return false;
    const day = occurredAt.toISOString().slice(0, 10);
    return day >= startDay && day <= endDay;
  });
  return {
    trades: selectedTrades,
    topItems: buildMarketTopItems(selectedTrades),
    daily: buildMarketDaily(selectedTrades),
    totals: {
      confirmedSales: selectedTrades.length,
      confirmedUnits: selectedTrades.reduce(
        (total, trade) => total + exactInteger(trade.quantity),
        0n,
      ).toString(),
      trackedValue: selectedTrades.reduce(
        (total, trade) => total + exactInteger(trade.total_value ?? trade.totalValue ?? trade.total_price ?? trade.totalPrice),
        0n,
      ).toString(),
    },
  };
}

export function buildMarketDaily(events: AnyRecord[]) {
  const grouped = new Map<string, { day: string; salesCount: number; unitsSold: bigint; totalValue: bigint }>();
  for (const event of events) {
    const occurredAt = event.occurred_at ?? event.occurredAt;
    const parsed = parseDateValue(occurredAt);
    const day = parsed ? parsed.toISOString().slice(0, 10) : String(occurredAt ?? "").slice(0, 10) || "Unknown";
    const current = grouped.get(day) ?? { day, salesCount: 0, unitsSold: 0n, totalValue: 0n };
    current.salesCount += 1;
    current.unitsSold += exactInteger(event.quantity);
    current.totalValue += exactInteger(event.total_value ?? event.totalValue);
    grouped.set(day, current);
  }
  return [...grouped.values()]
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((row) => ({
      ...row,
      unitsSold: row.unitsSold.toString(),
      totalValue: row.totalValue.toString(),
    }));
}

export function buildMarketIncomeSummary(
  dailyRows: AnyRecord[],
  endAt?: string | Date | null,
  rangeDays: MarketIncomeRangeDays = 7,
  _lifetimeTotal?: number,
) {
  const rows = [...dailyRows]
    .map((row) => ({
      day: String(row.day ?? ""),
      salesCount: toNumber(row.salesCount ?? row.sales_count),
      unitsSold: exactInteger(row.unitsSold ?? row.units_sold),
      totalValue: exactInteger(row.totalValue ?? row.total_value),
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
  const selectedRows = requestedStartDay
    ? rows.filter((row) => row.day >= requestedStartDay && (!lastDay || row.day <= lastDay))
    : [];
  const cumulativeTrend: Array<{ at: string; value: number }> = [];
  const totalValue = selectedRows.reduce((total, row) => total + row.totalValue, 0n);
  let runningTotal = 0n;

  if (plottedStartDay && lastDay) {
    const cursor = new Date(`${plottedStartDay}T00:00:00.000Z`);
    const end = new Date(`${lastDay}T00:00:00.000Z`);
    while (cursor <= end) {
      const day = cursor.toISOString().slice(0, 10);
      runningTotal += rowByDay.get(day)?.totalValue ?? 0n;
      cumulativeTrend.push({ at: day, value: Number(runningTotal) });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  return {
    totalValue: totalValue.toString(),
    salesCount: selectedRows.reduce((total, row) => total + row.salesCount, 0),
    unitsSold: selectedRows.reduce((total, row) => total + row.unitsSold, 0n).toString(),
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
