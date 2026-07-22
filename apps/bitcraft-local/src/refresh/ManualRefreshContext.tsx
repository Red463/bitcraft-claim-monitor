import React from "react";

import { manualRefreshApplies } from "./manualRefresh.mjs";

export type ManualRefreshRequest = {
  id: string;
  page: string;
  sequence: number;
  requestedAt: number;
};

type ManualRefreshCoordinator = {
  beginTask: (requestId: string, taskKey: string) => (error?: unknown) => void;
};

type ManualRefreshContextValue = {
  request: ManualRefreshRequest | null;
  trackPromise: <T>(taskKey: string, promise: Promise<T>) => Promise<T>;
};

const ManualRefreshContext = React.createContext<ManualRefreshContextValue>({
  request: null,
  trackPromise: (_taskKey, promise) => promise,
});

export function ManualRefreshProvider({
  page,
  request,
  coordinator,
  children,
}: {
  page: string;
  request: ManualRefreshRequest | null;
  coordinator: ManualRefreshCoordinator;
  children: React.ReactNode;
}) {
  const activeRequest = manualRefreshApplies(request, page) ? request : null;
  const value = React.useMemo<ManualRefreshContextValue>(() => ({
    request: activeRequest,
    trackPromise: <T,>(taskKey: string, promise: Promise<T>) => {
      if (!activeRequest) return promise;
      const finish = coordinator.beginTask(activeRequest.id, taskKey);
      return promise
        .then((result) => {
          finish();
          return result;
        })
        .catch((error) => {
          finish(error);
          throw error;
        });
    },
  }), [activeRequest, coordinator]);

  return <ManualRefreshContext.Provider value={value}>{children}</ManualRefreshContext.Provider>;
}

export function useManualRefresh() {
  return React.useContext(ManualRefreshContext);
}
