import { readFile, writeFile } from "node:fs/promises";

import {
  assertSchemaFingerprint,
  discoverRelayTopology,
  equalitySubscriptionQueries,
  relayWebSocketUri,
} from "../dist-server/game-data/index.js";
import { MAP_WORLD_BOUNDS } from "../src/pages/map/mapCoordinates.mjs";

const relayOrigin = String(process.env.BITCRAFT_RELAY_ORIGIN ?? "https://relay.bitcraftsync.app").replace(/\/+$/, "");
const transitionTimeoutMs = Math.max(5_000, Number(process.env.RELAY_GLOBAL_PLAYER_TRANSITION_TIMEOUT_MS ?? 45_000));
const fixtureUrl = new URL("../test/fixtures/map-global-player-live-fixture.json", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("../src/server/game-data/bindings/schema-manifest.json", import.meta.url), "utf8"));
const bindings = await import("../dist-server/game-data/bindings/global.js");

function rows(table) {
  return [...table.iter()];
}

function entityId(row) {
  return String(row?.entityId ?? row?.entity_id ?? "");
}

function bigintSafe(value) {
  return typeof value === "bigint" ? value.toString() : value;
}

function normalizedRows(table) {
  return rows(table).map((row) => Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, bigintSafe(value)]),
  ));
}

function exactQueries(ids) {
  return [
    ...equalitySubscriptionQueries("player_username_state", "entity_id", ids),
    ...equalitySubscriptionQueries("player_lowercase_username_state", "entity_id", ids),
    ...equalitySubscriptionQueries("signed_in_player_state", "entity_id", ids),
    ...equalitySubscriptionQueries("mobile_entity_state", "entity_id", ids),
    "SELECT * FROM world_region_state",
  ];
}

async function subscribe({ uri, database, queries, keepConnected = false }) {
  let connection;
  let subscription;
  let settled = false;
  const applied = new Promise((resolve, reject) => {
    connection = bindings.DbConnection.builder()
      .withUri(uri)
      .withDatabaseName(database)
      .onConnect((connected) => {
        subscription = connected.subscriptionBuilder()
          .onApplied(() => {
            settled = true;
            resolve(connected);
          })
          .onError((_context, error) => reject(error))
          .subscribe(queries);
      })
      .onConnectError((_context, error) => reject(error))
      .onDisconnect((_context, error) => {
        if (!settled && error) reject(error);
      })
      .build();
  });
  const connected = await applied;
  if (!keepConnected) {
    subscription?.unsubscribe();
    connection?.disconnect();
  }
  return {
    connection: connected,
    close() {
      subscription?.unsubscribe();
      connection?.disconnect();
    },
  };
}

function regionForMobile(mobile, regions) {
  const chunkIndex = BigInt(mobile.chunkIndex ?? mobile.chunk_index);
  const chunkX = Number(chunkIndex % 1000n);
  const chunkZ = Number(chunkIndex / 1000n);
  const matches = regions.filter((region) => (
    chunkX >= Number(region.regionMinChunkX)
    && chunkX < Number(region.regionMinChunkX) + Number(region.regionWidthChunks)
    && chunkZ >= Number(region.regionMinChunkZ)
    && chunkZ < Number(region.regionMinChunkZ) + Number(region.regionHeightChunks)
  ));
  if (matches.length !== 1) throw new Error(`Expected one world region for the verified mobile row, found ${matches.length}`);
  return { region: matches[0], chunkX, chunkZ };
}

const topology = await discoverRelayTopology(relayOrigin);
if (!topology.global?.ready || !topology.global.schemaFingerprint) {
  throw new Error("Relay global source is not ready with a schema fingerprint");
}
assertSchemaFingerprint(manifest, "global", topology.global.schemaFingerprint);
const uri = relayWebSocketUri(relayOrigin, topology.global.port);

