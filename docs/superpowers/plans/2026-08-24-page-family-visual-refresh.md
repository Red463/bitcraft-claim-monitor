# Application Page-Family Visual Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply consistent Obsidian Ledger composition to command/analytics, people/progression, work-queue/resource, and guided/public pages while preserving every route and capability.

**Architecture:** Extend the existing `PageHeader` contract across conventional routes, then style each page through its existing focused stylesheet. Preserve existing data fetching and interactions; change React markup only to establish shared header, toolbar, workspace, and detail boundaries.

**Tech Stack:** React, TypeScript, Vite, plain CSS, Node test runner, existing shared controls and Lucide icons.

**Spec:** `docs/superpowers/specs/2026-08-24-whole-application-visual-system-design.md`

## Global Constraints

- Execute after `2026-08-24-visual-foundations-and-shell.md`.
- Do not change route IDs, data contracts, provider projections, access rules, or page capabilities.
- Preserve existing hooks and derived data; do not move hooks below conditional returns.
- Reuse `PageHeader`, `DataTable`, `SearchBox`, `Segmented`, `Stats`, `AsyncState`, and existing controls where already suitable.
- Keep route-specific styling in the nearest existing stylesheet.
- Global Market, Local Market, Map, Admin, and `/bot` are owned by their focused plans.
- Responsive tables must retain semantic structure and must not create overlapping label/value cards.

---

### Task 1: Standardise conventional page anatomy

**Files:**
- Modify: `apps/bitcraft-local/src/components/main/PageHeader.tsx`
- Modify: `apps/bitcraft-local/src/styles.css`
- Modify: `apps/bitcraft-local/src/pages/LeaderboardPage.tsx`
- Modify: `apps/bitcraft-local/src/pages/ActivityPage.tsx`
- Modify: `apps/bitcraft-local/src/pages/RegionPage.tsx`
- Modify: `apps/bitcraft-local/src/pages/EmpiresPage.tsx`
- Modify: `apps/bitcraft-local/src/pages/CraftPlanningPage.tsx`
- Modify: `apps/bitcraft-local/src/pages/PublicCraftFinderPage.tsx`
- Modify: `apps/bitcraft-local/src/pages/CraftCalculatorPage.tsx`
- Modify: `apps/bitcraft-local/src/pages/SyncPage.tsx`
- Modify: `apps/bitcraft-local/src/components/main/LegalDialogs.tsx`
- Modify: `apps/bitcraft-local/src/components/main/LegalAcceptanceDialog.tsx`
- Modify: `apps/bitcraft-local/test/theme-contract.test.mjs`
- Modify: `apps/bitcraft-local/test/page-header-spacing-boundary.test.mjs`
- Create: `apps/bitcraft-local/test/page-family-boundary.test.mjs`

**Interfaces:**
- Extends: `PageHeaderProps` with optional `eyebrow?: string` and `status?: React.ReactNode` only if existing `meta` cannot express both cleanly.
- Produces: one `.page-header` per conventional route and shared `.page-workspace`, `.page-toolbar`, and `.page-status` structural classes.
- Preserves: existing page titles, descriptions, actions, and route-specific controls.

- [ ] **Step 1: Write the failing route-coverage test**

Create a test that requires `PageHeader` in every conventional route owned by this plan:

```js
const routes = [
  ["DashboardPage.tsx", "Settlement command centre"],
  ["LeaderboardPage.tsx", "Leaderboard"],
  ["MembersPage.tsx", "Members"],
  ["SkillsPage.tsx", "Professions"],
  ["ProductionPage.tsx", "Craft Monitor"],
  ["CraftPlanningPage.tsx", "Craft Planning"],
  ["InventoryPage.tsx", "Inventory"],
  ["ConstructionPage.tsx", "Construction"],
  ["ResearchPage.tsx", "Research"],
  ["RegionPage.tsx", "Region"],
  ["EmpiresPage.tsx", "Empires"],
  ["ActivityPage.tsx", "Activity"],
  ["PublicCraftFinderPage.tsx", "Public Craft Finder"],
  ["CraftCalculatorPage.tsx", "Craft Calculator"],
  ["SyncPage.tsx", "Sync"],
];
for (const [file, title] of routes) {
  const source = readFileSync(new URL(`../src/pages/${file}`, import.meta.url), "utf8");
  assert.match(source, /import \{ PageHeader \} from "\.\.\/components\/main\/PageHeader";/, file);
  assert.match(source, new RegExp(`<PageHeader[\\s\\S]*?title="${title}"`), file);
}
```

Require shared header CSS to use tokenised gaps, responsive one-column layout, and no fixed height.

