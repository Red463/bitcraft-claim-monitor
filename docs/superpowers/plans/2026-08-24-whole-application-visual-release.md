# Whole-Application Obsidian Ledger Visual Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved Obsidian Ledger visual system across the complete maintained application and `/bot` in one verified production release.

**Architecture:** Execute five focused visual subplans behind one release gate. Each subplan produces a buildable, testable slice, while the final release task verifies every route, responsive state, and live-data surface before one version bump, push, deploy, and production inspection.

**Tech Stack:** React, TypeScript, Vite, plain CSS, Node.js 24, pnpm, Node test runner, Lucide icons, in-app browser, existing smoke server.

**Spec:** `docs/superpowers/specs/2026-08-24-whole-application-visual-system-design.md`

## Global Constraints

- Work only in `apps/bitcraft-local` and directly related release documentation.
- This is a visual redesign only; do not merge/remove destinations or expand the approved behaviour scope.
- Preserve every current page, route, navigation destination, permission, and capability.
- Do not change API contracts, Relay behaviour, SQLite schema, authentication, Discord delivery semantics, or notification rules.
- Add no UI framework, styling system, charting library, or heavy dependency.
- Preserve user theme, density, and collapsed-navigation settings.
- Keep adaptive-balanced density: compact operational data, comfortable forms/public flows, and touch-sized mobile controls.
- Keep React hooks at component top level and preserve hook order.
- Use existing Lucide icons and BitCraft game imagery.
- Maintain WCAG AA contrast, visible keyboard focus, reduced motion, semantic tables/dialogs, and non-colour status cues.
- Build and test each independently reviewable slice; do not deploy intermediate slices as the finished redesign.
- Ship one beta version and one changelog release only after the full release gate passes.
- Preserve unrelated working-tree changes and stage only files belonging to the active task.

## Coordinated Plan Set

1. `docs/superpowers/plans/2026-08-24-visual-foundations-and-shell.md`
2. `docs/superpowers/plans/2026-08-24-page-family-visual-refresh.md`
3. `docs/superpowers/plans/2026-08-24-market-visual-refresh.md`
4. `docs/superpowers/plans/2026-08-24-map-visual-refresh.md`
5. `docs/superpowers/plans/2026-08-24-bot-admin-visual-refresh.md`

Dependency order:

```text
Foundations & shell
        |
        +---- Page families
        +---- Markets
        +---- Map
        +---- Bot/Admin
                    |
                    v
       Whole-app release gate
                    |
                    v
        Version / push / deploy
                    |
                    v
        Live production inspection
```

The four surface plans after Foundations & Shell may be implemented independently if their task files do not overlap. Review and commit each task before starting another task that touches the same stylesheet.

---

### Task 1: Establish the isolated execution workspace

**Files:**
- Read: `AGENTS.md`
- Read: `docs/superpowers/specs/2026-08-24-whole-application-visual-system-design.md`
- Read: all five coordinated subplans listed above
- Do not modify production files in this task.

**Interfaces:**
- Consumes: approved spec and plan set.
- Produces: isolated `codex/` worktree/branch with the current base commit recorded.

- [ ] **Step 1: Invoke the required isolation skill**

Use `superpowers:using-git-worktrees` before production edits. Create a `codex/`-prefixed branch from the intended integration base. Do not reuse a worktree containing unrelated changes.

- [ ] **Step 2: Record the clean execution baseline**

Run:

```powershell
git branch --show-current
git rev-parse HEAD
git status --short
```

Expected: the new `codex/` branch is active and the isolated worktree contains no unrelated modifications.

- [ ] **Step 3: Run baseline verification**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
corepack pnpm --filter @workspace/bitcraft-local test
```

Expected: PASS. If the baseline fails, stop and document the pre-existing failure before changing code.

### Task 2: Execute the five visual subplans

**Files:**
- Modify only the files enumerated by each subplan.
- Do not edit `CHANGELOG.md` or `apps/bitcraft-local/package.json` yet.

**Interfaces:**
- Consumes: shared `surfaceModeForPanel`, shell tokens, and page primitives produced by the foundations plan.
- Produces: complete visual implementation with each subplan's focused tests and commits passing.

- [ ] **Step 1: Execute Foundations & Shell**

Follow every checkbox in:

```text
docs/superpowers/plans/2026-08-24-visual-foundations-and-shell.md
```

Expected gate: focused shell/theme tests, build, and shell browser matrix pass.

- [ ] **Step 2: Execute Page Families**

Follow every checkbox in:

```text
docs/superpowers/plans/2026-08-24-page-family-visual-refresh.md
```

Expected gate: all conventional routes use the approved page-family patterns and focused tests/build pass.

- [ ] **Step 3: Execute Markets**

Follow every checkbox in:

```text
docs/superpowers/plans/2026-08-24-market-visual-refresh.md
```

Expected gate: Global Market Split Exchange, mobile drill-in, Local Market styling, focused tests, and browser inspection pass.

- [ ] **Step 4: Execute Map**

Follow every checkbox in:

```text
docs/superpowers/plans/2026-08-24-map-visual-refresh.md
```

Expected gate: all map docks remain viewport-contained and focused map tests/browser checks pass.

- [ ] **Step 5: Execute Bot/Admin**

Follow every checkbox in:

```text
docs/superpowers/plans/2026-08-24-bot-admin-visual-refresh.md
```

Expected gate: health/exceptions hierarchy, every current bot section, destructive controls, focused tests, and mobile browser checks pass.

### Task 3: Run the whole-application release gate

**Files:**
- Modify only focused tests or CSS/component defects found by verification.
- Do not broaden scope into feature or backend work.

**Interfaces:**
- Consumes: completed commits from all five subplans.
- Produces: written evidence that automated and visual gates pass at the same commit.

- [ ] **Step 1: Run whitespace and ownership checks**

Run:

```powershell
$visualBase = git merge-base main HEAD
git diff --check "$visualBase..HEAD"
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/css-ownership.test.mjs test/theme-contract.test.mjs test/ui-audit-guardrails.test.mjs test/responsive-layout-boundary.test.mjs
```

Expected: PASS with no whitespace errors or CSS ownership regressions.

- [ ] **Step 2: Run the production build and full suite**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
corepack pnpm --filter @workspace/bitcraft-local test
```

