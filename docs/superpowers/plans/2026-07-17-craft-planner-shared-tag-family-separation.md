# Craft Planner Shared-Tag Family Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Pebbles, Braxite, and every other audited shared-tag material family in independent Craft Planner rows without losing legitimate cross-tier grouping.

**Architecture:** Extend the existing shared taxonomy module with declarative name-family rules for known broad tags. Continue using the taxonomy as the single frontend/server identity seam, retain tag keys for unambiguous base families, and use exact item identity for unmatched or unknown families so incorrect aggregation fails safe.

**Tech Stack:** JavaScript ES modules, TypeScript/React consumers, Node.js test runner, pnpm workspace scripts.

## Global Constraints

- Make focused changes in `apps/bitcraft-local` and do not refactor unrelated Craft Planner code.
- Preserve existing section ordering, tier columns, API response shapes, and ordinary tag-based override keys.
- Do not add dependencies or database migrations.
- Follow test-driven development: observe each new regression test fail before changing production code.

---

### Task 1: Failing shared-family regression coverage

**Files:**
- Modify: `apps/bitcraft-local/test/craft-planning-needs-board.test.mjs`
- Modify: `apps/bitcraft-local/test/craft-planning.test.mjs`

**Interfaces:**
- Consumes: `plannerTaxonomyFor(item): { hidden, row, section, order, known }` and `plannerOverrideKeyFor(item, fallbackIdentity): string`.
- Produces: failing coverage for canonical taxonomy identity, Needs Board grouping, and server-side override isolation.

- [ ] **Step 1: Write the failing taxonomy matrix test**

Add representative items for all audited shared tags and assert each semantic family has the expected row and key. Include `Rough Braxite`/`Rough Pebbles`, `Sea Glass`/`Simple Glass`, the four Raw Meat families, Stone Carvings/Stone Diagrams, the Taming families, an unmatched shared-tag item, and an unknown broad tag.

```js
assert.deepEqual(
  samples.map(({ item, fallback }) => [
    plannerTaxonomy.plannerTaxonomyFor(item).row,
    plannerTaxonomy.plannerOverrideKeyFor(item, fallback),
  ]),
  expectedRowsAndKeys,
);
```

- [ ] **Step 2: Write the failing Needs Board regression**

Create T1/T2 Pebbles and Braxite materials sharing the `Pebbles` tag. Assert that Mining contains separate `Braxite` and `Pebbles` rows, each family spans T1/T2, and no cell contains items from the other family. Add a compact representative test proving other audited same-tier pairs are also separate.

- [ ] **Step 3: Write the failing server regression test**

Extend or add a focused `computeCraftPlan` fixture containing a Braxite requirement and a Pebbles requirement. Configure a section/row-name override only for `row:Braxite`, then assert the Braxite material receives it and Pebbles retains `tag:Pebbles` with no inherited override.

- [ ] **Step 4: Run the focused tests and verify RED**

Run:

```sh
node --experimental-strip-types --test --test-name-pattern="shared-tag family taxonomy|keeps audited shared-tag families separate" apps/bitcraft-local/test/craft-planning-needs-board.test.mjs
node --experimental-strip-types --test --test-name-pattern="Braxite family override" apps/bitcraft-local/test/craft-planning.test.mjs
```

Expected: FAIL because Braxite and the other sibling families still return their shared tag row/key.

### Task 2: Shared taxonomy family resolution

**Files:**
- Modify: `apps/bitcraft-local/src/pages/craftPlanningTaxonomyData.mjs`

**Interfaces:**
- Consumes: the failing tests from Task 1 and the existing public taxonomy signatures.
- Produces: canonical family rows and safe exact-item fallback identities without changing the public function signatures.

- [ ] **Step 1: Implement declarative family rules**

In `craftPlanningTaxonomyData.mjs`, add focused shared-tag family definitions containing canonical row names and case-insensitive item-name matchers. Resolve these rules before the existing tag fallback. Keep ordinary base families on `tag:<tag>` and return `row:<family>` for split families. Return `item:<fallbackIdentity>` for unmatched declared-shared-tag items and unknown taxonomy rows.

- [ ] **Step 2: Run the focused tests and verify GREEN**

Run both commands from Task 1 Step 4. Expected: PASS.

- [ ] **Step 3: Run the complete Needs Board test file**

Run:

```sh
node --experimental-strip-types --test apps/bitcraft-local/test/craft-planning-needs-board.test.mjs
```

Expected: all tests pass, including existing Brick/Unfired Brick and ordinary tier-family grouping coverage.

### Task 3: Verification and delivery

**Files:**
- Inspect: all modified files.

**Interfaces:**
- Consumes: completed taxonomy and regression coverage.
- Produces: a verified, reviewable commit on the current branch.

- [ ] **Step 1: Run the full application test suite**

```sh
corepack pnpm --filter @workspace/bitcraft-local test
```

Expected: zero failures.

- [ ] **Step 2: Run the production build**

```sh
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: exit code 0 with no TypeScript or Vite build errors.

- [ ] **Step 3: Review the diff against the approved design**

Confirm all seven audited shared tags are covered, unknown/unmatched items fail separate, no API or database schema changed, and no unrelated files are included.

- [ ] **Step 4: Commit the implementation**

```sh
git add docs/superpowers/specs/2026-07-17-craft-planner-shared-tag-family-separation-design.md docs/superpowers/plans/2026-07-17-craft-planner-shared-tag-family-separation.md apps/bitcraft-local/src/pages/craftPlanningTaxonomyData.mjs apps/bitcraft-local/test/craft-planning-needs-board.test.mjs apps/bitcraft-local/test/craft-planning.test.mjs
git commit -m "fix: separate shared-tag planner families"
```
