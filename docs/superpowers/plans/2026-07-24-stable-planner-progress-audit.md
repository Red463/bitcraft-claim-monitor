# Stable Planner Progress and Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Craft Planner progress distinguish confirmed from projected effort, remain stable through temporary source failures, and record exportable diagnostics explaining every meaningful change.

**Architecture:** Keep the existing zero-stock effort model, but calculate two current-state projections against one canonical baseline: confirmed stock plus guaranteed output, and projected stock plus estimated output. Add a focused SQLite-backed audit module that normalizes planner snapshots, records deduplicated deltas, supplies the last successful progress during incomplete refreshes, and exports a 14-day diagnostic archive. Extend the existing planner, Discord, and admin UI consumers without replacing their current route or material APIs.

**Tech Stack:** Node.js 24, `node:sqlite`, built-in `node:crypto` and `node:zlib`, React, TypeScript, plain CSS, Node test runner, pnpm.

## Global Constraints

- Confirmed progress may decrease when genuinely counted stock or guaranteed output disappears.
- Estimated output must affect projected planning only, never confirmed progress.
- A failed source refresh is unknown data, not zero stock.
- Use one canonical zero-stock baseline for confirmed and projected progress.
- Building completion reduces remaining effort without shrinking its original baseline.
- Baseline revisions change only for targets, target quantities, routes, gathered overrides, buffers/multipliers, catalogue revision, or probability/effort model revision.
- Keep existing `effortProgress.overall` and `effortProgress.sections` as confirmed compatibility fields.
- Retain progress diagnostics for exactly 14 days.
- Audit exports include original player, storage, source, and craft identities.
- Audit exports must exclude tokens, sessions, credentials, cookies, and unrelated application settings.
- Do not add a new dependency; use built-in gzip support.
- Do not update the changelog or package version unless the user separately asks to push, publish, or deploy.

---

## File Structure

### Create

- `apps/bitcraft-local/src/server/craftPlanProgressAudit.mjs` — snapshot normalization, fingerprints, delta attribution, SQLite repository, stale-summary recovery, retention, and export bundle creation.
- `apps/bitcraft-local/test/craft-plan-progress-audit.test.mjs` — pure attribution, persistence, retention, stale recovery, and secret-exclusion tests.
- `apps/bitcraft-local/test/server-craft-plan-progress-audit-boundary.test.mjs` — server route, permission, source-failure, and capture wiring boundaries.

### Modify

- `apps/bitcraft-local/src/server/craftPlanEffortCache.mjs` — canonical baseline configuration and semantic baseline revision.
- `apps/bitcraft-local/src/server/craftPlanEffortProgress.mjs` — confirmed/projected summaries and compatibility aliases.
- `apps/bitcraft-local/src/server/craftPlanning.mjs` — retain both confirmed and projected effort inputs in the internal plan.
- `apps/bitcraft-local/src/server/schemaBootstrap.mjs` — additive progress audit tables and indexes.
- `apps/bitcraft-local/src/server/preparedStatements.mjs` — progress audit reads/writes/pruning.
- `apps/bitcraft-local/src/server/adminPermissions.mjs` — audit read and export permissions.
- `apps/bitcraft-local/server.mjs` — canonical baseline use, source completeness, stale recovery, audit capture, status API, and gzip export API.
- `apps/bitcraft-local/src/pages/craftPlanningEffortView.ts` — typed confirmed/projected/stale presentation model.
- `apps/bitcraft-local/src/pages/CraftPlanningPage.tsx` — headline, profession projection, stale, and baseline-change presentation.
- `apps/bitcraft-local/src/pages/CraftPlanManagerDialog.tsx` — progress audit timeline/status and export controls.
- `apps/bitcraft-local/src/styles/craft-planning.css` — compact confirmed/projected and audit styling.
- `apps/bitcraft-local/src/server/craftPlanDiscordReports.mjs` — confirmed headline, projected secondary line, stale state, and baseline-change note.
- Existing focused test files named in each task.

---

### Task 1: Canonical Baseline and Dual Effort Summaries

**Files:**
- Modify: `apps/bitcraft-local/src/server/craftPlanEffortCache.mjs`
- Modify: `apps/bitcraft-local/src/server/craftPlanEffortProgress.mjs`
- Modify: `apps/bitcraft-local/src/server/craftPlanning.mjs`
- Test: `apps/bitcraft-local/test/craft-plan-effort-cache.test.mjs`
- Test: `apps/bitcraft-local/test/craft-plan-effort-progress.test.mjs`
- Test: `apps/bitcraft-local/test/craft-planning.test.mjs`

**Interfaces:**
- Produces: `craftPlanBaselineConfig(config) -> normalized config`
- Produces: `craftPlanBaselineRevision(config, catalogRevision, modelVersion) -> SHA-256 string`
- Produces: `calculateCraftPlanEffortProgress(...) -> { confirmed, projected, overall, sections, fishingVariants, ... }`
- Preserves: `overall`, `sections`, and `fishingVariants` as confirmed compatibility fields.

- [ ] **Step 1: Add failing baseline revision tests**

Add cases proving live/display state does not revise the semantic baseline while plan inputs do:

```js
import {
  craftPlanBaselineConfig,
  craftPlanBaselineRevision,
  craftPlanEffortBaselineKey,
} from "../src/server/craftPlanEffortCache.mjs";

test("baseline configuration removes live progress and counted sources", () => {
  const result = craftPlanBaselineConfig({
    enabled: true,
    targets: [{ id: "1", kind: "building", quantity: 2, name: "Station" }],
    routeOverrides: { "items:2": "recipe:3" },
    gatheredItemKeys: ["items:4"],
    multipliers: { "items:5": { multiplier: 1.2, note: "buffer" } },
    sectionOverrides: { "items:5": "Farming" },
    rowNameOverrides: { "items:5": "Fiber" },
    sourceRules: { storageContainerIds: ["storage-1"] },
    buildingProgress: { "building:1": { baselineEntityIds: ["a"], completedEntityIds: ["a"] } },
  });
  assert.deepEqual(result.buildingProgress, {});
  assert.deepEqual(result.sourceRules, {
    storageContainerIds: [], playerIds: [], craftPlayerIds: [],
    bankPlayerIds: [], deployableContainerIds: [],
  });
  assert.equal(result.sectionOverrides["items:5"], "Farming");
});

test("semantic baseline revisions ignore labels and sources but include plan inputs", () => {
  const base = {
    targets: [{ id: "1", kind: "items", quantity: 10 }],
    routeOverrides: {}, gatheredItemKeys: [], multipliers: {},
    sourceRules: { storageContainerIds: ["a"] },
    sectionOverrides: {}, rowNameOverrides: {}, buildingProgress: {},
  };
  const revision = craftPlanBaselineRevision(base, "catalog-a", 3);
  assert.equal(craftPlanBaselineRevision({
    ...base,
    sourceRules: { storageContainerIds: ["b"] },
    sectionOverrides: { "items:1": "Farming" },
    rowNameOverrides: { "items:1": "Renamed" },
    buildingProgress: { "building:2": { completedEntityIds: ["done"] } },
  }, "catalog-a", 3), revision);
  const buffered = {
    ...base,
    multipliers: { "items:1": { multiplier: 1.2, note: "first explanation" } },
  };
  const bufferedRevision = craftPlanBaselineRevision(buffered, "catalog-a", 3);
  assert.equal(craftPlanBaselineRevision({
    ...buffered,
    multipliers: { "items:1": { multiplier: 1.2, note: "rewritten explanation" } },
  }, "catalog-a", 3), bufferedRevision);
  assert.notEqual(craftPlanBaselineRevision({
    ...buffered,
    multipliers: { "items:1": { multiplier: 1.3, note: "first explanation" } },
  }, "catalog-a", 3), bufferedRevision);
  assert.notEqual(craftPlanBaselineRevision({
    ...base,
    targets: [{ id: "1", kind: "items", quantity: 11 }],
  }, "catalog-a", 3), revision);
  assert.notEqual(craftPlanBaselineRevision(base, "catalog-b", 3), revision);
});
```

