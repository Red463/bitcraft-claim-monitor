# Mixed Planner Routes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep valid crafting and processing alternatives visible when an item also has gathering routes.

**Architecture:** Change the shared `recipesForTarget` ordering rule so it orders gathering routes before other routes without filtering either group. Cover the public planner result with a mixed Sturdy Pebbles-style fixture and verify both the default and saved override paths.

**Tech Stack:** Node.js 24, JavaScript modules, Node test runner, React/Vite build.

## Global Constraints

- Gathering remains the default when no route override exists.
- Existing route identifiers, probability calculations, catalogue ingestion, and UI layout remain unchanged.
- The behavior applies to every item with mixed gathering and crafting routes.

---

### Task 1: Preserve Mixed Acquisition Routes

**Files:**
- Modify: `apps/bitcraft-local/src/server/craftPlanning.mjs:627-632`
- Test: `apps/bitcraft-local/test/craft-planning.test.mjs`

**Interfaces:**
- Consumes: the existing `recipesForTarget(detail, target, detailsByKey)` route candidates and `routeIsGathering(recipe)` classifier.
- Produces: the same recipe array shape, ordered gathering-first but containing every valid route.

- [ ] **Step 1: Write the failing regression test**

Add a test with Sturdy Pebbles as the target, a gathering producer, and `Sturdy Pebbles Output` produced by processing `Sturdy Stone Chunk`. Assert the target route alternatives contain both route types, the default remains gathering, and a `possibility:303012:items:3030001` override selects the Stone Chunk route and adds the cargo input.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test --test-name-pattern="mixed gathering and processing routes" apps/bitcraft-local/test/craft-planning.test.mjs
```

Expected: FAIL because the alternatives omit `possibility:303012:items:3030001`.

- [ ] **Step 3: Make the minimal route-ordering change**

Replace the gathering-only conditional in `recipesForTarget` with stable grouping:

```js
return recipes.sort((a, b) => {
  const gatheringOrder = Number(routeIsGathering(b)) - Number(routeIsGathering(a));
  return gatheringOrder || recipeSortScore(a, target, detailsByKey) - recipeSortScore(b, target, detailsByKey);
});
```

- [ ] **Step 4: Verify GREEN and regression safety**

Run:

```powershell
node --test --test-name-pattern="mixed gathering and processing routes" apps/bitcraft-local/test/craft-planning.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
corepack pnpm --filter @workspace/bitcraft-local test
```

Expected: focused test passes, production build exits 0, and the full suite reports zero failures.

- [ ] **Step 5: Review the final diff**

Run:

```powershell
git diff --check
git diff --stat
git status -sb
```

Expected: only the shared planner module, focused planner test, and approved design/plan documents are changed or committed.
