# Passive Craft Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Count processing and complete passive crafts from craft-tracked players toward the shared Craft Planning material totals.

**Architecture:** Add a passive-craft adapter beside the existing active-craft output adapter, then fetch both sources for the same configured players in the server planner workspace. Reuse the existing probability expansion and material aggregation while carrying passive-source metadata through to item details.

**Tech Stack:** Node.js 24, React, TypeScript, plain CSS, Node test runner, BitJita HTTP API.

## Global Constraints

- Reuse `sourceRules.craftPlayerIds`; do not add another player selector or configuration field.
- Count only exact normalized statuses `processing` and `complete`; do not model a queued state.
- Label processing output **Passive craft in progress** and complete output **Passive craft ready to collect**.
- Preserve expected-versus-guaranteed probability behavior for farming co-products.
- Passive API failure for one player must not prevent the rest of the plan from calculating.
- Tell users that BitJita does not report the passive craft's settlement location.
- Do not add dependencies or refactor unrelated planner code.

---

### Task 1: Normalize passive crafts into tracked planner outputs

**Files:**
- Modify: `apps/bitcraft-local/src/server/craftPlanSources.mjs`
- Test: `apps/bitcraft-local/test/craft-plan-sources.test.mjs`

**Interfaces:**
- Consumes: passive source objects shaped as `{ playerId, playerName, payload }` and the existing `detailsByKey: Map` catalogue.
- Produces: `trackedPassiveCraftPlanOutputs(passiveSources, detailsByKey)`, returning existing tracked-output rows plus `passive`, `sourceType`, and `locationUnknown`.

- [ ] **Step 1: Write the failing status and identity test**

Update the test import to include `trackedPassiveCraftPlanOutputs`, then add:

```js
test("trackedPassiveCraftPlanOutputs counts processing and complete jobs but ignores other states", () => {
  const outputs = trackedPassiveCraftPlanOutputs([{
    playerId: "farmer-1",
    playerName: "Farmer",
    payload: {
      items: [{ id: 3200001, name: "Basic Embergrain Products", tier: 1 }],
      craftResults: [
        { entityId: "growing", status: "processing", buildingName: "Basic Farming Station", craftedItem: [{ item_id: 3200001, quantity: 2 }] },
        { entityId: "ready", status: "complete", buildingName: "Basic Farming Station", craftedItem: [{ item_id: 3200001, quantity: 3 }] },
        { entityId: "unsupported", status: "queued", buildingName: "Basic Farming Station", craftedItem: [{ item_id: 3200001, quantity: 100 }] },
      ],
    },
  }], new Map());

  assert.deepEqual(outputs.map((output) => [output.craftId, output.quantity, output.status]), [
    ["passive:farmer-1:growing", 2, "Passive craft in progress"],
    ["passive:farmer-1:ready", 3, "Passive craft ready to collect"],
  ]);
  assert.equal(outputs.every((output) => output.passive === true && output.sourceType === "Passive craft" && output.locationUnknown === true), true);
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run `node --test apps/bitcraft-local/test/craft-plan-sources.test.mjs`.

Expected: FAIL because `trackedPassiveCraftPlanOutputs` is not exported.

- [ ] **Step 3: Implement the minimal passive adapter**

Add beside `trackedCraftPlanOutputs`:

```js
function passiveCraftStatus(craft) {
  return String(craft?.status ?? craft?.state ?? "").trim().toLowerCase();
}