- [ ] **Step 2: Run the tests and verify RED**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/theme-contract.test.mjs test/page-header-spacing-boundary.test.mjs test/page-family-boundary.test.mjs
```

Expected: FAIL for routes still using bespoke topbars.

- [ ] **Step 3: Migrate conventional headers without moving page logic**

For each route, replace only the existing title/topbar markup with:

```tsx
<PageHeader
  title="Route title"
  description="One concise sentence describing the page's operational job."
  meta={existingFreshnessOrStatus}
  actions={existingPrimaryActions}
/>
```

Keep filters below the header in `.page-toolbar`; do not place large filter groups inside `actions`.

- [ ] **Step 4: Add shared page anatomy styling**

Use tokenised structure:

```css
.page-header { gap: var(--space-6); }
.page-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--line-subtle);
  border-radius: var(--radius-panel);
  background: var(--surface-1);
}
.page-workspace {
  min-width: 0;
  border: 1px solid var(--line-subtle);
  border-radius: var(--radius-panel);
  background: var(--surface-1);
}
```

Do not force every page to wrap all content in one extra card; use the classes only at actual structural boundaries.

- [ ] **Step 5: Run focused tests and build**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/theme-contract.test.mjs test/page-header-spacing-boundary.test.mjs test/page-family-boundary.test.mjs test/route-loading-boundary.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: PASS.

- [ ] **Step 6: Commit shared anatomy**

```powershell
git add -- apps/bitcraft-local/src/components/main/PageHeader.tsx apps/bitcraft-local/src/styles.css apps/bitcraft-local/src/pages/LeaderboardPage.tsx apps/bitcraft-local/src/pages/ActivityPage.tsx apps/bitcraft-local/src/pages/RegionPage.tsx apps/bitcraft-local/src/pages/EmpiresPage.tsx apps/bitcraft-local/src/pages/CraftPlanningPage.tsx apps/bitcraft-local/src/pages/PublicCraftFinderPage.tsx apps/bitcraft-local/src/pages/CraftCalculatorPage.tsx apps/bitcraft-local/src/pages/SyncPage.tsx apps/bitcraft-local/test/theme-contract.test.mjs apps/bitcraft-local/test/page-header-spacing-boundary.test.mjs apps/bitcraft-local/test/page-family-boundary.test.mjs
git commit -m "style: standardize route page anatomy"
```

### Task 2: Make Dashboard a settlement command centre

**Files:**
- Modify: `apps/bitcraft-local/src/pages/DashboardPage.tsx`
- Modify: `apps/bitcraft-local/src/pages/dashboardView.ts`
- Modify: `apps/bitcraft-local/src/styles/dashboard.css`
- Modify: `apps/bitcraft-local/test/dashboard-page-boundary.test.mjs`
- Modify: `apps/bitcraft-local/test/dashboard-view.test.mjs`
- Modify: `apps/bitcraft-local/test/dashboard-recent-activity.test.mjs`

**Interfaces:**
- Consumes: current dashboard data and existing navigation callbacks.
- Produces: visual groups `dashboard-command-state`, `dashboard-command-metrics`, `dashboard-exceptions`, and `dashboard-live-activity`.
- Preserves: every current dashboard metric/widget and existing route navigation.

- [ ] **Step 1: Write failing hierarchy tests**

Require the command-centre title and ordered structural regions:

```js
assert.match(source, /title="Settlement command centre"/);
for (const className of [
  "dashboard-command-state", "dashboard-command-metrics",
  "dashboard-exceptions", "dashboard-live-activity",
]) assert.match(source, new RegExp(`className="[^"]*${className}`));

assert.ok(source.indexOf("dashboard-exceptions") < source.indexOf("dashboard-live-activity"));
```

Keep existing dashboard view tests asserting underlying values and shortcuts.

- [ ] **Step 2: Run tests and verify RED**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/dashboard-page-boundary.test.mjs test/dashboard-view.test.mjs test/dashboard-recent-activity.test.mjs
```

Expected: FAIL because the approved visual regions are absent.

- [ ] **Step 3: Reorder existing dashboard presentation only**

Group existing current-state/health information first, high-signal metrics second, blocker/attention widgets third, and existing recent activity/supporting widgets last. Do not invent new health semantics or hide existing data.

Where no current data can support an exception, render a compact healthy/empty state such as:

```tsx
<div className="empty-state compact">
  <strong>No current exceptions</strong>
  <span>Settlement feeds have not reported an item requiring attention.</span>
</div>
```

- [ ] **Step 4: Apply command-centre styling**

