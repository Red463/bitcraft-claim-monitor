import path from "node:path";

export function smokeServerEnvironment({ inherited, repoRoot, adminReview, port }) {
  return {
    ...inherited,
    APP_HOST: "127.0.0.1",
    APP_PORT: port,
    SERVE_STATIC: "true",
    BITCRAFT_PROCESS_ROLE: inherited.BITCRAFT_SMOKE_PROCESS_ROLE ?? "all",
    ENABLE_SERVER_POLLING: "false",
    ENABLE_SCHEDULED_JOBS: "false",
    ENABLE_DISCORD_STARTUP: "false",
    BITCRAFT_SMOKE_ADMIN_BYPASS: adminReview ? "true" : "false",
    BITCRAFT_LOCAL_DATA_DIR: adminReview
      ? path.join(repoRoot, ".codex-dev", "admin-review-data")
      : path.join(repoRoot, ".dev-data"),
  };
}
