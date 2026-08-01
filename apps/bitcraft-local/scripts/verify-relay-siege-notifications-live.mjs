import { readFile } from "node:fs/promises";

import {
  discoverRelayTopology,
  equalitySubscriptionQueries,
  relayWebSocketUri,
} from "../dist-server/game-data/index.js";
import { normalizeAndPairSiegeNotifications } from
  "../dist-server/game-data/siegeNotifications.js";

const relayBaseUrl = String(
  process.env.BITCRAFT_RELAY_ORIGIN ?? "https://relay.bitcraftsync.app",
).replace(/\/+$/, "");
const regionId = canonicalDecimal(
  process.env.BITCRAFT_REGION_ID ?? "19",
  "configured region id",
);
const timeoutMs = Math.max(
  5_000,
  Number(process.env.RELAY_SIEGE_VERIFY_TIMEOUT_MS ?? 60_000),
);
const manifest = JSON.parse(await readFile(
  new URL("../src/server/game-data/bindings/schema-manifest.json", import.meta.url),
  "utf8",
));

function canonicalDecimal(value, label) {
  const normalized = typeof value === "bigint"
    ? value.toString()
    : String(value ?? "").trim();
  if (!/^(?:0|[1-9]\d*)$/.test(normalized)) {
    throw new TypeError(`${label} must be a canonical non-negative decimal integer`);
  }
  return normalized;
}

function rows(table) {
  return [...table.iter()];
}

function exactPairKey(notification) {
  return `${notification.occurredAt}\u0000${notification.replacements[0]}\u0000${notification.replacements[1]}`;
}

function countExactStartedPairs(notifications) {
  const groups = new Map();
  for (const notification of notifications) {
    if (notification.kind !== "started_attack" && notification.kind !== "started_defense") {
      continue;
    }
    const key = exactPairKey(notification);
    const group = groups.get(key) ?? [];
    group.push(notification);
    groups.set(key, group);
  }
  let count = 0;
  for (const group of groups.values()) {
    if (
      group.length === 2
      && group.filter(({ kind }) => kind === "started_attack").length === 1
      && group.filter(({ kind }) => kind === "started_defense").length === 1
    ) {
      count += 1;
    }
  }
  return count;
}

function regionBounds(worldRegionRows) {
  if (worldRegionRows.length !== 1) {
    throw new Error(
      `Expected one world_region_state row, received ${worldRegionRows.length}`,
    );
  }
  const row = worldRegionRows[0];
  if (canonicalDecimal(row.regionIndex, "world region index") !== regionId) {
    throw new Error(
      `Regional database reported region ${row.regionIndex}; expected ${regionId}`,
    );
  }
  const minX = Number(row.regionMinChunkX);
  const minZ = Number(row.regionMinChunkZ);
  const width = Number(row.regionWidthChunks);
  const height = Number(row.regionHeightChunks);
  if (
    ![minX, minZ, width, height].every(Number.isSafeInteger)
    || minX < 0
    || minZ < 0
    || width <= 0
    || height <= 0
  ) {
    throw new Error("Regional geometry is malformed");
  }
  return {
    contains(chunkIndexValue) {
      const chunkIndex = BigInt(canonicalDecimal(chunkIndexValue, "chunk index"));
      const x = Number(chunkIndex % 1_000n);
      const z = Number(chunkIndex / 1_000n);
      return x >= minX && x < minX + width && z >= minZ && z < minZ + height;
    },
  };
}

