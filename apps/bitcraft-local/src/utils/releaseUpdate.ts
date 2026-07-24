export type ReleaseUpdateDecision = "ignore" | "remember" | "updated" | "prompt" | "reload";

export const LAST_LOADED_RELEASE_BUILD_KEY = "bitcraft.release.last-loaded-build";

type ReleaseUpdateStorage = Pick<Storage, "getItem" | "setItem">;

export function readLastLoadedReleaseBuild(storage: ReleaseUpdateStorage): string {
  try {
    return String(storage.getItem(LAST_LOADED_RELEASE_BUILD_KEY) ?? "").trim();
  } catch {
    return "";
  }
}

export function writeLastLoadedReleaseBuild(storage: ReleaseUpdateStorage, buildId: string): boolean {
  const normalized = buildId.trim();
  if (!normalized) return false;
  try {
    storage.setItem(LAST_LOADED_RELEASE_BUILD_KEY, normalized);
    return true;
  } catch {
    return false;
  }
}

export function normalizeReleaseBuildId(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const buildId = (payload as { buildId?: unknown }).buildId;
  return typeof buildId === "string" ? buildId.trim() : "";
}

export function releaseUpdateDecision({
  currentBuildId,
  lastLoadedBuildId,
  nextBuildId,
  documentHidden,
}: {
  currentBuildId: string;
  lastLoadedBuildId: string;
  nextBuildId: string;
  documentHidden: boolean;
}): ReleaseUpdateDecision {
  const current = currentBuildId.trim();
  const lastLoaded = lastLoadedBuildId.trim();
  const next = nextBuildId.trim();
  if (!next || current === next) return "ignore";
  if (!current) return lastLoaded && lastLoaded !== next ? "updated" : "remember";
  return documentHidden ? "reload" : "prompt";
}
