export const CLIENT_MANUAL_REFRESH_COOLDOWN_MS: number;
export const CLIENT_MANUAL_REFRESH_HEADER: string;

export type ManualRefreshRequestShape = {
  id: string;
  page: string;
  sequence: number;
  requestedAt: number;
};

export type ManualRefreshTaskState = {
  requestId: string;
  status: "idle" | "refreshing" | "complete";
  pendingTasks: string[];
  errors: string[];
};

export type ManualRefreshTaskCoordinator = {
  beginRequest: (requestId: string) => void;
  beginTask: (requestId: string, taskKey: string) => (error?: unknown) => void;
  seal: (requestId: string) => void;
  snapshot: () => ManualRefreshTaskState;
};

export function createManualRefreshRequest(
  page: string,
  sequence: number,
  options?: { id?: string; now?: () => number; createId?: () => string },
): ManualRefreshRequestShape;

export function manualRefreshApplies(
  request: ManualRefreshRequestShape | null | undefined,
  page: string,
): boolean;

export function manualRefreshHeaders(
  request: ManualRefreshRequestShape | null | undefined,
  page: string,
): Record<string, string>;

export function cooldownRemainingMs(startedAt: number | null | undefined, now?: number): number;

export function createManualRefreshTaskCoordinator(options?: {
  onStateChange?: (state: ManualRefreshTaskState) => void;
}): ManualRefreshTaskCoordinator;
