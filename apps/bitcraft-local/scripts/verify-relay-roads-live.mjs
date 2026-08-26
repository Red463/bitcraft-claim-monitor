import { discoverRelayTopology, relayWebSocketUri } from "../dist-server/game-data/index.js";
import { DbConnection } from "../dist-server/game-data/bindings/regional.js";
import { fileURLToPath } from "node:url";
import { createRoadTileStore } from "../src/server/roadTileStore.mjs";
import { groupRoadPointsForZoom, renderRoadTile } from "../src/server/roadTileRenderer.mjs";

const relayBaseUrl = String(process.env.BITCRAFT_RELAY_ORIGIN ?? "https://relay.bitcraftsync.app").replace(/\/+$/, "");
const regionId = String(process.env.BITCRAFT_REGION_ID ?? "19");
const timeoutMs = Math.max(5_000, Number(process.env.RELAY_MAP_VERIFY_TIMEOUT_MS ?? 60_000));
const installRoads = process.env.BITCRAFT_INSTALL_ROAD_TILES === "true";
const dataDir = String(process.env.BITCRAFT_LOCAL_DATA_DIR ?? fileURLToPath(new URL("../data", import.meta.url)));
const roadMinimumAgeMs = Math.max(0, Number(process.env.RELAY_ROAD_TILE_MIN_AGE_MS ?? 24 * 60 * 60_000));
const forceRoads = process.env.BITCRAFT_FORCE_ROAD_TILES === "true";
const roadStore = createRoadTileStore({ dataDir });
const existingRoads = installRoads ? await roadStore.readManifest() : null;
const existingRoadAgeMs = existingRoads?.generatedAt ? Date.now() - Date.parse(existingRoads.generatedAt) : Infinity;
if (installRoads && !forceRoads && existingRoads?.regionIds?.includes(regionId) && existingRoadAgeMs >= 0 && existingRoadAgeMs < roadMinimumAgeMs) {
  console.log(JSON.stringify({ ok: true, skipped: true, reason: "road tiles are within their freshness window", manifest: existingRoads }, null, 2));
  process.exit(0);
}
const topology = await discoverRelayTopology(relayBaseUrl);
const source = topology.regions.get(regionId);
if (!source?.ready || !source.schemaFingerprint) throw new Error(`Relay region ${regionId} source is not ready`);

const candidates = [
  { name: "entity-id", pavedColumn: "paved_tile_state.entity_id", locationColumn: "location_state.entity_id" },
  { name: "related-entity-id", pavedColumn: "paved_tile_state.related_entity_id", locationColumn: "location_state.entity_id" },
];

async function verifyCandidate(candidate) {
  let connection;
  let subscription;
  let timeout;
  const startedAt = Date.now();
  try {
    return await new Promise((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error(`Timed out waiting for road candidate ${candidate.name}`)), timeoutMs);
      connection = DbConnection.builder()
        .withUri(relayWebSocketUri(relayBaseUrl, source.port))
        .withDatabaseName(source.database)
        .onConnect((connected) => {
          const join = `FROM paved_tile_state JOIN location_state ON ${candidate.pavedColumn} = ${candidate.locationColumn}`;
          subscription = connected.subscriptionBuilder()
            .onApplied(async () => {
              try {
              const paved = [...connected.db.pavedTileState.iter()];
              const locations = new Map([...connected.db.locationState.iter()].map((row) => [String(row.entityId), row]));
              let count = 0;
              let normalizedBytes = 2;
              let minX = Infinity; let minZ = Infinity; let maxX = -Infinity; let maxZ = -Infinity;
              const dimensions = new Set();
              const fixtures = [];
              const roadPoints = installRoads && candidate.name === "entity-id" ? [] : null;
              for (const row of paved) {
                const locationId = candidate.name === "entity-id" ? String(row.entityId) : String(row.relatedEntityId);
                const location = locations.get(locationId);
                if (!location) continue;
                const normalized = {
                  entityId: String(row.entityId),
                  relatedEntityId: String(row.relatedEntityId),
                  tileTypeId: row.tileTypeId,
                  x: location.x,
                  z: location.z,
                  dimension: String(location.dimension),
                };
                count += 1;
                normalizedBytes += Buffer.byteLength(JSON.stringify(normalized)) + (count > 1 ? 1 : 0);
                minX = Math.min(minX, normalized.x); minZ = Math.min(minZ, normalized.z);
                maxX = Math.max(maxX, normalized.x); maxZ = Math.max(maxZ, normalized.z);
                dimensions.add(normalized.dimension);
                if (fixtures.length < 5) fixtures.push(normalized);
                roadPoints?.push({ x: normalized.x, z: normalized.z });
              }
              let installed = null;
              if (roadPoints) {
                const tiles = [];
                for (let zoom = -5; zoom <= 0; zoom += 1) {
                  for (const [key, points] of groupRoadPointsForZoom(roadPoints, { zoom })) {
                    const [x, y] = key.split(":").map(Number);
                    tiles.push({ z: zoom, x, y, bytes: await renderRoadTile({ points, zoom }) });
                  }
                }
                installed = await roadStore.install({
                  generation: String(Date.now()), regionIds: [regionId], observedAt: new Date().toISOString(),
                  bounds: count ? { minX, minZ, maxX, maxZ } : null, tiles, featureCount: count,
                });
              }
              resolve({
                candidate: candidate.name,
                elapsedMs: Date.now() - startedAt,
                count,
                normalizedBytes,
                bounds: count ? { minX, minZ, maxX, maxZ } : null,
                dimensions: [...dimensions].sort(),
                fixtures,
                installed,
              });
              } catch (error) { reject(error); }
            })
            .onError((_context, error) => reject(error))
            .subscribe([
              `SELECT paved_tile_state.* ${join} WHERE location_state.dimension = 1`,
              `SELECT location_state.* ${join} WHERE location_state.dimension = 1`,
            ]);
        })
        .onConnectError((_context, error) => reject(error))
        .onDisconnect((_context, error) => { if (error) reject(error); })
        .build();
    });
  } finally {
    clearTimeout(timeout);
    subscription?.unsubscribe();
    connection?.disconnect();
  }
}

const results = [];
for (const candidate of installRoads ? candidates.slice(0, 1) : candidates) {
  try {
    results.push(await verifyCandidate(candidate));
  } catch (error) {
    results.push({ candidate: candidate.name, error: error instanceof Error ? error.message : String(error) });
  }
}
console.log(JSON.stringify({ ok: true, regionId, database: source.database, schemaFingerprint: source.schemaFingerprint, results }, null, 2));
