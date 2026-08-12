import assert from "node:assert/strict";
import test from "node:test";

import {
  MapSnapshotError,
  authorizedMapPlayerIds,
  buildMapSnapshot,
  mapRequestAccess,
  parseMapScope,
} from "../src/server/mapSnapshot.mjs";
import { normalizeAccessControlConfig } from "../src/access/accessControl.mjs";

test("map scopes are canonical, bounded, and restricted to configured regions", () => {
  const scope = parseMapScope(new URLSearchParams({
    regions: "24,19,19",
    layers: "players,claims,resources",
    playerIds: "216172782115643288,1369094286777412590",
    resourceIds: "30,2,2",
  }), { allowedRegionIds: ["19", "24"] });

  assert.deepEqual(scope, {
    regionIds: ["19", "24"],
    layers: ["claims", "players", "resources"],
    resourceIds: ["2", "30"],
    enemyTypes: [],
    playerIds: ["216172782115643288", "1369094286777412590"],
  });
  assert.throws(
    () => parseMapScope(new URLSearchParams({ regions: "99", layers: "claims" }), { allowedRegionIds: ["19"] }),
    (error) => error instanceof MapSnapshotError && error.statusCode === 422,
  );
  assert.throws(
    () => parseMapScope(new URLSearchParams({ regions: "19", layers: "resources" }), { allowedRegionIds: ["19"] }),
    /resourceIds/,
  );
  assert.throws(
    () => parseMapScope(new URLSearchParams({ regions: "19", layers: "banks" }), { allowedRegionIds: ["19"] }),
    (error) => error instanceof MapSnapshotError && error.statusCode === 422 && /Unknown map layer/.test(error.message),
  );
});

test("map request access follows the configured Map page rule", () => {
  const config = normalizeAccessControlConfig({ rules: { "page:map": { mode: "verified" } } });
  assert.equal(mapRequestAccess(config, { user: null }).allowed, false);
  assert.equal(mapRequestAccess(config, { user: { discordId: "123456", characterStatus: "pending" } }).allowed, false);
  assert.equal(mapRequestAccess(config, { user: { discordId: "123456", characterStatus: "approved" } }).allowed, true);
});

test("roads and claim areas are accepted but fail closed until coordinates are verified", () => {
  const scope = parseMapScope(new URLSearchParams({
    regions: "19",
    layers: "roads,claim-areas",
  }), { allowedRegionIds: ["19"] });
  const snapshot = buildMapSnapshot({ scope, now: new Date("2026-08-11T12:00:00.000Z") });

  assert.deepEqual(snapshot.layers.roads, []);
  assert.deepEqual(snapshot.layers["claim-areas"], []);
  assert.deepEqual(snapshot.layerAvailability.roads, {
    available: false,
    reason: "Unavailable — awaiting verified Relay coordinates",
  });
  assert.equal(snapshot.layerAvailability["claim-areas"].available, false);
  assert.match(snapshot.warnings.join(" "), /roads.*verified Relay coordinates/i);
  assert.match(snapshot.warnings.join(" "), /claim areas.*verified Relay coordinates/i);
});

test("map snapshot projects available operations and reports uncollected layers", () => {
  const scope = parseMapScope(new URLSearchParams({
    regions: "19",
    layers: "claims,markets,watchtowers,players,resources",
    playerIds: "216172782115643288",
    resourceIds: "2",
  }), { allowedRegionIds: ["19"] });

  const snapshot = buildMapSnapshot({
    scope,
    now: new Date("2026-08-11T12:00:10.000Z"),
    excludedMemberIds: [],
    regionClaims: {
      data: { regionId: "19", claims: [{ entityId: "1369094286777412590", name: "Timbersteel", tier: 6, locationX: 10, locationZ: 20, locationDimension: "1" }] },
      generation: 7,
      provenance: { receivedAt: "2026-08-11T12:00:00.000Z" },
    },
    market: {
      data: { regionId: "19", marketplaces: [{ buildingEntityId: "1369094286778488967", claimEntityId: "1369094286777412590", locationX: 30, locationZ: 40, dimension: "1" }] },
      generation: 8,
      provenance: { receivedAt: "2026-08-11T12:00:01.000Z" },
    },
    empires: {
      data: { nodes: [{ entityId: "216172782113783810", empireEntityId: "1", regionId: "19", nickname: "North Tower", locationX: 50, locationZ: 60, locationDimension: "1" }] },
      generation: 9,
      provenance: { receivedAt: "2026-08-11T12:00:02.000Z" },
    },
    members: [{ playerEntityId: "216172782115643288", username: "Scout" }],
    players: [{ entityId: "216172782115643288", signedIn: true }],
    spatial: null,
  });

  assert.equal(snapshot.provider, "relay");
  assert.equal(snapshot.layers.claims[0].entityId, "1369094286777412590");
  assert.equal(snapshot.layers.markets[0].point.x, 30);
  assert.equal(snapshot.layers.watchtowers[0].point.z, 60);
  assert.deepEqual(snapshot.layers.players, []);
  assert.deepEqual(snapshot.layers.resources, []);
  assert.equal(snapshot.layerAvailability.players.available, false);
  assert.equal(snapshot.layerAvailability.resources.available, false);
  assert.equal(snapshot.freshness, "partial");
  assert.match(snapshot.warnings.join(" "), /player positions.*unavailable/i);
  assert.match(snapshot.warnings.join(" "), /resource positions.*unavailable/i);
});

