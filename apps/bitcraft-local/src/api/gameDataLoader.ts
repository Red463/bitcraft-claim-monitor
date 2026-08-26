import React from "react";

import type { AnyRecord } from "../main-app-data";
import type { PageRefreshCycle } from "../refresh/pageRefresh.mjs";
import { pageRefreshHeaders } from "../refresh/pageRefresh.mjs";
import type { ActivePanel, LoadState } from "../types/app";
import { loadGameDataWithPayloadBytes } from "./gameData.ts";
import { pageDomains } from "./pageDomains.ts";
import { createPageNavigationCache } from "./pageNavigationCache.ts";

type PageFreshness = { updatedAt: string; cacheState: string | null; stale: boolean };
type PageNavigationCache = ReturnType<typeof createPageNavigationCache<AnyRecord>>;
const pageNavigationCache = createPageNavigationCache<AnyRecord>();

export function gameDataScopeKey(claimId: string, activePanel: ActivePanel): string {
  return `${claimId}:${activePanel}`;
}

export function cacheGameDataForNavigation(
  cache: PageNavigationCache,
  scopeKey: string,
  claimId: string,
  panel: ActivePanel,
  data: AnyRecord,
  payloadBytes: number | undefined,
  freshness: Partial<PageFreshness> = {},
): AnyRecord {
  const responseMeta = data.responseMeta as AnyRecord | null | undefined;
  cache.set(scopeKey, {
    claimId,
    panel,
    data,
    payloadBytes,
    generation: responseMeta?.newestGeneration == null ? null : String(responseMeta.newestGeneration),
    coherence: responseMeta?.coherence == null ? null : String(responseMeta.coherence),
    ...stateFreshness(freshness),
  });
  return data;
}

export function clearPreviousClaimNavigationCache(
  cache: PageNavigationCache,
  previousClaimId: string,
  nextClaimId: string,
): void {
  if (previousClaimId && nextClaimId && previousClaimId !== nextClaimId) cache.clearClaim(previousClaimId);
}

export function clearPreviousClaimGameData(previousClaimId: string, nextClaimId: string): void {
  clearPreviousClaimNavigationCache(pageNavigationCache, previousClaimId, nextClaimId);
}

function freshnessFromPayload(data: AnyRecord, fallbackMs = Date.now()): PageFreshness {
  const serverFreshness = data?.serverFreshness ?? {};
  const updatedAt = String(
    serverFreshness.lastSuccessAt
      ?? serverFreshness.collectedAt
      ?? serverFreshness.cachedAt
      ?? new Date(fallbackMs).toISOString(),
  );
  const cacheState = serverFreshness.cacheState == null
    ? null
    : String(serverFreshness.cacheState);
  const stale = Boolean(
    data?.stale
      || serverFreshness.stale
      || cacheState === "stale-if-error",
  );
  return { updatedAt, cacheState, stale };
}

function stateFreshness(freshness?: Partial<PageFreshness>): Partial<PageFreshness> {
  if (!freshness) return {};
  return {
    ...(freshness.updatedAt === undefined ? {} : { updatedAt: freshness.updatedAt }),
    ...(freshness.cacheState === undefined ? {} : { cacheState: freshness.cacheState }),
    ...(freshness.stale === undefined ? {} : { stale: freshness.stale }),
  };
}

function qualityState(data: unknown): Pick<LoadState<unknown>, "domainStatus" | "responseMeta"> {
  if (!data || typeof data !== "object") return {};
  const payload = data as AnyRecord;
  return {
    ...(payload.domainStatus && typeof payload.domainStatus === "object"
      ? { domainStatus: payload.domainStatus }
      : {}),
    ...(payload.responseMeta && typeof payload.responseMeta === "object"
      ? { responseMeta: payload.responseMeta }
      : {}),
  };
}

export function beginGameDataScope<T>(
  previous: LoadState<T>,
  scopeKey: string,
  cached?: Partial<PageFreshness> & { data: T },
): LoadState<T> {
  if (previous.scopeKey === scopeKey) {
    return { ...previous, loading: true, error: null };
  }
  return {
    data: cached?.data ?? null,
    error: null,
    loading: true,
    scopeKey,
    ...stateFreshness(cached),
    ...qualityState(cached?.data),
  };
}

export function completeGameDataScope<T>(
  previous: LoadState<T>,
  scopeKey: string,
  data: T | null,
  freshness?: Partial<PageFreshness>,
): LoadState<T> {
  if (previous.scopeKey !== scopeKey) return previous;
  return {
    data,
    error: null,
    loading: false,
    scopeKey,
    ...stateFreshness(freshness),
    ...qualityState(data),
  };
}

export function completeEmptyGameDataScope<T>(
  previous: LoadState<T>,
  scopeKey: string,
): LoadState<T> {
  return completeGameDataScope(beginGameDataScope(previous, scopeKey), scopeKey, null);
}

export function useGameData(
  claimId: string,
  activePanel: ActivePanel,
  pageRefreshCycle: PageRefreshCycle | null,
  trackPageRefreshPromise: <T>(taskKey: string, promise: Promise<T>) => Promise<T> = (
    _taskKey,
    promise,
  ) => promise,
): LoadState<AnyRecord> {
  const domains = pageDomains(activePanel);
  const requestedScopeKey = gameDataScopeKey(claimId, activePanel);
  const [state, setState] = React.useState<LoadState<AnyRecord>>({
    data: null,
    error: null,
    loading: true,
    scopeKey: requestedScopeKey,
  });

  React.useEffect(() => {
    const cached = pageNavigationCache.get(requestedScopeKey);
    const refreshHeaders = pageRefreshHeaders(pageRefreshCycle, activePanel);
    if (domains.length === 0) {
      setState((previous) => completeEmptyGameDataScope(previous, requestedScopeKey));
      return;
    }
    setState((previous) => beginGameDataScope(previous, requestedScopeKey, cached));
    if (!pageRefreshCycle || pageRefreshCycle.page !== activePanel) return;

    let cancelled = false;
    const controller = new AbortController();
    async function load() {
      try {
        const result = await loadGameDataWithPayloadBytes(
          claimId,
          domains,
          fetch,
          { headers: { ...refreshHeaders }, signal: controller.signal },
        );
        const raw = result.data;
        const freshness = freshnessFromPayload(raw);
        cacheGameDataForNavigation(pageNavigationCache, requestedScopeKey, claimId, activePanel, raw, result.payloadBytes, freshness);
        if (!cancelled) {
          React.startTransition(() => {
            setState((previous) => completeGameDataScope(previous, requestedScopeKey, raw, freshness));
          });
        }
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        setState((previous) => ({
          ...previous,
          data: previous.data,
          loading: false,
          error: error instanceof Error ? error.message : String(error),
          stale: Boolean(previous.data) || previous.stale,
        }));
        throw error;
      }
    }
    void trackPageRefreshPromise("main-data", load()).catch(() => {});
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    activePanel,
    claimId,
    pageRefreshCycle?.sequence,
    requestedScopeKey,
    trackPageRefreshPromise,
  ]);

  return state;
}
