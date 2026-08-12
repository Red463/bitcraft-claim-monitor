export function resourceViewportDecision({ selectionKey, snapshotSelectionKey, consumedSelectionKey, points, isVisible }) {
  if (!selectionKey) return "preserve";
  if (selectionKey !== snapshotSelectionKey) return "wait";
  if (selectionKey === consumedSelectionKey) return "preserve";
  if (!Array.isArray(points) || points.length === 0) return "wait";
  return points.some(isVisible) ? "preserve" : "frame";
}

export function applyResourceViewport(input) {
  const decision = resourceViewportDecision(input);
  if (decision === "wait") return input.consumedSelectionKey;
  if (decision === "frame") input.frame(input.points);
  return input.selectionKey || "";
}
