# Craft Planner Claim-Scoped Active Crafts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent ordinary station crafts outside the monitored claim from contributing output to Craft Planner while preserving passive crafts with unknown locations.

**Architecture:** Add exact claim eligibility at the ordinary-craft normalization boundary in `craftPlanSources.mjs`. Keep the output-building logic private and reusable so passive crafts can retain their existing location-unknown behavior without bypassing the public ordinary-craft contract.

**Tech Stack:** Node.js 24, JavaScript ES modules, Node test runner, existing BitJita payload normalizers.

## Global Constraints

- Ordinary station crafts must have a claim identifier that exactly matches the monitored claim ID.
- Crafts with foreign, blank, missing, or malformed claim identifiers must be excluded.
- Matching public and private crafts must retain existing deduplication and output calculations.
- Passive crafts must remain eligible and retain their existing location-unknown metadata.
- Do not change API routes, database schema, configuration, source-selection controls, UI layout, or dependencies.

---

### Task 1: Lock the ordinary-craft claim boundary with failing tests

**Files:**
- Modify: `apps/bitcraft-local/test/craft-plan-sources.test.mjs`
- Modify: `apps/bitcraft-local/test/craft-planning-boundary.test.mjs`

**Interfaces:**
- Consumes: existing `trackedCraftPlanOutputs(craftPayloads, detailsByKey)`
- Produces: expected contract `trackedCraftPlanOutputs(craftPayloads, detailsByKey, monitoredClaimId)`

- [ ] **Step 1: Add focused claim-scoping fixtures and assertions**

Add a shared monitored claim ID near the imports:

```js
const MONITORED_CLAIM_ID = "claim-monitored";
```

Add a focused test that supplies one matching craft, one foreign craft, and one craft without a claim ID:

```js
test("trackedCraftPlanOutputs counts only ordinary crafts that prove monitored claim ownership", () => {
  const payload = {
    craftResults: [
      {
        entityId: "matching",
        claimEntityId: MONITORED_CLAIM_ID,
        buildingName: "Fine Forestry Station",
        craftedItem: [{ item_id: 100, quantity: 2, item_type: "item" }],
      },
      {
        entityId: "foreign",
        claimEntityId: "claim-foreign",
        buildingName: "Ancient Forestry Station",
        craftedItem: [{ item_id: 100, quantity: 26, item_type: "item" }],
      },
      {
        entityId: "unverified",
        buildingName: "Unknown Forestry Station",
        craftedItem: [{ item_id: 100, quantity: 99, item_type: "item" }],
      },
    ],
    items: [{ id: 100, name: "Simple Wood Log" }],
  };

  const outputs = trackedCraftPlanOutputs([payload], new Map(), MONITORED_CLAIM_ID);

  assert.deepEqual(outputs.map((output) => [output.craftId, output.buildingName, output.quantity]), [
    ["matching", "Fine Forestry Station", 2],
  ]);
});
```

Add a deduplication test using the same craft ID in matching public and player payloads:

```js
test("trackedCraftPlanOutputs retains matching private craft details during deduplication", () => {
  const publicPayload = {
    craftResults: [{
      entityId: "shared",
      claimEntityId: MONITORED_CLAIM_ID,
      completed: false,
      craftedItem: [{ item_id: 100, quantity: 1, item_type: "item" }],
    }],
  };
  const playerPayload = {
    craftResults: [{
      entityId: "shared",
      claimEntityId: MONITORED_CLAIM_ID,
      ownerUsername: "Oddfawn",
      buildingName: "Fine Forestry Station",
      completed: true,
      craftedItem: [{ item_id: 100, quantity: 1, item_type: "item" }],
    }],
  };

  const outputs = trackedCraftPlanOutputs([publicPayload, playerPayload], new Map(), MONITORED_CLAIM_ID);

  assert.equal(outputs.length, 1);
  assert.equal(outputs[0].playerName, "Oddfawn");
  assert.equal(outputs[0].status, "Ready to collect");
});
```

Update existing ordinary `trackedCraftPlanOutputs` tests so fixture crafts include `claimEntityId: MONITORED_CLAIM_ID` and calls pass `MONITORED_CLAIM_ID`. Leave passive-craft tests unchanged.

Update the server boundary assertion:

```js
assert.match(computedCraftPlan, /trackedCraftPlanOutputs\(craftPayloads, detailsByKey, claimId\)/);
```

- [ ] **Step 2: Run the focused tests and verify the new contract fails**

Run:

```sh
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/craft-plan-sources.test.mjs test/craft-planning-boundary.test.mjs
```

Expected: FAIL because `trackedCraftPlanOutputs` ignores the third argument and still includes the foreign and unverified station crafts; the boundary test also reports the missing `claimId` argument.

- [ ] **Step 3: Commit the red tests**

```sh
git add apps/bitcraft-local/test/craft-plan-sources.test.mjs apps/bitcraft-local/test/craft-planning-boundary.test.mjs
git commit -m "Test Craft Planner claim-scoped station crafts"
```

---

### Task 2: Enforce exact claim matching for ordinary station crafts

**Files:**
- Modify: `apps/bitcraft-local/src/server/craftPlanSources.mjs`
- Modify: `apps/bitcraft-local/server.mjs`
- Test: `apps/bitcraft-local/test/craft-plan-sources.test.mjs`
- Test: `apps/bitcraft-local/test/craft-planning-boundary.test.mjs`

