import {
  discoverRelayTopology,
  relayWebSocketUri,
} from "../dist-server/game-data/index.js";
import { RelayEmpireRegionSession } from "../dist-server/game-data/empireRegionSession.js";
import { equalitySubscriptionQueries } from "../dist-server/game-data/publicCraftRegionSession.js";
import manifest from "../src/server/game-data/bindings/schema-manifest.json" with { type: "json" };

const regionId = String(process.env.RELAY_EMPIRE_INVENTORY_REGION_ID ?? "19");
const relayBaseUrl = String(
  process.env.BITCRAFT_RELAY_ORIGIN ?? "https://relay.bitcraftsync.app",
).replace(/\/+$/, "");
const timeoutMs = Math.max(
  10_000,
  Number(process.env.RELAY_EMPIRE_INVENTORY_VERIFY_TIMEOUT_MS ?? 60_000),
);

function withTimeout(promise, label) {
  let timeout;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timeout));
}

function itemType(value) {
  const label = String(value?.tag ?? value?.kind ?? value ?? "").toLowerCase();
  if (label === "item") return "item";
  if (label === "cargo") return "cargo";
  return "unknown";
}

function hexiteContents(inventories, reserveBuildingIds) {
  const rows = [];
  for (const inventory of inventories) {
    let energy = 0n;
    let capsules = 0n;
    for (const pocket of inventory.pockets ?? []) {
      const contents = pocket?.contents;
      if (!contents) continue;
      const type = itemType(contents.itemType);
      const id = String(contents.itemId);
      const quantity = BigInt(contents.quantity);
      if (type === "item" && id === "828972621") energy += quantity;
      if (type === "cargo" && id === "2000000") capsules += quantity;
    }
    if (energy || capsules) {
      rows.push({
        entityId: String(inventory.entityId),
        ownerEntityId: String(inventory.ownerEntityId),
        playerOwnerEntityId: String(inventory.playerOwnerEntityId),
        energy: energy.toString(),
        capsules: capsules.toString(),
        reserveBuilding: reserveBuildingIds.has(String(inventory.ownerEntityId)),
      });
    }
  }
  return rows;
}

const topology = await discoverRelayTopology(relayBaseUrl);
const source = topology.regions.get(regionId);
if (!source?.ready || !source.schemaFingerprint) {
  throw new Error(`Relay region ${regionId} source is not ready`);
}
if (source.schemaFingerprint !== manifest.schemas?.regional?.fingerprint) {
  throw new Error(`Relay region ${regionId} schema fingerprint does not match generated bindings`);
}

