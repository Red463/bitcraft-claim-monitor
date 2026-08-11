import { readFile } from "node:fs/promises";

import {
  discoverRelayTopology,
  RelayMapSpatialSession,
  relayWebSocketUri,
} from "../dist-server/game-data/index.js";

const relayBaseUrl = String(process.env.BITCRAFT_RELAY_ORIGIN ?? "https://relay.bitcraftsync.app").replace(/\/+$/, "");
const claimId = String(process.env.BITCRAFT_CLAIM_ID ?? "1369094286777412590");
const regionId = String(process.env.BITCRAFT_REGION_ID ?? "19");
const playerIds = String(process.env.BITCRAFT_MAP_PLAYER_IDS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
const resourceIds = String(process.env.BITCRAFT_MAP_RESOURCE_IDS ?? "54").split(",").map((value) => value.trim()).filter(Boolean);
const enemyTypes = String(process.env.BITCRAFT_MAP_ENEMY_TYPES ?? "").split(",").map((value) => value.trim()).filter(Boolean);
const timeoutMs = Math.max(5_000, Number(process.env.RELAY_MAP_VERIFY_TIMEOUT_MS ?? 60_000));
const manifest = JSON.parse(await readFile(new URL("../src/server/game-data/bindings/schema-manifest.json", import.meta.url), "utf8"));
const topology = await discoverRelayTopology(relayBaseUrl);
const source = topology.regions.get(regionId);
if (!source?.ready || !source.schemaFingerprint) throw new Error(`Relay region ${regionId} source is not ready`);

let session;
let timeout;
try {
  const snapshot = await new Promise((resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(`Timed out waiting for map-spatial data: ${JSON.stringify(session?.health() ?? {})}`)), timeoutMs);
    session = new RelayMapSpatialSession({ onSnapshot: resolve, onFailure: (error) => reject(new Error(error)) });
    void session.start({
      uri: relayWebSocketUri(relayBaseUrl, source.port),
      database: source.database,
      schemaFingerprint: source.schemaFingerprint,
      manifest,
      generation: 1,
      scope: { claimId, regionId, playerIds, resourceIds, enemyTypes },
    }).catch(reject);
  });
  console.log(JSON.stringify({
    ok: true,
    claimId,
    regionId,
    schemaFingerprint: source.schemaFingerprint,
    counts: Object.fromEntries(Object.entries(snapshot.data).filter(([, value]) => Array.isArray(value)).map(([key, value]) => [key, value.length])),
    warnings: snapshot.warnings,
  }, null, 2));
} finally {
  clearTimeout(timeout);
  await session?.stop();
}
