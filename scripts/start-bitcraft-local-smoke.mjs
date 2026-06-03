import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appDir = path.join(repoRoot, "apps", "bitcraft-local");
const distIndex = path.join(appDir, "dist", "index.html");
const logDir = path.join(repoRoot, ".codex-dev");
const port = String(process.env.APP_PORT ?? process.env.PORT ?? "18449");
const healthUrl = `http://127.0.0.1:${port}/api/local/health`;

mkdirSync(logDir, { recursive: true });

async function healthOk() {
  try {
    const response = await fetch(healthUrl);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForHealth() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (await healthOk()) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

if (await healthOk()) {
  console.log(`BitCraft local smoke server already running: http://127.0.0.1:${port}/`);
  process.exit(0);
}

if (!existsSync(distIndex)) {
  console.error("Missing apps/bitcraft-local/dist/index.html. Run this first:");
  console.error("corepack pnpm --filter @workspace/bitcraft-local run build");
  process.exit(1);
}

const out = openSync(path.join(logDir, "bitcraft-local-smoke.out.log"), "a");
const err = openSync(path.join(logDir, "bitcraft-local-smoke.err.log"), "a");

const child = spawn(process.execPath, ["server.mjs"], {
  cwd: appDir,
  detached: true,
  stdio: ["ignore", out, err],
  env: {
    ...process.env,
    APP_HOST: "127.0.0.1",
    APP_PORT: port,
    SERVE_STATIC: "true",
    ENABLE_SERVER_POLLING: "false",
    BITCRAFT_LOCAL_DATA_DIR: path.join(repoRoot, ".dev-data"),
  },
});

writeFileSync(path.join(logDir, "bitcraft-local-smoke.pid"), `${child.pid}\n`);
child.unref();

if (await waitForHealth()) {
  console.log(`BitCraft local smoke server running: http://127.0.0.1:${port}/`);
  console.log(`Logs: ${path.join(logDir, "bitcraft-local-smoke.out.log")}`);
  process.exit(0);
}

console.error(`BitCraft local smoke server did not become healthy at ${healthUrl}.`);
console.error(`Check logs in ${logDir}.`);
process.exit(1);
