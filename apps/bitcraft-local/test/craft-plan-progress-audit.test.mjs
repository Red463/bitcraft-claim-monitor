import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCraftPlanProgressSnapshot,
  craftPlanProgressFingerprint,
  diffCraftPlanProgressSnapshots,
  normalizeCraftPlanAuditRange,
  staleCraftPlanProgress,
} from "../src/server/craftPlanProgressAudit.mjs";

function fixtureSnapshot({
  capturedAt = "2026-07-24T10:00:00.000Z",
  confirmed = 75,
  projected = confirmed,
  baselineRevision = "rev-a",
  material = {},
  sourceQuantity = 60,
  craftPresent = true,
} = {}) {
  const required = Number(material.required ?? 100);
  const available = Number(material.available ?? sourceQuantity);
  const guaranteed = Number(material.guaranteed ?? (craftPresent ? 15 : 0));
  const estimated = Number(material.estimated ?? 0);
  const missing = Math.max(0, required - available - guaranteed);
  const confirmedProgress = {
    overall: { completion: confirmed, baselineEffort: 100, remainingEffort: 100 - confirmed },
    sections: {},
  };
  const projectedProgress = {
    overall: { completion: projected, baselineEffort: 100, remainingEffort: 100 - projected },
    sections: {},
  };
  return {
    schemaVersion: 1,
    claimId: "1",
    capturedAt,
    baselineRevision,
    baselineInputs: {
      config: {
        targets: [{ id: "1", kind: "items", quantity: required }],
        routeOverrides: {},
        gatheredItemKeys: [],
        multipliers: {},
      },
      catalogRevision: "catalog-a",
      modelVersion: 3,
    },
    planInputs: {
      targets: [{ id: "1", kind: "items", quantity: required }],
      routeOverrides: {},
      gatheredItemKeys: [],
      multipliers: {},
      sourceRules: {
        storageContainerIds: ["store-1"],
        playerIds: ["player-1"],
        craftPlayerIds: ["player-1"],
        bankPlayerIds: [],
        deployableContainerIds: [],
      },
      buildingProgress: {},
    },
    planConfigFingerprint: "fixture",
    progress: { confirmed, projected },
    effortProgress: {
      confirmed: confirmedProgress,
      projected: projectedProgress,
      overall: confirmedProgress.overall,
      sections: confirmedProgress.sections,
      baselineRevision,
    },
    materials: [{
      key: "items:1",
      name: "Ink",
      required,
      missing,
      available,
      guaranteedInProgress: guaranteed,
      estimatedInProgress: estimated,
      effortWeight: 1,
      sources: [{
        sourceId: "store-1",
        label: "Scholar Storage",
        type: "Settlement storage",
        quantity: sourceQuantity,
      }],
      activeCraftSources: craftPresent ? [{
        craftId: "craft-1",
        playerId: "player-1",
        playerName: "Tom",
        buildingName: "Scholar Station",
        status: "In progress",
        quantity: guaranteed + estimated,
        directQuantity: guaranteed,
        guaranteedQuantity: guaranteed,
        estimatedQuantity: estimated,
      }] : [],
    }],
    sourceStatus: [{
      sourceId: "store-1",
      label: "Scholar Storage",
      type: "Settlement storage",
      available: true,
    }],
    metadata: { appVersion: "0.1.0", buildId: "abc", catalogRevision: "catalog-a", modelVersion: 3 },
  };
}

test("snapshot retains exact source identities and complete effort progress", () => {
  const snapshot = buildCraftPlanProgressSnapshot({
    claimId: "77",
    plan: {
      config: {
        targets: [{ id: "1", kind: "items", quantity: 10 }],
        routeOverrides: {},
        gatheredItemKeys: [],
        multipliers: {},
        sourceRules: {
          storageContainerIds: ["store-9"],
          playerIds: ["player-7"],
          craftPlayerIds: ["player-7"],
          bankPlayerIds: [],
          deployableContainerIds: [],
        },
        buildingProgress: {},
      },
      effortProgress: {
        baselineRevision: "rev-a",
        confirmed: { overall: { completion: 50, baselineEffort: 100, remainingEffort: 50 }, sections: {} },
        projected: { overall: { completion: 60, baselineEffort: 100, remainingEffort: 40 }, sections: {} },
        overall: { completion: 50, baselineEffort: 100, remainingEffort: 50 },
        sections: {},
        warnings: ["A useful warning"],
      },
      materials: [{
        key: "items:1",
        name: "Ink",
        required: 10,
        missing: 5,
        available: 4,
        guaranteedInProgress: 1,
        estimatedInProgress: 1,
        sources: [{ sourceId: "store-9", label: "Scholar Storage", type: "Settlement storage", quantity: 4 }],
        activeCraftSources: [{
          craftId: "craft-8",
          playerId: "player-7",
          playerName: "Tom",
          buildingName: "Scholar Station",
          status: "In progress",
          quantity: 2,
          directQuantity: 1,
          guaranteedQuantity: 1,
          estimatedQuantity: 1,
        }],
      }],
    },
    metadata: {
      appVersion: "0.1.0",
      buildId: "abc",
      catalogRevision: "catalog-a",
      modelVersion: 3,
      capturedAt: "2026-07-24T10:00:00.000Z",
    },
    sourceStatus: [{ sourceId: "store-9", label: "Scholar Storage", type: "Settlement storage", available: true }],
    weights: new Map([["items:1", { effortWeight: 5 }]]),
  });

  assert.equal(snapshot.materials[0].sources[0].label, "Scholar Storage");
  assert.equal(snapshot.materials[0].activeCraftSources[0].playerName, "Tom");
  assert.equal(snapshot.materials[0].effortWeight, 5);
  assert.equal(snapshot.progress.confirmed, 50);
  assert.equal(snapshot.progress.projected, 60);
  assert.equal(snapshot.effortProgress.confirmed.overall.completion, 50);
  assert.equal(snapshot.effortProgress.projected.overall.completion, 60);
  assert.deepEqual(snapshot.planInputs.sourceRules.storageContainerIds, ["store-9"]);
  assert.match(snapshot.planConfigFingerprint, /^[a-f0-9]{64}$/);
});