- [ ] **Step 2: Run the focused baseline tests and verify failure**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/craft-plan-effort-cache.test.mjs
```

Expected: FAIL because `craftPlanBaselineConfig` and `craftPlanBaselineRevision` are not exported.

- [ ] **Step 3: Implement canonical baseline helpers**

In `craftPlanEffortCache.mjs`, use stable sorting and explicit semantic fields:

```js
const emptySourceRules = {
  storageContainerIds: [],
  playerIds: [],
  craftPlayerIds: [],
  bankPlayerIds: [],
  deployableContainerIds: [],
};

export function craftPlanBaselineConfig(config = {}) {
  return {
    ...config,
    sourceRules: { ...emptySourceRules },
    buildingProgress: {},
  };
}

function semanticBaselineConfig(config = {}) {
  const multipliers = Object.fromEntries(
    Object.entries(config.multipliers ?? {})
      .map(([key, value]) => [String(key), Number(value?.multiplier ?? value ?? 1)])
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  return {
    enabled: config.enabled !== false,
    targets: Array.isArray(config.targets) ? config.targets.map((target) => ({
      id: String(target.id ?? ""),
      kind: String(target.kind ?? "items"),
      quantity: Number(target.quantity ?? 0),
    })) : [],
    routeOverrides: config.routeOverrides ?? {},
    gatheredItemKeys: [...(config.gatheredItemKeys ?? [])].map(String).sort(),
    multipliers,
  };
}

export function craftPlanBaselineRevision(config, catalogRevision, modelVersion) {
  return createHash("sha256")
    .update(JSON.stringify(stable({
      config: semanticBaselineConfig(config),
      catalogRevision: String(catalogRevision ?? ""),
      modelVersion: Number(modelVersion ?? 0),
    })))
    .digest("hex");
}

export function craftPlanEffortBaselineKey(config, catalogRevision, modelVersion) {
  return createHash("sha256")
    .update(JSON.stringify(stable({
      config: craftPlanBaselineConfig(config),
      catalogRevision,
      modelVersion,
    })))
    .digest("hex");
}
```

- [ ] **Step 4: Add failing dual-progress tests**

Add a test where expected output improves projected progress but not confirmed progress:

```js
test("effort progress separates confirmed and projected active output", () => {
  const baselinePlan = {
    materials: [{ key: "items:ink", section: "Scholar", required: 100, missing: 100 }],
    personalViews: { fishing: { tiers: [] } },
  };
  const currentPlan = {
    materials: [{ key: "items:ink", section: "Scholar", required: 100, missing: 20 }],
    confirmedEffortPlan: {
      materials: [{ key: "items:ink", section: "Scholar", required: 100, missing: 40 }],
      personalViews: { fishing: { tiers: [] } },
    },
    personalViews: { fishing: { tiers: [] } },
  };
  const result = calculateCraftPlanEffortProgress({
    baselinePlan,
    currentPlan,
    weights: new Map([["items:ink", 1]]),
  });
  assert.equal(result.confirmed.overall.completion, 60);
  assert.equal(result.projected.overall.completion, 80);
  assert.equal(result.overall.completion, 60);
  assert.strictEqual(result.sections, result.confirmed.sections);
  assert.equal(result.projected.sections.Scholar.completion, 80);
});

test("projected completion is never below confirmed completion", () => {
  const result = calculateCraftPlanEffortProgress({
    baselinePlan: {
      materials: [{ key: "items:x", section: "Other", required: 10, missing: 10 }],
      personalViews: { fishing: { tiers: [] } },
    },
    currentPlan: {
      materials: [{ key: "items:x", section: "Other", required: 10, missing: 9 }],
      confirmedEffortPlan: {
        materials: [{ key: "items:x", section: "Other", required: 10, missing: 4 }],
        personalViews: { fishing: { tiers: [] } },
      },
      personalViews: { fishing: { tiers: [] } },
    },
    weights: new Map([["items:x", 1]]),
  });
  assert.equal(result.confirmed.overall.completion, 60);
  assert.equal(result.projected.overall.completion, 60);
});
```

- [ ] **Step 5: Run the focused effort tests and verify failure**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/craft-plan-effort-progress.test.mjs
```

Expected: FAIL because `confirmed` and `projected` are not returned.

- [ ] **Step 6: Refactor the effort calculation into reusable projections**

Keep `calculateProjection` as the single calculation path, run it for both plans, clamp projected aggregates against confirmed aggregates, and return confirmed aliases:

```js
function atLeastConfirmed(confirmed, projected) {
  if (!confirmed || !projected) return projected;
  if (confirmed.completion == null || projected.completion == null) return projected;
  if (projected.completion >= confirmed.completion) return projected;
  return {
    ...projected,
    remainingEffort: confirmed.remainingEffort,
    completion: confirmed.completion,
  };
}

function clampProjection(confirmed, projected) {
  const sections = Object.fromEntries(Object.entries(projected.sections ?? {}).map(([name, value]) => [
    name,
    atLeastConfirmed(confirmed.sections?.[name], value),
  ]));
  return {
    ...projected,
    overall: atLeastConfirmed(confirmed.overall, projected.overall),
    sections,
  };
}

const confirmedPlan = currentPlan?.confirmedEffortPlan ?? currentPlan;
const confirmed = calculatePlanSummary(baselinePlan, confirmedPlan, weights);
const rawProjected = calculatePlanSummary(baselinePlan, currentPlan, weights);
const projected = clampProjection(confirmed, rawProjected);

return {
  modelVersion: CRAFT_PLAN_EFFORT_MODEL_VERSION,
  ...confirmed,
  confirmed,
  projected,
};
```

Apply the same confirmed/projected structure to ocean and lake fishing variants. Empty and unavailable states must expose both projections and preserve root compatibility fields.

- [ ] **Step 7: Ensure internal plans retain both effort inputs**

Keep the current projected `materials`/`personalViews` and confirmed `confirmedEffortPlan`; add a regression assertion in `craft-planning.test.mjs`:

```js
assert.equal(plan.materials.find((row) => row.key === "items:ink").missing, 20);
assert.equal(plan.confirmedEffortPlan.materials.find((row) => row.key === "items:ink").missing, 40);
```

Extend the existing active-craft fixtures with these automated cases:

- Moving 10 guaranteed output from a ready-to-collect craft into a tracked stock source leaves confirmed missing quantity unchanged.
- A ready-to-collect deterministic passive craft remains in `confirmedEffortPlan`.
- Completing one configured building reduces current remaining effort while `baselinePlan` still contains the original building target quantity.

- [ ] **Step 8: Run focused tests**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/craft-plan-effort-cache.test.mjs test/craft-plan-effort-progress.test.mjs test/craft-planning.test.mjs
```

Expected: all tests PASS.

- [ ] **Step 9: Commit**

```powershell
git add apps/bitcraft-local/src/server/craftPlanEffortCache.mjs apps/bitcraft-local/src/server/craftPlanEffortProgress.mjs apps/bitcraft-local/src/server/craftPlanning.mjs apps/bitcraft-local/test/craft-plan-effort-cache.test.mjs apps/bitcraft-local/test/craft-plan-effort-progress.test.mjs apps/bitcraft-local/test/craft-planning.test.mjs
git commit -m "feat: separate confirmed and projected planner progress"
```

---

### Task 2: Pure Progress Snapshot and Change Attribution

**Files:**
- Create: `apps/bitcraft-local/src/server/craftPlanProgressAudit.mjs`
- Create: `apps/bitcraft-local/test/craft-plan-progress-audit.test.mjs`

**Interfaces:**
- Consumes: dual `effortProgress` from Task 1.
- Produces: `buildCraftPlanProgressSnapshot(input) -> normalized snapshot`
- Produces: `craftPlanProgressFingerprint(snapshot) -> SHA-256 string`
- Produces: `diffCraftPlanProgressSnapshots(previous, current) -> event[]`
- Produces: `staleCraftPlanProgress(lastSuccess, failures, now) -> effortProgress`
- Produces: `normalizeCraftPlanAuditRange(value, now) -> { label, since }`

- [ ] **Step 1: Write failing snapshot normalization tests**

```js
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
    baselineRevision: "rev-a",
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
    progress: { confirmed, projected },
    effortProgress: {
      confirmed: confirmedProgress,
      projected: projectedProgress,
      overall: confirmedProgress.overall,
      sections: confirmedProgress.sections,
      baselineRevision: "rev-a",
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
    metadata: { appVersion: "0.1.0", buildId: "abc", catalogRevision: "catalog-a" },
  };
}

