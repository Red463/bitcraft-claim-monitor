import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createRelaySettlementTransitionCoordinator } from "../src/server/relaySettlementTransitionCoordinator.mjs";

function flushAsyncWork() {
  return new Promise((resolve) => setImmediate(resolve));
}

function settlementSnapshots(claimId = "claim-1", generation = 1) {
  return {
    claim: {
      generation,
      data: {
        entityId: claimId,
        supplies: "9007199254740993125",
        treasury: "9007199254740993000",
      },
    },
    members: {
      generation,
      data: [{ entityId: "member-1", claimEntityId: claimId }],
    },
    inventories: {
      generation,
      data: {
        claim: { entityId: claimId },
        dimensions: [],
        buildings: [{ entityId: "storage-building" }],
      },
    },
    market: {
      generation,
      data: {
        claimId,
        regionId: "19",
        marketplaces: [],
        listings: [{ entityId: "listing-1" }],
      },
    },
  };
}

test("settlement transitions react only to relevant committed domains for the configured claim", async () => {
  const snapshots = settlementSnapshots();
  const applied = [];
  const coordinator = createRelaySettlementTransitionCoordinator({
    configuredClaimId: () => "claim-1",
    readDomainSnapshot: (_claimId, domain) => snapshots[domain],
    applySettlementTransition: async (claimId, summary) => applied.push({ claimId, summary }),
  });

  assert.equal(coordinator.onCommit({
    claimId: "claim-1",
    generation: 1,
    changedDomains: ["crafts"],
  }), false);
  assert.equal(coordinator.onCommit({
    claimId: "other-claim",
    generation: 1,
    changedDomains: ["claim"],
  }), false);
  assert.equal(coordinator.onCommit({
    claimId: "claim-1",
    generation: 1,
    changedDomains: ["members"],
  }), true);

  await coordinator.whenIdle();
  assert.deepEqual(applied, [{
    claimId: "claim-1",
    summary: {
      claimId: "claim-1",
      supplies: "9007199254740993125",
      treasury: "9007199254740993000",
      membersCount: 1,
      buildingsCount: null,
      marketCount: 1,
    },
  }]);
});

test("settlement transitions wait for all four valid claim-fenced domains", async () => {
  const snapshots = settlementSnapshots();
  const failures = [];
  let applications = 0;
  const coordinator = createRelaySettlementTransitionCoordinator({
    configuredClaimId: () => "claim-1",
    readDomainSnapshot: (_claimId, domain) => snapshots[domain],
    applySettlementTransition: async () => { applications += 1; },
    onFailure: (error) => failures.push(error.message),
  });

  snapshots.inventories = null;
  coordinator.onCommit({ claimId: "claim-1", generation: 1, changedDomains: ["claim"] });
  await coordinator.whenIdle();

  snapshots.inventories = settlementSnapshots().inventories;
  snapshots.members = { generation: 2, data: [{ claimEntityId: "other-claim" }] };
  coordinator.onCommit({ claimId: "claim-1", generation: 2, changedDomains: ["members"] });
  await coordinator.whenIdle();

  snapshots.members = { generation: 3, data: {} };
  coordinator.onCommit({ claimId: "claim-1", generation: 3, changedDomains: ["members"] });
  await coordinator.whenIdle();

  snapshots.members = {
    generation: 4,
    data: [{ entityId: "member-1", claimEntityId: "claim-1" }],
    confidence: "partial",
    warnings: ["members[1] was malformed"],
  };
  coordinator.onCommit({ claimId: "claim-1", generation: 4, changedDomains: ["members"] });
  await coordinator.whenIdle();

  assert.equal(applications, 0);
  assert.deepEqual(failures, [
    "Relay settlement snapshot is unavailable for inventories",
    "Relay settlement members escaped the configured claim",
    "Relay settlement members snapshot is malformed",
    "Relay settlement members snapshot is incomplete",
  ]);
});

test("settlement transition notifications return before side effects settle", async () => {
  const snapshots = settlementSnapshots();
  let releaseApply;
  const heldApply = new Promise((resolve) => { releaseApply = resolve; });
  let applyCalls = 0;
  const coordinator = createRelaySettlementTransitionCoordinator({
    configuredClaimId: () => "claim-1",
    readDomainSnapshot: (_claimId, domain) => snapshots[domain],
    applySettlementTransition: async () => {
      applyCalls += 1;
      await heldApply;
    },
  });

  assert.equal(coordinator.onCommit({
    claimId: "claim-1",
    generation: 1,
    changedDomains: ["claim", "members", "inventories", "market"],
  }), true);
  assert.equal(applyCalls, 0);

  await flushAsyncWork();
  assert.equal(applyCalls, 1);
  releaseApply();
  await coordinator.whenIdle();
});

