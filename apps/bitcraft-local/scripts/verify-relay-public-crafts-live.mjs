import { readFile } from "node:fs/promises";

import {
  discoverRelayTopology,
  RelayPublicCraftRegionSession,
  relayWebSocketUri,
} from "../dist-server/game-data/index.js";

const relayBaseUrl = String(
  process.env.BITCRAFT_RELAY_ORIGIN ?? "https://relay.bitcraftsync.app",
).replace(/\/+$/, "");
const regionId = String(process.env.BITCRAFT_REGION_ID ?? "19");
const timeoutMs = Math.max(
  5_000,
  Number(process.env.RELAY_PUBLIC_CRAFT_VERIFY_TIMEOUT_MS ?? 90_000),
);
const manifest = JSON.parse(await readFile(
  new URL("../src/server/game-data/bindings/schema-manifest.json", import.meta.url),
  "utf8",
));

const topology = await discoverRelayTopology(relayBaseUrl);
const source = topology.regions.get(regionId);
if (!source?.ready || !source.schemaFingerprint) {
  throw new Error(`Relay region ${regionId} source is not ready`);
}

let session;
let timeout;
try {
  const snapshot = await new Promise((resolve, reject) => {
    timeout = setTimeout(() => {
      const health = session?.health();
      reject(new Error(
        `Timed out waiting for Relay region ${regionId} public crafts after ${timeoutMs}ms`
        + (health?.lastError ? `: ${health.lastError}` : ""),
      ));
    }, timeoutMs);
    session = new RelayPublicCraftRegionSession({ onSnapshot: resolve });
    void session.start({
      uri: relayWebSocketUri(relayBaseUrl, source.port),
      database: source.database,
      schemaFingerprint: source.schemaFingerprint,
      manifest,
      generation: 1,
      regionId,
    }).catch(reject);
  });
  if (snapshot.data.craftResults.length === 0) {
    throw new Error(`Relay region ${regionId} returned no public craft rows`);
  }
  const invalidRows = snapshot.data.craftResults.filter((row) => (
    row.regionId !== regionId
    || !/^\d+$/.test(String(row.entityId ?? ""))
    || !/^\d+$/.test(String(row.recipeId ?? ""))
  ));
  if (invalidRows.length) {
    throw new Error(
      `Relay region ${regionId} public craft snapshot contained ${invalidRows.length} invalid rows`,
    );
  }
  console.log(JSON.stringify({
    ok: true,
    regionId,
    publicCrafts: snapshot.data.craftResults.length,
    warnings: snapshot.warnings.length,
    database: snapshot.database,
    schemaFingerprint: snapshot.schemaFingerprint,
    generation: snapshot.generation,
    receivedAt: snapshot.receivedAt,
  }));
} finally {
  clearTimeout(timeout);
  await session?.stop();
}