test("fingerprints ignore capture time but change with planner inputs", () => {
  const base = fixtureSnapshot();
  assert.equal(
    craftPlanProgressFingerprint({ ...base, capturedAt: "2026-07-24T10:00:00Z" }),
    craftPlanProgressFingerprint({ ...base, capturedAt: "2026-07-24T11:00:00Z" }),
  );
  assert.notEqual(
    craftPlanProgressFingerprint(base),
    craftPlanProgressFingerprint({ ...base, progress: { ...base.progress, confirmed: 49 } }),
  );
});

test("diff attributes stock, craft, requirement, output, and progress changes", () => {
  const previous = fixtureSnapshot({
    confirmed: 75,
    material: { required: 100, available: 60, guaranteed: 15, estimated: 5 },
    sourceQuantity: 60,
    craftPresent: true,
  });
  const current = fixtureSnapshot({
    confirmed: 65,
    material: { required: 130, available: 65, guaranteed: 0, estimated: 0 },
    sourceQuantity: 65,
    craftPresent: false,
  });
  const result = diffCraftPlanProgressSnapshots(previous, current);
  assert.ok(result.events.some((event) => event.type === "progress_delta" && event.confirmedDelta === -10));
  assert.ok(result.events.some((event) => event.type === "requirement_delta" && event.delta === 30));
  assert.ok(result.events.some((event) => event.type === "craft_removed" && event.craftId === "craft-1"));
  assert.ok(result.events.some((event) => event.type === "stock_delta" && event.delta === 5));
  assert.ok(result.events.some((event) => event.type === "guaranteed_output_delta" && event.delta === -15));
});

test("collection is inferred only when matching stock appears", () => {
  const result = diffCraftPlanProgressSnapshots(
    fixtureSnapshot({ craftPresent: true, sourceQuantity: 0 }),
    fixtureSnapshot({ craftPresent: false, sourceQuantity: 10 }),
  );
  const removed = result.events.find((event) => event.type === "craft_removed");
  assert.equal(removed.inference?.cause, "collected");
  assert.equal(removed.inference?.confidence, "medium");
  assert.match(removed.inference?.evidence.join(" "), /matching stock increase/i);
});

test("baseline changes are not reported as ordinary progress deltas", () => {
  const previous = fixtureSnapshot({ confirmed: 75, baselineRevision: "rev-a" });
  const current = fixtureSnapshot({ confirmed: 65, baselineRevision: "rev-b" });
  current.baselineInputs.config.targets[0].quantity = 120;
  const result = diffCraftPlanProgressSnapshots(previous, current);
  assert.equal(result.events.some((event) => event.type === "progress_delta"), false);
  assert.equal(result.events.some((event) => event.type === "baseline_change"), true);
  assert.match(result.baselineChange.reasons.join(" "), /target/i);
});

test("stale progress retains the complete last success and identifies failed sources", () => {
  const stale = staleCraftPlanProgress({
    confirmed: { overall: { completion: 72.8 }, sections: { Scholar: { completion: 47.5 } } },
    projected: { overall: { completion: 76.1 }, sections: { Scholar: { completion: 51 } } },
    overall: { completion: 72.8 },
    sections: { Scholar: { completion: 47.5 } },
    fishingVariants: { ocean: { overall: { completion: 70 } } },
    warnings: [],
    lastSuccessfulAt: "2026-07-24T09:00:00.000Z",
  }, [{
    sourceId: "player-1",
    label: "Mosswick inventory",
    type: "Player inventory",
    error: "HTTP 500",
  }], "2026-07-24T09:10:00.000Z");

  assert.equal(stale.overall.completion, 72.8);
  assert.equal(stale.confirmed.sections.Scholar.completion, 47.5);
  assert.equal(stale.fishingVariants.ocean.overall.completion, 70);
  assert.equal(stale.stale, true);
  assert.equal(stale.unavailableSources[0].label, "Mosswick inventory");
});

test("audit ranges are explicit and bounded by retention", () => {
  assert.deepEqual(
    normalizeCraftPlanAuditRange("24h", "2026-07-24T12:00:00.000Z"),
    { label: "24h", since: "2026-07-23T12:00:00.000Z" },
  );
  assert.equal(
    normalizeCraftPlanAuditRange("all", "2026-07-24T12:00:00.000Z").since,
    "2026-07-10T12:00:00.000Z",
  );
  assert.throws(
    () => normalizeCraftPlanAuditRange("30d", "2026-07-24T12:00:00.000Z"),
    /invalid audit range/i,
  );
});
