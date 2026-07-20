# Craft Planner Target Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair overlapping Craft Planning targets with a safe two-column layout that falls back to one column, and add a persisted Targets disclosure that defaults to collapsed.

**Architecture:** Keep the behavior inside `CraftPlanningPage` using the existing `usePersistedState` hook and native disclosure attributes. Keep layout ownership in `craft-planning.css`, using a container query so the persistent sidebar and actual panel width determine when two columns are safe.

**Tech Stack:** React 19, TypeScript, plain CSS, Lucide React, Node's built-in test runner, pnpm.

## Global Constraints

- The Targets section defaults to collapsed and restores the user's latest choice from `planning.targetsCollapsed`.
- The summary metric band remains visible while Targets is collapsed.
- The disclosure uses a native button, `aria-expanded`, `aria-controls`, a mounted controlled region, and the native `hidden` state.
- The target list displays no more than two columns and falls back to one column when two safe rows do not fit.
- Existing target calculations, target content, summary metrics, and Needs Board behavior remain unchanged.
- Add no component, dependency, animation library, backend route, or persistence schema.
- Leave unrelated `.impeccable/` files untracked and uncommitted.

---

### Task 1: Persisted Targets disclosure

**Files:**
- Modify: `apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs`
- Modify: `apps/bitcraft-local/src/pages/CraftPlanningPage.tsx`
- Modify: `apps/bitcraft-local/src/styles/craft-planning.css`

**Interfaces:**
- Consumes: `usePersistedState<boolean>(key, initialValue)` from `src/hooks/usePersistedState.ts`.
- Produces: persisted key `planning.targetsCollapsed`; controlled region id `craft-plan-target-list`; CSS hooks `.craft-plan-targets-header`, `.craft-plan-targets-toggle`, and `.craft-plan-targets-chevron`.

- [ ] **Step 1: Write the failing disclosure boundary test**

Add this test to `apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs`:

```js
test("Craft planning targets default collapsed and expose an accessible persisted disclosure", () => {
  const css = readFileSync(new URL("../src/styles/craft-planning.css", import.meta.url), "utf8");
  const page = readFileSync(new URL("../src/pages/CraftPlanningPage.tsx", import.meta.url), "utf8");

  assert.match(page, /ChevronDown/);
  assert.match(page, /usePersistedState<boolean>\("planning\.targetsCollapsed", true\)/);
  assert.match(page, /const targetsAreCollapsed = targetsCollapsed !== false/);
  assert.match(page, /className="craft-plan-targets-toggle"/);
  assert.match(page, /aria-expanded=\{!targetsAreCollapsed\}/);
  assert.match(page, /aria-controls="craft-plan-target-list"/);
  assert.match(page, /id="craft-plan-target-list"/);
  assert.match(page, /hidden=\{targetsAreCollapsed\}/);
  assert.match(css, /\.craft-plan-target-list\[hidden\]\s*\{[^}]*display:\s*none/);
  assert.match(css, /\.craft-plan-targets-toggle:focus-visible\s*\{/);
  assert.match(css, /\.craft-plan-targets-toggle\[aria-expanded="true"\][^{]*\.craft-plan-targets-chevron\s*\{/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run from the repository root:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/craft-planning-css-boundary.test.mjs
```

Expected: FAIL in `Craft planning targets default collapsed and expose an accessible persisted disclosure` because `ChevronDown`, `planning.targetsCollapsed`, and the disclosure selectors do not exist.

- [ ] **Step 3: Implement the minimal persisted disclosure**

In `CraftPlanningPage.tsx`, add `ChevronDown` to the existing Lucide import:

```tsx
import { AlertTriangle, ChevronDown, ClipboardList, EqualApproximately, Factory, LoaderCircle, MapPin, Package, Route, Search, Target, X } from "lucide-react";
```

Add the persisted value beside the existing planner preferences:

```tsx
const [targetsCollapsed, setTargetsCollapsed] = usePersistedState<boolean>("planning.targetsCollapsed", true);
const targetsAreCollapsed = targetsCollapsed !== false;
```

Replace the existing Targets `split-header` with:

```tsx
<div className="split-header craft-plan-targets-header">
  <h3>
    <button
      className="craft-plan-targets-toggle"
      type="button"
      aria-expanded={!targetsAreCollapsed}
      aria-controls="craft-plan-target-list"
      onClick={() => setTargetsCollapsed((current) => current === false)}
    >
      <Target size={17} />
      <span>Targets</span>
      <ChevronDown className="craft-plan-targets-chevron" size={16} aria-hidden="true" />
    </button>
  </h3>
  <p className="legend">Configured goals and current progress against counted sources.</p>
</div>
```

Change the existing target-list opening tag from:

```tsx
<div className="craft-plan-target-list">
```

to:

```tsx
<div id="craft-plan-target-list" className="craft-plan-target-list" hidden={targetsAreCollapsed}>
```

Add these focused rules near the existing target-list rules in `craft-planning.css`:

