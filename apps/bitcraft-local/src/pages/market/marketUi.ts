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