test("settlement transitions coalesce overlapping notifications and recover after failure", async () => {
  let snapshots = settlementSnapshots("claim-1", 1);
  let releaseFirst;
  const heldFirst = new Promise((resolve) => { releaseFirst = resolve; });
  let active = 0;
  let maxActive = 0;
  const attempts = [];
  const failures = [];
  const successes = [];
  const coordinator = createRelaySettlementTransitionCoordinator({
    configuredClaimId: () => "claim-1",
    readDomainSnapshot: (_claimId, domain) => snapshots[domain],
    applySettlementTransition: async (_claimId, _summary, context) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      attempts.push(context.generationVector);
      if (attempts.length === 1) {
        await heldFirst;
        active -= 1;
        throw new Error("checkpoint busy");
      }
      active -= 1;
    },
    onFailure: (error) => failures.push(error.message),
    onSuccess: (_event, context) => successes.push(context.generationVector),
  });

  coordinator.onCommit({ claimId: "claim-1", generation: 1, changedDomains: ["claim"] });
  await flushAsyncWork();
  snapshots = settlementSnapshots("claim-1", 3);
  snapshots.claim.data.supplies = "9007199254740993126";
  coordinator.onCommit({ claimId: "claim-1", generation: 2, changedDomains: ["members"] });
  coordinator.onCommit({ claimId: "claim-1", generation: 3, changedDomains: ["market"] });
  releaseFirst();

  await coordinator.whenIdle();
  assert.equal(maxActive, 1);
  assert.deepEqual(failures, ["checkpoint busy"]);
  assert.deepEqual(attempts, [
    "claim:1|members:1|inventories:1|market:1",
    "claim:3|members:3|inventories:3|market:3",
  ]);
  assert.deepEqual(successes, ["claim:3|members:3|inventories:3|market:3"]);
});

test("settlement transitions retry transient failures without another commit", async () => {
  const snapshots = settlementSnapshots();
  let attempts = 0;
  const failures = [];
  const successes = [];
  const coordinator = createRelaySettlementTransitionCoordinator({
    configuredClaimId: () => "claim-1",
    readDomainSnapshot: (_claimId, domain) => snapshots[domain],
    applySettlementTransition: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("database is busy");
    },
    retryDelaysMs: [0, 0],
    onFailure: (error) => failures.push(error.message),
    onSuccess: () => successes.push("success"),
  });

  coordinator.onCommit({ claimId: "claim-1", generation: 1, changedDomains: ["claim"] });
  await coordinator.whenIdle();

  assert.equal(attempts, 2);
  assert.deepEqual(failures, ["database is busy"]);
  assert.deepEqual(successes, ["success"]);
});

test("settlement transition retries stop after the bounded backoff is exhausted", async () => {
  const snapshots = settlementSnapshots();
  let attempts = 0;
  const failures = [];
  const coordinator = createRelaySettlementTransitionCoordinator({
    configuredClaimId: () => "claim-1",
    readDomainSnapshot: (_claimId, domain) => snapshots[domain],
    applySettlementTransition: async () => {
      attempts += 1;
      throw new Error("database remains busy");
    },
    retryDelaysMs: [0, 0],
    onFailure: (error) => failures.push(error.message),
  });

  coordinator.onCommit({ claimId: "claim-1", generation: 1, changedDomains: ["claim"] });
  await coordinator.whenIdle();

  assert.equal(attempts, 3);
  assert.deepEqual(failures, [
    "database remains busy",
    "database remains busy",
    "database remains busy",
  ]);
});

test("equivalent committed settlement summaries do not duplicate transition evaluation", async () => {
  const snapshots = settlementSnapshots();
  const applied = [];
  const coordinator = createRelaySettlementTransitionCoordinator({
    configuredClaimId: () => "claim-1",
    readDomainSnapshot: (_claimId, domain) => snapshots[domain],
    applySettlementTransition: async (_claimId, summary, context) => {
      applied.push({ summary, vector: context.generationVector });
    },
  });

  coordinator.onCommit({ claimId: "claim-1", generation: 1, changedDomains: ["claim"] });
  await coordinator.whenIdle();
  snapshots.claim = {
    generation: 2,
    data: {
      ...snapshots.claim.data,
      supplies: "09007199254740993125",
      treasury: "09007199254740993000",
    },
  };
  coordinator.onCommit({ claimId: "claim-1", generation: 2, changedDomains: ["claim"] });
  await coordinator.whenIdle();
  snapshots.members = {
    generation: 3,
    data: [{ entityId: "same-member-new-row", claimEntityId: "claim-1" }],
  };
  coordinator.onCommit({ claimId: "claim-1", generation: 3, changedDomains: ["members"] });
  await coordinator.whenIdle();
  snapshots.members = {
    generation: 4,
    data: [
      { entityId: "same-member-new-row", claimEntityId: "claim-1" },
      { entityId: "member-2", claimEntityId: "claim-1" },
    ],
  };
  coordinator.onCommit({ claimId: "claim-1", generation: 4, changedDomains: ["members"] });
  await coordinator.whenIdle();

  assert.equal(applied.length, 2);
  assert.equal(applied[0].summary.supplies, "9007199254740993125");
  assert.equal(applied[0].summary.treasury, "9007199254740993000");
  assert.equal(applied[0].summary.membersCount, 1);
  assert.equal(applied[1].summary.membersCount, 2);
  assert.equal(applied[1].vector, "claim:2|members:4|inventories:1|market:1");
});

test("server gives committed Relay domains sole ownership of settlement transitions", () => {
  const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  const collectStart = server.indexOf("async function collectServerSnapshot");
  const collectEnd = server.indexOf("function marketHistory", collectStart);
  const collectServerSnapshot = server.slice(collectStart, collectEnd);

  assert.ok(collectStart > -1);
  assert.ok(collectEnd > collectStart);
  assert.match(server, /createRelaySettlementTransitionCoordinator/);
  assert.match(server, /settlementRelayTransitionCoordinator\?\.onCommit\(event\)/);
  assert.doesNotMatch(collectServerSnapshot, /recordSettlementState/);
  assert.doesNotMatch(server, /url\.pathname === "\/api\/local\/snapshot"/);
  assert.doesNotMatch(collectServerSnapshot, /const buildings = unwrap\(currentData\.buildings/);
});