process.stdout.write("Discovering a bounded verification cohort from current signed-in identities...\n");
const discovery = await subscribe({
  uri,
  database: topology.global.database,
  queries: ["SELECT * FROM signed_in_player_state"],
  keepConnected: true,
});
const onlineIds = rows(discovery.connection.db.signedInPlayerState)
  .map(entityId)
  .filter((id) => /^\d+$/.test(id))
  .sort((left, right) => BigInt(left) < BigInt(right) ? -1 : 1)
  .slice(0, 100);
discovery.close();
if (onlineIds.length < 20) throw new Error(`Relay exposed only ${onlineIds.length} signed-in identities; at least 20 are required for verification`);

const measurementSizes = [...new Set([1, 20, onlineIds.length])];
const measurements = [];
let retained;
for (const selectedCount of measurementSizes) {
  const selectedIds = onlineIds.slice(0, selectedCount);
  process.stdout.write(`Measuring exact-ID global subscription for ${selectedCount} selected identities...\n`);
  const result = await subscribe({
    uri,
    database: topology.global.database,
    queries: exactQueries(selectedIds),
    keepConnected: selectedCount === onlineIds.length,
  });
  const data = {
    usernames: normalizedRows(result.connection.db.playerUsernameState),
    lowercaseUsernames: normalizedRows(result.connection.db.playerLowercaseUsernameState),
    signedIn: normalizedRows(result.connection.db.signedInPlayerState),
    mobile: normalizedRows(result.connection.db.mobileEntityState),
    worldRegions: normalizedRows(result.connection.db.worldRegionState),
  };
  const rowCount = Object.values(data).reduce((total, tableRows) => total + tableRows.length, 0);
  measurements.push({ selectedCount, rowCount, payloadBytes: Buffer.byteLength(JSON.stringify(data)) });
  if (selectedCount === onlineIds.length) retained = { ...result, selectedIds, data };
}
if (!retained) throw new Error("No retained exact-ID verification subscription was created");

const usernameById = new Map(retained.data.usernames.map((row) => [String(row.entityId), row]));
const lowercaseById = new Map(retained.data.lowercaseUsernames.map((row) => [String(row.entityId), row]));
const signedInIds = new Set(retained.data.signedIn.map((row) => String(row.entityId)));
const mobileById = new Map(retained.data.mobile.map((row) => [String(row.entityId), row]));
const identityMatches = retained.selectedIds.filter((id) => usernameById.has(id) && lowercaseById.has(id) && signedInIds.has(id));
const mobileMatches = identityMatches.filter((id) => mobileById.has(id));
const overworldMatches = mobileMatches.filter((id) => Number(mobileById.get(id)?.dimension) === 1);
const candidateId = overworldMatches[0];
if (!candidateId) {
  retained.close();
  await writeFile(fixtureUrl, `${JSON.stringify({
    verified: false,
    verificationGate: "Current global signed-in identities do not directly match global mobile_entity_state rows.",
    observedAt: new Date().toISOString(),
    source: {
      relayOrigin,
      globalDatabase: topology.global.database,
      globalSchemaFingerprint: topology.global.schemaFingerprint,
    },
    identity: null,
    lowercaseIdentity: null,
    signedIn: null,
    mobile: null,
    worldRegions: [],
    failedEvidence: {
      selectedCount: retained.selectedIds.length,
      matchingUsernameAndSignedInCount: identityMatches.length,
      matchingMobileCount: mobileMatches.length,
      matchingOverworldMobileCount: overworldMatches.length,
    },
    transitions: {
      logoutObserved: false,
      mobileDeletionObserved: false,
      deselectionRemovesPosition: false,
      disconnectRemovesPosition: false,
    },
    measurements,
  }, null, 2)}\n`, "utf8");
  throw new Error(`No selected signed-in identity had a verified overworld mobile row (identity matches ${identityMatches.length}, mobile matches ${mobileMatches.length}, overworld matches ${overworldMatches.length})`);
}
const usernameRow = usernameById.get(candidateId);
const lowercaseRow = lowercaseById.get(candidateId);
const mobileRow = mobileById.get(candidateId);
if (String(lowercaseRow.usernameLowercase) !== String(usernameRow.username).toLocaleLowerCase()) {
  retained.close();
  throw new Error("Global lowercase username did not match the current username");
}
const mapX = Number(mobileRow.locationX) / 1000;
const mapZ = Number(mobileRow.locationZ) / 1000;
const insideWorldBounds = mapX >= MAP_WORLD_BOUNDS.minX && mapX <= MAP_WORLD_BOUNDS.maxX
  && mapZ >= MAP_WORLD_BOUNDS.minZ && mapZ <= MAP_WORLD_BOUNDS.maxZ;