test("snapshot retains exact stock and craft source identities", () => {
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
      },
      materials: [{
        key: "items:1", name: "Ink", required: 10, missing: 5,
        available: 4, guaranteedInProgress: 1, estimatedInProgress: 1,
        sources: [{ sourceId: "store-9", label: "Scholar Storage", type: "Settlement storage", quantity: 4 }],
        activeCraftSources: [{
          craftId: "craft-8", playerId: "player-7", playerName: "Tom",
          buildingName: "Scholar Station", status: "In progress",
          quantity: 2, directQuantity: 1, guaranteedQuantity: 1, estimatedQuantity: 1,
        }],
      }],
    },
    metadata: { appVersion: "0.1.0", buildId: "abc", catalogRevision: "catalog-a", capturedAt: "2026-07-24T10:00:00.000Z" },
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
  const base = { claimId: "1", progress: { confirmed: 50 }, materials: [], sources: [], crafts: [] };
  assert.equal(
    craftPlanProgressFingerprint({ ...base, capturedAt: "2026-07-24T10:00:00Z" }),
    craftPlanProgressFingerprint({ ...base, capturedAt: "2026-07-24T11:00:00Z" }),
  );
  assert.notEqual(
    craftPlanProgressFingerprint(base),
    craftPlanProgressFingerprint({ ...base, progress: { confirmed: 49 } }),
  );
});

test("audit ranges are explicit and bounded by retention", () => {
  assert.deepEqual(
    normalizeCraftPlanAuditRange("24h", "2026-07-24T12:00:00.000Z"),
    { label: "24h", since: "2026-07-23T12:00:00.000Z" },
  );
  assert.throws(
    () => normalizeCraftPlanAuditRange("30d", "2026-07-24T12:00:00.000Z"),
    /invalid audit range/i,
  );
});
```

- [ ] **Step 2: Write failing attribution and stale-state tests**

```js
test("diff attributes stock, craft, source, requirement, and progress changes", () => {
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
  const events = diffCraftPlanProgressSnapshots(previous, current);
  assert.ok(events.some((event) => event.type === "progress_delta" && event.confirmedDelta === -10));
  assert.ok(events.some((event) => event.type === "requirement_delta" && event.delta === 30));
  assert.ok(events.some((event) => event.type === "craft_removed" && event.craftId === "craft-1"));
  assert.ok(events.some((event) => event.type === "stock_delta" && event.delta === 5));
  assert.ok(events.some((event) => event.type === "guaranteed_output_delta" && event.delta === -15));
});

test("collection is marked inferred only when matching stock appears", () => {
  const events = diffCraftPlanProgressSnapshots(
    fixtureSnapshot({ craftPresent: true, sourceQuantity: 0 }),
    fixtureSnapshot({ craftPresent: false, sourceQuantity: 10 }),
  );
  const removed = events.find((event) => event.type === "craft_removed");
  assert.equal(removed.inference?.cause, "collected");
  assert.equal(removed.inference?.confidence, "medium");
  assert.match(removed.inference?.evidence.join(" "), /matching stock increase/i);
});

test("stale progress retains last success and identifies failed sources", () => {
  const stale = staleCraftPlanProgress({
    confirmed: { overall: { completion: 72.8 }, sections: {} },
    projected: { overall: { completion: 76.1 }, sections: {} },
    overall: { completion: 72.8 },
    sections: {},
    lastSuccessfulAt: "2026-07-24T09:00:00.000Z",
  }, [{ sourceId: "player-1", label: "Mosswick inventory", type: "Player inventory", error: "HTTP 500" }], "2026-07-24T09:10:00.000Z");
  assert.equal(stale.overall.completion, 72.8);
  assert.equal(stale.stale, true);
  assert.equal(stale.unavailableSources[0].label, "Mosswick inventory");
});
```

- [ ] **Step 3: Run the new test and verify failure**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/craft-plan-progress-audit.test.mjs
```

Expected: FAIL because the module does not exist.

- [ ] **Step 4: Implement normalized snapshot builders**

Implement stable source keys and only planner-relevant fields:

```js
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function sourceKey(materialKey, source = {}) {
  return `${materialKey}\u0000${source.type ?? ""}\u0000${source.sourceId ?? ""}`;
}

function craftKey(materialKey, source = {}) {
  return `${materialKey}\u0000${source.craftId ?? source.sourceId ?? ""}`;
}

export function craftPlanProgressFingerprint(snapshot = {}) {
  const { capturedAt, ...content } = snapshot;
  return createHash("sha256").update(JSON.stringify(stable(content))).digest("hex");
}
```

`buildCraftPlanProgressSnapshot` must emit deterministic arrays sorted by keys and include:

- The complete sanitized `effortProgress` object, including confirmed/projected overall, sections, fishing variants, and warnings, so stale recovery can restore the full display state.
- Exact material/source/craft labels and IDs.
- `baselineInputs` containing only semantic targets, route overrides, gathered overrides, numeric multipliers, catalogue revision, and model version.
- Sanitized `planInputs` containing targets, routes, gathered overrides, buffers, exact tracked-source rules, and building-completion inputs. Store a deterministic `planConfigFingerprint` derived from this object.
- Source refresh state and effort weight per material.

Do not include request objects, cookies, sessions, tokens, or general server settings.

- [ ] **Step 5: Implement delta attribution**

Compare maps keyed by item/source/craft identity. Emit structured events with `type`, exact before/after values, `delta`, `itemKey`, source/craft identity, and optional `inference`. Cover source-rule additions/removals, source availability/restoration, building completion, and craft status/direct/guaranteed/estimated output changes in addition to stock and requirements. Calculate top effort contributions as:

```js
const remainingEffortDelta = (currentMissing - previousMissing) * effortWeight;
```

