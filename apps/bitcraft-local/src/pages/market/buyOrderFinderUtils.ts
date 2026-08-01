function decimalInteger(value: unknown): bigint | null {
  const normalized = String(value ?? "").trim();
  return /^\d+$/.test(normalized) ? BigInt(normalized) : null;
}

export function buyOrderQueryFromLocation(locationSearch: string): string {
  return new URLSearchParams(locationSearch).get("buyQ") ?? "";
}

export function buyOrderSearchTransition(appliedSearch: string, locationSearch: string) {
  const search = buyOrderQueryFromLocation(locationSearch);
  return { changed: appliedSearch !== search, search };
}

export function formatExactDecimalInteger(value: unknown): string {
  const digits = (decimalInteger(value) ?? 0n).toString();
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function sumExactDecimalIntegers(values: Iterable<unknown>): string {
  let total = 0n;
  for (const value of values) total += decimalInteger(value) ?? 0n;
  return total.toString();
}

export function maxExactDecimalInteger(values: Iterable<unknown>): string | null {
  let maximum: bigint | null = null;
  for (const value of values) {
    const candidate = decimalInteger(value);
    if (candidate != null && (maximum == null || candidate > maximum)) maximum = candidate;
  }
  return maximum?.toString() ?? null;
}
