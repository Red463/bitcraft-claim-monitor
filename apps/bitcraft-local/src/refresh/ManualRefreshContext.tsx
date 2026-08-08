import React from "react";

import type { PageRefreshCycle, PageRefreshTaskCoordinator } from "./pageRefresh.mjs";

export type ManualRefreshRequest = PageRefreshCycle;

type PageRefreshContextValue = {
  cycle: PageRefreshCycle | null;
  /** Compatibility alias for page modules that still name the cycle request. */
  request: PageRefreshCycle | null;
  trackPromise: <T>(taskKey: string, promise: Promise<T>) => Promise<T>;
};

const PageRefreshContext = React.createContext<PageRefreshContextValue>({
  cycle: null,
  request: null,
  trackPromise: (_taskKey, promise) => promise,
});

export function PageRefreshProvider({
  page,
  cycle,
  coordinator,
  children,
}: {
  page: string;
  cycle: PageRefreshCycle | null;
  coordinator: PageRefreshTaskCoordinator;
  children: React.ReactNode;
}) {
  const activeCycle = cycle?.id && cycle.page === page ? cycle : null;
  const value = React.useMemo<PageRefreshContextValue>(() => ({
    cycle: activeCycle,
    request: activeCycle,
    trackPromise: <T,>(taskKey: string, promise: Promise<T>) => {
      if (!activeCycle) return promise;
      return coordinator.trackPromise(activeCycle.id, taskKey, promise);
    },
  }), [activeCycle, coordinator]);

  return <PageRefreshContext.Provider value={value}>{children}</PageRefreshContext.Provider>;
}

export function usePageRefresh() {
  return React.useContext(PageRefreshContext);
}

export const ManualRefreshProvider = ({ request, ...props }: Omit<React.ComponentProps<typeof PageRefreshProvider>, "cycle"> & { request: PageRefreshCycle | null }) => (
  <PageRefreshProvider {...props} cycle={request} />
);

export const useManualRefresh = usePageRefresh;
