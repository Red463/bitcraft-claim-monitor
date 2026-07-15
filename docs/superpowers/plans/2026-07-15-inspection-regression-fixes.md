# Inspection Regression Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the four visual-inspection regressions without changing global panel or dialog behaviour.

**Architecture:** Apply one narrowly owned change per affected surface: tour overlay CSS, Leaderboard page CSS, Members permission-cell markup, and User Settings layout CSS. Each fix gets a focused source-boundary regression first, then the final candidate is rebuilt and checked through the existing read-only smoke/CDP workflow.

**Tech Stack:** React, TypeScript, plain CSS, Node test runner, Vite, pnpm via Corepack, local smoke server and bounded Edge CDP rendering.

## Global Constraints

- Work only in `apps/bitcraft-local` except for this plan and temporary visual evidence.
- Preserve existing tour geometry, card placement, keyboard behaviour, and reduced-motion treatment.
- Preserve Leaderboard responsive column changes at 1250px and 560px.
- Preserve the direct build and inventory permission icons; do not introduce another inferred role label.
- Keep User Settings viewport-fixed and modal, with one vertical scroll owner for settings content.
- Do not change global `.panel` alignment or the shared `Dialog` primitive.
- Do not update release versions, `CHANGELOG.md`, or deployment state.
- Every production edit must follow a witnessed RED → GREEN test cycle.
- Preserve all unrelated and untracked `.superpowers` evidence in the worktree.

---

## File map

- `apps/bitcraft-local/src/styles/first-run-tour.css`: owns guided-tour dimming, spotlight, and card placement.
- `apps/bitcraft-local/test/appshell-tour-boundary.test.mjs`: guards tour composition and CSS layering.
- `apps/bitcraft-local/src/styles/leaderboard.css`: owns Leaderboard-only page and summary geometry.
- `apps/bitcraft-local/test/leaderboard-page-boundary.test.mjs`: guards Leaderboard page-level responsive/layout contracts.
- `apps/bitcraft-local/src/pages/MembersPage.tsx`: renders the Members table permission column.
- `apps/bitcraft-local/test/member-permissions.test.mjs`: guards permission parsing and Members permission presentation.
- `apps/bitcraft-local/src/styles/user-settings.css`: owns the settings modal's internal rows and scrolling.
- `apps/bitcraft-local/test/appshell-user-settings-boundary.test.mjs`: guards User Settings extraction and presentation contracts.

### Task 1: Keep guided-tour spotlight targets crisp

**Files:**
- Modify: `apps/bitcraft-local/test/appshell-tour-boundary.test.mjs`
- Modify: `apps/bitcraft-local/src/styles/first-run-tour.css:1-4`

**Interfaces:**
- Consumes: shared `.dialog-backdrop` blur from `styles/app-chrome.css` and tour-specific `.first-run-tour-overlay` classes.
- Produces: active guided steps with no overlay blur; the initial prompt retains its explicit `blur(3px)` treatment.

- [ ] **Step 1: Add the failing spotlight-clarity boundary**

Append this test to `apps/bitcraft-local/test/appshell-tour-boundary.test.mjs`:

```js
test("guided tour keeps highlighted targets crisp while the welcome prompt may blur", () => {
  const css = readFileSync(new URL("../src/styles/first-run-tour.css", import.meta.url), "utf8");

  assert.match(css, /\.first-run-tour-overlay\s*\{[^}]*backdrop-filter:\s*none;/s);
  assert.match(css, /\.first-run-tour-prompt-overlay,\s*\.first-run-tour-overlay\.is-centered\s*\{[^}]*backdrop-filter:\s*blur\(3px\);/s);
});
```

- [ ] **Step 2: Run the focused test and witness RED**

Run:

```powershell
node --test apps/bitcraft-local/test/appshell-tour-boundary.test.mjs
```

Expected: the new test fails because `.first-run-tour-overlay` does not explicitly override the shared dialog backdrop blur.

- [ ] **Step 3: Apply the minimal tour CSS fix**

Change the base rule in `apps/bitcraft-local/src/styles/first-run-tour.css` to:

```css
.first-run-tour-overlay {
  position: fixed;
  inset: 0;
  z-index: calc(var(--z-overlay) + 12);
  pointer-events: auto;
  background: transparent;
  backdrop-filter: none;
}
```

Do not alter the prompt rule that explicitly applies `blur(3px)`.

- [ ] **Step 4: Run the focused test and witness GREEN**

Run the Step 2 command again.

Expected: all tests in `appshell-tour-boundary.test.mjs` pass.

- [ ] **Step 5: Commit the isolated fix**

```powershell
git add -- apps/bitcraft-local/test/appshell-tour-boundary.test.mjs apps/bitcraft-local/src/styles/first-run-tour.css
git commit -m "fix(ui): keep tour spotlight targets crisp"
```

### Task 2: Stabilize Leaderboard tab geometry

