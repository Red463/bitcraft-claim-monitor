import { readFileSync as defaultReadFileSync } from "node:fs";
import path from "node:path";

export function currentAppBuildId({
  env = process.env,
  repoRoot = "",
  readFileSync = defaultReadFileSync,
  joinPath = path.join,
  isAbsolutePath = path.isAbsolute,
  resolvePath = path.resolve,
} = {}) {
  const envRevision = String(env.SOURCE_VERSION ?? env.RENDER_GIT_COMMIT ?? env.GITHUB_SHA ?? "").trim();
  if (envRevision) return envRevision.slice(0, 12);
  try {
    let gitDir = joinPath(repoRoot, ".git");
    try {
      const pointer = readFileSync(gitDir, "utf8").trim();
      if (/^gitdir:/i.test(pointer)) {
        const target = pointer.slice(pointer.indexOf(":") + 1).trim();
        if (!target) return "";
        gitDir = isAbsolutePath(target) ? target : resolvePath(repoRoot, target);
      }
    } catch {
      // A normal checkout has a .git directory rather than a pointer file.
    }
    const head = readFileSync(joinPath(gitDir, "HEAD"), "utf8").trim();
    if (head.startsWith("ref:")) {
      const refPath = head.slice(5).trim();
      let full;
      try {
        full = readFileSync(joinPath(gitDir, refPath), "utf8").trim();
      } catch {
        const commonTarget = readFileSync(joinPath(gitDir, "commondir"), "utf8").trim();
        if (!commonTarget) return "";
        const commonDir = isAbsolutePath(commonTarget) ? commonTarget : resolvePath(gitDir, commonTarget);
        full = readFileSync(joinPath(commonDir, refPath), "utf8").trim();
      }
      return /^[a-f0-9]{40}$/i.test(full) ? full.slice(0, 12) : "";
    }
    if (/^[a-f0-9]{40}$/i.test(head)) return head.slice(0, 12);
  } catch {}
  return "";
}

export function currentAppReleaseKey({ appVersion, buildId = "" }) {
  return buildId ? `${appVersion}+${buildId}` : appVersion;
}
export function currentAppAnnouncementKey({ appVersion }) {
  return String(appVersion ?? "").trim();
}

export function releaseVersionAlreadyAnnounced({ lastAnnounced = "", appVersion = "" }) {
  const version = currentAppAnnouncementKey({ appVersion });
  const previous = String(lastAnnounced ?? "").trim();
  return Boolean(version && (previous === version || previous.startsWith(`${version}+`)));
}
