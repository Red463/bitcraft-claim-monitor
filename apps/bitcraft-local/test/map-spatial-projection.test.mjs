import assert from "node:assert/strict";
import test from "node:test";

import {
  mapSpatialBaseQueries,
  mapSpatialDetailQueries,
  mapEnemyTypeId,
  normalizeMapSpatial,
} from "../src/server/game-data/mapSpatialProjection.ts";

const scope = {
  claimId: "1369094286777412590",
  regionId: "19",
  playerIds: ["216172782115643288"],
  resourceIds: ["2", "30"],
  enemyTypes: ["1", "8"],
};

test("map spatial subscriptions are bounded by requested identities", () => {
  assert.deepEqual(mapSpatialBaseQueries(scope), [
    "SELECT * FROM bank_state WHERE claim_entity_id = 1369094286777412590",
    "SELECT * FROM waystone_state WHERE claim_entity_id = 1369094286777412590",
    "SELECT * FROM resource_state WHERE resource_id = 2 OR resource_id = 30",
    "SELECT * FROM enemy_state",
  ]);
  assert.deepEqual(mapSpatialDetailQueries({
    playerIds: scope.playerIds,
    resourceRows: [{ entityId: 100n, resourceId: 2 }],
    enemyRows: [{ entityId: 200n, enemyType: 8 }],
  }), [
    "SELECT * FROM location_state WHERE entity_id = 100",
    "SELECT * FROM mobile_entity_state WHERE entity_id = 200 OR entity_id = 216172782115643288",
  ]);
});

test("map spatial detail subscriptions split dense entity joins into proven Relay-sized queries", () => {
  const resourceRows = Array.from({ length: 101 }, (_, index) => ({ entityId: BigInt(index + 1), resourceId: 2 }));
  const queries = mapSpatialDetailQueries({ playerIds: [], resourceRows, enemyRows: [] });

  assert.equal(queries.length, 2);
  assert.equal((queries[0].match(/entity_id = /g) ?? []).length, 100);
  assert.equal(queries[1], "SELECT * FROM location_state WHERE entity_id = 101");
});

test("generated EnemyType tags map to their matching catalog ids", () => {
  assert.equal(mapEnemyTypeId({ tag: "PracticeDummy" }), "1");
  assert.equal(mapEnemyTypeId({ tag: "DeerMale" }), "8");
  assert.equal(mapEnemyTypeId({ tag: "CrystalizedHexiteCrab" }), "43");
  assert.equal(mapEnemyTypeId(8), "8");
});

test("map spatial normalization joins resources and enemies without losing entity IDs", () => {
  const normalized = normalizeMapSpatial({
    scope,
    bankRows: [{ buildingEntityId: 300n, claimEntityId: 1369094286777412590n, coordinates: { x: 10, z: 20, dimension: 0n } }],
    waystoneRows: [{ buildingEntityId: 301n, claimEntityId: 1369094286777412590n, coordinates: { x: 30, z: 40, dimension: 0n } }],
    resourceRows: [{ entityId: 100n, resourceId: 2 }],
    enemyRows: [{ entityId: 200n, enemyType: { tag: "DeerMale" } }],
    locationRows: [{ entityId: 100n, x: 50, z: 60, dimension: 0n }],
    mobileRows: [
      { entityId: 200n, locationX: 70_000, locationZ: 80_000, dimension: 0 },
      { entityId: 216172782115643288n, locationX: 90_000, locationZ: 100_000, dimension: 0 },
    ],
    observedAt: "2026-08-11T12:00:00.000Z",
  });

  assert.deepEqual(normalized.data.resources[0], { entityId: "100", resourceId: "2", regionId: "19", locationX: 50, locationZ: 60, dimension: "0", observedAt: "2026-08-11T12:00:00.000Z" });
  assert.deepEqual(normalized.data.enemies[0], { entityId: "200", enemyType: "8", regionId: "19", locationX: 70000, locationZ: 80000, dimension: "0", observedAt: "2026-08-11T12:00:00.000Z" });
  assert.equal(normalized.data.players[0].playerEntityId, "216172782115643288");
  assert.equal(normalized.data.banks[0].entityId, "300");
  assert.equal(normalized.data.waystones[0].entityId, "301");
  assert.deepEqual(normalized.warnings, []);
});

test("map spatial normalization reports missing joins instead of inventing positions", () => {
  const normalized = normalizeMapSpatial({ scope, resourceRows: [{ entityId: 100n, resourceId: 2 }], enemyRows: [{ entityId: 200n, enemyType: 8 }] });
  assert.deepEqual(normalized.data.resources, []);
  assert.deepEqual(normalized.data.enemies, []);
  assert.match(normalized.warnings.join(" "), /resource 100.*location/i);
  assert.match(normalized.warnings.join(" "), /enemy 200.*mobile/i);
});

test("map spatial normalization skips malformed resource and player rows without dropping valid rows", () => {
  const normalized = normalizeMapSpatial({
    scope,
    resourceRows: [{ entityId: "bad", resourceId: 2 }, { entityId: 100n, resourceId: 2 }],
    locationRows: [{ entityId: 100n, x: 50, z: 60, dimension: 0n }],
    mobileRows: [
      { entityId: 216172782115643288n, locationX: "bad", locationZ: 100_000, dimension: 0 },
    ],
  });
  assert.deepEqual(normalized.data.resources.map((row) => row.entityId), ["100"]);
  assert.deepEqual(normalized.data.players, []);
  assert.match(normalized.warnings.join(" "), /decimal integer|safe integer/i);
});
