export type AdminLoadingStage = "pending-hidden" | "pending-visible" | "settled";

export function adminLoadingStage({
  authLoading,
  delayElapsed,
}: {
  authLoading: boolean;
  delayElapsed: boolean;
}): AdminLoadingStage {
  if (!authLoading) return "settled";
  return delayElapsed ? "pending-visible" : "pending-hidden";
}