test("player positions require selected online monitored non-excluded members", () => {
  const scope = parseMapScope(new URLSearchParams({
    regions: "19",
    layers: "players",
    playerIds: "101,102,103,104",
  }), { allowedRegionIds: ["19"] });
  const snapshot = buildMapSnapshot({
    scope,
    now: new Date("2026-08-11T12:00:00.000Z"),
    excludedMemberIds: ["103"],
    mobileIdentityVerified: true,
    members: [
      { playerEntityId: "101", username: "Online" },
      { playerEntityId: "102", username: "Offline" },
      { playerEntityId: "103", username: "Excluded" },
    ],
    players: [
      { entityId: "101", signedIn: true },
      { entityId: "102", signedIn: false },
      { entityId: "103", signedIn: true },
    ],
    spatial: {
      data: { players: [
        { playerEntityId: "101", regionId: "19", locationX: 12_000, locationZ: 24_000, dimension: "1", observedAt: "2026-08-11T11:59:59.000Z" },
        { playerEntityId: "102", regionId: "19", locationX: 13_000, locationZ: 25_000, dimension: "1" },
        { playerEntityId: "103", regionId: "19", locationX: 14_000, locationZ: 26_000, dimension: "1" },
        { playerEntityId: "104", regionId: "19", locationX: 15_000, locationZ: 27_000, dimension: "1" },
      ] },
      generation: 10,
      provenance: { receivedAt: "2026-08-11T11:59:59.000Z" },
    },
  });

  assert.deepEqual(snapshot.layers.players.map((row) => row.playerEntityId), ["101"]);
  assert.deepEqual(snapshot.layers.players[0].point, {
    x: 12,
    z: 24,
    dimension: "1",
    coordinateSpace: "map-xz",
    sourceCoordinateSpace: "mobile-fixed-1000",
  });

  const previouslyLiveSpatial = {
    data: { players: [{ playerEntityId: "101", regionId: "19", locationX: 12_000, locationZ: 24_000, dimension: "1" }] },
    generation: 10,
    provenance: { receivedAt: "2026-08-11T11:59:59.000Z" },
  };
  assert.deepEqual(buildMapSnapshot({
    scope: { ...scope, playerIds: ["101"] },
    mobileIdentityVerified: true,
    members: [{ playerEntityId: "101" }],
    players: [{ entityId: "101", signedIn: false }],
    spatial: previouslyLiveSpatial,
  }).layers.players, []);
  assert.deepEqual(buildMapSnapshot({
    scope: { ...scope, playerIds: ["101"] },
    excludedMemberIds: ["101"],
    mobileIdentityVerified: true,
    members: [{ playerEntityId: "101" }],
    players: [{ entityId: "101", signedIn: true }],
    spatial: previouslyLiveSpatial,
  }).layers.players, []);
});

test("map player subscriptions receive only selected online monitored non-excluded ids", () => {
  assert.deepEqual(authorizedMapPlayerIds({
    selectedPlayerIds: ["101", "102", "103", "104"],
    excludedMemberIds: ["103"],
    mobileIdentityVerified: true,
    members: [
      { playerEntityId: "101" },
      { playerEntityId: "102" },
      { playerEntityId: "103" },
    ],
    players: [
      { entityId: "101", signedIn: true },
      { entityId: "102", signedIn: false },
      { entityId: "103", signedIn: true },
      { entityId: "104", signedIn: true },
    ],
  }), ["101"]);
  assert.deepEqual(authorizedMapPlayerIds({
    selectedPlayerIds: ["101"],
    members: [{ playerEntityId: "101" }],
    players: [{ entityId: "101", signedIn: true }],
  }), []);
});

