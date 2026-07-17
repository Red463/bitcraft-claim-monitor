# Craft Planner Estimate Indicators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give approximate requirements and uncounted estimated active output separate Lucide icons, accessible labels, tooltips, and legend entries in the Craft Planner Needs Board.

**Architecture:** Keep the existing `NeedCell` data model and calculations unchanged. Derive the two display states inside `needCellNode`, render them in one compact indicator row, and use the same icon semantics in the legend. Lock the distinction down with focused source/CSS boundary tests before changing production code.

**Tech Stack:** React, TypeScript, Lucide React, plain CSS, Node test runner, Vite.

## Global Constraints

- Do not change recipe selection, expected-yield calculations, required quantities, stock accounting, or progress calculations.
- Use Lucide `EqualApproximately` for `estimatedRequirement === true`.
- Use a muted grey Lucide `Factory` for `estimatedInProgress > 0`.
- Keep the existing blue `Factory` treatment for `guaranteedInProgress > 0`.
- Render every applicable state without icon overlap.
- Do not describe an approximate requirement as excluded from progress.

---

### Task 1: Separate the Needs Board estimate indicators

**Files:**
- Modify: `apps/bitcraft-local/test/craft-planning-boundary.test.mjs`
- Modify: `apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs`
- Modify: `apps/bitcraft-local/src/pages/CraftPlanningPage.tsx:3,41-55,597`
- Modify: `apps/bitcraft-local/src/styles/craft-planning.css:273-279,325-332`

**Interfaces:**
- Consumes: existing `NeedCell.estimatedInProgress`, `NeedCell.guaranteedInProgress`, and `item.estimatedRequirement` values.
- Produces: `craft-plan-cell-indicators`, `has-indicators`, `is-guaranteed`, `is-estimated`, and `is-approximate` presentation hooks; no data-model or API changes.

- [ ] **Step 1: Write failing rendering and styling boundary tests**

Add a focused test to `craft-planning-boundary.test.mjs`:

```js
test("Craft Planning separates approximate requirements from estimated active output", () => {
  const page = readFileSync(new URL("../src/pages/CraftPlanningPage.tsx", import.meta.url), "utf8");
  const cellBody = page.match(/function needCellNode[\s\S]+?function recipeOptionLabel/)?.[0] ?? "";

  assert.match(page, /EqualApproximately/);
  assert.match(cellBody, /aria-label="Approximate requirement"/);
  assert.match(cellBody, /aria-label="Estimated active output; not counted toward progress"/);
  assert.match(cellBody, /craft-plan-cell-indicators/);
  assert.doesNotMatch(cellBody, /craft-plan-estimated-marker/);
  assert.doesNotMatch(cellBody, />~<\/span>/);
  assert.match(page, />Approximate requirement<\/span>/);
  assert.match(page, />Estimated active output; not counted<\/span>/);
  assert.doesNotMatch(page, />Estimated; not counted<\/span>/);
});
```

Add a focused test to `craft-planning-css-boundary.test.mjs`:

```js
test("Craft Planning estimate indicators share a compact non-overlapping row", () => {
  const css = readFileSync(new URL("../src/styles/craft-planning.css", import.meta.url), "utf8");

  assert.match(css, /\.craft-plan-cell-indicators\s*\{[^}]*display:\s*flex[^}]*gap:/s);
  assert.match(css, /\.craft-plan-need-cell\.has-indicators\s*\{[^}]*padding-top:/s);
  assert.match(css, /\.craft-plan-cell-indicators \.is-guaranteed\s*\{[^}]*#65b7fa/s);
  assert.match(css, /\.craft-plan-cell-indicators \.is-estimated[^}]*var\(--muted\)/s);
  assert.match(css, /\.craft-plan-cell-indicators \.is-approximate[^}]*var\(--muted\)/s);
  assert.doesNotMatch(css, /\.craft-plan-estimated-marker/);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
node --test apps/bitcraft-local/test/craft-planning-boundary.test.mjs apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs
```

Expected: FAIL because the page still renders the combined `~` marker and combined legend entry, and the new indicator-row CSS does not exist.

- [ ] **Step 3: Implement the distinct cell and legend indicators**

In `CraftPlanningPage.tsx`, add `EqualApproximately` to the existing `lucide-react` import. Replace the current combined estimate rendering in `needCellNode` with:

```tsx
const hasGuaranteedActive = cell.guaranteedInProgress > 0;
const hasEstimatedActive = cell.estimatedInProgress > 0;
const hasApproximateRequirement = cell.items.some((item) => item.estimatedRequirement === true);
const hasIndicators = hasGuaranteedActive || hasEstimatedActive || hasApproximateRequirement;
```

Use those booleans in the class name and tooltip, then render:

```tsx
{hasIndicators ? (
  <span className="craft-plan-cell-indicators">
    {hasGuaranteedActive ? <Factory className="is-guaranteed" size={11} role="img" aria-label="Actively being crafted" /> : null}
    {hasEstimatedActive ? <Factory className="is-estimated" size={11} role="img" aria-label="Estimated active output; not counted toward progress" /> : null}
    {hasApproximateRequirement ? <EqualApproximately className="is-approximate" size={12} role="img" aria-label="Approximate requirement" /> : null}
  </span>
) : null}
```

The button class must include `has-indicators` only when `hasIndicators` is true. Preserve the existing tooltip fragments exactly for estimated active output and expected processing yield.

Replace the combined estimate legend entry with icon-backed entries while retaining the other entries:

```tsx
<span className="active icon-state"><Factory size={11} aria-hidden="true" />Guaranteed craft counted</span>
<span className="approximate icon-state"><EqualApproximately size={12} aria-hidden="true" />Approximate requirement</span>
<span className="estimated-output icon-state"><Factory size={11} aria-hidden="true" />Estimated active output; not counted</span>
```

In `craft-planning.css`, replace the combined estimate-marker rules with:

```css
.craft-plan-cell-indicators { position: absolute; top: 4px; left: 5px; display: flex; align-items: center; gap: 3px; pointer-events: none; }
.craft-plan-need-cell.has-indicators { padding-top: 16px; }
.craft-plan-cell-indicators .is-guaranteed { color: #65b7fa; }
.craft-plan-cell-indicators .is-estimated,
.craft-plan-cell-indicators .is-approximate { color: var(--muted); }
```

Keep the guaranteed-active pulse on the right, remove the old absolute positioning rule that targets every active-cell SVG, and add:

```css
.craft-plan-needs-legend .icon-state::before { display: none; }
.craft-plan-needs-legend .icon-state svg { flex: 0 0 auto; }
.craft-plan-needs-legend .approximate,
.craft-plan-needs-legend .estimated-output { color: var(--muted); }
```

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run:

```powershell
node --test apps/bitcraft-local/test/craft-planning-boundary.test.mjs apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs
```

Expected: both test files pass with zero failures.

- [ ] **Step 5: Run full verification**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local test
corepack pnpm --filter @workspace/bitcraft-local run build
git diff --check
```

Expected: the full test suite reports zero failures, TypeScript and Vite build successfully, and `git diff --check` reports no whitespace errors.

- [ ] **Step 6: Commit the implementation**

```powershell
git add -- apps/bitcraft-local/src/pages/CraftPlanningPage.tsx apps/bitcraft-local/src/styles/craft-planning.css apps/bitcraft-local/test/craft-planning-boundary.test.mjs apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs
git commit -m "fix: clarify craft plan estimate indicators"
```