Sort contributors by absolute effort delta descending and retain the top 20 per progress event.

When `baselineRevision` changes, compare `baselineInputs` and return a structured `baseline_change` event plus a `baselineChange` summary. Reasons must name the semantic causes that changed: targets, target quantities, routes, gathered overrides, numeric multipliers, catalogue revision, or model version. Label-only edits and source selection changes are not baseline reasons. Do not emit an ordinary `progress_delta` across different baseline revisions; the baseline event records the before/after summaries and starts a new comparison epoch.

- [ ] **Step 6: Implement stale progress helper**

Return the last successful summary unchanged except for:

```js
return {
  ...lastSuccess,
  stale: true,
  staleSince: String(now),
  unavailableSources: failures.map((failure) => ({
    sourceId: String(failure.sourceId ?? ""),
    label: String(failure.label ?? failure.sourceId ?? "Unknown source"),
    type: String(failure.type ?? "Planner source"),
    error: String(failure.error ?? "Refresh failed").slice(0, 300),
  })),
  warnings: [...new Set([
    ...(lastSuccess.warnings ?? []),
    "Planner progress is showing the last complete refresh because one or more counted sources are unavailable.",
  ])],
};
```

- [ ] **Step 7: Run the new test**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/craft-plan-progress-audit.test.mjs
```

Expected: all snapshot, diff, inference, and stale-state tests PASS.

- [ ] **Step 8: Commit**

```powershell
git add apps/bitcraft-local/src/server/craftPlanProgressAudit.mjs apps/bitcraft-local/test/craft-plan-progress-audit.test.mjs
git commit -m "feat: attribute craft planner progress changes"
```

---

### Task 3: Audit Schema and Repository

**Files:**
- Modify: `apps/bitcraft-local/src/server/schemaBootstrap.mjs`
- Modify: `apps/bitcraft-local/src/server/preparedStatements.mjs`
- Modify: `apps/bitcraft-local/src/server/craftPlanProgressAudit.mjs`
- Modify: `apps/bitcraft-local/test/server-schema-bootstrap.test.mjs`
- Modify: `apps/bitcraft-local/test/server-prepared-statements.test.mjs`
- Modify: `apps/bitcraft-local/test/craft-plan-progress-audit.test.mjs`

**Interfaces:**
- Produces: `createCraftPlanProgressAuditRepository(db, options)`
- Repository methods: `recordSuccess`, `recordFailure`, `latestSuccess`, `status`, `listEvents`, `latestBaselineChange`, `exportRange`, `prune`.

- [ ] **Step 1: Add failing schema and statement assertions**

Add required fragments to the existing schema test:

```js
for (const fragment of [
  "CREATE TABLE IF NOT EXISTS craft_plan_progress_audit_snapshots",
  "CREATE TABLE IF NOT EXISTS craft_plan_progress_audit_events",
  "CREATE TABLE IF NOT EXISTS craft_plan_progress_audit_state",
  "CREATE INDEX IF NOT EXISTS idx_craft_plan_progress_snapshots_claim_time",
  "CREATE INDEX IF NOT EXISTS idx_craft_plan_progress_events_claim_time",
]) {
  assert.match(schemaBootstrapSql, new RegExp(fragment));
}
```

Add prepared statement keys:

```js
for (const key of [
  "insertCraftPlanProgressSnapshot",
  "latestCraftPlanProgressSnapshot",
  "latestCraftPlanProgressSnapshotBefore",
  "insertCraftPlanProgressEvent",
  "listCraftPlanProgressEvents",
  "upsertCraftPlanProgressAuditState",
  "getCraftPlanProgressAuditState",
  "pruneCraftPlanProgressSnapshots",
  "pruneCraftPlanProgressEvents",
]) assert.ok(statements[key], `${key} should be prepared`);
```

- [ ] **Step 2: Run focused schema tests and verify failure**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/server-schema-bootstrap.test.mjs test/server-prepared-statements.test.mjs
```

Expected: FAIL on missing tables and statements.

- [ ] **Step 3: Add additive bootstrap tables**

Add:

```sql
CREATE TABLE IF NOT EXISTS craft_plan_progress_audit_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  claim_id TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  baseline_revision TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  full_snapshot INTEGER NOT NULL DEFAULT 1,
  payload_gzip BLOB NOT NULL,
  app_version TEXT NOT NULL,
  build_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS craft_plan_progress_audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  claim_id TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  baseline_revision TEXT,
  event_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS craft_plan_progress_audit_state (
  claim_id TEXT PRIMARY KEY,
  last_fingerprint TEXT,
  last_payload_gzip BLOB,
  last_snapshot_id INTEGER,
  last_full_snapshot_at TEXT,
  last_success_at TEXT,
  last_failure_fingerprint TEXT,
  last_error TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_craft_plan_progress_snapshots_claim_time
  ON craft_plan_progress_audit_snapshots (claim_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_craft_plan_progress_events_claim_time
  ON craft_plan_progress_audit_events (claim_id, captured_at DESC);
```

- [ ] **Step 4: Add prepared statements**

Prepare bounded reads, inserts, upsert state, and cutoff deletes. `latestCraftPlanProgressSnapshotBefore` supplies the reconstruction checkpoint immediately before a requested export range. `listCraftPlanProgressEvents` must accept `(claimId, since, limit)` and order ascending for exports; the admin timeline may reverse the returned rows. Retention deletes must use an ID subquery with a fixed batch limit rather than one unbounded delete.

- [ ] **Step 5: Add failing repository lifecycle test**

Use `DatabaseSync(":memory:")`, `schemaBootstrapSql`, and `createPreparedStatements`. Add this concrete test helper next to the `fixtureSnapshot` helper from Task 2:

```js
function createTestRepository(clock) {
  const db = new DatabaseSync(":memory:");
  db.exec(schemaBootstrapSql);
  const statements = createPreparedStatements(db);
  return createCraftPlanProgressAuditRepository(db, {
    statements,
    now: () => clock.now,
    retentionDays: 14,
  });
}

test("repository deduplicates, stores six-hour full snapshots, and prunes after 14 days", () => {
  const clock = { now: "2026-07-24T12:00:00.000Z" };
  const repository = createTestRepository(clock);
  const first = repository.recordSuccess(fixtureSnapshot({ capturedAt: clock.now, confirmed: 50 }));
  const duplicate = repository.recordSuccess(fixtureSnapshot({ capturedAt: "2026-07-24T12:01:00.000Z", confirmed: 50 }));
  assert.equal(first.recorded, true);
  assert.equal(duplicate.recorded, false);

  clock.now = "2026-07-24T18:01:00.000Z";
  const heartbeat = repository.recordSuccess(fixtureSnapshot({ capturedAt: clock.now, confirmed: 50 }));
  assert.equal(heartbeat.fullSnapshot, true);

  repository.recordFailure("1", [{ label: "Mosswick inventory", error: "HTTP 500" }], clock.now);
  repository.recordFailure("1", [{ label: "Mosswick inventory", error: "HTTP 500" }], "2026-07-24T18:02:00.000Z");
  assert.match(repository.status("1").lastError, /Mosswick inventory/);
  assert.equal(
    repository.listEvents("1", { since: "2026-07-24T18:00:00.000Z", limit: 100 })
      .filter((event) => event.eventType === "source_failure").length,
    1,
  );

  repository.prune("2026-07-24T18:01:00.000Z");
  assert.equal(repository.exportRange("1", { since: "2026-07-10T18:01:00.000Z" }).retentionDays, 14);
  assert.equal(repository.latestSuccess("1").effortProgress.confirmed.overall.completion, 50);
});
```