Expected: PASS.

- [ ] **Step 3: Start the stable smoke server**

Run:

```powershell
node scripts/start-bitcraft-local-smoke.mjs --restart
curl.exe -s http://127.0.0.1:18449/api/local/health
```

Expected: launcher returns promptly and health JSON reports the local service ready.

- [ ] **Step 4: Inspect every main application destination**

Use the in-app browser against `http://127.0.0.1:18449/` and inspect these `page` values:

```text
dashboard, leaderboard, members, skills, craft-monitor, planning,
inventory, construction, research, settlement-market, market,
region, empires, map, activity, publiccrafts, craftcalc, sync, admin
```

For each route verify populated or representative state, page title, focus visibility, no console error, no horizontal page overflow, and no obscured action.

- [ ] **Step 5: Inspect all Global Market workspaces and Bot sections**

Inspect Market tabs:

```text
overview, browse, opportunities, saved, stalls
```

Inspect `/bot` sections:

```text
setup, notifications, youtube, channels, roleManager, roles, colours,
community, moderation, safety, records, content, commands, tools,
tests, diagnostics
```

Verify the Bot console does not send real messages or execute moderation actions during inspection.

- [ ] **Step 6: Run the viewport matrix**

At minimum inspect:

```text
1440 × 900
1024 × 768
768 × 1024
390 × 844
```

Explicitly check expanded/collapsed shell, mobile drawer, market tabs and back-to-results, table headers/value alignment, fixed dialogs, map docks, Bot section picker, long Bot forms, stale-data notices, loading states, empty states, and signed-out/restricted states.

- [ ] **Step 7: Commit verification fixes**

Stage only focused defects discovered by the release gate:

```powershell
git add -- apps/bitcraft-local/src apps/bitcraft-local/test
git commit -m "fix: close whole-app visual QA gaps"
```

If no fixes were required, do not create an empty commit.

### Task 4: Prepare and deploy the single release

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `apps/bitcraft-local/package.json`
- Modify only if required by existing release automation: deployment metadata already tracked by the repository.

**Interfaces:**
- Consumes: one verified release commit from Task 3.
- Produces: one beta version, one changelog section, one pushed release, one production deployment, and live visual evidence.

- [ ] **Step 1: Select the beta version from repository policy**

Read `VERSIONING.md` and the current package/changelog version. Apply exactly one of these rules:

```text
same visual-release line  -> increment beta only
new visual feature line   -> increment MINOR, reset PATCH to 0 and beta to 1
fix-only released line    -> increment PATCH and reset beta to 1
```

For this whole-application feature area, use a new MINOR beta line unless a matching unreleased visual-release line already exists.

- [ ] **Step 2: Write the user-facing changelog section**

Use dated Keep a Changelog headings. Include concrete entries such as:

```markdown
### Changed

- Refreshed the complete application with the Obsidian Ledger visual system.
- Improved the Global Market for regional price comparison on desktop and mobile.
- Reworked the Bot dashboard around service health and actionable exceptions.
- Improved responsive layouts, keyboard focus, and stale-data presentation across the app.
```

Do not include commit hashes, internal task names, or empty headings.

- [ ] **Step 3: Update the package version and rerun final verification**

Set `apps/bitcraft-local/package.json` to the selected version, then run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
corepack pnpm --filter @workspace/bitcraft-local test
git diff --check
```

Expected: PASS.

- [ ] **Step 4: Commit and push the release**

```powershell
git add -- CHANGELOG.md apps/bitcraft-local/package.json
git commit -m "chore: release whole-app visual refresh"
git push
```

Expected: the release branch is pushed with all checks passing. Follow the repository's existing integration/deployment workflow; do not invent a new deployment path.

- [ ] **Step 5: Deploy once and inspect production**

After the existing deployment workflow completes, open `https://app.timbersteeltrade.com/` in the in-app browser with live data. Repeat the route/workspace/section and viewport checks from Task 3, prioritising Dashboard, Global Market Browse, Local Market, Map, `/bot`, stale-data presentation, and mobile overflow.

Expected: production matches the verified build, real data remains visible, and there are no console errors or layout regressions.

- [ ] **Step 6: Use the existing rollback point if production fails**

If a release-blocking visual or runtime regression is found, stop the rollout and restore the previous deployed build using the repository's existing rollback/deployment procedure. Do not patch production manually outside version control.