**Files:**
- Modify: `apps/bitcraft-local/test/leaderboard-page-boundary.test.mjs`
- Modify: `apps/bitcraft-local/src/styles/leaderboard.css:1-6`

**Interfaces:**
- Consumes: the shared `.panel` grid and the Leaderboard's `min-height: 100%`.
- Produces: Leaderboard implicit rows aligned at the top so short tabs retain the normal 20px gap and 112px minimum summary height.

- [ ] **Step 1: Add the failing top-alignment boundary**

Add this assertion to the existing `Leaderboard summary steps down to two columns and then one` test:

```js
assert.match(css, /\.leaderboard-page\s*\{[^}]*align-content:\s*start;/s);
```

- [ ] **Step 2: Run the focused test and witness RED**

```powershell
node --test apps/bitcraft-local/test/leaderboard-page-boundary.test.mjs
```

Expected: the responsive-layout test fails because `.leaderboard-page` currently allows CSS Grid to stretch auto tracks into spare viewport height.

- [ ] **Step 3: Apply the minimal Leaderboard CSS fix**

Add this declaration inside the existing `.leaderboard-page` rule:

```css
align-content: start;
```

Do not set a fixed page or card height and do not change `.panel` globally.

- [ ] **Step 4: Run the focused test and witness GREEN**

Run the Step 2 command again.

Expected: all tests in `leaderboard-page-boundary.test.mjs` pass.

- [ ] **Step 5: Commit the isolated fix**

```powershell
git add -- apps/bitcraft-local/test/leaderboard-page-boundary.test.mjs apps/bitcraft-local/src/styles/leaderboard.css
git commit -m "fix(ui): stabilize leaderboard tab spacing"
```

### Task 3: Remove misleading Members permission pills

**Files:**
- Modify: `apps/bitcraft-local/test/member-permissions.test.mjs:48-55`
- Modify: `apps/bitcraft-local/src/pages/MembersPage.tsx:152-155`

**Interfaces:**
- Consumes: `m.buildPermission` and `m.inventoryPermission` booleans.
- Produces: the same two visual permission icons with an exact accessible description, and no “Can manage settlement” or “Standard member” text.

- [ ] **Step 1: Replace the existing presentation test with a failing accuracy boundary**

Replace the final test in `member-permissions.test.mjs` with:

```js
test("Members exposes direct permission indicators without inferred role pills", () => {
  const page = readFileSync(new URL("../src/pages/MembersPage.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(page, /Can manage settlement/);
  assert.doesNotMatch(page, /Standard member/);
  assert.match(page, /Build permission .*granted.*not granted/);
  assert.match(page, /Inventory permission .*granted.*not granted/);
  assert.match(page, /View .* details/);
  assert.match(page, /type="button"/);
});
```

- [ ] **Step 2: Run the focused test and witness RED**

```powershell
node --test apps/bitcraft-local/test/member-permissions.test.mjs
```

Expected: the new test fails because both inferred role labels remain in `MembersPage.tsx`.

- [ ] **Step 3: Render only direct permission state**

Replace the Permissions cell renderer with:

```tsx
["Permissions", (m) => (
  <span
    className="permission-icons"
    role="img"
    aria-label={`Build permission ${m.buildPermission ? "granted" : "not granted"}; Inventory permission ${m.inventoryPermission ? "granted" : "not granted"}`}
  >
    <Hammer aria-hidden="true" className={m.buildPermission ? "enabled" : ""} />
    <Package aria-hidden="true" className={m.inventoryPermission ? "enabled blue" : ""} />
  </span>
)],
```

Remove the now-unused `canManage` derived constant.

- [ ] **Step 4: Run the focused test and witness GREEN**

Run the Step 2 command again.

Expected: all four permission tests pass.

- [ ] **Step 5: Commit the isolated fix**

```powershell
git add -- apps/bitcraft-local/test/member-permissions.test.mjs apps/bitcraft-local/src/pages/MembersPage.tsx
git commit -m "fix(ui): remove inferred member permission labels"
```

### Task 4: Make the custom-theme editor fully scrollable

**Files:**
- Modify: `apps/bitcraft-local/test/appshell-user-settings-boundary.test.mjs`
- Modify: `apps/bitcraft-local/src/styles/user-settings.css:1-8`

**Interfaces:**
- Consumes: `.settings-dialog` as a two-row viewport-bounded dialog and `.settings-shell` containing tabs plus `.settings-grid`.
- Produces: fixed tabs and a single content scroller that can reach the final theme controls.

- [ ] **Step 1: Add the failing settings scroll-owner boundary**

Append this test to `appshell-user-settings-boundary.test.mjs`:

```js
test("User settings keeps tabs fixed and gives content the bounded scroll region", () => {
  const css = readFileSync(new URL("../src/styles/user-settings.css", import.meta.url), "utf8");

  assert.match(css, /\.settings-shell\s*\{[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\);[^}]*overflow:\s*hidden;/s);
  assert.match(css, /\.settings-grid\s*\{[^}]*min-height:\s*0;[^}]*max-height:\s*none;[^}]*overflow:\s*auto;/s);
  assert.doesNotMatch(css, /\.settings-grid\s*\{[^}]*max-height:\s*calc\(100vh - 170px\)/s);
});
```

