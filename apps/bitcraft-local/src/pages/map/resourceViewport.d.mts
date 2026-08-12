export type ResourceViewportDecision = "wait" | "preserve" | "frame";

export function resourceViewportDecision<T>(input: {
  selectionKey: string;
  snapshotSelectionKey: string;
  consumedSelectionKey: string;
  loading?: boolean;
  points: readonly T[];
  isVisible: (point: T, index: number, points: readonly T[]) => boolean;
}): ResourceViewportDecision;

export function applyResourceViewport<T>(input: {
  selectionKey: string;
  snapshotSelectionKey: string;
  consumedSelectionKey: string;
  loading?: boolean;
  points: readonly T[];
  isVisible: (point: T, index: number, points: readonly T[]) => boolean;
  frame: (points: readonly T[]) => void;
}): string;

export function resourceLayerStatus(input: {
  selectionKey: string;
  snapshotSelectionKey: string;
  available: boolean | undefined;
  status?: "live" | "partial" | "stale" | "loading" | "unavailable";
  reason: string | null | undefined;
  visible: boolean;
  freshness: string;
}): "loading" | "unavailable" | "hidden" | string;