export function trackedPassiveCraftPlanOutputs(passiveSources = [], detailsByKey = new Map()) {
  const payloads = asArray(passiveSources).map((source) => ({
    ...(source?.payload ?? {}),
    craftResults: asArray(source?.payload?.craftResults).flatMap((craft, index) => {
      const status = passiveCraftStatus(craft);
      if (status !== "processing" && status !== "complete") return [];
      const rawId = String(craft?.entityId ?? craft?.id ?? `${status}:${index}`).trim();
      return [{
        ...craft,
        entityId: `passive:${String(source?.playerId ?? "unknown")}:${rawId}`,
        ownerEntityId: craft?.ownerEntityId ?? source?.playerId,
        ownerUsername: craft?.ownerUsername ?? source?.playerName,
        completed: status === "complete",
        status,
      }];
    }),
  }));

  return trackedCraftPlanOutputs([{ craftResults: [] }, ...payloads], detailsByKey).map((output) => ({
    ...output,
    passive: true,
    sourceType: "Passive craft",
    locationUnknown: true,
    status: output.completed ? "Passive craft ready to collect" : "Passive craft in progress",
  }));
}
```

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run `node --test apps/bitcraft-local/test/craft-plan-sources.test.mjs`.

Expected: all tests in the file pass.

- [ ] **Step 5: Add a probabilistic farming-output test**

```js
test("trackedPassiveCraftPlanOutputs expands probabilistic farming products", () => {
  const product = { id: 3200001, name: "Basic Embergrain Products", tier: 1 };
  const detailsByKey = new Map([["items:3200001", {
    item: product,
    itemListPossibilities: [{
      targetId: "straw",
      targetItem: { id: "straw", name: "Rough Straw", tier: 1 },
      quantity: 0.2,
      chance: 1,
      guaranteedQuantity: 0,
    }],
  }]]);
  const outputs = trackedPassiveCraftPlanOutputs([{
    playerId: "farmer-1",
    playerName: "Farmer",
    payload: {
      items: [product],
      craftResults: [{ entityId: "grain", status: "processing", craftCount: 10, craftedItem: [{ item_id: 3200001, quantity: 1 }] }],
    },
  }], detailsByKey);

  const straw = outputs.find((output) => output.itemId === "straw");
  assert.equal(straw?.quantity, 2);
  assert.equal(straw?.guaranteedQuantity, 0);
  assert.equal(straw?.status, "Passive craft in progress");
});
```

- [ ] **Step 6: Run and commit Task 1**

Run the focused test again, then commit:

```powershell
git add apps/bitcraft-local/src/server/craftPlanSources.mjs apps/bitcraft-local/test/craft-plan-sources.test.mjs
git commit -m "feat: normalize passive craft planner outputs"
```

---

### Task 2: Load passive jobs for craft-tracked players

**Files:**
- Modify: `apps/bitcraft-local/server.mjs`
- Test: `apps/bitcraft-local/test/craft-planning-boundary.test.mjs`

**Interfaces:**
- Consumes: `trackedPassiveCraftPlanOutputs` and `config.sourceRules.craftPlayerIds`.
- Produces: passive output rows passed to `computeCraftPlan`, plus per-player passive errors in `craftSourceErrors`.

- [ ] **Step 1: Write failing server-boundary assertions**

Extend the computed-planner boundary test:

```js
assert.match(server, /trackedPassiveCraftPlanOutputs/);
assert.match(computedCraftPlan, /passive-crafts\?status=all/);
assert.match(computedCraftPlan, /type:\s*"Tracked passive crafts"/);
assert.match(computedCraftPlan, /activeCrafts:\s*\[[\s\S]*trackedCraftPlanOutputs[\s\S]*trackedPassiveCraftPlanOutputs/);
```

- [ ] **Step 2: Run the boundary test and confirm RED**

Run `node --test apps/bitcraft-local/test/craft-planning-boundary.test.mjs`.

Expected: FAIL because passive planner fetching and aggregation do not exist.

- [ ] **Step 3: Import the passive adapter**

Add `trackedPassiveCraftPlanOutputs` to the existing `craftPlanSources.mjs` import in `server.mjs`.

- [ ] **Step 4: Fetch active and passive payloads in parallel**

Replace the single active-player batch with:

```js
const [playerCraftResults, playerPassiveCraftResults] = await Promise.all([
  Promise.all(config.sourceRules.craftPlayerIds.map(async (playerId) => {
    try {
      const payload = await fetchBitjita(`/players/${encodeURIComponent(playerId)}/crafts?completed=all`, { timeoutMs: 6000, cache: true });
      return { playerId, payload, error: "" };
    } catch (error) {
      return { playerId, payload: { craftResults: [] }, error: error instanceof Error ? error.message : String(error) };
    }
  })),
  Promise.all(config.sourceRules.craftPlayerIds.map(async (playerId) => {
    try {
      const payload = await fetchBitjita(`/players/${encodeURIComponent(playerId)}/passive-crafts?status=all`, { timeoutMs: 6000, cache: true });
      return { playerId, playerName: memberNames.get(String(playerId)) ?? String(playerId), payload, error: "" };
    } catch (error) {
      return { playerId, playerName: memberNames.get(String(playerId)) ?? String(playerId), payload: { craftResults: [] }, error: error instanceof Error ? error.message : String(error) };
    }
  })),
]);
```

- [ ] **Step 5: Surface failures and aggregate both output sources**

Create:

```js
const passiveCraftSourceErrors = playerPassiveCraftResults
  .filter((result) => result.error)
  .map((result) => ({
    sourceId: String(result.playerId),
    label: `${result.playerName} passive crafts`,
    type: "Tracked passive crafts",
    error: result.error,
  }));
```

Pass both output sets into `computeCraftPlan`:

```js
activeCrafts: [
  ...trackedCraftPlanOutputs(craftPayloads, detailsByKey),
  ...trackedPassiveCraftPlanOutputs(playerPassiveCraftResults, detailsByKey),
],
craftSourceErrors: [...craftSourceErrors, ...passiveCraftSourceErrors],
```

- [ ] **Step 6: Run planner tests and commit Task 2**

Run:

```powershell
node --test apps/bitcraft-local/test/craft-planning-boundary.test.mjs apps/bitcraft-local/test/craft-plan-sources.test.mjs apps/bitcraft-local/test/craft-planning.test.mjs
```

Expected: all selected tests pass.

Commit:

```powershell
git add apps/bitcraft-local/server.mjs apps/bitcraft-local/test/craft-planning-boundary.test.mjs
git commit -m "feat: count tracked passive crafts in planner"
```

---

### Task 3: Explain passive output in item details

**Files:**
- Modify: `apps/bitcraft-local/src/pages/CraftPlanningPage.tsx`
- Test: `apps/bitcraft-local/test/craft-planning-boundary.test.mjs`
- Test: `apps/bitcraft-local/test/craft-planning-need-details.test.mjs`

**Interfaces:**
- Consumes: rows carrying `passive`, `status`, and `locationUnknown`.
- Produces: distinct passive labels and the BitJita location disclaimer in the existing tracked-crafts panel.

- [ ] **Step 1: Write failing metadata and copy tests**

Add to `craft-planning-need-details.test.mjs`:

```js
test("groupNeedCellActiveCrafts keeps passive craft metadata and identity separate", () => {
  const crafts = groupNeedCellActiveCrafts({
    ...roughLogCell,
    items: [{ ...roughLogCell.items[0], activeCraftSources: [
      { craftId: "craft:grain", quantity: 1, sourceType: "Active craft" },
      { craftId: "passive:farmer:grain", quantity: 2, passive: true, sourceType: "Passive craft", locationUnknown: true },
    ] }],
  });
  assert.equal(crafts.length, 2);
  assert.equal(crafts.find((craft) => craft.passive)?.locationUnknown, true);
});
```

Add to the page boundary test:

```js
assert.match(page, /Passive craft/);
assert.match(page, /Location not reported by BitJita/);
```

- [ ] **Step 2: Run focused frontend tests and confirm RED**

Run:

```powershell
node --test apps/bitcraft-local/test/craft-planning-need-details.test.mjs apps/bitcraft-local/test/craft-planning-boundary.test.mjs
```

Expected: grouping passes; page copy fails because passive labels are not rendered.

- [ ] **Step 3: Render passive labels and location note**

Replace the tracked-craft text block with:

```tsx
<span>
  <strong>{craft.passive ? `Passive craft · ${craft.buildingName ?? "Unknown structure"}` : craft.buildingName ?? "Crafting station"}</strong>
  <small>{craft.playerName ?? "Unknown player"} - {craft.status ?? (craft.completed ? "Ready to collect" : "In progress")}</small>
  {craft.locationUnknown ? <small>Location not reported by BitJita</small> : null}
</span>
```

Keep the expected and guaranteed quantity block unchanged.

- [ ] **Step 4: Run focused tests and build**

```powershell
node --test apps/bitcraft-local/test/craft-planning-need-details.test.mjs apps/bitcraft-local/test/craft-planning-boundary.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: focused tests and build pass.

- [ ] **Step 5: Commit Task 3**

```powershell
git add apps/bitcraft-local/src/pages/CraftPlanningPage.tsx apps/bitcraft-local/test/craft-planning-boundary.test.mjs apps/bitcraft-local/test/craft-planning-need-details.test.mjs
git commit -m "feat: label passive crafts in planner details"
```

---

### Task 4: Final verification

**Files:**
- Inspect: all files changed since `origin/main`.

**Interfaces:**
- Consumes: completed Tasks 1-3.
- Produces: a verified, clean passive-craft planner branch ready for review.

- [ ] **Step 1: Run the full application test suite**

Run `corepack pnpm --filter @workspace/bitcraft-local test`.

Expected: zero failed tests.

- [ ] **Step 2: Run a fresh production build**

Run `corepack pnpm --filter @workspace/bitcraft-local run build`.

Expected: exit code 0.

- [ ] **Step 3: Inspect the final diff**

```powershell
git diff --check origin/main...HEAD
git diff --stat origin/main...HEAD
git status -sb
```

Expected: no whitespace errors, only approved planner/spec files changed, and the worktree is clean.

