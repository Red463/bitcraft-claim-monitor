# Craft Planner Stock Location Wrapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make stock-location labels wrap cleanly inside the Craft Planning item-details column without horizontal scrolling.

**Architecture:** Keep the existing React markup and modal grid. Add a narrowly scoped CSS containment and wrapping override for `.craft-plan-stock-card`, protected by the existing CSS boundary-test suite.

**Tech Stack:** React, TypeScript, plain CSS, Node.js test runner, pnpm, Vite

## Global Constraints

- Keep the quantity visible and top-right aligned while the location label wraps.
- Preserve vertical scrolling for tall stock lists.
- Preserve existing truncation behavior for non-stock detail rows.
- Do not change React markup, data mapping, API behavior, modal dimensions, or unrelated planner layout.
- Add no dependencies.

---

### Task 1: Contain and wrap stock-location rows

**Files:**
- Modify: `apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs`
- Modify: `apps/bitcraft-local/src/styles/craft-planning.css`

**Interfaces:**
- Consumes: existing `.craft-plan-stock-card`, `.craft-plan-detail-group`, and `.craft-plan-detail-row` markup from `CraftPlanningPage.tsx`.
- Produces: stock rows whose labels wrap within the card while quantities remain non-shrinking and horizontal overflow is suppressed.

- [ ] **Step 1: Write the failing CSS boundary test**

Add this test after the existing item-details layout tests in `apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs`:

```js
test("Craft planning stock locations wrap without horizontal scrolling", () => {
  const css = readFileSync(new URL("../src/styles/craft-planning.css", import.meta.url), "utf8");
  const stockCard = css.match(/\.craft-plan-stock-card\s*\{([^}]+)\}/)?.[1] ?? "";
  const stockGroups = css.match(/\.craft-plan-stock-card \.craft-plan-detail-group,\s*\.craft-plan-stock-card \.craft-plan-detail-row\s*\{([^}]+)\}/)?.[1] ?? "";
  const stockLabels = css.match(/\.craft-plan-stock-card \.craft-plan-detail-row > span\s*\{([^}]+)\}/)?.[1] ?? "";
  const stockQuantities = css.match(/\.craft-plan-stock-card \.craft-plan-detail-row > strong\s*\{([^}]+)\}/)?.[1] ?? "";

  assert.match(stockCard, /overflow-x:\s*hidden/);
  assert.match(stockGroups, /min-width:\s*0/);
  assert.match(css, /\.craft-plan-stock-card \.craft-plan-detail-row\s*\{[^}]*align-items:\s*flex-start/);
  assert.match(stockLabels, /flex:\s*1 1 auto/);
  assert.match(stockLabels, /white-space:\s*normal/);
  assert.match(stockLabels, /overflow:\s*visible/);
  assert.match(stockLabels, /text-overflow:\s*clip/);
  assert.match(stockLabels, /overflow-wrap:\s*anywhere/);
  assert.match(stockQuantities, /flex:\s*0 0 auto/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/craft-planning-css-boundary.test.mjs
```

Expected: FAIL in `Craft planning stock locations wrap without horizontal scrolling` because the scoped `.craft-plan-stock-card` rules do not exist.

- [ ] **Step 3: Add the minimal scoped CSS repair**

Add this block near the existing item-detail row styles in `apps/bitcraft-local/src/styles/craft-planning.css`:

```css
.craft-plan-stock-card {
  overflow-x: hidden;
}
.craft-plan-stock-card .craft-plan-detail-group,
.craft-plan-stock-card .craft-plan-detail-row {
  min-width: 0;
}
.craft-plan-stock-card .craft-plan-detail-row {
  align-items: flex-start;
}
.craft-plan-stock-card .craft-plan-detail-row > span {
  flex: 1 1 auto;
  min-width: 0;
  overflow: visible;
  text-overflow: clip;
  white-space: normal;
  overflow-wrap: anywhere;
}
.craft-plan-stock-card .craft-plan-detail-row > strong {
  flex: 0 0 auto;
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/craft-planning-css-boundary.test.mjs
```

Expected: all Craft Planning CSS boundary tests PASS with no warnings.

- [ ] **Step 5: Commit the focused fix**

```powershell
git add apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs apps/bitcraft-local/src/styles/craft-planning.css
git commit -m "fix: wrap planner stock locations"
```

### Task 2: Verify the updated planner branch

**Files:**
- Inspect: `apps/bitcraft-local/src/styles/craft-planning.css`
- Inspect: `apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs`

**Interfaces:**
- Consumes: the scoped wrapping rules from Task 1.
- Produces: a verified branch ready to update draft PR #29.

- [ ] **Step 1: Run both focused Craft Planning boundary suites**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/craft-planning-css-boundary.test.mjs test/craft-planning-boundary.test.mjs
```

Expected: all focused tests PASS.

- [ ] **Step 2: Run the complete application test suite**

```powershell
corepack pnpm --filter @workspace/bitcraft-local test
```

Expected: all tests PASS with zero failures.

- [ ] **Step 3: Build the production frontend**

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: TypeScript checking and Vite production build both complete successfully.

- [ ] **Step 4: Re-run the scoped layout detector**

From the main repository checkout, run:

```powershell
node .agents/skills/impeccable/scripts/detect.mjs --json --scope layout .worktrees/planner-target-layout/apps/bitcraft-local/src/styles/craft-planning.css .worktrees/planner-target-layout/apps/bitcraft-local/src/pages/CraftPlanningPage.tsx
```

Expected: `[]`.

- [ ] **Step 5: Perform the browser smoke check when available**

Build and serve the feature worktree at `http://127.0.0.1:18449/?page=planning`. Open an item-details modal with a long stock-location label and verify:

- the label wraps within the left column;
- the quantity remains visible at the top-right;
- no horizontal scrollbar appears;
- the modal still collapses to one column at narrow widths.

If the local profile has no configured craft plan or the smoke server exits, record the browser check as blocked rather than claiming visual verification.

- [ ] **Step 6: Inspect the final diff and push the existing branch**

```powershell
git diff --check
git status --short
git push
```

Expected: the worktree is clean after the Task 1 commit, `git diff --check` reports no errors, and draft PR #29 receives the new commits.
