import assert from "node:assert/strict";
import test from "node:test";

import {
  readRelayClaimForSupplyReport,
  runIndependentReconciliation,
} from "../src/server/relayReconciliation.mjs";
import { reconcileCraftPlanBuildingProgress } from "../src/server/craftPlanning.mjs";

const claimId = "1369094286777412590";
const receivedAt = "2026-07-31T12:00:00.000Z";

function snapshot(data, overrides = {}) {
  return {
    data,
    confidence: "joined",
    lastError: null,
    provenance: {
      provider: "relay",
      sourceKey: "relay-cache",
      regionId: "19",
      database: null,
      schemaFingerprint: null,
      sourceObservedAt: receivedAt,
      receivedAt,
    },
    warnings: [],
    ...overrides,
  };
}

test("relay reconciliation accepts a complete claim fenced to the configured claim", () => {
  const snapshots = {
    claim: snapshot({ entityId: claimId, supplies: "900", name: "Timbersteel" }),
  };
  const read = (_claimId, domain) => snapshots[domain] ?? null;

  assert.equal(readRelayClaimForSupplyReport(read, claimId).supplies, "900");
});

test("relay reconciliation rejects partial claim input before side effects", () => {
  const partialClaim = (_claimId, domain) => domain === "claim"
    ? snapshot({ entityId: claimId, supplies: "900" }, { confidence: "partial" })
    : null;

  assert.throws(() => readRelayClaimForSupplyReport(partialClaim, claimId), /partial/);
});

test("relay reconciliation rejects snapshots that are not Relay-owned", () => {
  const legacyClaim = (_claimId, domain) => domain === "claim"
    ? snapshot(
      { entityId: claimId, supplies: "900" },
      { provenance: { provider: "legacy", receivedAt } },
    )
    : null;

  assert.throws(() => readRelayClaimForSupplyReport(legacyClaim, claimId), /not Relay-owned/);
});

test("Craft Plan building reconciliation rejects incomplete generations before they can create a false completion", async () => {
  const relay = await import("../src/server/relayReconciliation.mjs");
  assert.equal(typeof relay.readRelayClaimBuildingsForPlanning, "function");
  const buildingId = "1369094286777412599";
  const buildingDescriptionId = "77";
  const config = {
    targets: [{ kind: "building", id: buildingDescriptionId, name: "Workshop", quantity: 1 }],
    buildingProgress: {},
  };
  const partial = snapshot(
    { projects: [], buildings: [] },
    { confidence: "partial", warnings: ["Regional building_state omitted row 0."] },
  );
  const readPartial = (_claimId, domain) => domain === "construction" ? partial : null;

  assert.throws(
    () => relay.readRelayClaimBuildingsForPlanning(readPartial, claimId),
    /partial|warning/i,
  );

  const unchangedAfterRejectedPartial = config;
  const complete = snapshot({
    projects: [],
    buildings: [{
      entityId: buildingId,
      claimEntityId: claimId,
      buildingDescriptionId,
      constructedByPlayerEntityId: "1369094286777412598",
      directionIndex: 0,
    }],
  }, { confidence: "authoritative" });
  const buildings = relay.readRelayClaimBuildingsForPlanning(
    (_claimId, domain) => domain === "construction" ? complete : null,
    claimId,
  );
  const reconciled = reconcileCraftPlanBuildingProgress(
    unchangedAfterRejectedPartial,
    buildings,
  ).config;

  assert.deepEqual(reconciled.buildingProgress[`building:${buildingDescriptionId}`], {
    baselineEntityIds: [buildingId],
    completedEntityIds: [],
  });
});

test("Craft Plan building reconciliation rejects warned, malformed, and cross-claim construction rows", async () => {
  const relay = await import("../src/server/relayReconciliation.mjs");
  assert.equal(typeof relay.readRelayClaimBuildingsForPlanning, "function");
  const valid = {
    entityId: "1369094286777412599",
    claimEntityId: claimId,
    buildingDescriptionId: "77",
    constructedByPlayerEntityId: "1369094286777412598",
    directionIndex: 0,
  };
  const read = (construction) => (_claimId, domain) => (
    domain === "construction" ? construction : null
  );

  assert.throws(
    () => relay.readRelayClaimBuildingsForPlanning(
      read(snapshot({ projects: [], buildings: [valid] }, { warnings: ["row omitted"] })),
      claimId,
    ),
    /partial|warning/i,
  );
  assert.throws(
    () => relay.readRelayClaimBuildingsForPlanning(
      read(snapshot({ projects: "invalid", buildings: [valid] })),
      claimId,
    ),
    /malformed/i,
  );
  assert.throws(
    () => relay.readRelayClaimBuildingsForPlanning(
      read(snapshot({
        projects: [],
        buildings: [{ ...valid, claimEntityId: "1369094286777412000" }],
      })),
      claimId,
    ),
    /cross-claim/i,
  );
});

