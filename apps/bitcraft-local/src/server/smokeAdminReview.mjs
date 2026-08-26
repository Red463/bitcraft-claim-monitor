import path from "node:path";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);
const adminProtectedMutationPaths = new Set(["/api/local/market/event/resolve"]);
const readOnlyMessage = "Smoke administrator review mode is read-only";

function samePath(left, right) {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

export function resolveSmokeAdminReviewMode({ env, isProduction, repoRoot, dataDir }) {
  const enabled = env.BITCRAFT_SMOKE_ADMIN_BYPASS === "true"
    && !isProduction
    && env.APP_HOST === "127.0.0.1"
    && samePath(dataDir, path.join(repoRoot, ".codex-dev", "admin-review-data"));

  return enabled ? {
    enabled: true,
    user: {
      id: 0,
      username: "Smoke review",
      password_hash: "",
      role: "owner",
      discord_id: "",
      discord_username: "",
      discord_global_name: "",
      discord_avatar: "",
      active: 1,
    },
  } : { enabled: false, user: null };
}

export function smokeAdminReviewMutationRejection(req, mode) {
  const pathname = String(req.url ?? "").split("?", 1)[0];
  return mode.enabled
    && (pathname.startsWith("/api/local/admin/") || adminProtectedMutationPaths.has(pathname))
    && !safeMethods.has(req.method ?? "")
    ? readOnlyMessage
    : null;
}