- [ ] **Step 6: Implement the repository**

`recordSuccess` must:

1. Load audit state and gunzip `last_payload_gzip`; fall back to the newest valid historical full snapshot only when state has no usable payload.
2. Skip identical fingerprints unless six hours elapsed.
3. Diff the previous snapshot and insert each structured event.
4. Insert a historical full snapshot on the first success, whenever the baseline changes, and at least every six hours. Compact events cover changes between these checkpoints.
5. Gzip and update `last_payload_gzip` on every changed success, even when no historical full snapshot is due, so the next diff and stale recovery survive process restarts.
6. Clear `last_error` and `last_failure_fingerprint`; if a failure was active, insert one `source_recovered` event.
7. Prune historical snapshots and events older than `capturedAt - 14 days` in bounded SQL deletes. Keep current state regardless of its age.
8. Return `{ recorded, fullSnapshot, events, baselineChanged, baselineChange, capturedAt }`.

`recordFailure` must normalize and fingerprint the ordered failed-source list. Insert a `source_failure` event only when that fingerprint changes, while always updating the state timestamp and bounded `last_error`. This prevents repeated failed polls from flooding the audit.

`latestSuccess(claimId)` must gunzip `last_payload_gzip`; if it is corrupt or absent, scan historical full snapshots newest-first until a valid payload is found. Because snapshots retain the complete sanitized `effortProgress`, this method can restore the confirmed/projected sections, fishing variants, and warnings without recalculation. `exportRange` returns:

```js
{
  schemaVersion: 1,
  generatedAt,
  retentionDays: 14,
  claimId,
  status,
  effectiveSince,
  snapshots, // the checkpoint at/before the range plus later full checkpoints
  events,
  warnings,
}
```

The export whitelist is constructed from audit tables only; do not serialize server settings or request/session objects. The combination of the nearest valid checkpoint at or before `since`, later full checkpoints, and ordered compact events makes changes reconstructable. If no valid checkpoint exists before the first retained event, set `effectiveSince` to the first valid full snapshot and add a manifest warning rather than claiming complete reconstruction.

- [ ] **Step 7: Run repository and schema tests**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/server-schema-bootstrap.test.mjs test/server-prepared-statements.test.mjs test/craft-plan-progress-audit.test.mjs
```

Expected: all tests PASS.

- [ ] **Step 8: Commit**

```powershell
git add apps/bitcraft-local/src/server/schemaBootstrap.mjs apps/bitcraft-local/src/server/preparedStatements.mjs apps/bitcraft-local/src/server/craftPlanProgressAudit.mjs apps/bitcraft-local/test/server-schema-bootstrap.test.mjs apps/bitcraft-local/test/server-prepared-statements.test.mjs apps/bitcraft-local/test/craft-plan-progress-audit.test.mjs
git commit -m "feat: persist craft planner progress audits"
```

---

### Task 4: Server Capture, Stale Recovery, and Admin APIs

**Files:**
- Modify: `apps/bitcraft-local/server.mjs`
- Modify: `apps/bitcraft-local/src/server/adminPermissions.mjs`
- Create: `apps/bitcraft-local/test/server-craft-plan-progress-audit-boundary.test.mjs`
- Modify: `apps/bitcraft-local/test/craft-planning-boundary.test.mjs`
- Modify: `apps/bitcraft-local/test/server-admin-permissions.test.mjs`

**Interfaces:**
- Consumes: Tasks 1–3 baseline, progress, snapshot, and repository APIs.
- Produces public plan fields: `effortProgress.baselineRevision`, `baselineChange`, `stale`, `lastSuccessfulAt`, `unavailableSources`.
- Produces admin endpoints:
  - `GET /api/local/admin/craft-plan/progress-audit`
  - `GET /api/local/admin/craft-plan/progress-audit/export?range=24h|3d|7d|all`

- [ ] **Step 1: Write failing server boundary and permission tests**

Assert the server:

```js
assert.match(server, /createCraftPlanProgressAuditRepository/);
assert.match(computedCraftPlan, /craftPlanBaselineConfig\(config\)/);
assert.match(computedCraftPlan, /craftPlanBaselineRevision/);
assert.match(computedCraftPlan, /recordSuccess/);
assert.match(computedCraftPlan, /recordFailure/);
assert.match(computedCraftPlan, /staleCraftPlanProgress/);
assert.match(server, /craftPlanProgressAuditWriteWarning/);
assert.match(server, /\/api\/local\/admin\/craft-plan\/progress-audit/);
assert.match(server, /progress-audit\/export/);
assert.match(server, /application\/gzip/);
assert.match(server, /content-disposition/);
```

Permission assertions:

```js
assert.equal(adminPermissionFor("GET", "/api/local/admin/craft-plan/progress-audit"), "audit.view");
assert.equal(adminPermissionFor("GET", "/api/local/admin/craft-plan/progress-audit/export"), "data.export");
```

- [ ] **Step 2: Run boundary tests and verify failure**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/server-craft-plan-progress-audit-boundary.test.mjs test/server-admin-permissions.test.mjs test/craft-planning-boundary.test.mjs
```

Expected: FAIL on missing integration and routes.

- [ ] **Step 3: Create one repository instance at server startup**

After database bootstrap and prepared statements:

```js
const craftPlanProgressAudit = createCraftPlanProgressAuditRepository(db, {
  statements,
  appVersion,
  buildId: currentAppBuildId,
  retentionDays: 14,
});
let craftPlanProgressAuditWriteWarning = null;
```

The repository receives `currentAppBuildId` as a function because the build ID helper is initialized later in the module.

- [ ] **Step 4: Track completeness of counted sources**

Replace silent empty fallbacks for counted sources with structured results:

```js
async function craftPlanSourceResult(source, load) {
  try {
    return { source, value: await load(), error: "" };
  } catch (error) {
    return {
      source,
      value: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
```

Create failures for:

- Claim inventories
- Claim active crafts
- Each selected player inventory/bank/deployable fetch
- Each selected player craft fetch
- Each selected player passive-craft fetch

Member-name and building-reconciliation failures may retain existing labels/progress and must not alone invalidate stock completeness.

- [ ] **Step 5: Use canonical baseline and attach dual progress**

Inside `computedCraftPlanResponseFresh`:

```js
const catalogRevision = gameCatalogRepository.getEffortWeightRevision(CRAFT_PLAN_EFFORT_MODEL_VERSION);
const baselineRevision = craftPlanBaselineRevision(
  config,
  catalogRevision,
  CRAFT_PLAN_EFFORT_MODEL_VERSION,
);
const baselineConfig = craftPlanBaselineConfig(config);
const baselineKey = craftPlanEffortBaselineKey(
  baselineConfig,
  catalogRevision,
  CRAFT_PLAN_EFFORT_MODEL_VERSION,
);
const baselinePlan = await craftPlanEffortBaselineCache.getOrCreate(baselineKey, async () => (
  compactCraftPlanEffortInput(computeCraftPlan({
    config: baselineConfig,
    detailsByKey,
    catalogWarnings,
  }))
));
livePlan.effortProgress = {
  ...calculateCraftPlanEffortProgress({ baselinePlan, currentPlan: livePlan, weights }),
  baselineRevision,
};
```

- [ ] **Step 6: Record complete refreshes and retain stale summaries**

If no counted-source failures:

