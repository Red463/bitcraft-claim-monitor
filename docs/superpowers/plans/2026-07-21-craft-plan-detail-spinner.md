# Craft Planning Detail Spinner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Craft Planning item-detail loading icon rotate while data is loading.

**Architecture:** Reuse Craft Planning's existing `is-spinning` animation class and `craft-plan-spin` keyframes. The fix stays local to the existing item-detail markup and boundary test; no new animation utility or dependency is introduced.

**Tech Stack:** React, TypeScript, plain CSS, Node test runner, Vite, pnpm.

## Global Constraints

- Preserve the existing loading-strip layout and copy.
- Preserve the existing 0.8-second linear rotation.
- Preserve the `prefers-reduced-motion` override that disables rotation.
- Do not add a global `.spin` class or animate the loading-strip container.

---

### Task 1: Connect the Detail Icon to the Existing Spinner Animation

**Files:**
- Modify: `apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs`
- Modify: `apps/bitcraft-local/src/pages/CraftPlanningPage.tsx`

**Interfaces:**
- Consumes: the existing `.is-spinning` CSS class, `craft-plan-spin` keyframes, and reduced-motion override in `apps/bitcraft-local/src/styles/craft-planning.css`.
- Produces: a `LoaderCircle` whose `className` resolves to the existing rotation animation.

- [ ] **Step 1: Write the failing regression assertions**

Extend the existing `Craft planning item details use an intentional loading strip and close control` test with:

```js
assert.match(page, /<LoaderCircle size=\{17\} className="is-spinning" \/>/);
assert.doesNotMatch(page, /<LoaderCircle size=\{17\} className="spin" \/>/);
assert.match(css, /\.is-spinning\s*\{[^}]*animation:\s*craft-plan-spin\s+0\.8s\s+linear\s+infinite/s);
assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*\.is-spinning\s*\{[^}]*animation:\s*none/s);
```

- [ ] **Step 2: Run the focused test and confirm the red state**

Run:

```powershell
node --test apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs
```

Expected: FAIL because the item-detail `LoaderCircle` still uses the undefined `spin` class.

- [ ] **Step 3: Apply the minimal production fix**

In `apps/bitcraft-local/src/pages/CraftPlanningPage.tsx`, replace:

```tsx
<LoaderCircle size={17} className="spin" />
```

with:

```tsx
<LoaderCircle size={17} className="is-spinning" />
```

- [ ] **Step 4: Run focused and production verification**

Run:

```powershell
node --test apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: both commands exit 0.

- [ ] **Step 5: Commit the fix**

```powershell
git add apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs apps/bitcraft-local/src/pages/CraftPlanningPage.tsx docs/superpowers/plans/2026-07-21-craft-plan-detail-spinner.md
git commit -m "fix: animate craft plan detail spinner"
```