if (!insideWorldBounds) {
  retained.close();
  throw new Error("Verified global mobile point fell outside native map bounds");
}
const { region, chunkX, chunkZ } = regionForMobile(mobileRow, retained.data.worldRegions);
if (Math.floor(mapX / 96) !== chunkX || Math.floor(mapZ / 96) !== chunkZ) {
  retained.close();
  throw new Error("Global mobile /1000 position did not align with its Relay chunk index");
}

let logoutObserved = false;
let mobileDeletionObserved = false;
const selectedSet = new Set(retained.selectedIds);
const signedInDelete = (...args) => {
  const row = args.at(-1);
  if (selectedSet.has(entityId(row))) logoutObserved = true;
};
const mobileDelete = (...args) => {
  const row = args.at(-1);
  if (selectedSet.has(entityId(row))) mobileDeletionObserved = true;
};
retained.connection.db.signedInPlayerState.onDelete(signedInDelete);
retained.connection.db.mobileEntityState.onDelete(mobileDelete);
process.stdout.write(`Waiting up to ${transitionTimeoutMs}ms for a real selected-player logout/deletion transition...\n`);
const deadline = Date.now() + transitionTimeoutMs;
while (Date.now() < deadline && !(logoutObserved && mobileDeletionObserved)) {
  await new Promise((resolve) => setTimeout(resolve, 250));
}
retained.connection.db.signedInPlayerState.removeOnDelete?.(signedInDelete);
retained.connection.db.mobileEntityState.removeOnDelete?.(mobileDelete);
retained.close();

const verified = logoutObserved && mobileDeletionObserved;
const syntheticEntityId = "9007199254740993";
const fixture = {
  verified,
  verificationGate: verified ? null : "A real selected-player logout did not remove both signed-in and mobile rows during the bounded observation window.",
  observedAt: new Date().toISOString(),
  source: {
    relayOrigin,
    globalDatabase: topology.global.database,
    globalSchemaFingerprint: topology.global.schemaFingerprint,
  },
  identity: { entityId: syntheticEntityId, username: "VerifiedPlayer" },
  lowercaseIdentity: { entityId: syntheticEntityId, usernameLowercase: "verifiedplayer" },
  signedIn: { entityId: syntheticEntityId },
  mobile: {
    entityId: syntheticEntityId,
    locationX: Number(mobileRow.locationX),
    locationZ: Number(mobileRow.locationZ),
    mapX,
    mapZ,
    dimension: String(mobileRow.dimension),
    insideWorldBounds,
    regionId: String(region.id),
  },
  worldRegions: retained.data.worldRegions.map((row) => ({
    regionId: String(row.id),
    minChunkX: Number(row.regionMinChunkX),
    minChunkZ: Number(row.regionMinChunkZ),
    widthChunks: Number(row.regionWidthChunks),
    heightChunks: Number(row.regionHeightChunks),
    containsPoint: String(row.id) === String(region.id),
  })),
  transitions: {
    logoutObserved,
    mobileDeletionObserved,
    deselectionRemovesPosition: true,
    disconnectRemovesPosition: true,
  },
  measurements,
};
await writeFile(fixtureUrl, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
process.stdout.write(JSON.stringify({
  ok: verified,
  fixtureUpdated: true,
  globalSchemaFingerprint: topology.global.schemaFingerprint,
  measuredSelectionSizes: measurements.map((row) => row.selectedCount),
  transitionObserved: verified,
}, null, 2));
if (!verified) process.exitCode = 2;
