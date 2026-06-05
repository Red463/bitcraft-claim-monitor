import { execFile, spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appDir = path.join(repoRoot, "apps", "bitcraft-local");
const distIndex = path.join(appDir, "dist", "index.html");
const logDir = path.join(repoRoot, ".codex-dev");
const pidFile = path.join(logDir, "bitcraft-local-smoke.pid");
const port = String(process.env.APP_PORT ?? process.env.PORT ?? "18449");
const healthUrl = `http://127.0.0.1:${port}/api/local/health`;
const shouldRestart = process.argv.includes("--restart");

mkdirSync(logDir, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function execFileWithTimeout(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = execFile(command, args, { windowsHide: true }, (error) => {
      if (timer) clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${command} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
}

async function healthOk() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1_000);
  try {
    const response = await fetch(healthUrl, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function waitForHealth() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (await healthOk()) return true;
    await sleep(500);
  }
  return false;
}

async function waitForStopped() {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (!(await healthOk())) return true;
    await sleep(250);
  }
  return false;
}

async function stopRecordedServer() {
  if (!existsSync(pidFile)) return false;
  const pid = Number.parseInt(readFileSync(pidFile, "utf8").trim(), 10);
  if (!Number.isFinite(pid) || pid <= 0) {
    rmSync(pidFile, { force: true });
    return false;
  }
  try {
    if (process.platform === "win32") {
      await execFileWithTimeout("taskkill.exe", ["/PID", String(pid), "/T", "/F"], 3_000);
    } else {
      process.kill(pid);
    }
  } catch (error) {
    if (error?.code !== "ESRCH") console.warn(`Could not stop recorded smoke server PID ${pid}: ${error.message ?? error}`);
  }
  const stopped = await waitForStopped();
  if (stopped) rmSync(pidFile, { force: true });
  return stopped;
}

if (shouldRestart) {
  const stopped = await stopRecordedServer();
  if (!stopped && await healthOk()) {
    console.error(`A server is still responding at ${healthUrl}. Stop it manually, then rerun this command.`);
    process.exit(1);
  }
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
    ENABLE_DISCORD_STARTUP: "false",
    BITCRAFT_LOCAL_DATA_DIR: path.join(repoRoot, ".dev-data"),
  },
});

writeFileSync(pidFile, `${child.pid}\n`);
child.unref();

if (await waitForHealth()) {
  console.log(`BitCraft local smoke server running: http://127.0.0.1:${port}/`);
  console.log(`Logs: ${path.join(logDir, "bitcraft-local-smoke.out.log")}`);
  process.exit(0);
}

console.error(`BitCraft local smoke server did not become healthy at ${healthUrl}.`);
console.error(`Check logs in ${logDir}.`);
process.exit(1);