test("Discord online state joins exact member and player decimal-string identities", async () => {
  const relay = await import("../src/server/relayReconciliation.mjs");
  assert.equal(typeof relay.readRelayOnlineMembers, "function");
  const largePlayerId = "18446744073709551614";
  const otherPlayerId = "18446744073709551613";
  const snapshots = {
    members: snapshot([
      { claimEntityId: claimId, playerEntityId: largePlayerId, userName: "Exact Match" },
    ]),
    players: snapshot([
      { entityId: otherPlayerId, playerEntityId: otherPlayerId, username: "Wrong", signedIn: true },
      { entityId: largePlayerId, playerEntityId: largePlayerId, username: "Exact Match", signedIn: true },
    ]),
  };

  const rows = relay.readRelayOnlineMembers?.(
    (_claimId, domain) => snapshots[domain] ?? null,
    claimId,
  );
  assert.deepEqual(rows, [{
    member: snapshots.members.data[0],
    player: snapshots.players.data[1],
  }]);
});

test("Discord online state rejects unavailable, partial, and malformed player snapshots", async () => {
  const relay = await import("../src/server/relayReconciliation.mjs");
  assert.equal(typeof relay.readRelayOnlineMembers, "function");
  const members = snapshot([
    { claimEntityId: claimId, playerEntityId: "18446744073709551614", userName: "Exact Match" },
  ]);
  const readWithPlayers = (players) => (_claimId, domain) => (
    domain === "members" ? members : domain === "players" ? players : null
  );

  assert.throws(() => relay.readRelayOnlineMembers?.(readWithPlayers(null), claimId), /unavailable/);
  assert.throws(() => relay.readRelayOnlineMembers?.(
    readWithPlayers(snapshot([], { confidence: "partial" })),
    claimId,
  ), /partial/);
  assert.throws(() => relay.readRelayOnlineMembers?.(
    readWithPlayers(snapshot([{ entityId: "rounded-id", playerEntityId: "rounded-id", signedIn: true }])),
    claimId,
  ), /malformed/);
});

test("Discord crafts keep only incomplete claim-fenced normalized rows", async () => {
  const relay = await import("../src/server/relayReconciliation.mjs");
  assert.equal(typeof relay.readRelayCraftsForDiscord, "function");
  const active = {
    entityId: "1369094286777412591",
    claimEntityId: claimId,
    recipeId: "77",
    completed: false,
  };
  const completed = {
    entityId: "1369094286777412592",
    claimEntityId: claimId,
    recipeId: "78",
    completed: true,
  };
  const read = (_claimId, domain) => domain === "crafts"
    ? snapshot({ craftResults: [active, completed] })
    : null;

  assert.deepEqual(relay.readRelayCraftsForDiscord?.(read, claimId), {
    craftResults: [active],
  });
});

test("a failed scheduled report remains isolated from maintenance", async () => {
  const calls = [];
  const result = await runIndependentReconciliation({
    runMaintenance: async () => calls.push("maintenance"),
    runSupplyReport: async () => { throw new Error("claim input unavailable"); },
  });

  assert.deepEqual(calls, ["maintenance"]);
  assert.match(result.supplyError, /claim input unavailable/);
});

test("a failed maintenance task does not discard a successful scheduled report", async () => {
  const calls = [];
  const result = await runIndependentReconciliation({
    runMaintenance: async () => { throw new Error("temporary-ban check unavailable"); },
    runSupplyReport: async () => calls.push("supply"),
  });

  assert.deepEqual(calls, ["supply"]);
  assert.match(result.maintenanceError, /temporary-ban check unavailable/);
});
