import { usePageRefresh } from "../refresh/ManualRefreshContext";

/**
 * Compatibility adapter for page modules that previously subscribed directly
 * to Relay generations. Their requests now follow the active page cycle, so
 * ordinary pages remain interval-driven and Craft Monitor alone is near-live.
 */
export function useGameDataGeneration(_claimId: string, _domains: string[]): number {
  return usePageRefresh().cycle?.sequence ?? 0;
}
