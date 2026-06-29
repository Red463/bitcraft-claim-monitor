const validProcessRoles = new Set(["web", "worker", "all"]);

export function resolveProcessRole(env = process.env, { isProduction = false } = {}) {
  const explicitRole = String(env.BITCRAFT_PROCESS_ROLE ?? env.BITCRAFT_SERVER_ROLE ?? "").trim().toLowerCase();
  if (validProcessRoles.has(explicitRole)) return explicitRole;
  return isProduction ? "web" : "all";
}

export function processRoleCapabilities(role) {
  if (role === "web") return { serveHttp: true, runBackgroundJobs: false };
  if (role === "worker") return { serveHttp: false, runBackgroundJobs: true };
  return { serveHttp: true, runBackgroundJobs: true };
}
