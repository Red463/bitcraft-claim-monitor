import { readFile } from "node:fs/promises";

import {
  AdaptiveRegionSessionPool,
  discoverRelayTopology,
  RelayPublicCraftRegionSession,
  relayWebSocketUri,
} from "../dist-server/game-data/index.js";

const relayBaseUrl = String(
  process.env.BITCRAFT_RELAY_ORIGIN ?? "https://relay.bitcraftsync.app",
).replace(/\/+$/, "");
const primaryRegionId = String(process.env.BITCRAFT_REGION_ID ?? "19");
const timeoutMs = Math.max(
  5_000,
  Number(process.env.RELAY_REGION_POOL_VERIFY_TIMEOUT_MS ?? 90_000),
);
const manifest = JSON.parse(await readFile(
  new URL("../src/server/game-data/bindings/schema-manifest.json", import.meta.url),
  "utf8",
));
const topology = await discoverRelayTopology(relayBaseUrl);
const secondaryRegionIds = [...topology.regions.values()]
  .filter((source) => (
    source.ready
    && source.schemaFingerprint
    && source.sourceKey !== `region:${primaryRegionId}`
  ))
  .map((source) => source.sourceKey.slice("region:".length))
  .sort((left, right) => Number(left) - Number(right))
  .slice(0, 2);
if (secondaryRegionIds.length < 2) {
  throw new Error("Relay topology has fewer than two ready secondary regions");
}
const configuredRegionIds = [primaryRegionId, ...secondaryRegionIds];
const snapshots = new Map();
const sessions = new Map();

function waitFor(predicate, label) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const poll = () => {
      const result = predicate();
      if (result) {
        resolve(result);
        return;
      }
      if (Date.now() >= deadline) {
        reject(new Error(`Timed out waiting for ${label} after ${timeoutMs}ms`));
        return;
      }
      setTimeout(poll, 50);
    };
    poll();
  });
}

const pool = new AdaptiveRegionSessionPool({
  maxSessions: 2,
  idleCloseMs: 0,
  staggerMs: 10,
  createSession: (regionId) => {
    let session;
    return {
      start: async () => {
        const source = topology.regions.get(regionId);
        if (!source?.ready || !source.schemaFingerprint) {
          throw new Error(`Relay region ${regionId} is not ready`);
        }
        session = new RelayPublicCraftRegionSession({
          onSnapshot: (snapshot) => snapshots.set(regionId, snapshot),
        });
        sessions.set(regionId, session);
        await session.start({
          uri: relayWebSocketUri(relayBaseUrl, source.port),
          database: source.database,
          schemaFingerprint: source.schemaFingerprint,
          manifest,
          generation: 1,
          regionId,
        });
      },
      stop: async () => {
        await session?.stop();
        sessions.delete(regionId);
      },
      health: () => session?.health() ?? null,
    };
  },
});

let secondaryLease;
let tertiaryLease;
try {
  await pool.start({
    primaryRegionId,
    activeRegionIds: configuredRegionIds,
  });
  await waitFor(
    () => snapshots.get(primaryRegionId),
    `primary region ${primaryRegionId} generation`,
  );

  secondaryLease = await pool.acquire(secondaryRegionIds[0]);
  await waitFor(
    () => snapshots.get(secondaryRegionIds[0]),
    `secondary region ${secondaryRegionIds[0]} generation`,
  );
  await pool.acquire(secondaryRegionIds[1]).then(
    () => {
      throw new Error("Pool exceeded its hard two-session cap");
    },
    (error) => {
      if (!/capacity/i.test(String(error?.message ?? error))) throw error;
    },
  );

  await secondaryLease.release();
  secondaryLease = null;
  const closed = await pool.sweepIdle();
  if (!closed.includes(secondaryRegionIds[0])) {
    throw new Error("Pool did not idle-close the released secondary session");
  }
  if (!pool.health().sessions.some(({ regionId, pinned }) => (
    regionId === primaryRegionId && pinned
  ))) {
    throw new Error("Pool did not preserve its pinned primary session");
  }

  tertiaryLease = await pool.acquire(secondaryRegionIds[1]);
  await waitFor(
    () => snapshots.get(secondaryRegionIds[1]),
    `rotated region ${secondaryRegionIds[1]} generation`,
  );
  const health = pool.health();
  if (health.sessions.length !== 2) {
    throw new Error(`Pool ended with ${health.sessions.length} sessions instead of two`);
  }

  console.log(JSON.stringify({
    ok: true,
    primaryRegionId,
    configuredRegionIds,
    maxSessions: health.maxSessions,
    closed,
    openRegionIds: health.sessions.map(({ regionId }) => regionId),
    publicCraftCounts: Object.fromEntries(
      configuredRegionIds.map((regionId) => [
        regionId,
        snapshots.get(regionId)?.data?.craftResults?.length ?? null,
      ]),
    ),
  }));
} finally {
  await secondaryLease?.release();
  await tertiaryLease?.release();
  await pool.stop();
}
