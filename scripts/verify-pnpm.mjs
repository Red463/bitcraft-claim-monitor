import { rmSync } from "node:fs";

rmSync("package-lock.json", { force: true });
rmSync("yarn.lock", { force: true });

const userAgent = process.env.npm_config_user_agent ?? "";
const execPath = process.env.npm_execpath ?? "";

if (!userAgent.startsWith("pnpm/") && !execPath.includes("pnpm")) {
  console.error("Use pnpm instead of npm or yarn.");
  process.exit(1);
}
