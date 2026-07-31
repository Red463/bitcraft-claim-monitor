import React from "react";

import type { AnyRecord } from "../main-app-data";
import type { ManualRefreshRequest } from "../refresh/ManualRefreshContext";
import { manualRefreshHeaders } from "../refresh/manualRefresh.mjs";
import type { ActivePanel, LoadState } from "../types/app";
import { loadGameData } from "./gameData.ts";
import { pageDomains } from "./pageDomains.ts";

type PageFreshness = { updatedAt: string; cacheState: string | null; stale: boolean };
const pageNavigationCache = new Map<string, PageFreshness & { data: AnyRecord }>();

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

function loadedState(data: AnyRecord): LoadState<AnyRecord> {
  return {
    loading: false,
    error: null,
    data,
    ...freshnessFromPayload(data),
  };
}

export function useGameData(
  refreshToken: number,
  claimId: string,
  activePanel: ActivePanel,
  manualRefreshRequest: ManualRefreshRequest | null = null,
  trackManualRefreshPromise: <T>(taskKey: string, promise: Promise<T>) => Promise<T> = (
    _taskKey,
    promise,
  ) => promise,
): LoadState<AnyRecord> {
  const [state, setState] = React.useState<LoadState<AnyRecord>>({
    data: null,
    error: null,
    loading: true,
  });

  React.useEffect(() => {
    const cacheKey = `${claimId}:${activePanel}`;
    const cached = pageNavigationCache.get(cacheKey);
    const domains = pageDomains(activePanel);
    const manualHeaders = manualRefreshHeaders(manualRefreshRequest, activePanel);
    if (domains.length === 0) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    if (cached) {
      setState({
        loading: true,
        error: null,
        data: cached.data,
        updatedAt: cached.updatedAt,
        cacheState: cached.cacheState,
        stale: cached.stale,
      });
    }

    let cancelled = false;
    const controller = new AbortController();
    async function load() {
      try {
        const raw = await loadGameData(
          claimId,
          domains,
          fetch,
          { headers: { ...manualHeaders }, signal: controller.signal },
        );
        const freshness = freshnessFromPayload(raw);
        pageNavigationCache.set(cacheKey, { data: raw, ...freshness });
        if (!cancelled) React.startTransition(() => setState(loadedState(raw)));
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        setState((previous) => ({
          ...previous,
          loading: false,
          error: error instanceof Error ? error.message : String(error),
          stale: Boolean(previous.data) || previous.stale,
        }));
        throw error;
      }
    }
    void trackManualRefreshPromise("main-data", load()).catch(() => {});
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    activePanel,
    claimId,
    manualRefreshRequest?.sequence,
    refreshToken,
    trackManualRefreshPromise,
  ]);

  return state;
}