```js
const auditResult = craftPlanProgressAudit.recordSuccess(buildCraftPlanProgressSnapshot({
  claimId,
  plan: livePlan,
  sourceStatus,
  weights,
  metadata: {
    capturedAt: new Date().toISOString(),
    appVersion,
    buildId: currentAppBuildId(),
    catalogRevision,
    modelVersion: CRAFT_PLAN_EFFORT_MODEL_VERSION,
  },
}));
livePlan.effortProgress.baselineChange = auditResult.baselineChange ?? null;
livePlan.effortProgress.lastSuccessfulAt = auditResult.capturedAt;
```

If failures exist:

```js
craftPlanProgressAudit.recordFailure(claimId, sourceFailures, new Date().toISOString());
const lastSuccess = craftPlanProgressAudit.latestSuccess(claimId);
livePlan.effortProgress = lastSuccess
  ? staleCraftPlanProgress(lastSuccess.effortProgress, sourceFailures, new Date().toISOString())
  : unavailableCraftPlanEffortProgress();
livePlan.unavailableSources = [...livePlan.unavailableSources, ...sourceFailures];
```

Wrap audit writes in `try/catch`; log a bounded warning and return the planner response unchanged if persistence fails. Set:

```js
craftPlanProgressAuditWriteWarning = {
  at: new Date().toISOString(),
  error: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
};
```

Clear this in-memory warning after the next successful audit write. This makes a database-write failure visible to the admin status route even when the failed write cannot update SQLite.

- [ ] **Step 7: Add admin status and export routes**

Status route:

```js
if (req.method === "GET" && url.pathname === "/api/local/admin/craft-plan/progress-audit") {
  const claimId = getSettings().claimId;
  return send(res, 200, {
    status: {
      ...craftPlanProgressAudit.status(claimId),
      writeWarning: craftPlanProgressAuditWriteWarning,
    },
    events: craftPlanProgressAudit.listEvents(claimId, { limit: 100 }),
  });
}
```

Export route:

```js
if (req.method === "GET" && url.pathname === "/api/local/admin/craft-plan/progress-audit/export") {
  if (!rateLimit(req, res, "craft-plan-progress-audit-export", RATE_LIMITS.expensiveLocal)) return;
  let range;
  try {
    range = normalizeCraftPlanAuditRange(url.searchParams.get("range"), new Date().toISOString());
  } catch (error) {
    return send(res, 400, {
      error: error instanceof Error ? error.message : "Invalid audit range.",
    });
  }
  const bundle = craftPlanProgressAudit.exportRange(getSettings().claimId, range);
  const bytes = gzipSync(Buffer.from(JSON.stringify(bundle)));
  return sendBinary(res, 200, bytes, "application/gzip", {
    "cache-control": "no-store",
    "content-disposition": `attachment; filename="craft-plan-progress-audit-${range.label}.json.gz"`,
  });
}
```

Accept only `24h`, `3d`, `7d`, and `all`; return `400` for any other value.

- [ ] **Step 8: Run focused backend tests**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/server-craft-plan-progress-audit-boundary.test.mjs test/server-admin-permissions.test.mjs test/craft-planning-boundary.test.mjs test/craft-plan-progress-audit.test.mjs
```

Expected: all tests PASS.

- [ ] **Step 9: Commit**

```powershell
git add apps/bitcraft-local/server.mjs apps/bitcraft-local/src/server/adminPermissions.mjs apps/bitcraft-local/test/server-craft-plan-progress-audit-boundary.test.mjs apps/bitcraft-local/test/craft-planning-boundary.test.mjs apps/bitcraft-local/test/server-admin-permissions.test.mjs
git commit -m "feat: audit live craft planner progress"
```

---

### Task 5: Confirmed and Projected Progress UI

**Files:**
- Modify: `apps/bitcraft-local/src/pages/craftPlanningEffortView.ts`
- Modify: `apps/bitcraft-local/src/pages/CraftPlanningPage.tsx`
- Modify: `apps/bitcraft-local/src/styles/craft-planning.css`
- Modify: `apps/bitcraft-local/test/craft-planning-effort-view.test.mjs`
- Modify: `apps/bitcraft-local/test/craft-planning-boundary.test.mjs`
- Modify: `apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs`

**Interfaces:**
- Consumes: dual/stale `effortProgress` from Task 4.
- Produces: `CraftPlanningEffortView` with `confirmed`, `projected`, compatibility `overall/sections`, stale metadata, and baseline change.

- [ ] **Step 1: Add failing selector tests**

```js
test("effort view exposes confirmed and projected summaries", () => {
  const selected = selectCraftPlanningEffortView({
    state: "ready",
    confirmed: {
      overall: { state: "ready", baselineEffort: 100, remainingEffort: 30, completion: 70 },
      sections: { Scholar: { state: "ready", baselineEffort: 50, remainingEffort: 20, completion: 60 } },
    },
    projected: {
      overall: { state: "ready", baselineEffort: 100, remainingEffort: 20, completion: 80 },
      sections: { Scholar: { state: "ready", baselineEffort: 50, remainingEffort: 10, completion: 80 } },
    },
    overall: { state: "ready", baselineEffort: 100, remainingEffort: 30, completion: 70 },
    sections: {},
    stale: true,
    lastSuccessfulAt: "2026-07-24T09:00:00.000Z",
    unavailableSources: [{ label: "Mosswick inventory" }],
  }, "ocean");
  assert.equal(selected.confirmed.overall.completion, 70);
  assert.equal(selected.projected.overall.completion, 80);
  assert.equal(selected.overall.completion, 70);
  assert.equal(selected.stale, true);
  assert.equal(selected.unavailableSources[0].label, "Mosswick inventory");
});
```

- [ ] **Step 2: Run selector tests and verify failure**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/craft-planning-effort-view.test.mjs
```

Expected: FAIL because the view lacks dual and stale fields.

- [ ] **Step 3: Extend the typed effort selector**

Add:

```ts
type EffortProjectionView = {
  overall: EffortAggregate;
  sections: Record<string, EffortAggregate>;
};

export type CraftPlanningEffortView = {
  state: EffortState;
  route: FishingRoutePreference;
  confirmed: EffortProjectionView;
  projected: EffortProjectionView;
  overall: EffortAggregate;
  sections: Record<string, EffortAggregate>;
  stale: boolean;
  staleSince: string;
  lastSuccessfulAt: string;
  unavailableSources: Array<{ sourceId?: string; label: string; type?: string; error?: string }>;
  baselineChange: null | { previousRevision?: string; revision: string; changedAt: string; reasons: string[] };
  warnings: string[];
};
```

Select the configured fishing variant independently inside confirmed and projected summaries. Fall back to root compatibility fields for older servers.

- [ ] **Step 4: Add failing UI boundary assertions**

Assert source contains:

```js
assert.match(page, /Confirmed progress/);
assert.match(page, /Projected after active crafts/);
assert.match(page, /Last confirmed/);
assert.match(page, /Plan baseline changed/);
assert.match(page, /effortView\.confirmed/);
assert.match(page, /effortView\.projected/);
assert.match(css, /\.craft-plan-progress-projected/);
assert.match(css, /\.craft-plan-progress-stale/);
assert.match(css, /\.craft-plan-baseline-change/);
```

- [ ] **Step 5: Render compact dual progress**

Keep the current large bar driven by confirmed progress. Show projected only when its completion exceeds confirmed by at least `0.1`:

