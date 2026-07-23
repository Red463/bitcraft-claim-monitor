export type ReleaseUpdateDecision = "ignore" | "remember" | "prompt" | "reload";

export const AUTOMATIC_RELEASE_UPDATE_KEY = "bitcraft.release.auto-updated";

type ReleaseUpdateStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function markAutomaticReleaseUpdate(storage: ReleaseUpdateStorage): boolean {
  try {
    storage.setItem(AUTOMATIC_RELEASE_UPDATE_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

export function consumeAutomaticReleaseUpdate(storage: ReleaseUpdateStorage): boolean {
  try {
    const marked = storage.getItem(AUTOMATIC_RELEASE_UPDATE_KEY) === "1";
    storage.removeItem(AUTOMATIC_RELEASE_UPDATE_KEY);
    return marked;
  } catch {
    return false;
  }
}

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