**Interfaces:**
- Consumes: `monitoredClaimId: string` from `computedCraftPlanResponseFresh`
- Produces: `trackedCraftPlanOutputs(craftPayloads, detailsByKey, monitoredClaimId): Array<object>`
- Preserves: `trackedPassiveCraftPlanOutputs(passiveSources, detailsByKey): Array<object>`

- [ ] **Step 1: Extract the existing output calculation into a private helper**

Change only the current function declaration so its existing implementation becomes the private unscoped output builder:

```diff
-export function trackedCraftPlanOutputs(craftPayloads = [], detailsByKey = new Map()) {
+function trackedCraftPlanOutputsFromPayloads(craftPayloads = [], detailsByKey = new Map()) {
```

- [ ] **Step 2: Add exact claim-ID normalization and ordinary-craft filtering**

Add a private claim-ID helper:

```js
function craftClaimId(craft) {
  return String(
    craft?.claimEntityId
      ?? craft?.claim_entity_id
      ?? craft?.claim?.entityId
      ?? craft?.claim?.id
      ?? craft?.claimId
      ?? "",
  ).trim();
}
```

Implement the exported ordinary-craft boundary:

```js
export function trackedCraftPlanOutputs(craftPayloads = [], detailsByKey = new Map(), monitoredClaimId = "") {
  const expectedClaimId = String(monitoredClaimId).trim();
  if (!expectedClaimId) return [];
  const payloads = Array.isArray(craftPayloads) ? craftPayloads : [craftPayloads];
  const scopedPayloads = payloads.map((payload) => ({
    ...payload,
    craftResults: asArray(payload?.craftResults)
      .filter((craft) => craftClaimId(craft) === expectedClaimId),
  }));
  return trackedCraftPlanOutputsFromPayloads(scopedPayloads, detailsByKey);
}
```

- [ ] **Step 3: Preserve passive-craft behavior through the private output helper**

Replace the passive normalizer's ordinary export call:

```js
return trackedCraftPlanOutputsFromPayloads([{ craftResults: [] }, ...payloads], detailsByKey).map((output) => ({
  ...output,
  passive: true,
  sourceType: "Passive craft",
  locationUnknown: true,
  status: output.completed ? "Passive craft ready to collect" : "Passive craft in progress",
}));
```

- [ ] **Step 4: Pass the monitored claim through the production Craft Planner path**

In `computedCraftPlanResponseFresh`, change:

```js
...trackedCraftPlanOutputs(craftPayloads, detailsByKey, claimId),
```

Keep `trackedPassiveCraftPlanOutputs(playerPassiveCraftResults, detailsByKey)` unchanged.

- [ ] **Step 5: Run the focused tests and verify they pass**

Run:

```sh
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/craft-plan-sources.test.mjs test/craft-planning-boundary.test.mjs
```

Expected: PASS, including foreign and missing claim exclusion, matching private craft deduplication, and passive craft preservation.

- [ ] **Step 6: Re-run the original minimal reproduction**

Run:

```powershell
@'
import { trackedCraftPlanOutputs } from "./apps/bitcraft-local/src/server/craftPlanSources.mjs";
const monitoredClaimId = "1369094286777412590";
const outputs = trackedCraftPlanOutputs([
  { craftResults: [] },
  {
    craftResults: [{
      entityId: "foreign-craft",
      claimEntityId: "1369094286736851047",
      buildingName: "Ancient Forestry Station",
      ownerUsername: "Oddfawn",
      craftCount: 26,
      craftedItem: [{ item_id: "1940258895", quantity: 1, item_type: "item" }],
    }],
  },
], new Map(), monitoredClaimId);
if (outputs.length !== 0) {
  console.error(`FAIL: counted ${outputs.length} foreign-claim output row`);
  process.exit(1);
}
console.log("PASS: foreign-claim crafts excluded");
'@ | node --input-type=module -
```

Expected:

```text
PASS: foreign-claim crafts excluded
```

- [ ] **Step 7: Commit the implementation**

```sh
git add apps/bitcraft-local/src/server/craftPlanSources.mjs apps/bitcraft-local/server.mjs
git commit -m "Scope Craft Planner station crafts to monitored claim"
```

---

### Task 3: Verify the complete change

**Files:**
- Inspect: all changed files on `codex/craft-planner-claim-scope`

**Interfaces:**
- Consumes: completed Task 1 and Task 2 commits
- Produces: a release-ready, locally verified branch

- [ ] **Step 1: Check scope and remove temporary instrumentation**

Run:

```sh
git status --short
git diff origin/main...HEAD --check
rg -n "\[DEBUG-" apps/bitcraft-local/src apps/bitcraft-local/server.mjs
```

Expected: only intended committed files, no whitespace errors, and no debug instrumentation.

- [ ] **Step 2: Run the production build**

Run:

```sh
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: TypeScript and Vite build pass.

- [ ] **Step 3: Run the full application test suite**

Run:

```sh
corepack pnpm --filter @workspace/bitcraft-local test
```

Expected: all tests pass with zero failures.

- [ ] **Step 4: Review the final diff**

Run:

```sh
git diff origin/main...HEAD --stat
git log --oneline origin/main..HEAD
```

Expected: design and plan commits followed by one red-test commit and one implementation commit; no release metadata or unrelated files.