function openSnapshot(bindings, {
  uri,
  database,
  queries,
  accessors,
  label,
}) {
  let connection;
  let subscription;
  let timeout;
  let settled = false;
  const promise = new Promise((resolve, reject) => {
    const fail = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    };
    timeout = setTimeout(
      () => fail(new Error(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    connection = bindings.DbConnection.builder()
      .withUri(uri)
      .withDatabaseName(database)
      .onConnect((connected) => {
        subscription = connected.subscriptionBuilder()
          .onApplied(() => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            resolve({
              rows: Object.fromEntries(accessors.map((accessor) => [
                accessor,
                rows(connected.db[accessor]),
              ])),
              stop() {
                subscription?.unsubscribe();
                connected.disconnect();
              },
            });
          })
          .onError((_context, error) => fail(error))
          .subscribe(queries);
      })
      .onConnectError((_context, error) => fail(error))
      .onDisconnect((_context, error) => {
        if (error) fail(error);
      })
      .build();
  });
  return promise.catch((error) => {
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
  regionalSnapshot = await openSnapshot(regionalBindings, {
    uri: relayWebSocketUri(relayBaseUrl, regionalSource.port),
    database: regionalSource.database,
    queries: [
      "SELECT * FROM world_region_state",
      "SELECT * FROM empire_settlement_state",
      "SELECT * FROM empire_node_state",
      "SELECT * FROM empire_node_siege_state",
    ],
    accessors: [
      "worldRegionState",
      "empireSettlementState",
      "empireNodeState",
      "empireNodeSiegeState",
    ],
    label: `region ${regionId} Empire scope`,
  });

  const bounds = regionBounds(regionalSnapshot.rows.worldRegionState);
  const localSettlements = regionalSnapshot.rows.empireSettlementState.filter(
    (row) => bounds.contains(row.chunkIndex),
  );
  const localNodes = regionalSnapshot.rows.empireNodeState.filter(
    (row) => bounds.contains(row.chunkIndex),
  );
  const localNodeIds = new Set(
    localNodes.map((row) => canonicalDecimal(row.entityId, "node entity id")),
  );
  const localSieges = regionalSnapshot.rows.empireNodeSiegeState.filter(
    (row) => localNodeIds.has(canonicalDecimal(row.buildingEntityId, "siege building id")),
  );
  const empireIds = [...new Set([
    ...localSettlements.map(
      (row) => canonicalDecimal(row.empireEntityId, "settlement Empire id"),
    ),
    ...localNodes.map(
      (row) => canonicalDecimal(row.empireEntityId, "node Empire id"),
    ),
    ...localSieges.map(
      (row) => canonicalDecimal(row.empireEntityId, "siege attacker Empire id"),
    ),
  ])].sort((left, right) => (
    BigInt(left) < BigInt(right) ? -1 : BigInt(left) > BigInt(right) ? 1 : 0
  ));
  if (!empireIds.length) {
    throw new Error(`Region ${regionId} produced no exact Empire notification scope`);
  }

  const notificationQueries = equalitySubscriptionQueries(
    "empire_notification_state",
    "empire_entity_id",
    empireIds,
    100,
  );
  if (
    !notificationQueries.length
    || notificationQueries.some((query) => !/\bWHERE\s+empire_entity_id\s*=/i.test(query))
  ) {
    throw new Error("Notification-state subscription is not exact-Empire bounded");
  }
  globalSnapshot = await openSnapshot(globalBindings, {
    uri: relayWebSocketUri(relayBaseUrl, globalSource.port),
    database: globalSource.database,
    queries: [
      "SELECT * FROM empire_notification_desc",
      ...notificationQueries,
    ],
    accessors: ["empireNotificationDesc", "empireNotificationState"],
    label: "bounded Empire siege notifications",
  });

  const normalized = normalizeAndPairSiegeNotifications(
    globalSnapshot.rows.empireNotificationDesc,
    globalSnapshot.rows.empireNotificationState,
  );
  const malformedWarnings = normalized.warnings.filter(
    (warning) => !/^Unmatched siege outcome notifications\b/.test(warning),
  );
  if (malformedWarnings.length) {
    throw new Error(
      `Bounded siege notification rows failed closed: ${malformedWarnings.join("; ")}`,
    );
  }
  const pairedStartEvents = countExactStartedPairs(normalized.notifications);
  const attackerWinEvents = normalized.outcomes.filter(
    ({ outcome }) => outcome === "attacker_won",
  ).length;
  const defenderWinEvents = normalized.outcomes.filter(
    ({ outcome }) => outcome === "defender_won",
  ).length;
  if (pairedStartEvents === 0 || attackerWinEvents === 0 || defenderWinEvents === 0) {
    throw new Error(
      "Current bounded notification window did not retain all required paired siege evidence",
    );
  }
  const observedTimes = normalized.notifications
    .map(({ occurredAt }) => occurredAt)
    .sort();

  console.log(JSON.stringify({
    ok: true,
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
    regionalRows: {
      settlements: localSettlements.length,
      nodes: localNodes.length,
      sieges: localSieges.length,
    },
    notificationScope: {
      empireCount: empireIds.length,
      queryCount: notificationQueries.length,
      empireIds,
    },
    scopedNotificationCount: globalSnapshot.rows.empireNotificationState.length,
    siegeNotificationCount: normalized.notifications.length,
    firstSiegeNotificationAt: observedTimes[0] ?? null,
    lastSiegeNotificationAt: observedTimes.at(-1) ?? null,
    pairedStartEvents,
    attackerWinEvents,
    defenderWinEvents,
    unmatchedOutcomeWarnings: normalized.warnings.length,
    cancellationSemantics: "unavailable",
  }, null, 2));
} finally {
  globalSnapshot?.stop();
  regionalSnapshot?.stop();
}
