import { execFile, spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
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
const shouldForceRestart = process.argv.includes("--force-restart");

mkdirSync(logDir, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (message) => console.log(message);
const fail = (message) => console.error(message);

function execFileWithTimeout(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const child = execFile(command, args, { windowsHide: true }, (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(`${command} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
}

async function healthOk() {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const req = request(new URL(healthUrl), { method: "GET", timeout: 1_000 }, (res) => {
      res.resume();
      finish(Boolean(res.statusCode && res.statusCode >= 200 && res.statusCode < 500));
    });

    req.on("timeout", () => {
      req.destroy();
      finish(false);
    });
    req.on("error", () => finish(false));
    req.end();
  });
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

  log(`Stopping recorded smoke server PID ${pid}...`);
  try {
    process.kill(pid);
  } catch (error) {
    if (error?.code !== "ESRCH") fail(`Could not stop recorded smoke server PID ${pid}: ${error.message ?? error}`);
  }
  if (process.platform === "win32") {
    try {
      await execFileWithTimeout("taskkill.exe", ["/PID", String(pid), "/T", "/F"], 5_000);
    } catch (error) {
      const message = String(error?.message ?? error);
      if (!message.includes("not found") && !message.includes("not running")) {
        fail(`Windows taskkill could not stop recorded smoke server PID ${pid}: ${message}`);
      }
    }
  }

  const stopped = await waitForStopped();
  if (stopped) {
    rmSync(pidFile, { force: true });
    log("Recorded smoke server stopped.");
  }
  return stopped;
}

async function main() {
  const hardTimeout = setTimeout(() => {
    fail(`Smoke launcher timed out after 30s while waiting for ${healthUrl}.`);
    fail(`Check logs in ${logDir}.`);
    process.exit(1);
  }, 30_000);

  try {
    if (shouldForceRestart) {
      const stopped = await stopRecordedServer();
      if (!stopped && await healthOk()) {
        fail(`A server is still responding at ${healthUrl}. Stop it manually, then rerun this command.`);
        return 1;
      }
    }

    if (shouldRestart && !shouldForceRestart && await healthOk()) {
      log(`BitCraft local smoke server already running: http://127.0.0.1:${port}/`);
      log("Latest built frontend files are served from disk; no process restart needed for UI changes.");
      log("Use --force-restart only after backend/server changes.");
      return 0;
    }

    if (await healthOk()) {
      log(`BitCraft local smoke server already running: http://127.0.0.1:${port}/`);
      return 0;
    }

    if (!existsSync(distIndex)) {
      fail("Missing apps/bitcraft-local/dist/index.html. Run this first:");
      fail("corepack pnpm --filter @workspace/bitcraft-local run build");
      return 1;
    }

    const out = openSync(path.join(logDir, "bitcraft-local-smoke.out.log"), "a");
    const err = openSync(path.join(logDir, "bitcraft-local-smoke.err.log"), "a");

    log(`Starting smoke server on http://127.0.0.1:${port}/...`);
    const child = spawn(process.execPath, ["server.mjs"], {
      cwd: appDir,
      detached: true,
      stdio: ["ignore", out, err],
      env: {
        ...process.env,
        APP_HOST: "127.0.0.1",
        APP_PORT: port,
        SERVE_STATIC: "true",
        BITCRAFT_PROCESS_ROLE: process.env.BITCRAFT_SMOKE_PROCESS_ROLE ?? "all",
        ENABLE_SERVER_POLLING: "false",
        ENABLE_SCHEDULED_JOBS: "false",
        ENABLE_DISCORD_STARTUP: "false",
        BITCRAFT_LOCAL_DATA_DIR: path.join(repoRoot, ".dev-data"),
      },
    });

    writeFileSync(pidFile, `${child.pid}\n`);
    child.unref();
    closeSync(out);
    closeSync(err);

    log(`Waiting for health at ${healthUrl}...`);
    if (await waitForHealth()) {
      log(`BitCraft local smoke server running: http://127.0.0.1:${port}/`);
      log(`Logs: ${path.join(logDir, "bitcraft-local-smoke.out.log")}`);
      return 0;
    }

    fail(`BitCraft local smoke server did not become healthy at ${healthUrl}.`);
    fail(`Check logs in ${logDir}.`);
    return 1;
  } finally {
    clearTimeout(hardTimeout);
  }
}

process.exitCode = await main();
