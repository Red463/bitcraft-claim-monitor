export function resourceViewportDecision({ selectionKey, snapshotSelectionKey, consumedSelectionKey, loading = false, points, isVisible }) {
  if (!selectionKey) return "preserve";
  if (selectionKey !== snapshotSelectionKey) return "wait";
  if (loading) return "wait";
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

export function resourceLayerStatus({ selectionKey, snapshotSelectionKey, available, status, pending, reason, visible, freshness }) {
  if (selectionKey && selectionKey !== snapshotSelectionKey) return "loading";
  if (status === "loading" || (status === "partial" && pending !== false)) return "loading";
  if (status == null && selectionKey && selectionKey === snapshotSelectionKey && available === false && reason === "Live resource positions are unavailable.") return "loading";
  if (available === false) return "unavailable";
  return visible ? freshness : "hidden";
}
