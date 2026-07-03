export type ReleaseUpdateDecision = "ignore" | "remember" | "prompt" | "reload";

export function normalizeReleaseBuildId(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const buildId = (payload as { buildId?: unknown }).buildId;
  return typeof buildId === "string" ? buildId.trim() : "";
}

export function releaseUpdateDecision({ currentBuildId, nextBuildId, documentHidden }: { currentBuildId: string; nextBuildId: string; documentHidden: boolean }): ReleaseUpdateDecision {
  const current = currentBuildId.trim();
  const next = nextBuildId.trim();
  if (!next || current === next) return "ignore";
  if (!current) return "remember";
  return documentHidden ? "reload" : "prompt";
}