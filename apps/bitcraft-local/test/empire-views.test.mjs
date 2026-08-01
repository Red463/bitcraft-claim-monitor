import assert from "node:assert/strict";
import test from "node:test";

const {
  empireClaimMembersView,
  empireDetailsView,
  empireOverviewView,
  empireSnapshotStatus,
  empireWatchtowersView,
} = await import("../src/server/empireViews.mjs");

const snapshot = {
  activeRegionIds: ["19"],
  empires: [{
    regionId: "19",
    entityId: "10",
    name: "Timbersteel Empire",
    capitalBuildingEntityId: "100",
    empireCurrencyTreasury: "123",
    shardTreasury: "4",
    numClaims: 1,
    territoryChunks: 2,
    locationX: 1,
    locationZ: 2,
    locationDimension: "1",
  }, {
    regionId: "19",
    entityId: "11",
    name: "Verdant",
  }],
  members: [{
    regionId: "19",
    entityId: "20",
    empireEntityId: "10",
    username: "Owner",
    rank: 0,
    rankTitle: "Emperor",
    permissions: [true, false, false, false, false, false, true],
    signedIn: true,
    lastLoginTimestamp: "2026-07-30T17:00:00.000Z",
  }],
  settlements: [{
    regionId: "19",
    buildingEntityId: "100",
    claimEntityId: "40",
    empireEntityId: "10",
    claimName: "Timbersteel Trade",
    claimOwnerEntityId: "20",
    claimOwnerName: "Owner",
    locationX: 3,
    locationZ: 4,
    locationDimension: "1",
  }],
  claimMembers: [{
    regionId: "19",
    entityId: "70",
    claimEntityId: "40",
    playerEntityId: "20",
    username: "Owner",
    inventoryPermission: true,
    buildPermission: true,
    officerPermission: true,
    coOwnerPermission: false,
  }],
  nodes: [{
    regionId: "19",
    entityId: "60",
    empireEntityId: "10",
    nickname: "North Watch",
    energy: "99",
    upkeep: "2",
    active: true,
    coveredChunks: 2,
    locationX: 5,
    locationZ: 6,
    locationDimension: "1",
    sieges: [{
      entityId: "80",
      buildingEntityId: "60",
      empireEntityId: "11",
      defenderEmpireEntityId: "10",
      role: "attacker",
      energy: "7",
      active: true,
      startTimestamp: "2026-07-30T16:00:00.000Z",
    }],
  }],
  siegeOutcomes: [{
    eventKey: "outcome-1",
    occurredAt: "2026-07-29T16:00:00.000Z",
    watchtowerLabel: "North Watch",
    encodedLocation: "19:5:6",
    attackerEmpireEntityId: "11",
    defenderEmpireEntityId: "10",
    outcome: "defender_won",
  }, {
    eventKey: "outcome-outside-region",
    occurredAt: "2026-07-28T16:00:00.000Z",
    watchtowerLabel: "Elsewhere",
    encodedLocation: "7:1:2",
    attackerEmpireEntityId: "12",
    defenderEmpireEntityId: "13",
    outcome: "attacker_won",
  }],
  regions: [{
    regionId: "19",
    receivedAt: "2026-07-30T18:00:00.000Z",
    warnings: [],
  }],
};

const regionalClaims = {
  regionId: "19",
  claims: [{
    entityId: "40",
    name: "Timbersteel Trade",
    ownerPlayerEntityId: "20",
    ownerPlayerUsername: "Owner",
    supplies: 500,
    treasury: "900",
    numTiles: 49,
    tier: 6,
    locationX: 3,
    locationZ: 4,
    locationDimension: "1",
  }],
};

test("Empire overview is composed directly from the current regional generation", () => {
  const view = empireOverviewView(snapshot, "19", {
    regionalClaims,
    hexiteForEmpire: () => ({ status: "current", totalEnergy: "123" }),
  });
  assert.equal(view.summary.empires, 1);
  assert.equal(view.summary.totalMembers, 1);
  assert.equal(view.empires[0].leader, "Owner");
  assert.equal(view.empires[0].claims[0].tier, 6);
  assert.deepEqual(view.empires[0].hexiteReserves, {
    status: "current",
    totalEnergy: "123",
  });
  assert.equal(view.fetchedAt, "2026-07-30T18:00:00.000Z");
});

test("Empire details and watchtowers expose proven current roles and paired outcomes", () => {
  const details = empireDetailsView(snapshot, "19", "10", 14, {
    regionalClaims,
    now: () => Date.parse("2026-07-30T18:00:00.000Z"),
  });
  assert.equal(details.empire.leader, "Owner");
  assert.equal(details.members[0].canAddHexite, true);
  assert.equal(details.members[0].permissions.supplyNode, true);
  assert.equal(details.towers[0].underSiege, true);
  assert.deepEqual(
    details.towers[0].activeSiegeParticipants.map((participant) => [
      participant.empireEntityId,
      participant.empireName,
      participant.attacker,
    ]),
    [["11", "Verdant", true], ["10", "Timbersteel Empire", false]],
  );
  assert.equal(details.recentSiegeOutcomes[0].attackerEmpireName, "Verdant");
  assert.equal(details.recentSiegeOutcomes[0].defenderEmpireName, "Timbersteel Empire");
  assert.equal(details.recentSiegeOutcomes[0].outcome, "defender_won");
  assert.equal(details.cancellationSemantics, "unavailable");

  const towers = empireWatchtowersView(snapshot, "19", 14, {
    now: () => Date.parse("2026-07-30T18:00:00.000Z"),
  });
  assert.equal(towers.summary.towerCount, 1);
  assert.equal(towers.summary.underSiege, 1);
  assert.equal(towers.towers[0].towerId, "60");
  assert.equal(towers.empires[0].members[0].hasStorage, true);
  assert.equal(towers.recentSiegeOutcomes.length, 1);
  assert.equal(towers.recentSiegeOutcomes[0].occurredAt, "2026-07-29T16:00:00.000Z");
  assert.equal(towers.cancellationSemantics, "unavailable");
  assert.equal(JSON.stringify(towers).includes("cancelled"), false);
});

