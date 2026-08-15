import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  discoverRelayTopology,
  RelayGlobalCatalogSession,
} from "../dist-server/game-data/index.js";
import { collectGameIconEntries } from "./game-icon-catalog.mjs";

const sourceOriginArgument = process.argv.find((argument) => argument.startsWith("--source-origin="));
const sourceOrigin = String(sourceOriginArgument?.slice("--source-origin=".length) ?? "").replace(/\/+$/, "");
if (!sourceOrigin || new URL(sourceOrigin).protocol !== "https:") {
  throw new Error("Pass an HTTPS icon source with --source-origin=https://...");
}

const relayBaseUrl = String(
  process.env.BITCRAFT_RELAY_ORIGIN ?? "https://relay.bitcraftsync.app",
).replace(/\/+$/, "");
const publicRoot = fileURLToPath(new URL("../public/", import.meta.url));
const manifestPath = fileURLToPath(new URL("../assets/game-icons-manifest.json", import.meta.url));
const permissionReference = "docs/relay-migration/asset-permission.md";
const retrievedAt = new Date().toISOString();
const topology = await discoverRelayTopology(relayBaseUrl);
if (!topology.global?.ready || !topology.global.schemaFingerprint) {
  throw new Error("Relay global catalog is not ready");
}

const relayUrl = new URL(relayBaseUrl);
relayUrl.protocol = relayUrl.protocol === "https:" ? "wss:" : "ws:";
relayUrl.port = String(topology.global.port);
relayUrl.pathname = "/";
relayUrl.search = "";
relayUrl.hash = "";

const manifest = JSON.parse(await readFile(
  new URL("../src/server/game-data/bindings/schema-manifest.json", import.meta.url),
  "utf8",
));

let session;
let timeout;
const snapshot = await new Promise((resolve, reject) => {
  timeout = setTimeout(() => {
    reject(new Error("Timed out waiting for the Relay global catalog"));
  }, 60_000);
  session = new RelayGlobalCatalogSession({ onSnapshot: resolve });
  void session.start({
    uri: relayUrl.href.replace(/\/$/, ""),
    database: topology.global.database,
    schemaFingerprint: topology.global.schemaFingerprint,
    manifest,
    generation: 1,
  }).catch(reject);
});
clearTimeout(timeout);
await session.stop();

const iconEntries = collectGameIconEntries(snapshot);
const acquired = new Array(iconEntries.length);
const unavailable = [];
const failures = [];
let nextIndex = 0;

async function acquireWorker() {
  while (true) {
    const index = nextIndex++;
    if (index >= iconEntries.length) return;
    const [browserPath, catalogKeys] = iconEntries[index];
    const encodedSourcePath = browserPath.slice("/game-icons".length);
    const originalUrl = `${sourceOrigin}${encodedSourcePath}`;
    const relativeAssetPath = decodeURIComponent(browserPath.slice(1));
    const absoluteAssetPath = join(publicRoot, ...relativeAssetPath.split("/"));
    let existingBytes = null;
    try {
      existingBytes = await readFile(absoluteAssetPath);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    if (existingBytes) {
      acquired[index] = {
        catalogKey: catalogKeys[0],
        catalogKeys,
        originalUrl,
        localPath: relativeAssetPath,
        sha256: createHash("sha256").update(existingBytes).digest("hex"),
        retrievedAt,
      };
      continue;
    }

    let response;
    let lastError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        response = await fetch(originalUrl, {
          headers: { accept: "image/webp" },
          signal: AbortSignal.timeout(15_000),
        });
        if (response.ok) break;
        lastError = new Error(`HTTP ${response.status}`);
        if (response.status < 500 && response.status !== 429) break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!response?.ok) {
      const failure = {
        originalUrl,
        catalogKeys,
        status: response?.status ?? null,
        error: lastError?.message ?? `HTTP ${response?.status ?? "unknown"}`,
      };
      if (response?.status === 404) {
        unavailable.push({
          catalogKeys,
          originalUrl,
          reason: "source-not-found",
          observedAt: retrievedAt,
        });
      } else {
        failures.push(failure);
      }
      continue;
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    await mkdir(dirname(absoluteAssetPath), { recursive: true });
    await writeFile(absoluteAssetPath, bytes);
    acquired[index] = {
      catalogKey: catalogKeys[0],
      catalogKeys,
      originalUrl,
      localPath: relativeAssetPath,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      retrievedAt,
    };
    if ((index + 1) % 100 === 0 || index + 1 === iconEntries.length) {
      console.log(`Acquired ${index + 1}/${iconEntries.length} icon paths`);
    }
  }
}

await Promise.all(Array.from({ length: 12 }, () => acquireWorker()));
if (failures.length) {
  console.error(JSON.stringify({ failedCount: failures.length, failures }, null, 2));
  throw new Error(`Failed to acquire ${failures.length} game icons; manifest was not written`);
}

const availableAssets = acquired.filter(Boolean);
const output = {
  version: 1,
  permissionReference,
  source: {
    relayDatabase: snapshot.database,
    relaySchemaFingerprint: snapshot.schemaFingerprint,
    observedAt: snapshot.receivedAt,
  },
  assets: availableAssets,
  unavailable,
};
await mkdir(dirname(manifestPath), { recursive: true });
await writeFile(manifestPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  ok: true,
  assetCount: availableAssets.length,
  unavailableCount: unavailable.length,
  catalogIdentityCount: [...availableAssets, ...unavailable]
    .reduce((total, entry) => total + entry.catalogKeys.length, 0),
  manifestPath,
}, null, 2));