```tsx
const confirmedCompletion = effortView.confirmed.overall.completion;
const projectedCompletion = effortView.projected.overall.completion;
const showProjected = confirmedCompletion != null
  && projectedCompletion != null
  && projectedCompletion >= confirmedCompletion + 0.1;
```

Render:

```tsx
<strong>{confirmedCompletion == null ? "—" : `${confirmedCompletion}%`}</strong>
<small>Confirmed progress</small>
{showProjected ? (
  <span className="craft-plan-progress-projected">
    {projectedCompletion}% projected after active crafts
  </span>
) : null}
```

Profession headings show confirmed first and a smaller projected value only when different.

- [ ] **Step 6: Render stale and baseline notices**

Stale copy includes `timeAgo(lastSuccessfulAt)` and a bounded source-label list. Baseline copy lists the stored reasons and timestamp. Neither notice replaces the Needs Board.

- [ ] **Step 7: Add compact responsive CSS**

Use existing colors and density. Projected text is secondary, stale is amber, and baseline change is blue/info. At `max-width: 760px`, stack the values without introducing horizontal scroll.

- [ ] **Step 8: Run UI tests and build**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/craft-planning-effort-view.test.mjs test/craft-planning-boundary.test.mjs test/craft-planning-css-boundary.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: tests PASS and Vite build succeeds.

- [ ] **Step 9: Commit**

```powershell
git add apps/bitcraft-local/src/pages/craftPlanningEffortView.ts apps/bitcraft-local/src/pages/CraftPlanningPage.tsx apps/bitcraft-local/src/styles/craft-planning.css apps/bitcraft-local/test/craft-planning-effort-view.test.mjs apps/bitcraft-local/test/craft-planning-boundary.test.mjs apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs
git commit -m "feat: show confirmed and projected planner progress"
```

---

### Task 6: Admin Progress Audit Timeline and Export

**Files:**
- Modify: `apps/bitcraft-local/src/pages/CraftPlanManagerDialog.tsx`
- Modify: `apps/bitcraft-local/src/styles/craft-planning.css`
- Modify: `apps/bitcraft-local/test/craft-planning-boundary.test.mjs`
- Modify: `apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs`

**Interfaces:**
- Consumes:
  - `GET /admin/craft-plan/progress-audit`
  - `GET /admin/craft-plan/progress-audit/export?range=...`
- Extends the existing Audit tab; does not add another top-level manager tab.

- [ ] **Step 1: Add failing admin UI boundary assertions**

```js
assert.match(manager, /\/admin\/craft-plan\/progress-audit/);
assert.match(manager, /Download audit bundle/);
for (const range of ["24h", "3d", "7d", "all"]) assert.match(manager, new RegExp(`"${range}"`));
assert.match(manager, /Confirmed progress/);
assert.match(manager, /Projected progress/);
assert.match(manager, /Audit storage/);
assert.match(manager, /URL\.createObjectURL/);
assert.match(manager, /URL\.revokeObjectURL/);
assert.match(css, /\.craft-plan-progress-audit-summary/);
assert.match(css, /\.craft-plan-progress-event/);
```

