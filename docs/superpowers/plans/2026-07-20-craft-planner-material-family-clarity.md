# Craft Planner Material Family Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clarify the distinct-material shortage count and merge six approved cross-tier material families into one Needs Board row each.

**Architecture:** Extend the existing data-driven planner taxonomy with canonical rows and tag aliases, allowing the current tag-based override key and row builder to merge tiers without new component logic. Update only the two user-facing shortage-count strings and lock both behaviors with focused tests.

**Tech Stack:** React, TypeScript, JavaScript taxonomy data, Node test runner, pnpm.

## Global Constraints

- Preserve exceptional families with different API tags, including Ancient Nails, Rope Packages, and profession-dungeon loot.
- Preserve the existing T1–T10 column layout and section ordering.
- Keep the shortage value calculation unchanged.
- Add no dependencies and perform no unrelated refactoring.

---

### Task 1: Group approved material families by stable API tag

**Files:**
- Modify: `apps/bitcraft-local/test/craft-planning-needs-board.test.mjs`
- Modify: `apps/bitcraft-local/src/pages/craftPlanningTaxonomyData.mjs`

**Interfaces:**
- Consumes: `plannerTaxonomyFor(item)`, `plannerOverrideKeyFor(item, fallbackIdentity)`, and `buildNeedsBoard(materials, targets)`.
- Produces: Canonical taxonomy rows for `Timber`, `Roots`, `Brick Slab`, `Nail`, `Rope`, and `Thread` tags.

- [ ] **Step 1: Add a failing regression test using real catalog names and tags**

Add a test that supplies Exquisite and Peerless variants for each approved family and asserts one canonical row, T5/T6 cells, and a tag-based override key.

- [ ] **Step 2: Verify the regression test fails**

Run:

```sh
node --test apps/bitcraft-local/test/craft-planning-needs-board.test.mjs
```

Expected: FAIL because the current taxonomy returns quality-prefixed item names for these tags.

- [ ] **Step 3: Add the canonical rows and aliases**

Update the row lists with `Timber`, `Plant Roots`, `Brick Slab`, `Nails`, `Rope`, and `Spool of Thread`, then add these aliases:

```js
["roots", "Plant Roots"],
["nail", "Nails"],
["thread", "Spool of Thread"],
```

- [ ] **Step 4: Verify the focused taxonomy test passes**

Run the same Node test command and expect zero failures.

---

### Task 2: Clarify the shortage summary count

**Files:**
- Modify: `apps/bitcraft-local/test/craft-planning-boundary.test.mjs`
- Modify: `apps/bitcraft-local/src/pages/CraftPlanningPage.tsx`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: Existing `totals.missingItems` count.
- Produces: `Materials still short`, `different materials after stock and tracked crafts`, and `<count> materials still short` UI copy.

- [ ] **Step 1: Add failing copy boundary assertions**

Assert that `CraftPlanningPage.tsx` contains the three approved strings and no longer contains the ambiguous `Materials missing` or `${quantity(totals.missingItems)} missing items` strings.

- [ ] **Step 2: Verify the boundary test fails**

Run:

```sh
node --test apps/bitcraft-local/test/craft-planning-boundary.test.mjs
```

Expected: FAIL because the old summary and header wording is still present.

- [ ] **Step 3: Replace the two UI copy locations**

Update `CraftPlanningPage.tsx` without changing `totals.missingItems` or summary-card structure.

- [ ] **Step 4: Extend the existing `0.39.0-beta.6` changelog entry**

Add a Fixed bullet describing corrected cross-tier material-family grouping and clearer shortage-count wording.

- [ ] **Step 5: Run focused and full verification**

```sh
node --test apps/bitcraft-local/test/craft-planning-needs-board.test.mjs
node --test apps/bitcraft-local/test/craft-planning-boundary.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
corepack pnpm --filter @workspace/bitcraft-local test
```

Expected: all focused tests, build, and full app suite pass.

- [ ] **Step 6: Commit and publish**

Commit the focused files, push `codex/craft-planner-detail-wrapping`, and update draft PR #32 with the new scope and verification evidence.