Use one status band, a compact metric grid, and two supporting columns. At narrow widths, stack status → exceptions → activity. Avoid a marketing hero and avoid decorative icon cards for every number.

- [ ] **Step 5: Run focused tests and build**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/dashboard-page-boundary.test.mjs test/dashboard-view.test.mjs test/dashboard-recent-activity.test.mjs test/dashboard-members-view.test.mjs test/dashboard-market-income-chart.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: PASS.

- [ ] **Step 6: Browser-check populated and sparse dashboard states**

Inspect at 1440×900, 1024×768, and 390×844. Verify first-viewport priority, no oversized empty cards, readable metrics, activity chronology, and working navigation shortcuts.

- [ ] **Step 7: Commit Dashboard**

```powershell
git add -- apps/bitcraft-local/src/pages/DashboardPage.tsx apps/bitcraft-local/src/pages/dashboardView.ts apps/bitcraft-local/src/styles/dashboard.css apps/bitcraft-local/test/dashboard-page-boundary.test.mjs apps/bitcraft-local/test/dashboard-view.test.mjs apps/bitcraft-local/test/dashboard-recent-activity.test.mjs
git commit -m "style: focus dashboard on settlement operations"
```

### Task 3: Apply the people and progression pattern

**Files:**
- Modify: `apps/bitcraft-local/src/pages/MembersPage.tsx`
- Modify: `apps/bitcraft-local/src/pages/SkillsPage.tsx`
- Modify: `apps/bitcraft-local/src/pages/RegionPage.tsx`
- Modify: `apps/bitcraft-local/src/pages/EmpiresPage.tsx`
- Modify: `apps/bitcraft-local/src/styles/members.css`
- Modify: `apps/bitcraft-local/src/styles/skills.css`
- Modify: `apps/bitcraft-local/src/styles/region.css`
- Modify: `apps/bitcraft-local/src/styles/empires.css`
- Modify: `apps/bitcraft-local/test/members-loadout-boundary.test.mjs`
- Modify: `apps/bitcraft-local/test/skills-page-boundary.test.mjs`
- Modify: `apps/bitcraft-local/test/region-page-boundary.test.mjs`
- Modify: `apps/bitcraft-local/test/empires-page-boundary.test.mjs`
- Modify: `apps/bitcraft-local/test/page-family-boundary.test.mjs`

**Interfaces:**
- Produces: consistent `people-toolbar`, `people-collection`, `people-detail`, and `progress-grid` visual regions.
- Preserves: current selection, search, filter, sorting, member dialog/detail, map actions, and empire/region data.

- [ ] **Step 1: Add failing family-boundary tests**

Require each route root to carry `page-family-people` and each search/filter group to use `page-toolbar`. Where an existing desktop list/detail relationship exists, require `people-collection` and `people-detail` wrappers. Do not require new selection behaviour on pages that do not already select records.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/page-family-boundary.test.mjs test/members-loadout-boundary.test.mjs test/skills-page-boundary.test.mjs test/region-page-boundary.test.mjs test/empires-page-boundary.test.mjs
```

Expected: FAIL for missing family classes.

- [ ] **Step 3: Add structural classes without changing data flow**

Use markup such as:

```tsx
<div className="page-workspace people-workspace">
  <section className="people-collection">{existingCollection}</section>
  <section className="people-detail">{existingDetail}</section>
