import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RELAY_REPOSITORY = "https://github.com/Red463/bitcraft-claim-monitor-relay";
const LEGACY_REPOSITORY = /Red463\/bitcraft-claim-monitor(?!-relay)/;
const LIVE_REFRESH_COPY = "Live updates apply immediately; local fallback refreshes every";

function bundleText(distDir) {
  return readdirSync(distDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:html|js)$/.test(entry.name))
    .map((entry) => readFileSync(path.join(entry.parentPath, entry.name), "utf8"))
    .join("\n");
}

export function verifyRelayRuntimeBoundaries(distDir) {
  const text = bundleText(distDir);
  if (!text.includes(RELAY_REPOSITORY)) {
    throw new Error("Built browser bundle is missing the standalone Relay repository URL");
  }
  if (LEGACY_REPOSITORY.test(text)) {
    throw new Error("Built browser bundle contains the maintained repository URL");
  }
  if (!text.includes(LIVE_REFRESH_COPY)) {
    throw new Error("Built browser bundle is missing immediate live-update refresh copy");
  }
  if (text.includes("Display refreshes every")) {
    throw new Error("Built browser bundle contains retired interval-only refresh copy");
  }
  return { ok: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  console.log(JSON.stringify(verifyRelayRuntimeBoundaries(path.join(appDir, "dist"))));
}
