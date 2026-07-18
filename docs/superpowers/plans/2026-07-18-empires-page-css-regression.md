# Empires Page CSS Regression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the Empires page tabs, summary grid, table-card spacing, and the separation between the Claimed watchtowers heading and its filter pills.

**Architecture:** Keep the route-delivered Empires page visually self-contained. Remove its semantic dependency on the Leaderboard tab class and define the required tab, metric-grid, and table-panel layout within `empires.css`, using scoped selectors so other routes are unaffected.

**Tech Stack:** React, TypeScript, plain CSS, Node test runner, Vite.

## Global Constraints

- Work only in `apps/bitcraft-local` plus this implementation plan.
- Use the existing dark operational-dashboard visual language and gold active state.
- Do not import the complete Leaderboard or Dashboard stylesheet into Empires.
- Preserve existing Empires behaviour and data rendering.
- Use responsive four-, two-, and one-column summary layouts.

---

### Task 1: Make Empires styling self-contained with a regression test

**Files:**
- Modify: `apps/bitcraft-local/test/empires-page-boundary.test.mjs`
- Modify: `apps/bitcraft-local/src/pages/EmpiresPage.tsx`
- Modify: `apps/bitcraft-local/src/styles/empires.css`

**Interfaces:**
- Consumes: `EmpiresPage.tsx` class names, `empires.css` selectors, and existing theme variables such as `--active-color`, `--border`, `--card-top`, and `--card-bottom`.
- Produces: Tested, page-scoped tab styling, metric layout, card layout, and filter spacing with no cross-route CSS dependency.

- [ ] **Step 1: Write the failing test**

Add a test that reads `EmpiresPage.tsx` and `empires.css`, rejects the `leaderboard-tabs` class, and requires page-owned rules for `.empires-tabs` buttons and active state, `.empires-page .stats-grid`, `.empires-page .table-panel`, responsive summary columns, and a positive `12px` filter-bar top margin.

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```powershell
node --test apps/bitcraft-local/test/empires-page-boundary.test.mjs
```

Expected: FAIL because the page still contains `leaderboard-tabs` and the route-owned layout rules are absent.

- [ ] **Step 3: Remove the Leaderboard-owned tab class**

Change the tab container from `leaderboard-tabs empires-tabs` to `empires-tabs` while retaining its role, label, buttons, icons, active state, and click behaviour.

- [ ] **Step 4: Add the minimum page-owned CSS**

In `empires.css`:

- make `.empires-tabs` a wrapped flex row with an `8px` gap;
- style its buttons with the existing dark surface, hover/focus border, and gold active state;
- make `.empires-page .stats-grid` a four-column grid with a `12px` gap, reducing to two columns at `1250px` and one at `560px`;
- make `.empires-page .table-panel` own its border, background, padding, grid layout, and `12px` internal gap;
- replace `.watchtower-filter-bar`'s `-2px` top margin with `12px`.

- [ ] **Step 5: Run the focused test to verify it passes**

Run:

```powershell
node --test apps/bitcraft-local/test/empires-page-boundary.test.mjs
```

Expected: PASS.

### Task 2: Verify, visually inspect, and commit

**Files:**
- Verify: `apps/bitcraft-local/src/pages/EmpiresPage.tsx`
- Verify: `apps/bitcraft-local/src/styles/empires.css`
- Verify: `apps/bitcraft-local/test/empires-page-boundary.test.mjs`

**Interfaces:**
- Consumes: Completed page-scoped CSS fix.
- Produces: A build-verified, test-verified, visually checked branch commit.

- [ ] **Step 1: Run production verification**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
corepack pnpm --filter @workspace/bitcraft-local test
```

Expected: Both commands exit `0`.

- [ ] **Step 2: Re-run the layout detector**

Run:

```powershell
node .agents/skills/impeccable/scripts/detect.mjs --json --scope layout apps/bitcraft-local/src/pages/EmpiresPage.tsx apps/bitcraft-local/src/styles/empires.css
```

Expected: `[]` or only explicitly reviewed findings.

- [ ] **Step 3: Browser-check the Empires page**

Build and serve the local app at `http://127.0.0.1:18449/?page=empires`, then verify that the tabs have a clear gold active state, summary cards form a responsive grid, and the Claimed watchtowers heading has visible separation from its filter pills.

- [ ] **Step 4: Review and commit**

Inspect the diff for unrelated changes, run the code-review workflow, then commit only the plan, page, stylesheet, and focused test with message:

```text
Fix Empires page styling
```

## Self-Review

- Spec coverage: Both reported symptoms and the directly related route-style regressions are covered by Task 1, with Task 2 providing final verification.
- Placeholder scan: No deferred implementation steps or placeholder text remain.
- Type consistency: This change adds no TypeScript interfaces or runtime APIs.
