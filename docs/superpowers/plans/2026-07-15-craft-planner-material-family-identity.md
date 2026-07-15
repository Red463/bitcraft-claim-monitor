# Craft Planner Material Family Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore a separate Unfired Brick row and make all shared-tag material families independently groupable and configurable.

**Architecture:** Extend the shared planner taxonomy to resolve a more-specific known family from an item's canonical name when its API tag is broader, then derive one shared override key from that family identity. The server and frontend will consume the same helper so configuration lookup and Needs Board grouping cannot diverge.

**Tech Stack:** Node.js 24, JavaScript ES modules, React/TypeScript, Node test runner.

## Global Constraints

- Preserve ordinary `tag:<tag>` keys whenever the canonical family still matches the API tag.
- Keep quality and tier variants of one family in a single row.
- Give distinct families independent grouping, section overrides, and row-name overrides.
- Do not add a Brick-specific exception or a new dependency.

---

### Task 1: Shared material-family identity

**Files:**
- Modify: `apps/bitcraft-local/src/pages/craftPlanningTaxonomyData.mjs`
- Modify: `apps/bitcraft-local/src/pages/craftPlanningTaxonomyData.d.mts`
- Test: `apps/bitcraft-local/test/craft-planning-needs-board.test.mjs`

**Interfaces:**
- Produces: `plannerTaxonomyFor(item): SharedPlannerTaxonomy`, enhanced to return `Unfired Brick` for quality variants such as `Unfired Sturdy Brick` even when their tag is `Brick`.
- Produces: `plannerOverrideKeyFor(item, fallbackIdentity): string`, returning `row:Unfired Brick` for the collided family, `tag:Brick` for ordinary Brick, and the existing item fallback for generic or absent tags.

- [x] **Step 1: Write the failing identity regression test**

Add a test that passes ordinary Sturdy Brick and Unfired Sturdy Brick, both tagged `Brick`, to the shared taxonomy. Assert that their canonical rows are `Brick` and `Unfired Brick`, then assert that `plannerOverrideKeyFor` returns `tag:Brick` and `row:Unfired Brick` respectively.

- [x] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --experimental-strip-types --test --test-name-pattern="planner taxonomy gives shared-tag" apps/bitcraft-local/test/craft-planning-needs-board.test.mjs
```

Expected: FAIL because the Unfired material still resolves to the `Brick` family and the independent-key helper does not exist.

- [x] **Step 3: Implement the minimal shared resolver**

In `craftPlanningTaxonomyData.mjs`, keep the current tag lookup as the base identity. When that tag maps to a known row, examine only longer known rows in the same section that contain the base row's words and whose words appear in order within the item name. Select the longest match, making `Unfired Sturdy Brick` resolve to `Unfired Brick` without affecting unrelated tags.

Export this helper and declaration:

```js
export function plannerOverrideKeyFor(item = {}, fallbackIdentity = "") {
  const tag = text(item.tag ?? item.itemTag ?? item.categoryTag);
  if (!tag || /^trade\s+good$/i.test(tag)) return `item:${fallbackIdentity}`;
  const taggedFamily = plannerTaxonomyFor({ tag, name: tag }).row;
  const family = plannerTaxonomyFor(item).row;
  return family === taggedFamily ? `tag:${tag}` : `row:${family}`;
}
```

- [x] **Step 4: Run the focused test and verify GREEN**

Run the Step 2 command. Expected: PASS with separate family identities and keys.

- [x] **Step 5: Commit the shared identity change**

```powershell
git add apps/bitcraft-local/src/pages/craftPlanningTaxonomyData.mjs apps/bitcraft-local/src/pages/craftPlanningTaxonomyData.d.mts apps/bitcraft-local/test/craft-planning-needs-board.test.mjs
git commit -m "fix: separate shared-tag craft materials"
```

### Task 2: Use the shared identity for overrides and grouping

**Files:**
- Modify: `apps/bitcraft-local/src/server/craftPlanning.mjs`
- Modify: `apps/bitcraft-local/src/pages/craftPlanningNeedsBoard.ts`
- Test: `apps/bitcraft-local/test/craft-planning.test.mjs`
- Test: `apps/bitcraft-local/test/craft-planning-needs-board.test.mjs`

**Interfaces:**
- Consumes: `plannerOverrideKeyFor(item, fallbackIdentity): string` from Task 1.
- Produces: craft-plan materials whose `sectionOverrideKey`, `sectionOverride`, and `rowNameOverride` use the independent family key.
- Produces: Needs Board rows grouped by the same independent family key.

- [x] **Step 1: Write the failing board-grouping and independent-override integration tests**

Add a Needs Board test with Sturdy/Fine Brick and Unfired Sturdy/Fine Brick, all tagged `Brick`. Assert separate `Unfired Brick` and `Brick` rows with T3/T4 quantities `16/433`, `0/136`, `67/500`, and `114/250`. Add a focused `computeCraftPlan` test using ordinary Brick and Unfired Brick details. Configure `sectionOverrides` and `rowNameOverrides` only for `row:Unfired Brick`, then assert that the Unfired material receives that key and overrides while the ordinary Brick material retains `tag:Brick` and receives neither override.

- [x] **Step 2: Run the server test and verify RED**

Run:

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/craft-planning.test.mjs
```

Expected: FAIL because `sectionOverrideKeyForItem` still returns `tag:Brick` for both families.

- [x] **Step 3: Replace duplicate key derivation with the shared helper**

Import `plannerOverrideKeyFor` into `src/server/craftPlanning.mjs` and `src/pages/craftPlanningNeedsBoard.ts`. Replace the server's local `sectionOverrideKeyForItem` body and the frontend's local `rowOverrideKeyForNeed` body with calls that pass their existing stable item identity as the fallback. Keep the existing response fields and `NeedRow.overrideKey` contract unchanged.

- [x] **Step 4: Run both focused test files**

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/craft-planning.test.mjs apps/bitcraft-local/test/craft-planning-needs-board.test.mjs
```

Expected: PASS, including independent override lookup and exact Brick/Unfired Brick quantities.

- [x] **Step 5: Replay the live production payload through the patched selector**

Fetch `https://app.timbersteeltrade.com/api/local/craft-plan?claimId=1369094286777412590`, run its materials through `buildNeedsBoard`, and assert that Masonry contains `Unfired Brick`. Expected: PASS, with Brick and Unfired Brick quantities matching the two source families rather than summed cells.

- [x] **Step 6: Run complete verification**

```powershell
corepack pnpm --filter @workspace/bitcraft-local test
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: all tests pass and the Vite production build completes successfully.

- [x] **Step 7: Commit the integration fix**

```powershell
git add apps/bitcraft-local/src/server/craftPlanning.mjs apps/bitcraft-local/src/pages/craftPlanningNeedsBoard.ts apps/bitcraft-local/test/craft-planning.test.mjs apps/bitcraft-local/test/craft-planning-needs-board.test.mjs
git commit -m "fix: keep craft material overrides independent"
```
