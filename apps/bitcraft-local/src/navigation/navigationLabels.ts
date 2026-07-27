export function settlementNavigationLabel(claimName: unknown): string {
  return String(claimName ?? "").trim() || "Settlement";
}

export function settlementMarketTitle(claimName: unknown): string {
  return `${settlementNavigationLabel(claimName)} Market`;
}
