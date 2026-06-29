import { readFileSync as defaultReadFileSync } from "node:fs";
import path from "node:path";

export function currentAppBuildId({
  env = process.env,
  repoRoot = "",
  readFileSync = defaultReadFileSync,
  joinPath = path.join,
} = {}) {
  const envRevision = String(env.SOURCE_VERSION ?? env.RENDER_GIT_COMMIT ?? env.GITHUB_SHA ?? "").trim();
  if (envRevision) return envRevision.slice(0, 12);
  try {
    const gitDir = joinPath(repoRoot, ".git");
    const head = readFileSync(joinPath(gitDir, "HEAD"), "utf8").trim();
    if (head.startsWith("ref:")) {
      const refPath = head.slice(5).trim();
      const full = readFileSync(joinPath(gitDir, refPath), "utf8").trim();
      return full.slice(0, 12);
    }
    if (/^[a-f0-9]{40}$/i.test(head)) return head.slice(0, 12);
  } catch {}
  return "";
}

export function currentAppReleaseKey({ appVersion, buildId = "" }) {
  return buildId ? `${appVersion}+${buildId}` : appVersion;
}
