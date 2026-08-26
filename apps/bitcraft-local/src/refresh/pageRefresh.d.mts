import type { ActivePanel } from "../types/app.ts";

export type PageRefreshReason = "initial" | "near-live" | "generation" | "interval" | "manual" | "visibility-catch-up";

export type PageRefreshPolicy =
  | { mode: "near-live"; coalesceMs: number }
  | { mode: "interval" }
  | { mode: "manual" };

export type PageRefreshCycle = {
  id: string;
  page: ActivePanel;
  sequence: number;
  reason: PageRefreshReason;
  requestedAt: number;
};

export const PAGE_REFRESH_POLL_MS: number;
export const PAGE_REFRESH_COALESCE_MS: number;
export const PAGE_REFRESH_BACKOFF_MS: readonly number[];
export function createDelayedRefreshTask<T>(
  start: () => Promise<T> | T,
  delayMs: number,
  options?: {
    setTimeout?: (callback: () => void, delayMs: number) => unknown;
    clearTimeout?: (timer: unknown) => void;
  },
): { promise: Promise<T>; cancel: () => void };
export function pageRefreshPolicy(page: ActivePanel): PageRefreshPolicy;
export function pageRefreshShowsRetainedDataProgress(cycle: PageRefreshCycle | null | undefined): boolean;
export function createPageRefreshCycle(
  page: ActivePanel,
  sequence: number,
  reason: PageRefreshReason,
  options?: { now?: () => number; createId?: () => string },
): PageRefreshCycle;
export function pageRefreshHeaders(cycle: PageRefreshCycle | null | undefined, page: ActivePanel): Record<string, string>;

export type PageRefreshTaskState = {
  cycleId: string;
  status: "idle" | "refreshing" | "complete";
  pendingTasks: string[];
  errors: string[];
  lastSuccessfulAt: number | null;
  visibleProgress: boolean;
};

export type PageRefreshTaskCoordinator = {
  beginCycle: (cycle: PageRefreshCycle) => void;
  beginTask: (cycleId: string, taskKey: string) => (error?: unknown) => void;
  seal: (cycleId: string) => void;
  snapshot: () => PageRefreshTaskState;
  trackPromise: <T>(cycleId: string, taskKey: string, promise: Promise<T>) => Promise<T>;
};

export function createPageRefreshTaskCoordinator(options?: {
  now?: () => number;
  onStateChange?: (state: PageRefreshTaskState) => void;
  onComplete?: (cycle: PageRefreshCycle, succeeded: boolean) => void;
}): PageRefreshTaskCoordinator;

export type PageRefreshController = {
  start: () => PageRefreshCycle | null;
  stop: () => void;
  setPage: (page: ActivePanel) => PageRefreshCycle | null;
  restart: () => PageRefreshCycle | null;
  setIntervalMs: (intervalMs: number) => void;
  setVisible: (visible: boolean) => void;
  requestManual: () => PageRefreshCycle | null;
  invalidateNearLive: () => void;
  invalidateGeneration: () => void;
  complete: (cycleId: string, succeeded: boolean) => void;
};

export function createPageRefreshController(options: {
  page: ActivePanel;
  intervalMs: number;
  visible?: boolean;
  now?: () => number;
  setTimeout?: (callback: () => void, delay: number) => unknown;
  clearTimeout?: (timer: unknown) => void;
  createId?: () => string;
  onCycle?: (cycle: PageRefreshCycle) => void;
}): PageRefreshController;
