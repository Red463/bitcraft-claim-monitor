import { readFile } from "node:fs/promises";

import {
  RelayHttpClient,
  RelayRegionClaimsRuntime,
  RelayRegionClaimsSession,
} from "../dist-server/game-data/index.js";

const relayBaseUrl = String(
  process.env.BITCRAFT_RELAY_ORIGIN ?? "https://relay.bitcraftsync.app",
).replace(/\/+$/, "");
const claimId = String(
  process.env.BITCRAFT_CLAIM_ID ?? "1369094286777412590",
);
const timeoutMs = Math.max(
  5_000,
  Number(process.env.RELAY_REGION_RECONNECT_VERIFY_TIMEOUT_MS ?? 90_000),
);
const maxIdsPerQuery = process.env.RELAY_REGION_RECONNECT_VERIFY_MAX_IDS_PER_QUERY == null
  ? null
  : Math.max(1, Number(process.env.RELAY_REGION_RECONNECT_VERIFY_MAX_IDS_PER_QUERY));
const manifest = JSON.parse(await readFile(
  new URL("../src/server/game-data/bindings/schema-manifest.json", import.meta.url),
  "utf8",
));

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
        reject(new Error(
          `Timed out waiting for ${label} after ${timeoutMs}ms`
          + `: ${JSON.stringify(runtime?.health?.() ?? {})}`,
        ));
        return;
      }
      setTimeout(poll, 50);
    };
    poll();
  });
}

const claimPayload = await new RelayHttpClient({ baseUrl: relayBaseUrl }).claim(claimId);
const claim = claimPayload?.claim ?? claimPayload;
const regionId = String(claim?.region ?? claim?.region_id ?? claim?.regionId ?? "");
if (!/^\d+$/.test(regionId)) throw new Error("Relay claim payload has no valid region id");

let nextGeneration = 1;
const commits = [];
const healthWrites = [];
const sessions = [];
const runtime = new RelayRegionClaimsRuntime({
  manifest,
  reconnectDelayMs: () => 10,
  createSession: (options) => {
    const sessionNumber = sessions.length + 1;
    const observed = {
      number: sessionNumber,
      failure: options.onFailure,
      snapshots: [],
    };
    sessions.push(observed);
    const session = new RelayRegionClaimsSession({
      ...options,
      onSnapshot: async (snapshot) => {
        observed.snapshots.push(snapshot);
        await options.onSnapshot(snapshot);
      },
    });
    return {
      start: (config) => session.start({
        ...config,
        ...(maxIdsPerQuery == null ? {} : { maxIdsPerQuery }),
      }),
      health: () => session.health(),
      stop: () => session.stop(),
    };
  },
  currentStateRepository: {
    nextGeneration: () => nextGeneration++,
    commitGeneration: async (batch) => commits.push(batch),
    markError: async () => {},
    recordSubscriptionHealth: async (health, observedAt) => {
      healthWrites.push({ ...health, observedAt });
    },
  },
});

try {
  await runtime.start({ relayBaseUrl, claimId, regionId });
  const firstSnapshot = await waitFor(
    () => sessions[0]?.snapshots[0],
    `initial Relay region ${regionId} claims generation`,
  );
  sessions[0].failure("simulated reconnect drill");
  const secondSnapshot = await waitFor(
    () => sessions[1]?.snapshots[0],
    `reconnected Relay region ${regionId} claims generation`,
  );
  await waitFor(
    () => commits.some((batch) => batch.generation >= 2),
    "reconnected repository commit",
  );

  const invalidCommit = commits.find((batch) => (
    batch.claimId !== claimId
    || batch.domains?.["region-claims"]?.provenance?.regionId !== regionId
    || batch.domains?.["region-claims"]?.provenance?.sourceKey !== `region:${regionId}`
  ));
  if (invalidCommit) throw new Error("Reconnect drill observed a cross-claim or cross-region commit");
  const reconnectHealth = healthWrites.find((health) => health.reconnects >= 1 && health.connected);
  if (!reconnectHealth) throw new Error("Reconnect drill did not persist connected reconnect health");

  console.log(JSON.stringify({
    ok: true,
    claimId,
    regionId,
    database: secondSnapshot.database,
    schemaFingerprint: secondSnapshot.schemaFingerprint,
    sessionCount: sessions.length,
    committedGenerations: commits.map(({ generation }) => generation),
    initialClaimCount: firstSnapshot.data.claims.length,
    reconnectedClaimCount: secondSnapshot.data.claims.length,
    reconnects: reconnectHealth.reconnects,
  }));
} finally {
  await runtime.stop();
}
