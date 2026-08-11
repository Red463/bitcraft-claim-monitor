export type DensePointPlan<T> = { visibleCount: number; points: T[] };

export function planDensePointDraw<T>(
  points: readonly T[],
  isVisible: (point: T, index: number, points: readonly T[]) => boolean,
  budget?: number,
): DensePointPlan<T>;