let empireSession;
let connection;
let buildingSubscription;
let inventorySubscription;
let globalConnection;
let globalInventorySubscription;
let baseReceivedAt = null;
try {
  const snapshotPromise = new Promise((resolve, reject) => {
    empireSession = new RelayEmpireRegionSession({
      onSnapshot: (snapshot) => {
        if (snapshot.data.hexite == null) {
          baseReceivedAt = snapshot.receivedAt;
        } else {
          resolve(snapshot);
        }
      },
      onFailure: reject,
    });
    void empireSession.start({
      uri: relayWebSocketUri(relayBaseUrl, source.port),
      database: source.database,
      schemaFingerprint: source.schemaFingerprint,
      manifest,
      generation: 1,
      regionId,
      includeIdentities: true,
      includeHexiteInventories: true,
    }).catch(reject);
  });
  const snapshot = await withTimeout(snapshotPromise, "Empire identity generation");
  const localEmpireIds = new Set(snapshot.data.settlements.map((row) => row.empireEntityId));
  const playerIds = snapshot.data.members
    .filter((row) => localEmpireIds.has(row.empireEntityId))
    .map((row) => row.entityId);
  const claimIds = snapshot.data.settlements.map((row) => row.claimEntityId);

  await empireSession.stop();
  empireSession = null;

  const bindings = await import("../dist-server/game-data/bindings/regional.js");
  const result = await withTimeout(new Promise((resolve, reject) => {
    connection = bindings.DbConnection.builder()
      .withUri(relayWebSocketUri(relayBaseUrl, source.port))
      .withDatabaseName(source.database)
      .onConnect((connected) => {
        const buildingQueries = equalitySubscriptionQueries(
          "building_state",
          "claim_entity_id",
          claimIds,
        );
        buildingSubscription = connected.subscriptionBuilder()
          .onApplied(() => {
            const buildings = [...connected.db.buildingState.iter()];
            const buildingIds = buildings.map((row) => String(row.entityId));
            const reserveBuildingIds = new Set(
              buildings
                .filter((row) => Number(row.buildingDescriptionId) === 90001)
                .map((row) => String(row.entityId)),
            );
            const inventoryQueries = [
              ...equalitySubscriptionQueries(
                "inventory_state",
                "player_owner_entity_id",
                playerIds,
              ),
              ...equalitySubscriptionQueries(
                "inventory_state",
                "owner_entity_id",
                buildingIds,
              ),
            ];
            inventorySubscription = connected.subscriptionBuilder()
              .onApplied(() => {
                const inventories = [...connected.db.inventoryState.iter()];
                resolve({
                  snapshot,
                  localEmpireIds,
                  playerIds,
                  claimIds,
                  buildings,
                  reserveBuildingIds,
                  inventories,
                  hexiteRows: hexiteContents(inventories, reserveBuildingIds),
                  buildingQueryCount: buildingQueries.length,
                  inventoryQueryCount: inventoryQueries.length,
                });
              })
              .onError((_context, error) => reject(error))
              .subscribe(inventoryQueries);
          })
          .onError((_context, error) => reject(error))
          .subscribe(buildingQueries);
      })
      .onConnectError((_context, error) => reject(error))
      .onDisconnect((_context, error) => {
        if (error) reject(error);
      })
      .build();
  }), "Bounded Empire inventory generation");

  const playerSet = new Set(result.playerIds);
  const buildingSet = new Set(result.buildings.map((row) => String(row.entityId)));
  const playerInventories = result.inventories.filter(
    (row) => playerSet.has(String(row.playerOwnerEntityId)),
  );
  const claimInventories = result.inventories.filter(
    (row) => buildingSet.has(String(row.ownerEntityId)),
  );
  const globalSource = topology.global;
  if (!globalSource?.ready || !globalSource.schemaFingerprint) {
    throw new Error("Relay global source is not ready");
  }
  const globalBindings = await import("../dist-server/game-data/bindings/global.js");
  const globalInventories = await withTimeout(new Promise((resolve, reject) => {
    globalConnection = globalBindings.DbConnection.builder()
      .withUri(relayWebSocketUri(relayBaseUrl, globalSource.port))
      .withDatabaseName(globalSource.database)
      .onConnect((connected) => {
        globalInventorySubscription = connected.subscriptionBuilder()
          .onApplied(() => resolve([...connected.db.inventoryState.iter()]))
          .onError((_context, error) => reject(error))
          .subscribe([
            ...equalitySubscriptionQueries(
              "inventory_state",
              "player_owner_entity_id",
              result.playerIds,
            ),
            ...equalitySubscriptionQueries(
              "inventory_state",
              "owner_entity_id",
              [...buildingSet],
            ),
          ]);
      })
      .onConnectError((_context, error) => reject(error))
      .onDisconnect((_context, error) => {
        if (error) reject(error);
      })
      .build();
  }), "Global indexed inventory comparison");
  const globalHexiteRows = hexiteContents(globalInventories, result.reserveBuildingIds);
  const regionalInventoryIds = new Set(result.inventories.map((row) => String(row.entityId)));
  const globalInventoryIds = new Set(globalInventories.map((row) => String(row.entityId)));
  console.log(JSON.stringify({
    ok: true,
    regionId,
    database: source.database,
    schemaFingerprint: source.schemaFingerprint,
    empireCount: result.localEmpireIds.size,
    playerCount: result.playerIds.length,
    claimCount: result.claimIds.length,
    buildingCount: result.buildings.length,
    reserveBuildingCount: result.reserveBuildingIds.size,
    inventoryCount: result.inventories.length,
    playerInventoryCount: playerInventories.length,
    claimInventoryCount: claimInventories.length,
    buildingQueryCount: result.buildingQueryCount,
    inventoryQueryCount: result.inventoryQueryCount,
    integratedProjection: {
      baseReceivedAt,
      hexiteReceivedAt: snapshot.receivedAt,
      inventoryCount: snapshot.data.hexite?.inventories.length ?? null,
      coverageCount: snapshot.data.hexite?.coverage.length ?? null,
      energyTotal: snapshot.data.hexite?.inventories
        .reduce((sum, row) => sum + BigInt(row.energy), 0n)
        .toString() ?? null,
      capsuleTotal: snapshot.data.hexite?.inventories
        .reduce((sum, row) => sum + BigInt(row.capsules), 0n)
        .toString() ?? null,
      warningCount: snapshot.warnings.length,
      warnings: snapshot.warnings,
    },
    hexiteInventoryCount: result.hexiteRows.length,
    energyTotal: result.hexiteRows.reduce((sum, row) => sum + BigInt(row.energy), 0n).toString(),
    capsuleTotal: result.hexiteRows.reduce((sum, row) => sum + BigInt(row.capsules), 0n).toString(),
    reserveCapsuleTotal: result.hexiteRows
      .filter((row) => row.reserveBuilding)
      .reduce((sum, row) => sum + BigInt(row.capsules), 0n)
      .toString(),
    globalComparison: {
      database: globalSource.database,
      inventoryCount: globalInventories.length,
      regionalOnlyInventoryCount: [...regionalInventoryIds]
        .filter((id) => !globalInventoryIds.has(id))
        .length,
      globalOnlyInventoryCount: [...globalInventoryIds]
        .filter((id) => !regionalInventoryIds.has(id))
        .length,
      hexiteInventoryCount: globalHexiteRows.length,
      energyTotal: globalHexiteRows
        .reduce((sum, row) => sum + BigInt(row.energy), 0n)
        .toString(),
      capsuleTotal: globalHexiteRows
        .reduce((sum, row) => sum + BigInt(row.capsules), 0n)
        .toString(),
      reserveCapsuleTotal: globalHexiteRows
        .filter((row) => row.reserveBuilding)
        .reduce((sum, row) => sum + BigInt(row.capsules), 0n)
        .toString(),
    },
    sample: result.hexiteRows.slice(0, 10),
  }, null, 2));
} finally {
  await empireSession?.stop();
  buildingSubscription?.unsubscribe();
  inventorySubscription?.unsubscribe();
  connection?.disconnect();
  globalInventorySubscription?.unsubscribe();
  globalConnection?.disconnect();
}
