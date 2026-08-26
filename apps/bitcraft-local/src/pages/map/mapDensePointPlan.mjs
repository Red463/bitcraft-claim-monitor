export function planDensePointDraw(points, isVisible, budget = 25_000) {
  if (!Number.isSafeInteger(budget) || budget <= 0) {
    throw new TypeError("Dense point budget must be a positive safe integer.");
  }
  const visible = points.filter(isVisible);
  const stride = Math.max(1, Math.ceil(visible.length / budget));
  return {
    visibleCount: visible.length,
    points: visible.filter((_, index) => index % stride === 0),
  };
}
