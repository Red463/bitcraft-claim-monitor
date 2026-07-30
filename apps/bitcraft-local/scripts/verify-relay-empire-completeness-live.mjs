import { readFile } from "node:fs/promises";

import {
  discoverRelayTopology,
  equalitySubscriptionQueries,
  relayWebSocketUri,
} from "../dist-server/game-data/index.js";

const relayBaseUrl = String(
  process.env.BITCRAFT_RELAY_ORIGIN ?? "https://relay.bitcraftsync.app",
).replace(/\/+$/, "");
const regionId = String(process.env.BITCRAFT_REGION_ID ?? "19");
const timeoutMs = Math.max(
  5_000,
  Number(process.env.RELAY_EMPIRE_VERIFY_TIMEOUT_MS ?? 60_000),
);
const manifest = JSON.parse(await readFile(
  new URL("../src/server/game-data/bindings/schema-manifest.json", import.meta.url),
  "utf8",
));

const tableSpecs = [
  { sql: "empire_state", accessor: "empireState", key: "entityId" },
  { sql: "empire_player_data_state", accessor: "empirePlayerDataState", key: "entityId" },
  { sql: "empire_rank_state", accessor: "empireRankState", key: "entityId" },
  { sql: "empire_settlement_state", accessor: "empireSettlementState", key: "buildingEntityId" },
  { sql: "empire_node_state", accessor: "empireNodeState", key: "entityId" },
  { sql: "empire_node_siege_state", accessor: "empireNodeSiegeState", key: "entityId" },
  { sql: "empire_chunk_state", accessor: "empireChunkState", key: "chunkIndex" },
];

function decimalString(value) {
  const normalized = typeof value === "bigint" ? value.toString() : String(value ?? "").trim();
  if (!/^\d+$/.test(normalized)) throw new Error(`Expected decimal identifier, received ${normalized || "(empty)"}`);
  return normalized;
}

function snakeCase(value) {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function canonical(value) {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonical(nested)]),
    );
  }
  return value;
}

function connectionSnapshot(bindings, { uri, database, queries, accessors, label }) {
  let connection;
  let subscription;
  let timeout;
  const ready = new Promise((resolve, reject) => {
    timeout = setTimeout(
      () => reject(new Error(`Timed out waiting for ${label} after ${timeoutMs}ms`)),
      timeoutMs,
    );
    connection = bindings.DbConnection.builder()
      .withUri(uri)
      .withDatabaseName(database)
      .onConnect((connected) => {
        subscription = connected.subscriptionBuilder()
          .onApplied(() => {
            clearTimeout(timeout);
            resolve({
              rows: Object.fromEntries(accessors.map((accessor) => [
                accessor,
                [...connected.db[accessor].iter()],
              ])),
              stop() {
                subscription?.unsubscribe();
                connected.disconnect();
              },
            });
          })
          .onError((_context, error) => {
            clearTimeout(timeout);
            reject(error);
          })
          .subscribe(queries);
      })
      .onConnectError((_context, error) => {
        clearTimeout(timeout);
        reject(error);
      })
      .onDisconnect((_context, error) => {
        if (error) reject(error);
      })
      .build();
  });
  return ready.catch((error) => {
    clearTimeout(timeout);
    subscription?.unsubscribe();
    connection?.disconnect();
    throw error;
  });
}

const topology = await discoverRelayTopology(relayBaseUrl);
const regionalSource = topology.regions.get(regionId);
const globalSource = topology.global;
if (!regionalSource?.ready || !regionalSource.schemaFingerprint) {
  throw new Error(`Relay region ${regionId} source is not ready`);
}
if (!globalSource?.ready || !globalSource.schemaFingerprint) {
  throw new Error("Relay global source is not ready");
}
if (regionalSource.schemaFingerprint !== manifest.schemas?.regional?.fingerprint) {
  throw new Error("Relay regional schema fingerprint does not match generated bindings");
}
if (globalSource.schemaFingerprint !== manifest.schemas?.global?.fingerprint) {
  throw new Error("Relay global schema fingerprint does not match generated bindings");
}

const [regionalBindings, globalBindings] = await Promise.all([
  import("../dist-server/game-data/bindings/regional.js"),
  import("../dist-server/game-data/bindings/global.js"),
]);

let regionalSnapshot;
let globalSnapshot;
try {
  regionalSnapshot = await connectionSnapshot(regionalBindings, {
    uri: relayWebSocketUri(relayBaseUrl, regionalSource.port),
    database: regionalSource.database,
    queries: tableSpecs.map(({ sql }) => `SELECT * FROM ${sql}`),
    accessors: tableSpecs.map(({ accessor }) => accessor),
    label: `region ${regionId} empire snapshot`,
  });

  const globalQueries = [];
  const globalAccessors = [];
  for (const spec of tableSpecs) {
    const ids = regionalSnapshot.rows[spec.accessor].map((row) => decimalString(row[spec.key]));
    if (!ids.length) continue;
    globalQueries.push(...equalitySubscriptionQueries(
      spec.sql,
      snakeCase(spec.key),
      ids,
      100,
    ));
    globalAccessors.push(spec.accessor);
  }
  if (!globalQueries.length) throw new Error(`Region ${regionId} returned no empire rows`);

  globalSnapshot = await connectionSnapshot(globalBindings, {
    uri: relayWebSocketUri(relayBaseUrl, globalSource.port),
    database: globalSource.database,
    queries: globalQueries,
    accessors: globalAccessors,
    label: "global matching empire snapshot",
  });

  const comparisons = Object.fromEntries(tableSpecs.map((spec) => {
    const regionalRows = regionalSnapshot.rows[spec.accessor];
    const globalRows = globalSnapshot.rows[spec.accessor] ?? [];
    const globalById = new Map(globalRows.map((row) => [
      decimalString(row[spec.key]),
      canonical(row),
    ]));
    const missingKeys = [];
    const mismatchedKeys = [];
    for (const row of regionalRows) {
      const key = decimalString(row[spec.key]);
      const globalRow = globalById.get(key);
      if (!globalRow) {
        missingKeys.push(key);
      } else if (JSON.stringify(canonical(row)) !== JSON.stringify(globalRow)) {
        mismatchedKeys.push(key);
      }
    }
    return [spec.sql, {
      regionalCount: regionalRows.length,
      globalMatchedCount: globalRows.length,
      missingKeys,
      mismatchedKeys,
    }];
  }));

  console.log(JSON.stringify({
    ok: Object.values(comparisons).every(
      ({ missingKeys, mismatchedKeys }) => !missingKeys.length && !mismatchedKeys.length,
    ),
    observedAt: new Date().toISOString(),
    regionId,
    regionalSource: {
      database: regionalSource.database,
      schemaFingerprint: regionalSource.schemaFingerprint,
    },
    globalSource: {
      database: globalSource.database,
      schemaFingerprint: globalSource.schemaFingerprint,
    },
    comparisons,
    samples: Object.fromEntries(tableSpecs.map((spec) => [
      spec.sql,
      regionalSnapshot.rows[spec.accessor].slice(0, 3).map(canonical),
    ])),
  }, null, 2));
} finally {
  globalSnapshot?.stop();
  regionalSnapshot?.stop();
}
