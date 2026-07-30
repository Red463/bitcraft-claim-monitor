import { readFile } from "node:fs/promises";

import {
  discoverRelayTopology,
  RelayClaimMarketRegionSession,
  relayWebSocketUri,
} from "../dist-server/game-data/index.js";

const relayBaseUrl = String(
  process.env.BITCRAFT_RELAY_ORIGIN ?? "https://relay.bitcraftsync.app",
).replace(/\/+$/, "");
const claimId = String(
  process.env.BITCRAFT_CLAIM_ID ?? "1369094286777412590",
);
const regionId = String(process.env.BITCRAFT_REGION_ID ?? "19");
const timeoutMs = Math.max(
  5_000,
  Number(process.env.RELAY_CLAIM_MARKET_VERIFY_TIMEOUT_MS ?? 60_000),
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
        `Timed out waiting for Relay claim ${claimId} market after ${timeoutMs}ms`
        + (health?.lastError ? `: ${health.lastError}` : ""),
      ));
    }, timeoutMs);
    session = new RelayClaimMarketRegionSession({ onSnapshot: resolve });
    void session.start({
      uri: relayWebSocketUri(relayBaseUrl, source.port),
      database: source.database,
      schemaFingerprint: source.schemaFingerprint,
      manifest,
      generation: 1,
      regionId,
      claimId,
    }).catch(reject);
  });
  const crossClaimRows = snapshot.data.listings.filter(
    (listing) => listing.claimEntityId !== claimId || listing.regionId !== regionId,
  );
  if (crossClaimRows.length || snapshot.data.marketplaces.length === 0) {
    throw new Error(
      `Relay claim-market verification found ${crossClaimRows.length} cross-scope rows`
      + ` and ${snapshot.data.marketplaces.length} marketplace rows`,
    );
  }
  console.log(JSON.stringify({
    ok: true,
    claimId,
    regionId,
    sellOrders: snapshot.data.listings.filter(({ side }) => side === "sell").length,
    buyOrders: snapshot.data.listings.filter(({ side }) => side === "buy").length,
    marketplaces: snapshot.data.marketplaces.length,
    warnings: snapshot.warnings.length,
    database: snapshot.database,
    schemaFingerprint: snapshot.schemaFingerprint,
    receivedAt: snapshot.receivedAt,
  }));
} finally {
  clearTimeout(timeout);
  await session?.stop();
}