- [ ] **Step 2: Run boundary tests and verify failure**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/craft-planning-boundary.test.mjs test/craft-planning-css-boundary.test.mjs
```

Expected: FAIL on missing audit status and export UI.

- [ ] **Step 3: Load configuration audit and progress audit together**

Replace `loadAudit` with:

```tsx
const [configurationResult, progressResult] = await Promise.all([
  adminApi("/admin/craft-plan/audit?limit=100"),
  adminApi("/admin/craft-plan/progress-audit"),
]);
setAuditRows(Array.isArray(configurationResult.auditLog) ? configurationResult.auditLog : []);
setProgressAudit(progressResult);
```

Keep separate errors if one endpoint succeeds and the other fails.

- [ ] **Step 4: Add safe authenticated download**

```tsx
async function downloadProgressAudit(range: "24h" | "3d" | "7d" | "all") {
  setAuditDownloadRange(range);
  setAuditDownloadError(null);
  try {
    const response = await fetch(`${LOCAL_API}/admin/craft-plan/progress-audit/export?range=${range}`, {
      credentials: "same-origin",
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error ?? `HTTP ${response.status}`);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `craft-plan-progress-audit-${range}.json.gz`;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    setAuditDownloadError(error instanceof Error ? error.message : String(error));
  } finally {
    setAuditDownloadRange(null);
  }
}
```

- [ ] **Step 5: Render the audit summary and timeline**

Above existing configuration audit history show:

- Confirmed/projected current values
- Last capture and last complete refresh
- Baseline revision abbreviated to 12 characters
- Retention `14 days`
- Snapshot/event counts and storage bytes
- Latest source/audit warning
- Four download buttons

Render event cards with observed facts first, inferred cause and confidence second, and top effort contributors in a wrapped list.

- [ ] **Step 6: Add dense responsive styles**

Use a compact stat grid and reuse existing audit cards. Ensure long player, source, and craft IDs wrap and do not create horizontal scrolling.

- [ ] **Step 7: Run UI tests and build**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/craft-planning-boundary.test.mjs test/craft-planning-css-boundary.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: tests PASS and build succeeds.

- [ ] **Step 8: Commit**

```powershell
git add apps/bitcraft-local/src/pages/CraftPlanManagerDialog.tsx apps/bitcraft-local/src/styles/craft-planning.css apps/bitcraft-local/test/craft-planning-boundary.test.mjs apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs
git commit -m "feat: expose craft planner progress audits"
```

---

### Task 7: Discord Confirmed, Projected, Stale, and Baseline Copy

**Files:**
- Modify: `apps/bitcraft-local/src/server/craftPlanDiscordReports.mjs`
- Modify: `apps/bitcraft-local/server.mjs`
- Modify: `apps/bitcraft-local/test/server-craft-plan-discord-reports.test.mjs`
- Modify: `apps/bitcraft-local/test/server-craft-plan-discord-boundary.test.mjs`

**Interfaces:**
- Consumes dual/stale effort progress and internal `confirmedEffortPlan`.
- Produces report fields: `projectedCompletion`, `stale`, `lastSuccessfulAt`, `unavailableSources`, and `baselineChange`.

- [ ] **Step 1: Add failing Discord report tests**

```js
test("Discord leads with confirmed progress and shows a separate projection", () => {
  const plan = {
    enabled: true,
    targets: [{}],
    materials,
    confirmedEffortPlan: { materials },
    effortProgress: {
      state: "ready",
      confirmed: makeEffortProgress({ overall: 72.8, Forestry: 70 }),
      projected: makeEffortProgress({ overall: 76.1, Forestry: 75 }),
      overall: { state: "ready", completion: 72.8 },
      sections: { Forestry: { state: "ready", completion: 70 } },
      fishingVariants: {},
      warnings: [],
    },
  };
  const report = buildCraftPlanDiscordReport(plan);
  assert.equal(report.overall.completion, 72.8);
  assert.equal(report.overall.projectedCompletion, 76.1);
  const description = buildCraftPlanDiscordEmbed(report).embeds[0].description;
  assert.match(description, /Confirmed effort complete/);
  assert.match(description, /Projected after active crafts: 76\.1%/);
});

test("Discord retains stale values and names unavailable sources", () => {
  const report = buildCraftPlanDiscordReport({
    enabled: true,
    targets: [{}],
    materials,
    confirmedEffortPlan: { materials },
    effortProgress: {
      ...makeEffortProgress({ overall: 72.8, Forestry: 70 }),
      stale: true,
      lastSuccessfulAt: "2026-07-24T09:00:00.000Z",
      unavailableSources: [{ label: "Mosswick inventory" }],
    },
  });
  const description = buildCraftPlanDiscordEmbed(report).embeds[0].description;
  assert.match(description, /last complete refresh/i);
  assert.match(description, /Mosswick inventory/);
});

test("Discord discloses a changed plan baseline", () => {
  const report = buildCraftPlanDiscordReport({
    enabled: true,
    targets: [{}],
    materials,
    confirmedEffortPlan: { materials },
    effortProgress: {
      ...makeEffortProgress({ overall: 72.8, Forestry: 70 }),
      baselineChange: { changedAt: "2026-07-24T08:30:00.000Z", reasons: ["Selected route changed"] },
    },
  });
  assert.match(JSON.stringify(buildCraftPlanDiscordEmbed(report)), /Plan baseline changed/);
});
```

- [ ] **Step 2: Run Discord tests and verify failure**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/server-craft-plan-discord-reports.test.mjs test/server-craft-plan-discord-boundary.test.mjs
```

Expected: FAIL on missing projected/stale/baseline report fields.

- [ ] **Step 3: Split confirmed coverage from projected shortages**

Use `plan.confirmedEffortPlan.materials` for covered units and requirements complete. Continue using `plan.materials` for the projected `Most needed` list. Match rows by material key when applying profession filters.

- [ ] **Step 4: Add projected and diagnostic description lines**

The primary description remains confirmed. Add projected only when it is at least `0.1` higher. Add bounded stale and baseline notices with mention suppression preserved.

- [ ] **Step 5: Attach baseline changes relevant to scheduled reports**

Before building a scheduled report, query `latestBaselineChange` from the audit repository. Include it when its timestamp is newer than the most recent successfully sent `craft_plan_report` delivery. The interactive `/craft-plan` command includes a baseline change from the last 24 hours.

- [ ] **Step 6: Run Discord tests**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/server-craft-plan-discord-reports.test.mjs test/server-craft-plan-discord-boundary.test.mjs
```

Expected: all tests PASS and payloads remain below Discord’s existing size limit.

- [ ] **Step 7: Commit**

```powershell
git add apps/bitcraft-local/src/server/craftPlanDiscordReports.mjs apps/bitcraft-local/server.mjs apps/bitcraft-local/test/server-craft-plan-discord-reports.test.mjs apps/bitcraft-local/test/server-craft-plan-discord-boundary.test.mjs
git commit -m "feat: clarify craft planner Discord progress"
```

---

### Task 8: Full Verification and Browser Smoke

**Files:**
- Modify only if verification finds a defect in files already touched by Tasks 1–7.

**Interfaces:**
- Validates the complete feature and migration path.

- [ ] **Step 1: Run the full test suite**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local test
```

Expected: all tests PASS.

- [ ] **Step 2: Run the production build**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: TypeScript and Vite build succeed.

- [ ] **Step 3: Start the stable smoke server**

Because backend code changed:

```powershell
node scripts/start-bitcraft-local-smoke.mjs --force-restart
curl.exe -s http://127.0.0.1:18449/api/local/health
```

Expected: launcher returns promptly and health JSON contains `"ok":true`.

- [ ] **Step 4: Browser-smoke Craft Planning**

Open:

```text
http://127.0.0.1:18449/?page=planning
```

Verify:

- Confirmed progress is the large headline.
- Projected progress appears only when greater than confirmed.
- Profession projections align and wrap.
- A simulated unavailable source retains the previous value and shows stale copy.
- Baseline-change notice does not replace or obscure the Needs Board.
- No horizontal scrolling is introduced.
- Existing item details, route selection, filters, and refresh continue working.

- [ ] **Step 5: Browser-smoke admin audit and export**

Open the Craft Plan Manager Audit tab and verify:

- Progress audit status loads independently of configuration audit.
- Exact player, storage, source, and craft labels are visible.
- Long IDs wrap.
- Each export range downloads a `.json.gz` file.
- Decompress one export and confirm `schemaVersion`, `snapshots`, `events`, and `status` are present.
- Search the export for `token`, `cookie`, `session`, `password`, and `secret`; confirm no sensitive values or unrelated settings are present.

- [ ] **Step 6: Verify a controlled transition sequence**

Using focused fixture calls or a local test source:

1. Capture stock plus a guaranteed and estimated craft.
2. Remove only estimated output: confirmed stays fixed, projected decreases.
3. Move guaranteed output into stock: confirmed stays fixed.
4. Remove confirmed stock: confirmed decreases.
5. Fail a source refresh: both displayed values remain at the last success and become stale.
6. Restore the source: new values publish and a recovery event appears.
7. Change a route: baseline revision changes and a baseline event appears.

- [ ] **Step 7: Inspect final diff**

Run:

```powershell
git status --short
git diff --check origin/main...HEAD
git diff --stat origin/main...HEAD
```

Expected: only planned source, test, CSS, and documentation files are changed; no databases, logs, `.codex-dev`, or unrelated local files are tracked.

- [ ] **Step 8: Commit verification fixes if required**

If verification required changes:

```powershell
git add -- apps/bitcraft-local/server.mjs apps/bitcraft-local/src/server/adminPermissions.mjs apps/bitcraft-local/src/server/craftPlanDiscordReports.mjs apps/bitcraft-local/src/server/craftPlanEffortCache.mjs apps/bitcraft-local/src/server/craftPlanEffortProgress.mjs apps/bitcraft-local/src/server/craftPlanning.mjs apps/bitcraft-local/src/server/craftPlanProgressAudit.mjs apps/bitcraft-local/src/server/preparedStatements.mjs apps/bitcraft-local/src/server/schemaBootstrap.mjs apps/bitcraft-local/src/pages/CraftPlanManagerDialog.tsx apps/bitcraft-local/src/pages/CraftPlanningPage.tsx apps/bitcraft-local/src/pages/craftPlanningEffortView.ts apps/bitcraft-local/src/styles/craft-planning.css apps/bitcraft-local/test/craft-plan-effort-cache.test.mjs apps/bitcraft-local/test/craft-plan-effort-progress.test.mjs apps/bitcraft-local/test/craft-plan-progress-audit.test.mjs apps/bitcraft-local/test/craft-planning-boundary.test.mjs apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs apps/bitcraft-local/test/craft-planning-effort-view.test.mjs apps/bitcraft-local/test/craft-planning.test.mjs apps/bitcraft-local/test/server-admin-permissions.test.mjs apps/bitcraft-local/test/server-craft-plan-discord-reports.test.mjs apps/bitcraft-local/test/server-craft-plan-progress-audit-boundary.test.mjs apps/bitcraft-local/test/server-prepared-statements.test.mjs apps/bitcraft-local/test/server-schema-bootstrap.test.mjs
git commit -m "fix: harden craft planner progress diagnostics"
```

If no changes were required, do not create an empty commit.

---

## Completion Criteria

- Confirmed progress is unaffected by estimated active output.
- Projected progress remains useful for Needs Board decisions.
- Real confirmed stock loss can lower confirmed progress.
- Guaranteed craft-to-stock transitions are continuous.
- Partial upstream failures never appear as zero stock.
- Baseline changes are revisioned and disclosed.
- Fourteen days of exact, attributable diagnostics are retained.
- Admins can export original source identities in a secret-free gzip JSON bundle.
- Web and Discord use the same confirmed/projected terminology.
- Full tests, build, and browser smoke pass.
