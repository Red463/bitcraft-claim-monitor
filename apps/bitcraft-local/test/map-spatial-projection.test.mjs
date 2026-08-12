import assert from "node:assert/strict";
import test from "node:test";

import {
  mapSpatialQueries,
  mapEnemyMobileQueries,
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

test("map spatial subscriptions are bounded by selected players and enemies", () => {
  assert.deepEqual(mapSpatialQueries(scope), [
    "SELECT * FROM enemy_state",
    "SELECT * FROM mobile_entity_state WHERE (entity_id = 216172782115643288) AND dimension = 1",
  ]);
  assert.deepEqual(mapEnemyMobileQueries([{ entityId: 200n, enemyType: { tag: "DeerMale" } }]), [
    "SELECT * FROM mobile_entity_state WHERE (entity_id = 200) AND dimension = 1",
  ]);
});

test("map spatial subscriptions omit operational rows unless their type is selected", () => {
  const queries = mapSpatialQueries({ ...scope, resourceIds: [], enemyTypes: [], playerIds: [] });
  assert.deepEqual(queries, []);
});

test("map spatial subscriptions split selected players into bounded queries", () => {
  const playerIds = Array.from({ length: 250 }, (_, index) => String(index + 1));
  const queries = mapSpatialQueries({ ...scope, resourceIds: [], enemyTypes: [], playerIds });
  const playerQueries = queries;
  assert.equal(playerQueries.length, 3);
  assert.deepEqual(playerQueries.map((query) => (query.match(/entity_id = /g) ?? []).length), [100, 100, 50]);
  assert.ok(playerQueries.every((query) => query.endsWith("AND dimension = 1")));
});

test("generated EnemyType tags map to their matching catalog ids", () => {
  assert.equal(mapEnemyTypeId({ tag: "PracticeDummy" }), "1");
  assert.equal(mapEnemyTypeId({ tag: "DeerMale" }), "8");
  assert.equal(mapEnemyTypeId({ tag: "CrystalizedHexiteCrab" }), "43");
  assert.equal(mapEnemyTypeId(8), "8");
});

test("map spatial normalization retains an empty resource list while joining enemies", () => {
  const normalized = normalizeMapSpatial({
    scope,
    waystoneRows: [{ buildingEntityId: 301n, claimEntityId: 1369094286777412590n, coordinates: { x: 30, z: 40, dimension: 1n } }],
    enemyRows: [{ entityId: 200n, enemyType: { tag: "DeerMale" } }],
    mobileRows: [
      { entityId: 200n, locationX: 70_000, locationZ: 80_000, dimension: 1 },
      { entityId: 216172782115643288n, locationX: 90_000, locationZ: 100_000, dimension: 1 },
      { entityId: 999n, locationX: 110_000, locationZ: 120_000, dimension: 1 },
    ],
    observedAt: "2026-08-11T12:00:00.000Z",
  });

  assert.deepEqual(normalized.data.resources, []);
  assert.deepEqual(normalized.data.enemies[0], { entityId: "200", enemyType: "8", regionId: "19", locationX: 70000, locationZ: 80000, dimension: "1", observedAt: "2026-08-11T12:00:00.000Z" });
  assert.deepEqual(normalized.data.players[0], {
    playerEntityId: "216172782115643288",
    regionId: "19",
    locationX: 90_000,
    locationZ: 100_000,
    dimension: "1",
    observedAt: "2026-08-11T12:00:00.000Z",
  });
  assert.equal(normalized.data.players.some(({ playerEntityId }) => playerEntityId === "999"), false);
  assert.equal("banks" in normalized.data, false);
  assert.equal(normalized.data.waystones[0].entityId, "301");
  assert.deepEqual(normalized.warnings, []);
});

test("map spatial normalization reports missing operational joins instead of inventing positions", () => {
  const normalized = normalizeMapSpatial({ scope, enemyRows: [{ entityId: 200n, enemyType: 8 }] });
  assert.deepEqual(normalized.data.resources, []);
  assert.deepEqual(normalized.data.enemies, []);
  assert.match(normalized.warnings.join(" "), /enemy 200.*mobile/i);
});

test("map spatial normalization skips malformed player rows", () => {
  const normalized = normalizeMapSpatial({
    scope,
    mobileRows: [
      { entityId: 216172782115643288n, locationX: "bad", locationZ: 100_000, dimension: 1 },
    ],
  });
  assert.deepEqual(normalized.data.resources, []);
  assert.deepEqual(normalized.data.players, []);
  assert.match(normalized.warnings.join(" "), /decimal integer|safe integer/i);
});

test("map spatial normalization rejects missing and non-overworld dimensions", () => {
  const normalized = normalizeMapSpatial({
    scope,
    enemyRows: [{ entityId: 200n, enemyType: 8 }],
    mobileRows: [{ entityId: 200n, locationX: 70_000, locationZ: 80_000 }],
  });
  assert.deepEqual(normalized.data.resources, []);
  assert.deepEqual(normalized.data.enemies, []);
  assert.match(normalized.warnings.join(" "), /dimension.*missing|dimension 2.*overworld/i);
});

test("map spatial normalization warns when Relay adds an unknown enemy type", () => {
  const normalized = normalizeMapSpatial({
    scope,
    enemyRows: [{ entityId: 200n, enemyType: { tag: "FutureEnemy" } }],
    mobileRows: [{ entityId: 200n, locationX: 70_000, locationZ: 80_000, dimension: 1 }],
  });
  assert.deepEqual(normalized.data.enemies, []);
  assert.match(normalized.warnings.join(" "), /unsupported relay enemytype tag.*futureenemy/i);
});

test("map spatial normalization rejects coordinates outside verified world bounds", () => {
  const normalized = normalizeMapSpatial({
    scope,
    enemyRows: [{ entityId: 200n, enemyType: 8 }],
    mobileRows: [{ entityId: 200n, locationX: 38_400_001, locationZ: 80_000, dimension: 1 }],
  });
  assert.deepEqual(normalized.data.resources, []);
  assert.deepEqual(normalized.data.enemies, []);
  assert.match(normalized.warnings.join(" "), /outside verified world bounds/i);
});
