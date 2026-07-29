import { readFile } from "node:fs/promises";

import {
  discoverRelayTopology,
  normalizeMembersPayload,
  RelayHttpClient,
  RelayPrimaryRegionPlayerSession,
  relayWebSocketUri,
} from "../dist-server/game-data/index.js";

const relayBaseUrl = String(
  process.env.BITCRAFT_RELAY_ORIGIN ?? "https://relay.bitcraftsync.app",
).replace(/\/+$/, "");
const claimId = String(
  process.env.BITCRAFT_CLAIM_ID ?? "1369094286777412590",
);
const timeoutMs = Math.max(
  5_000,
  Number(process.env.RELAY_REGIONAL_VERIFY_TIMEOUT_MS ?? 45_000),
);
const manifest = JSON.parse(await readFile(
  new URL("../src/server/game-data/bindings/schema-manifest.json", import.meta.url),
  "utf8",
));

const http = new RelayHttpClient({ baseUrl: relayBaseUrl });
const [topology, claimPayload, membersPayload] = await Promise.all([
  discoverRelayTopology(relayBaseUrl),
  http.claim(claimId),
  http.members(claimId),
]);
const claim = claimPayload?.claim ?? claimPayload;
const regionId = String(claim?.region ?? claim?.region_id ?? claim?.regionId ?? "");
const source = topology.regions.get(regionId);
if (!source?.ready || !source.schemaFingerprint) {
  throw new Error(`Relay region ${regionId || "(unknown)"} source is not ready`);
}
const members = normalizeMembersPayload(membersPayload).data;
if (!members.length) throw new Error("Relay member payload was empty");

let session;
let timeout;
try {
  const snapshot = await new Promise((resolve, reject) => {
    timeout = setTimeout(() => {
      const health = session?.health();
      reject(new Error(
        `Timed out waiting for Relay region ${regionId} player snapshot after ${timeoutMs}ms`
        + (health?.lastError ? `: ${health.lastError}` : ""),
      ));
    }, timeoutMs);
    session = new RelayPrimaryRegionPlayerSession({ onSnapshot: resolve });
    void session.start({
      uri: relayWebSocketUri(relayBaseUrl, source.port),
      database: source.database,
      schemaFingerprint: source.schemaFingerprint,
      manifest,
      generation: 1,
      regionId,
      members,
    }).catch(reject);
  });
  if (snapshot.players.length !== members.length) {
    throw new Error(
      `Regional player snapshot count ${snapshot.players.length} did not match member count ${members.length}`,
    );
  }
  const regionalRowsFound = snapshot.players.filter(
    ({ timePlayedSeconds }) => timePlayedSeconds != null,
  ).length;
  const expectedMemberIds = members.map(({ playerEntityId }) => playerEntityId).sort();
  const actualTypedRowIds = snapshot.players
    .filter(({ timePlayedSeconds }) => timePlayedSeconds != null)
    .map(({ playerEntityId }) => playerEntityId)
    .sort();
  if (
    regionalRowsFound === 0
    || snapshot.warnings.length > 0
    || JSON.stringify(actualTypedRowIds) !== JSON.stringify(expectedMemberIds)
  ) {
    throw new Error(
      `Regional player verification found ${regionalRowsFound} typed rows with ${snapshot.warnings.length} warnings`,
    );
  }
  console.log(JSON.stringify({
    ok: true,
    sourceKey: source.sourceKey,
    database: snapshot.database,
    schemaFingerprint: snapshot.schemaFingerprint,
    receivedAt: snapshot.receivedAt,
    memberCount: members.length,
    playerCount: snapshot.players.length,
    signedInCount: snapshot.players.filter(({ signedIn }) => signedIn).length,
    regionalRowsFound,
    warningCount: snapshot.warnings.length,
  }, null, 2));
} finally {
  clearTimeout(timeout);
  await session?.stop();
}
