import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = path.join(rootDir, "artifacts", "api-server");
const webDir = path.join(rootDir, "artifacts", "bitcraft-monitor");

const apiPort = process.env.API_PORT ?? "8080";
const webPort = process.env.PORT ?? "19428";
const basePath = process.env.BASE_PATH ?? "/";
const apiProxyTarget = process.env.API_PROXY_TARGET ?? `http://localhost:${apiPort}`;

const nodeBin = process.execPath;
const viteBin = path.join(webDir, "node_modules", "vite", "bin", "vite.js");

if (!existsSync(viteBin)) {
  console.error("Vite is not installed. Run `corepack pnpm install` first.");
  process.exit(1);
}

function run(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    shell: false,
    ...options,
    env: {
      ...process.env,
      ...options.env,
    },
  });

  return child;
}

function runOnce(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = run(command, args, options);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with ${code ?? signal}`));
    });
    child.once("error", reject);
  });
}

if (process.env.SKIP_API_BUILD !== "1") {
  await runOnce(nodeBin, [path.join(apiDir, "build.mjs")], { cwd: apiDir });
}

const children = [
  run(nodeBin, ["--enable-source-maps", path.join(apiDir, "dist", "index.mjs")], {
    cwd: apiDir,
    env: { PORT: apiPort },
  }),
  run(nodeBin, [viteBin, "--config", "vite.config.ts", "--host", "0.0.0.0"], {
    cwd: webDir,
    env: {
      PORT: webPort,
      BASE_PATH: basePath,
      API_PROXY_TARGET: apiProxyTarget,
    },
  }),
];

function stopAll() {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
}

process.on("SIGINT", () => {
  stopAll();
  process.exit(130);
});

process.on("SIGTERM", () => {
  stopAll();
  process.exit(143);
});

for (const child of children) {
  child.once("exit", (code) => {
    stopAll();
    process.exit(code ?? 1);
  });
}
