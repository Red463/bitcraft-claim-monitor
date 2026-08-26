import { readFile } from "node:fs/promises";

import {
  discoverRelayTopology,
  RelayRegionalMarketRegionSession,
  relayWebSocketUri,
} from "../dist-server/game-data/index.js";

const relayBaseUrl = String(
  process.env.BITCRAFT_RELAY_ORIGIN ?? "https://relay.bitcraftsync.app",
).replace(/\/+$/, "");
const regionId = String(process.env.BITCRAFT_REGION_ID ?? "19");
const timeoutMs = Math.max(
  5_000,
  Number(process.env.RELAY_MARKET_VERIFY_TIMEOUT_MS ?? 60_000),
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
if (source.schemaFingerprint !== manifest.schemas?.regional?.fingerprint) {
  throw new Error("Relay regional schema fingerprint does not match generated bindings");
}
const bindings = await import("../dist-server/game-data/bindings/regional.js");
let firstNormalizedSnapshot;
let normalizedSnapshot;
let normalizedSnapshotCount = 0;
const normalizedSession = new RelayRegionalMarketRegionSession({
  loadBindings: async () => bindings,
  onSnapshot: (snapshot) => {
    normalizedSnapshotCount += 1;
    firstNormalizedSnapshot ??= snapshot;
    normalizedSnapshot = snapshot;
  },
});
await normalizedSession.start({
  uri: relayWebSocketUri(relayBaseUrl, source.port),
  database: source.database,
  schemaFingerprint: source.schemaFingerprint,
  manifest,
  generation: 1,
  regionId,
  maxIdsPerQuery: Number(process.env.RELAY_MARKET_VERIFY_IDS_PER_QUERY ?? 100),
});
const normalizedDeadline = Date.now() + timeoutMs;
while (!normalizedSnapshot && Date.now() < normalizedDeadline) {
  await new Promise((resolve) => setTimeout(resolve, 25));
}
const enrichmentDeadline = Date.now() + timeoutMs;
while (
  (
    normalizedSnapshotCount < 2
    || normalizedSnapshot?.warnings.includes(
      "Relay regional market optional enrichment is refreshing.",
    )
    || normalizedSession.health().stage !== "live"
  )
  && Date.now() < enrichmentDeadline
) {
  await new Promise((resolve) => setTimeout(resolve, 25));
}
const normalizedHealth = normalizedSession.health();
await normalizedSession.stop();
if (!normalizedSnapshot) {
  throw new Error(
    `Timed out waiting for normalized region ${regionId} market snapshot: `
    + JSON.stringify(normalizedHealth),
  );
}

const closedKinds = { item: 0, cargo: 0, unknown: 0 };
for (const row of normalizedSnapshot.data.closedListings) {
  closedKinds[String(row.itemType)] += 1;
}
const ordersWithLocation = normalizedSnapshot.data.orders.filter((row) => (
  Number.isSafeInteger(row.locationX)
  && Number.isSafeInteger(row.locationZ)
  && /^\d+$/.test(String(row.dimension ?? ""))
));
console.log(JSON.stringify({
  observedAt: new Date().toISOString(),
  regionId,
  database: source.database,
  schemaFingerprint: source.schemaFingerprint,
  counts: {
    orders: normalizedSnapshot.data.orders.length,
    ordersWithLocation: ordersWithLocation.length,
    marketClaimsWithLocation: new Set(
      ordersWithLocation.map((row) => String(row.claimEntityId)),
    ).size,
    closedListings: normalizedSnapshot.data.closedListings.length,
    stalls: normalizedSnapshot.data.stalls.length,
    closedClaims: new Set(
      normalizedSnapshot.data.closedListings.map((row) => String(row.claimEntityId)),
    ).size,
    closedOwners: new Set(
      normalizedSnapshot.data.closedListings.map((row) => String(row.ownerEntityId)),
    ).size,
  },
  basePublication: {
    orders: firstNormalizedSnapshot.data.orders.length,
    closedListings: firstNormalizedSnapshot.data.closedListings.length,
    stalls: firstNormalizedSnapshot.data.stalls.length,
    receivedAt: firstNormalizedSnapshot.receivedAt,
  },
  enrichmentPublication: normalizedSnapshotCount > 1 ? {
    orders: normalizedSnapshot.data.orders.length,
    closedListings: normalizedSnapshot.data.closedListings.length,
    stalls: normalizedSnapshot.data.stalls.length,
    receivedAt: normalizedSnapshot.receivedAt,
    delayMs: Date.parse(normalizedSnapshot.receivedAt)
      - Date.parse(firstNormalizedSnapshot.receivedAt),
  } : null,
  closedKinds,
  warnings: normalizedSnapshot.warnings,
  receivedAt: normalizedSnapshot.receivedAt,
  applyDurationMs: normalizedHealth.lastApplyDurationMs,
  rowCount: normalizedHealth.rowCount,
  baseStallCount: normalizedHealth.baseStallCount,
  activeStallCount: normalizedHealth.activeStallCount,
  stageAtPublication: normalizedHealth.stage,
}, null, 2));