</div>
```

When detail is already a dialog, retain the shared `Dialog` and style the underlying collection only.

- [ ] **Step 4: Harmonise focused styles**

Align avatar framing, role/status badges, progress bars, rank numbers, metadata, filter toolbars, active rows, and empty states. Desktop may use master/detail where already supported; mobile must use the existing dialog/drill-in interaction rather than squeezing both panes.

- [ ] **Step 5: Run focused tests and build**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/page-family-boundary.test.mjs test/members-loadout-boundary.test.mjs test/member-presence-presentation.test.mjs test/skills-page-boundary.test.mjs test/region-page-boundary.test.mjs test/empires-page-boundary.test.mjs test/empires-page-interaction.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: PASS.

- [ ] **Step 6: Commit people/progression styling**

```powershell
git add -- apps/bitcraft-local/src/pages/MembersPage.tsx apps/bitcraft-local/src/pages/SkillsPage.tsx apps/bitcraft-local/src/pages/RegionPage.tsx apps/bitcraft-local/src/pages/EmpiresPage.tsx apps/bitcraft-local/src/styles/members.css apps/bitcraft-local/src/styles/skills.css apps/bitcraft-local/src/styles/region.css apps/bitcraft-local/src/styles/empires.css apps/bitcraft-local/test/page-family-boundary.test.mjs apps/bitcraft-local/test/members-loadout-boundary.test.mjs apps/bitcraft-local/test/skills-page-boundary.test.mjs apps/bitcraft-local/test/region-page-boundary.test.mjs apps/bitcraft-local/test/empires-page-boundary.test.mjs
git commit -m "style: unify people and progression pages"
```

### Task 4: Apply the work-queue and resource pattern

**Files:**
- Modify: `apps/bitcraft-local/src/pages/ProductionPage.tsx`
- Modify: `apps/bitcraft-local/src/pages/CraftPlanningPage.tsx`
- Modify: `apps/bitcraft-local/src/pages/CraftPlanManagerDialog.tsx`
- Modify: `apps/bitcraft-local/src/pages/InventoryPage.tsx`
- Modify: `apps/bitcraft-local/src/pages/ConstructionPage.tsx`
- Modify: `apps/bitcraft-local/src/pages/ResearchPage.tsx`
- Modify: `apps/bitcraft-local/src/styles/production.css`
- Modify: `apps/bitcraft-local/src/styles/craft-planning.css`
- Modify: `apps/bitcraft-local/src/styles/inventory.css`
- Modify: `apps/bitcraft-local/src/styles/construction.css`
- Modify: `apps/bitcraft-local/src/styles/research.css`
- Modify: `apps/bitcraft-local/test/production-page-boundary.test.mjs`
- Modify: `apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs`
- Modify: `apps/bitcraft-local/test/inventory-page-boundary.test.mjs`
- Modify: `apps/bitcraft-local/test/research-lanes-boundary.test.mjs`
- Modify: `apps/bitcraft-local/test/page-family-boundary.test.mjs`

**Interfaces:**
- Produces: consistent `work-toolbar`, `work-queue`, `work-detail`, `work-status`, and `work-requirements` visual regions.
- Preserves: all queue/filter/sort/dialog/planning/inventory/research interactions and data.

- [ ] **Step 1: Add failing structural tests**

Require each route root to carry `page-family-work`. Require search/filter controls to live in `.page-toolbar` or `.work-toolbar`, and require tables to remain inside `.table-wrap` with their existing accessible labels.

For `CraftPlanManagerDialog`, retain `<Dialog>` and assert its content wrapper remains viewport-bounded.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/page-family-boundary.test.mjs test/production-page-boundary.test.mjs test/craft-planning-css-boundary.test.mjs test/inventory-page-boundary.test.mjs test/research-lanes-boundary.test.mjs test/modal-foundation-boundary.test.mjs
```

Expected: FAIL for missing family structure.

- [ ] **Step 3: Add queue/detail structure around existing content**

Group the existing primary collection and selected/requirements content. Do not convert semantic tables to arbitrary cards. Example:

```tsx
<div className="page-workspace work-workspace">
  <section className="work-queue">{existingTableOrQueue}</section>
  {existingDetail ? <aside className="work-detail">{existingDetail}</aside> : null}
</div>
```

- [ ] **Step 4: Apply focused responsive styling**

Use compact table rows and aligned numeric columns on desktop. At narrow widths, preserve table scrolling with a visible label or move secondary details into the existing detail/dialog path. Never place labels over values or collapse distinct columns into unreadable inline text.

- [ ] **Step 5: Run focused tests and build**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/page-family-boundary.test.mjs test/production-page-boundary.test.mjs test/production-tool-eligibility.test.mjs test/craft-planning-css-boundary.test.mjs test/craft-planning-boundary.test.mjs test/inventory-page-boundary.test.mjs test/research-lanes-boundary.test.mjs test/modal-foundation-boundary.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: PASS.

- [ ] **Step 6: Commit work-queue styling**

```powershell
git add -- apps/bitcraft-local/src/pages/ProductionPage.tsx apps/bitcraft-local/src/pages/CraftPlanningPage.tsx apps/bitcraft-local/src/pages/CraftPlanManagerDialog.tsx apps/bitcraft-local/src/pages/InventoryPage.tsx apps/bitcraft-local/src/pages/ConstructionPage.tsx apps/bitcraft-local/src/pages/ResearchPage.tsx apps/bitcraft-local/src/styles/production.css apps/bitcraft-local/src/styles/craft-planning.css apps/bitcraft-local/src/styles/inventory.css apps/bitcraft-local/src/styles/construction.css apps/bitcraft-local/src/styles/research.css apps/bitcraft-local/test/page-family-boundary.test.mjs apps/bitcraft-local/test/production-page-boundary.test.mjs apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs apps/bitcraft-local/test/inventory-page-boundary.test.mjs apps/bitcraft-local/test/research-lanes-boundary.test.mjs
git commit -m "style: unify operational work queues"
```

