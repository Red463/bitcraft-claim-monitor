import { readFile } from "node:fs/promises";

import {
  discoverRelayTopology,
  relayWebSocketUri,
} from "../dist-server/game-data/index.js";

const relayBaseUrl = String(
  process.env.BITCRAFT_RELAY_ORIGIN ?? "https://relay.bitcraftsync.app",
).replace(/\/+$/, "");
const timeoutMs = Math.max(
  5_000,
  Number(process.env.RELAY_EMPIRE_FOUNDRY_VERIFY_TIMEOUT_MS ?? 30_000),
);
const manifest = JSON.parse(await readFile(
  new URL("../src/server/game-data/bindings/schema-manifest.json", import.meta.url),
  "utf8",
));
const topology = await discoverRelayTopology(relayBaseUrl);
const source = topology.global;
if (!source?.ready || !source.schemaFingerprint) {
  throw new Error("Relay global source is not ready");
}
if (source.schemaFingerprint !== manifest.schemas?.global?.fingerprint) {
  throw new Error("Relay global schema fingerprint does not match generated bindings");
}

const bindings = await import("../dist-server/game-data/bindings/global.js");
let connection;
let subscription;
let timeout;
try {
  const rows = await new Promise((resolve, reject) => {
    timeout = setTimeout(
      () => reject(new Error(`Timed out waiting for Empire Foundry rows after ${timeoutMs}ms`)),
      timeoutMs,
    );
    connection = bindings.DbConnection.builder()
      .withUri(relayWebSocketUri(relayBaseUrl, source.port))
      .withDatabaseName(source.database)
      .onConnect((connected) => {
        subscription = connected.subscriptionBuilder()
          .onApplied(() => {
            clearTimeout(timeout);
            resolve([...connected.db.empireFoundryState.iter()]);
          })
          .onError((_context, error) => reject(error))
          .subscribe(["SELECT * FROM empire_foundry_state"]);
      })
      .onConnectError((_context, error) => reject(error))
      .onDisconnect((_context, error) => {
        if (error) reject(error);
      })
      .build();
  });
  const normalized = rows.map((row) => {
    const startedMicros = (
      row.started?.microsSinceUnixEpoch?.toString?.()
      ?? row.started?.__timestamp_micros_since_unix_epoch__?.toString?.()
      ?? String(row.started ?? "")
    );
    return {
      entityId: row.entityId.toString(),
      empireEntityId: row.empireEntityId.toString(),
      hexiteCapsules: row.hexiteCapsules,
      queued: row.queued,
      startedMicros,
    };
  });
  const empireIds = new Set(normalized.map(({ empireEntityId }) => empireEntityId));
  const entityIds = new Set(normalized.map(({ entityId }) => entityId));
  const negativeCounts = normalized.filter(({ hexiteCapsules, queued }) => (
    hexiteCapsules < 0 || queued < 0
  ));
  if (entityIds.size !== normalized.length || negativeCounts.length) {
    throw new Error(
      `Empire Foundry rows have invalid identities or counts: `
      + `${normalized.length - entityIds.size} duplicate entity ids, ${negativeCounts.length} negative rows`,
    );
  }
  const foundriesPerEmpire = new Map();
  for (const row of normalized) {
    foundriesPerEmpire.set(
      row.empireEntityId,
      (foundriesPerEmpire.get(row.empireEntityId) ?? 0) + 1,
    );
  }
  console.log(JSON.stringify({
    ok: true,
    database: source.database,
    schemaFingerprint: source.schemaFingerprint,
    rowCount: normalized.length,
    empireCount: empireIds.size,
    maxFoundriesPerEmpire: Math.max(0, ...foundriesPerEmpire.values()),
    readyCapsules: normalized.reduce((total, row) => total + row.hexiteCapsules, 0),
    queuedCapsules: normalized.reduce((total, row) => total + row.queued, 0),
    activeFoundries: normalized.filter(({ startedMicros }) => BigInt(startedMicros) !== 0n).length,
    sample: normalized.slice(0, 5),
  }, null, 2));
} finally {
  clearTimeout(timeout);
  subscription?.unsubscribe();
  connection?.disconnect();
}
