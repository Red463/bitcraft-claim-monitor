import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const nodeBin = process.execPath;
const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");

function run(command, args, env = {}) {
  return spawn(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
    env: { ...process.env, ...env },
  });
}

const localApiPort = process.env.LOCAL_API_PORT ?? "18430";
const vitePort = process.env.PORT ?? "18428";

const children = [
  run(nodeBin, [path.join(root, "server.mjs")], { LOCAL_API_PORT: localApiPort }),
  run(nodeBin, [viteBin, "--host", "0.0.0.0"], { PORT: vitePort, LOCAL_API_PORT: localApiPort }),
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