test("map snapshot exposes verified waystone coordinates from the scoped collector", () => {
  const scope = parseMapScope(new URLSearchParams({ regions: "19", layers: "waystones" }), { allowedRegionIds: ["19"] });
  const snapshot = buildMapSnapshot({
    scope,
    waystoneCoordinatesVerified: true,
    spatial: {
      data: {
        waystones: [{ entityId: "301", claimEntityId: "999", regionId: "19", locationX: 30, locationZ: 40, dimension: "1" }],
      },
      generation: 11,
      provenance: { receivedAt: "2026-08-11T12:00:00.000Z" },
    },
  });
  assert.equal(snapshot.layers.waystones[0].kind, "waystone");
  assert.equal(snapshot.layers.waystones[0].point.z, 40);
  assert.deepEqual(snapshot.warnings, []);
});

test("map snapshot keeps waystone coordinates unavailable until live fixtures are verified", () => {
  const scope = parseMapScope(new URLSearchParams({ regions: "19", layers: "waystones" }), { allowedRegionIds: ["19"] });
  const snapshot = buildMapSnapshot({
    scope,
    spatial: {
      data: {
        waystones: [{ entityId: "301", claimEntityId: "999", regionId: "19", locationX: 30, locationZ: 40, dimension: "1" }],
      },
      provenance: { receivedAt: "2026-08-11T12:00:00.000Z" },
    },
  });
  assert.deepEqual(snapshot.layers.waystones, []);
  assert.equal(snapshot.layerAvailability.waystones.available, false);
  assert.match(snapshot.layerAvailability.waystones.reason, /live-verified/i);
  assert.match(snapshot.warnings.join(" "), /waystone.*live-verified/i);
});

test("map snapshot forwards scoped collector warnings to the native renderer", () => {
  const scope = parseMapScope(new URLSearchParams({
    regions: "19",
    layers: "enemies",
    enemyTypes: "8",
  }), { allowedRegionIds: ["19"] });
  const warning = "Enemy positions are unavailable until the Relay EnemyType to catalog mapping is live-verified.";
  const snapshot = buildMapSnapshot({
    scope,
    spatial: {
      data: { enemies: [] },
      generation: 12,
      provenance: { receivedAt: "2026-08-11T12:00:00.000Z" },
      warnings: [warning],
    },
  });

  assert.equal(snapshot.freshness, "partial");
  assert.deepEqual(snapshot.warnings, [warning]);
});

test("map snapshot keeps enemy positions unavailable until type mapping is verified", () => {
  const scope = parseMapScope(new URLSearchParams({ regions: "19", layers: "enemies", enemyTypes: "8" }), { allowedRegionIds: ["19"] });
  const snapshot = buildMapSnapshot({
    scope,
    spatial: {
      data: { enemies: [{ entityId: "200", enemyType: "8", regionId: "19", locationX: 70_000, locationZ: 80_000, dimension: "1" }] },
      generation: 12,
      provenance: { receivedAt: "2026-08-11T12:00:00.000Z" },
    },
  });
  assert.deepEqual(snapshot.layers.enemies, []);
  assert.equal(snapshot.layerAvailability.enemies.available, false);
  assert.match(snapshot.warnings.join(" "), /enemy positions.*catalog mapping.*live-verified/i);
});

test("map snapshot keeps resources unavailable until the live location join is verified", () => {
  const scope = parseMapScope(new URLSearchParams({ regions: "19", layers: "resources", resourceIds: "54" }), { allowedRegionIds: ["19"] });
  const snapshot = buildMapSnapshot({
    scope,
    spatial: {
      data: { resources: [{ entityId: "100", resourceId: "54", regionId: "19", locationX: 100, locationZ: 200, dimension: "1" }] },
      generation: 12,
      provenance: { receivedAt: "2026-08-11T12:00:00.000Z" },
    },
  });
  assert.deepEqual(snapshot.layers.resources, []);
  assert.equal(snapshot.layerAvailability.resources.available, false);
  assert.match(snapshot.warnings.join(" "), /resource positions.*location join.*live-verified/i);
});

test("map snapshot freshness uses the oldest requested source and cannot be masked by a newer layer", () => {
  const scope = parseMapScope(new URLSearchParams({ regions: "19", layers: "claims,waystones" }), { allowedRegionIds: ["19"] });
  const snapshot = buildMapSnapshot({
    scope,
    now: new Date("2026-08-11T12:10:00.000Z"),
    waystoneCoordinatesVerified: true,
    regionClaims: {
      data: { regionId: "19", claims: [] },
      generation: 1,
      freshness: "stale",
      provenance: { receivedAt: "2026-08-11T12:00:00.000Z" },
    },
    spatial: {
      data: { waystones: [] },
      generation: 2,
      freshness: "live",
      provenance: { receivedAt: "2026-08-11T12:09:59.000Z" },
    },
  });

  assert.equal(snapshot.generatedAt, "2026-08-11T12:00:00.000Z");
  assert.equal(snapshot.ageMs, 600_000);
  assert.equal(snapshot.freshness, "partial");
});