test("claim member view joins claim permissions with the live Empire rank", () => {
  const view = empireClaimMembersView(snapshot, "40", { regionalClaims });
  assert.equal(view.claim.name, "Timbersteel Trade");
  assert.equal(view.members[0].claimRole, "Owner");
  assert.equal(view.members[0].hasStorage, true);
  assert.equal(view.members[0].empireRankTitle, "Emperor");
  assert.equal(view.members[0].signedIn, true);
});

test("Empire regional views join local settlement rows to primary-region identity rows", () => {
  const replicated = {
    primaryRegionId: "19",
    activeRegionIds: ["7", "19"],
    empires: [{
      regionId: "19",
      entityId: "10",
      capitalBuildingEntityId: "100",
      name: "Cross-region Empire",
    }, {
      regionId: "19",
      entityId: "11",
      capitalBuildingEntityId: "110",
      name: "Other-region Empire",
    }],
    members: [{
      regionId: "19",
      entityId: "20",
      empireEntityId: "10",
      username: "Leader",
      rank: 0,
      rankTitle: "Emperor",
      permissions: [],
      signedIn: false,
      lastLoginTimestamp: "2026-07-30T17:00:00.000Z",
    }],
    settlements: [{
      regionId: "7",
      buildingEntityId: "70",
      claimEntityId: "71",
      empireEntityId: "10",
      claimName: "Region Seven Claim",
      claimOwnerEntityId: "20",
      claimOwnerName: "Leader",
    }],
    claimMembers: [],
    nodes: [{
      regionId: "7",
      entityId: "72",
      empireEntityId: "10",
      nickname: "Region Seven Tower",
      energy: "10",
      upkeep: "1",
      active: true,
      coveredChunks: 1,
      sieges: [],
    }],
    regions: [{
      regionId: "7",
      receivedAt: "2026-07-30T18:00:00.000Z",
      warnings: [],
    }, {
      regionId: "19",
      receivedAt: "2026-07-30T18:00:00.000Z",
      warnings: [],
    }],
  };

  const overview = empireOverviewView(replicated, "7");
  assert.deepEqual(overview.empires.map((row) => row.entityId), ["10"]);
  assert.equal(overview.empires[0].regionalClaims, 1);
  assert.equal(overview.empires[0].leader, "Leader");
  const watchtowers = empireWatchtowersView(replicated, "7");
  assert.equal(watchtowers.towers[0].nickname, "Region Seven Tower");
  assert.equal(watchtowers.empires[0].members[0].username, "Leader");
  assert.equal(empireDetailsView(replicated, "7", "11"), null);
});

test("Empire response freshness requires both the selected and primary regional sources", () => {
  const stored = {
    data: {
      primaryRegionId: "19",
      activeRegionIds: ["7", "19"],
      regions: [{
        regionId: "7",
        receivedAt: "2026-07-30T18:00:00.000Z",
        warnings: [],
        lastError: "Relay region 7 disconnected",
      }, {
        regionId: "19",
        receivedAt: "2026-07-30T18:02:30.000Z",
        warnings: [],
        lastError: null,
      }],
    },
    confidence: "authoritative",
    lastError: "Region 7: Relay region 7 disconnected",
    warnings: [],
  };

  assert.deepEqual(empireSnapshotStatus(stored, "7", {
    now: () => Date.parse("2026-07-30T18:03:00.000Z"),
    staleAfterMs: 60_000,
  }), {
    stale: true,
    partial: true,
    ageMs: 180_000,
    updatedAt: "2026-07-30T18:00:00.000Z",
    errors: [
      "Region 7: Relay region 7 disconnected",
      "Region 7 data is 180000ms old.",
    ],
  });

  assert.deepEqual(empireSnapshotStatus(stored, "19", {
    now: () => Date.parse("2026-07-30T18:03:00.000Z"),
    staleAfterMs: 60_000,
  }), {
    stale: false,
    partial: false,
    ageMs: 30_000,
    updatedAt: "2026-07-30T18:02:30.000Z",
    errors: [],
  });

  const immediateFailure = structuredClone(stored);
  immediateFailure.data.regions[0].lastError = null;
  assert.equal(empireSnapshotStatus(immediateFailure, "7", {
    now: () => Date.parse("2026-07-30T18:00:30.000Z"),
    staleAfterMs: 60_000,
  }).stale, true);
});