```css
.craft-plan-targets-header { align-items: center; }
.craft-plan-targets-toggle { display: inline-flex; align-items: center; gap: 8px; border: 0; background: transparent; color: inherit; padding: 4px 2px; font: inherit; font-weight: inherit; cursor: pointer; }
.craft-plan-targets-toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 4px; }
.craft-plan-targets-chevron { transform: rotate(-90deg); transition: transform 180ms cubic-bezier(0.16, 1, 0.3, 1); }
.craft-plan-targets-toggle[aria-expanded="true"] .craft-plan-targets-chevron { transform: rotate(0); }
.craft-plan-target-list[hidden] { display: none; }
```

Extend the existing reduced-motion block:

```css
.craft-plan-targets-chevron { transition: none; }
```

- [ ] **Step 4: Run the disclosure test and verify GREEN**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/craft-planning-css-boundary.test.mjs
```

Expected: PASS, including the new disclosure test.

- [ ] **Step 5: Commit the disclosure**

```powershell
git add -- apps/bitcraft-local/src/pages/CraftPlanningPage.tsx apps/bitcraft-local/src/styles/craft-planning.css apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs
git commit -m "feat: add collapsible planner targets"
```

### Task 2: Safe container-responsive target columns

**Files:**
- Modify: `apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs`
- Modify: `apps/bitcraft-local/src/styles/craft-planning.css`

**Interfaces:**
- Consumes: `.craft-plan-targets-strip`, `.craft-plan-target-list`, and the existing three-track `.craft-plan-target` row.
- Produces: a two-column target list above 1140px of available panel width and a one-column list at or below 1140px.

- [ ] **Step 1: Write the failing target-containment test**

Add this test to `apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs`:

```js
test("Craft planning targets use safe container-responsive columns", () => {
  const css = readFileSync(new URL("../src/styles/craft-planning.css", import.meta.url), "utf8");
  const listRule = css.match(/\.craft-plan-target-list\s*\{([^}]+)\}/)?.[1] ?? "";

  assert.match(css, /\.craft-plan-targets-strip\s*\{[^}]*container-type:\s*inline-size/);
  assert.match(listRule, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.doesNotMatch(listRule, /minmax\(300px/);
  assert.match(css, /@container\s*\(max-width:\s*1140px\)\s*\{[\s\S]*?\.craft-plan-target-list\s*\{[^}]*grid-template-columns:\s*1fr/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/craft-planning-css-boundary.test.mjs
```

Expected: FAIL in `Craft planning targets use safe container-responsive columns` because the target list still uses `repeat(auto-fit, minmax(300px, 1fr))` and the panel has no container query.

- [ ] **Step 3: Implement the safe two-column layout**

Replace the existing target-list rule and add the container boundary in `craft-planning.css`:

```css
.craft-plan-targets-strip { container-type: inline-size; }
.craft-plan-target-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }

@container (max-width: 1140px) {
  .craft-plan-target-list { grid-template-columns: 1fr; }
}
```

Keep the existing 760px viewport fallback as defensive support for older or constrained browsers.

- [ ] **Step 4: Run the containment test and verify GREEN**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/craft-planning-css-boundary.test.mjs
```

Expected: PASS, including the disclosure and target-containment tests.

- [ ] **Step 5: Commit the layout repair**

```powershell
git add -- apps/bitcraft-local/src/styles/craft-planning.css apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs
git commit -m "fix: contain planner target rows"
```

### Task 3: Regression and production verification

**Files:**
- Verify only: `apps/bitcraft-local/src/pages/CraftPlanningPage.tsx`
- Verify only: `apps/bitcraft-local/src/styles/craft-planning.css`
- Verify only: `apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs`

**Interfaces:**
- Consumes: the completed disclosure and responsive target layout.
- Produces: verification evidence; no production interface changes.

- [ ] **Step 1: Run the focused Craft Planning boundary tests**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/craft-planning-css-boundary.test.mjs test/craft-planning-boundary.test.mjs
```

Expected: all focused tests PASS with zero failures.

- [ ] **Step 2: Run the full application test suite**

```powershell
corepack pnpm --filter @workspace/bitcraft-local test
```

Expected: all tests PASS with zero failures.

- [ ] **Step 3: Build the production frontend**

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: TypeScript and Vite complete successfully with exit code 0.

- [ ] **Step 4: Inspect the final diff and preservation boundaries**

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors; only the three intended implementation files are modified or committed, while `.impeccable/` remains untracked.

- [ ] **Step 5: Perform the available browser smoke check**

```powershell
node scripts/start-bitcraft-local-smoke.mjs --restart
curl.exe -s http://127.0.0.1:18449/api/local/health
```

Open `http://127.0.0.1:18449/?page=planning` at 1920×949 and a narrower viewport. If the local profile has an active plan, verify the Targets section starts collapsed, toggles with the button, restores the last choice after reload, uses two safe columns when wide, and one column when narrow. If the local profile still reports `No craft plan configured`, record that data limitation explicitly and do not claim a visual target-list verification; rely on the focused regression tests, production build, and the supplied failing screenshot for the unavailable data state.
