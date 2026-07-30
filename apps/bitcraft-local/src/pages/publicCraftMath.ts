function decimalInteger(value: unknown): bigint | null {
  const normalized = typeof value === "bigint"
    ? value.toString()
    : String(value ?? "").trim();
  return /^\d+$/.test(normalized) ? BigInt(normalized) : null;
}

export function remainingCraftEffort(
  totalActionsRequired: unknown,
  progress: unknown,
): string | null {
  const total = decimalInteger(totalActionsRequired);
  const completed = decimalInteger(progress);
  if (total == null || completed == null) return null;
  return (total > completed ? total - completed : 0n).toString();
}

export function compareCraftEffort(left: unknown, right: unknown): number {
  const leftValue = decimalInteger(left);
  const rightValue = decimalInteger(right);
  if (leftValue == null || rightValue == null) {
    return leftValue == null ? (rightValue == null ? 0 : -1) : 1;
  }
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
}

export function formatCraftEffort(value: unknown, locales?: string | string[]): string {
  const exact = decimalInteger(value);
  return exact == null ? "-" : exact.toLocaleString(locales);
}