- [ ] **Step 2: Run the focused test and witness RED**

```powershell
node --test apps/bitcraft-local/test/appshell-user-settings-boundary.test.mjs
```

Expected: the new test fails because `.settings-shell` does not bound its rows and `.settings-grid` uses a competing viewport-derived maximum height.

- [ ] **Step 3: Establish one bounded scroll owner**

Update the two rules in `user-settings.css` to include these declarations while preserving their existing styling:

```css
.settings-shell {
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 13px;
  align-items: start;
  overflow: hidden;
}

.settings-grid {
  display: grid;
  gap: 13px;
  min-width: 0;
  min-height: 0;
  max-height: none;
  overflow: auto;
  padding: 0 10px 24px 0;
  scrollbar-gutter: stable;
  align-content: start;
}
```

- [ ] **Step 4: Run the focused test and witness GREEN**

Run the Step 2 command again.

Expected: all User Settings boundary tests pass.

- [ ] **Step 5: Commit the isolated fix**

```powershell
git add -- apps/bitcraft-local/test/appshell-user-settings-boundary.test.mjs apps/bitcraft-local/src/styles/user-settings.css
git commit -m "fix(ui): make theme settings fully scrollable"
```

### Task 5: Verify the combined candidate visually and mechanically

**Files:**
- Inspect: all eight production/test files changed in Tasks 1–4
- Temporary evidence only: `C:\tmp\bitcraft-inspection-regression-fixes\`

**Interfaces:**
- Consumes: the four green task commits and the worktree `dist` build.
- Produces: a candidate whose automated checks pass and whose smoke assets and reported visual states are verified.

- [ ] **Step 1: Run the focused regression set together**

```powershell
node --test apps/bitcraft-local/test/appshell-tour-boundary.test.mjs apps/bitcraft-local/test/leaderboard-page-boundary.test.mjs apps/bitcraft-local/test/member-permissions.test.mjs apps/bitcraft-local/test/appshell-user-settings-boundary.test.mjs
```

Expected: every focused test passes.

- [ ] **Step 2: Run the full frontend suite**

```powershell
corepack pnpm --filter @workspace/bitcraft-local test
```

Expected: zero failures.

- [ ] **Step 3: Build the production frontend**

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: TypeScript and Vite build pass.

- [ ] **Step 4: Confirm the smoke server and asset identity**

```powershell
curl.exe -s http://127.0.0.1:18451/api/local/health
```

The running smoke server serves frontend files from `dist`, so a frontend-only build does not require a process restart. Fetch `/` and compare its `assets/index-*.js` entry with `apps/bitcraft-local/dist/index.html`. Expected: health reports `ok: true` and the entry assets match exactly. If port 18451 is unexpectedly unavailable, inspect the existing smoke logs and report the blocker rather than starting an unrelated default-port server.

- [ ] **Step 5: Perform read-only desktop visual checks**

Use the established bounded CDP endpoint on port `9223` and smoke origin `http://127.0.0.1:18451`. Store screenshots and JSON under `C:\tmp\bitcraft-inspection-regression-fixes\`; do not stage them.

Verify these exact states at `1695×900`:

```js
// Guided step
getComputedStyle(document.querySelector('.first-run-tour-overlay')).backdropFilter === 'none'
document.querySelector('.first-run-tour-spotlight').getBoundingClientRect().width > 0

// Every Leaderboard tab after clicking it
getComputedStyle(document.querySelector('.leaderboard-page')).alignContent === 'start'
[...document.querySelectorAll('.leaderboard-summary .mini-stat')]
  .every((card) => Math.round(card.getBoundingClientRect().height) === 112)

// Members
!document.body.innerText.includes('Can manage settlement')
!document.body.innerText.includes('Standard member')

// Expanded custom theme editor, after scrolling .settings-grid to scrollHeight
const grid = document.querySelector('.settings-grid');
Math.ceil(grid.scrollTop + grid.clientHeight) >= grid.scrollHeight
document.querySelector('.settings-theme-section.expanded') !== null
```

Capture the guided tour, Contribution and Activity Leaderboard tabs, Members permission column, and bottom of the expanded theme editor.

- [ ] **Step 6: Perform narrow visual checks**

Repeat the tour and expanded-theme checks at `390×844`. Expected: no body/main overflow, the tour card stays in the viewport, and the settings content reaches its bottom.

- [ ] **Step 7: Inspect final diff and status**

```powershell
git diff --check b345849...HEAD
git status --short
```

Expected: the implementation diff is clean; only the pre-existing untracked `.superpowers` evidence remains outside the committed changes.

- [ ] **Step 8: Stop without release actions**

Report the commits, verification counts, smoke URL, and any skipped manual checks. Do not change the package version or changelog and do not push or deploy.
