export type MarketAvailability = "any" | "sell" | "buy" | "both";

export function availabilityFlags(value: MarketAvailability) {
  return {
    availableOnly: value !== "any",
    hasSell: value === "sell" || value === "both",
    hasBuy: value === "buy" || value === "both",
  };
}

export function nextOptionIndex(current: number, count: number, key: string): number {
  if (count <= 0) return -1;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "ArrowUp") return current < 0 ? count - 1 : (current - 1 + count) % count;
  if (key === "ArrowDown") return current < 0 ? 0 : (current + 1) % count;
  return current;
}

export type MarketChartPoint = {
  x: number;
  y: number;
  price: number;
  label: string;
};

export function marketChartPoints(rows: Array<Record<string, unknown>>, width: number, height: number): MarketChartPoint[] {
  const values = rows.map((row) => ({
    price: Number(row.vwap ?? row.avgPrice ?? row.price),
    label: String(row.bucket ?? row.timestamp ?? row.createdAt ?? ""),
  })).filter((row) => Number.isFinite(row.price));
  if (!values.length) return [];
  const low = Math.min(...values.map((row) => row.price));
  const high = Math.max(...values.map((row) => row.price));
  const spread = high - low;
  return values.map((row, index) => ({
    ...row,
    x: values.length === 1 ? width / 2 : (index / (values.length - 1)) * width,
    y: spread === 0 ? height / 2 : height - ((row.price - low) / spread) * height,
  }));
}
