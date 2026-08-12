export type ResourceViewportDecision = "wait" | "preserve" | "frame";

export function resourceViewportDecision<T>(input: {
  selectionKey: string;
  snapshotSelectionKey: string;
  consumedSelectionKey: string;
  points: readonly T[];
  isVisible: (point: T, index: number, points: readonly T[]) => boolean;
}): ResourceViewportDecision;

export function applyResourceViewport<T>(input: {
  selectionKey: string;
  snapshotSelectionKey: string;
  consumedSelectionKey: string;
  points: readonly T[];
  isVisible: (point: T, index: number, points: readonly T[]) => boolean;
  frame: (points: readonly T[]) => void;
}): string;
