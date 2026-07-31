import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchCraftContributionEvidence,
  readRelayClaimForSupplyReport,
  readRelayCraftsForContributionReconciliation,
  readRelayMembersForTradeReconciliation,
  runIndependentReconciliation,
  sideEffectCollectorIsDue,
} from "../src/server/relayReconciliation.mjs";

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

test("relay reconciliation accepts a complete claim, crafts, and roster fenced to the configured claim", async () => {
  const snapshots = {
    claim: snapshot({ entityId: claimId, supplies: "900", name: "Timbersteel" }),
    crafts: snapshot({ craftResults: [{ entityId: "1369094286777412591", claimEntityId: claimId }] }, {
      warnings: ["Craft contributor history is not available from the proven Relay mapping."],
    }),
    members: snapshot([{ entityId: "1369094286777412592", claimEntityId: claimId, playerEntityId: "1369094286777412593", userName: "Tom" }]),
  };
  const read = (_claimId, domain) => snapshots[domain] ?? null;

  assert.equal(readRelayClaimForSupplyReport(read, claimId).supplies, "900");
  assert.deepEqual(readRelayCraftsForContributionReconciliation(read, claimId).craftResults, snapshots.crafts.data.craftResults);
  assert.deepEqual(readRelayMembersForTradeReconciliation(read, claimId), snapshots.members.data);
  assert.deepEqual(await fetchCraftContributionEvidence({
    craftsPayload: snapshots.crafts.data,
    fetchContribution: async (craftId) => craftId === "1369094286777412591" ? [{ contributorEntityId: "1369094286777412593" }] : [],
    mapWithConcurrency: async (values, _concurrency, mapper) => Promise.all(values.map(mapper)),
  }), {
    "1369094286777412591": [{ contributorEntityId: "1369094286777412593" }],
  });
});

test("relay reconciliation rejects partial, warning-bearing, malformed, and cross-claim inputs before side effects", () => {
  const partialClaim = (_claimId, domain) => domain === "claim"
    ? snapshot({ entityId: claimId, supplies: "900" }, { confidence: "partial" })
    : null;
  const warnedRoster = (_claimId, domain) => domain === "members"
    ? snapshot([{ entityId: "1369094286777412592", claimEntityId: claimId, playerEntityId: "1369094286777412593" }], { warnings: ["member row omitted"] })
    : null;
  const foreignCraft = (_claimId, domain) => domain === "crafts"
    ? snapshot({ craftResults: [{ entityId: "1369094286777412591", claimEntityId: "1369094286777412000" }] }, { warnings: ["Craft contributor history is not available from the proven Relay mapping."] })
    : null;

  assert.throws(() => readRelayClaimForSupplyReport(partialClaim, claimId), /partial/);
  assert.throws(() => readRelayMembersForTradeReconciliation(warnedRoster, claimId), /partial/);
  assert.throws(() => readRelayCraftsForContributionReconciliation(foreignCraft, claimId), /cross-claim/);
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
    ? snapshot({ craftResults: [active, completed] }, {
      warnings: ["Craft contributor history is not available from the proven Relay mapping."],
    })
    : null;

  assert.deepEqual(relay.readRelayCraftsForDiscord?.(read, claimId), {
    craftResults: [active],
  });
});

test("reconciliation cadence skips disabled or not-due imports but force runs them", () => {
  const settings = {
    productionContributions: { enabled: true, intervalSeconds: 300 },
    marketTrades: { enabled: false, intervalSeconds: 60 },
  };
  const statuses = {
    productionContributions: { lastSuccessAt: "2026-07-31T11:58:00.000Z" },
  };
  const now = Date.parse("2026-07-31T12:00:00.000Z");

  assert.equal(sideEffectCollectorIsDue({ key: "productionContributions", settings, statuses, now }), false);
  assert.equal(sideEffectCollectorIsDue({ key: "marketTrades", settings, statuses, now }), false);
  assert.equal(sideEffectCollectorIsDue({ key: "marketTrades", settings, statuses, now, force: true }), true);
});

test("a failed contribution reconciliation does not prevent market-trade reconciliation", async () => {
  const calls = [];
  const result = await runIndependentReconciliation({
    runMaintenance: async () => calls.push("maintenance"),
    runSupplyReport: async () => { throw new Error("claim input unavailable"); },
    runContributions: async () => { calls.push("contributions"); throw new Error("contribution evidence unavailable"); },
    runMarketTrades: async () => { calls.push("market"); return { inserted: 2 }; },
  });

  assert.deepEqual(calls, ["maintenance", "contributions", "market"]);
  assert.match(result.supplyError, /claim input unavailable/);
  assert.match(result.contributionError, /contribution evidence unavailable/);
  assert.equal(result.marketTrades.inserted, 2);
});

test("a failed market-trade reconciliation does not discard successful contribution reconciliation", async () => {
  const calls = [];
  const result = await runIndependentReconciliation({
    runMaintenance: async () => { throw new Error("temporary-ban check unavailable"); },
    runSupplyReport: async () => calls.push("supply"),
    runContributions: async () => { calls.push("contributions"); return { inserted: 3 }; },
    runMarketTrades: async () => { calls.push("market"); throw new Error("sale evidence unavailable"); },
  });

  assert.deepEqual(calls, ["supply", "contributions", "market"]);
  assert.match(result.maintenanceError, /temporary-ban check unavailable/);
  assert.equal(result.contributions.inserted, 3);
  assert.match(result.marketError, /sale evidence unavailable/);
});