### Task 5: Apply the guided/public pattern and family browser gate

**Files:**
- Modify: `apps/bitcraft-local/src/pages/PublicCraftFinderPage.tsx`
- Modify: `apps/bitcraft-local/src/pages/CraftCalculatorPage.tsx`
- Modify: `apps/bitcraft-local/src/pages/SyncPage.tsx`
- Modify: `apps/bitcraft-local/src/styles/public-craft.css`
- Modify: `apps/bitcraft-local/src/styles/craftcalc.css`
- Modify: `apps/bitcraft-local/src/styles/sync.css`
- Modify: `apps/bitcraft-local/src/styles/app-popups.css`
- Modify: `apps/bitcraft-local/src/styles/app-chrome.css`
- Modify: `apps/bitcraft-local/test/public-craft-finder-page-boundary.test.mjs`
- Modify: `apps/bitcraft-local/test/restricted-access-guidance.test.mjs`
- Modify: `apps/bitcraft-local/test/legal-acceptance-boundary.test.mjs`
- Modify: `apps/bitcraft-local/test/legal-policy.test.mjs`
- Modify: `apps/bitcraft-local/test/page-family-boundary.test.mjs`

**Interfaces:**
- Produces: `page-family-guided`, `guided-steps`, `guided-inputs`, and `guided-results` visual regions.
- Preserves: existing calculator/finder/sync inputs, URL state, results, sign-in prompts, and access guidance.

- [ ] **Step 1: Add failing guided-flow tests**

Require each tool route to use `page-family-guided`; require primary inputs to precede advanced controls/results in source order; retain existing accessible form labels and restricted-state actions. Require dedicated Terms/Privacy and legal acceptance surfaces to use `guided-legal` while preserving their exact policy text and acceptance controls.

- [ ] **Step 2: Run tests and verify RED**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/page-family-boundary.test.mjs test/public-craft-finder-page-boundary.test.mjs test/restricted-access-guidance.test.mjs
```

Expected: FAIL for missing guided structure.

- [ ] **Step 3: Add visual sequence wrappers**

Use existing state to present choose/input → options → result without changing calculations. Advanced controls may be grouped in existing `<details>` or secondary sections but must remain reachable and labelled. Add `guided-legal` and shared calm-surface classes to existing legal/authentication markup without changing policy copy, consent order, or dedicated routes.

- [ ] **Step 4: Style comfortable controls and results**

Use a maximum readable line length, one-column mobile forms, 42px primary mobile controls, clear result emphasis, and compact explanatory copy. Avoid oversized empty illustrations.

- [ ] **Step 5: Run focused tests and build**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/page-family-boundary.test.mjs test/public-craft-finder-page-boundary.test.mjs test/public-craft-math.test.mjs test/restricted-access-guidance.test.mjs test/legal-acceptance-boundary.test.mjs test/legal-policy.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: PASS.

- [ ] **Step 6: Browser-check all owned routes**

Inspect Dashboard, Leaderboard, Members, Professions, Craft Monitor, Craft Planning, Inventory, Construction, Research, Region, Empires, Activity, Public Craft Finder, Craft Calculator, and Sync at 1440×900, 1024×768, and 390×844. Verify populated, empty, loading, stale/error where available, signed-out, and restricted states.

- [ ] **Step 7: Commit guided/public styling**

```powershell
git add -- apps/bitcraft-local/src/pages/PublicCraftFinderPage.tsx apps/bitcraft-local/src/pages/CraftCalculatorPage.tsx apps/bitcraft-local/src/pages/SyncPage.tsx apps/bitcraft-local/src/components/main/LegalDialogs.tsx apps/bitcraft-local/src/components/main/LegalAcceptanceDialog.tsx apps/bitcraft-local/src/styles/public-craft.css apps/bitcraft-local/src/styles/craftcalc.css apps/bitcraft-local/src/styles/sync.css apps/bitcraft-local/src/styles/app-popups.css apps/bitcraft-local/src/styles/app-chrome.css apps/bitcraft-local/test/public-craft-finder-page-boundary.test.mjs apps/bitcraft-local/test/restricted-access-guidance.test.mjs apps/bitcraft-local/test/legal-acceptance-boundary.test.mjs apps/bitcraft-local/test/legal-policy.test.mjs apps/bitcraft-local/test/page-family-boundary.test.mjs
git commit -m "style: refresh guided and public tools"
```
