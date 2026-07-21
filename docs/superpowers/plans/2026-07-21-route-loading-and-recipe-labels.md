# Route Loading and Recipe Label Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace generic route-loading screens with a shared structured skeleton, make placeholder-bearing recipe routes distinguishable by their actual inputs, and prevent item-detail save feedback from appearing on unrelated items.

**Architecture:** Add one focused shared React loading component for both Suspense boundaries. Keep route naming in the existing presentation helper, where catalogue templates can be sanitised once for cards and dropdowns. Replace global item-detail feedback strings with a typed item-keyed object and derive visible feedback only for the currently selected item.

**Tech Stack:** React 19, TypeScript, plain CSS, Node test runner, Vite, pnpm.

## Global Constraints

- Preserve existing route identifiers, selected recipe behaviour, probability calculations, and catalogue storage.
- Never display numeric catalogue placeholders such as `{0}` or `{1}` in acquisition-route labels.
- Use actual route inputs to distinguish placeholder-bearing processing recipes across all items.
- Keep dialogs viewport-fixed and retain native radio-input keyboard behaviour.
- Use existing dark surface, border, text, and status tokens; gold remains reserved for selected or primary states.
- Loading animations must stop under `prefers-reduced-motion: reduce`.
- Do not add dependencies or change frameworks.

---

### Task 1: Shared Route-Loading Skeleton

**Files:**
- Create: `apps/bitcraft-local/src/components/main/RouteLoadingState.tsx`
- Modify: `apps/bitcraft-local/src/main.tsx`
- Modify: `apps/bitcraft-local/src/AppShell.tsx`
- Modify: `apps/bitcraft-local/src/styles.css`
- Create: `apps/bitcraft-local/test/route-loading-boundary.test.mjs`

**Interfaces:**
- Produces: `RouteLoadingState({ label?: string }): JSX.Element`.
- Consumes: `activePageLabel` in `AppShell.tsx`; no data APIs or context providers.

- [ ] **Step 1: Write the failing route-loading boundary test**

Create `apps/bitcraft-local/test/route-loading-boundary.test.mjs`:

```js
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

function readSource(url) {
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

const component = readSource(new URL("../src/components/main/RouteLoadingState.tsx", import.meta.url));
const shell = readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8");
const entry = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("route loading uses one accessible destination-aware skeleton", () => {
  assert.match(component, /role="status"/);
  assert.match(component, /aria-live="polite"/);
  assert.match(component, /aria-busy="true"/);
  assert.match(component, /Loading \{displayLabel\}/);
  assert.match(component, /route-loading-summary/);
  assert.match(component, /route-loading-content/);
  assert.match(shell, /<RouteLoadingState label=\{activePageLabel\} \/>/);
  assert.match(entry, /<RouteLoadingState \/>/);
  assert.doesNotMatch(shell, />Loading page\.\.\.<\/section>/);
  assert.doesNotMatch(entry, />Loading page\.\.\.<\/section>/);
});

test("route skeleton styling is responsive and stops motion when requested", () => {
  assert.match(styles, /\.route-loading-state\s*\{/);
  assert.match(styles, /\.route-loading-summary\s*\{/);
  assert.match(styles, /\.route-loading-content\s*\{/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.route-loading-shape/);
});
```

- [ ] **Step 2: Run the test and confirm the red state**

Run:

```powershell
node --test apps/bitcraft-local/test/route-loading-boundary.test.mjs
```

Expected: FAIL because `RouteLoadingState.tsx` does not exist.

- [ ] **Step 3: Add the shared component**

Create `apps/bitcraft-local/src/components/main/RouteLoadingState.tsx`:

```tsx
type Props = { label?: string };

export function RouteLoadingState({ label = "page" }: Props) {
  const displayLabel = String(label || "page").trim() || "page";
  return (
    <section className="route-loading-state" role="status" aria-live="polite" aria-busy="true">
      <p className="route-loading-label">Loading {displayLabel}...</p>
      <span className="route-loading-shape route-loading-title" aria-hidden="true" />
      <div className="route-loading-summary" aria-hidden="true">
        {[0, 1, 2].map((id) => <span className="route-loading-shape" key={id} />)}
      </div>
      <div className="route-loading-content" aria-hidden="true">
        <span className="route-loading-shape" />
        <span className="route-loading-shape" />
        <span className="route-loading-shape" />
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Use the component in both Suspense boundaries**

In `apps/bitcraft-local/src/AppShell.tsx`, import the component, remove the local `RouteLoadingState` function, and change the route fallback to:

```tsx
<React.Suspense fallback={<RouteLoadingState label={activePageLabel} />}>{activePanel}</React.Suspense>
```

In `apps/bitcraft-local/src/main.tsx`, import the same component and change the startup fallback to:

```tsx
<React.Suspense fallback={<main className="route-entry-state"><RouteLoadingState /></main>}>
```

- [ ] **Step 5: Add restrained responsive skeleton CSS**

Add to `apps/bitcraft-local/src/styles.css` near the existing skeleton styles:

```css
.route-loading-state {
  width: 100%;
  min-height: min(520px, calc(100vh - 170px));
  padding: 24px;
  display: grid;
  align-content: start;
  gap: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  background: var(--panel);
}
.route-loading-label { margin: 0; color: var(--muted); font-size: .85rem; }
.route-loading-shape {
  display: block;
  border-radius: 8px;
  background: linear-gradient(100deg, rgba(255,255,255,.04), rgba(255,255,255,.09), rgba(255,255,255,.04));
  background-size: 220% 100%;
  animation: skeleton-sweep 1.25s linear infinite;
}
.route-loading-title { width: min(320px, 55%); height: 34px; }
.route-loading-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.route-loading-summary .route-loading-shape { height: 92px; }
.route-loading-content { display: grid; gap: 10px; padding-top: 4px; }
.route-loading-content .route-loading-shape:first-child { height: 40px; }
.route-loading-content .route-loading-shape:not(:first-child) { height: 86px; }
@media (max-width: 720px) {
  .route-loading-state { min-height: 360px; padding: 16px; }
  .route-loading-summary { grid-template-columns: 1fr; }
  .route-loading-summary .route-loading-shape { height: 64px; }
}
@media (prefers-reduced-motion: reduce) {
  .route-loading-shape { animation: none; background-position: 0 0; }
}
```

- [ ] **Step 6: Run the focused test and build**

Run:

```powershell
node --test apps/bitcraft-local/test/route-loading-boundary.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: both commands exit 0.

- [ ] **Step 7: Commit Task 1**

```powershell
git add -- apps/bitcraft-local/src/components/main/RouteLoadingState.tsx apps/bitcraft-local/src/main.tsx apps/bitcraft-local/src/AppShell.tsx apps/bitcraft-local/src/styles.css apps/bitcraft-local/test/route-loading-boundary.test.mjs
git commit -m "feat: improve route loading state"
```

---

### Task 2: Input-Derived Recipe Labels

**Files:**
- Modify: `apps/bitcraft-local/src/pages/craftPlanningRoutePresentation.mjs`
- Modify: `apps/bitcraft-local/src/pages/CraftPlanningRouteChooser.tsx`
- Modify: `apps/bitcraft-local/src/styles/craft-planning.css`
- Modify: `apps/bitcraft-local/test/craft-planning-route-presentation.test.mjs`
- Modify: `apps/bitcraft-local/test/craft-planning-boundary.test.mjs`

**Interfaces:**
- Preserves: `acquisitionRouteLabel(route, output): string`.
- Consumes: `route.inputs`, `route.label`, `route.name`, `route.recipeName`, `route.buildingName`, and output display metadata.
- Produces: player-facing route labels with no numeric brace templates.

- [ ] **Step 1: Add failing route-label tests**

Append to `apps/bitcraft-local/test/craft-planning-route-presentation.test.mjs`:

```js
test("placeholder processing recipes are named by their actual inputs", () => {
  const route = {
    routeType: "craft-byproduct",
    recipeName: "Harvest {0}",
    buildingName: "Fine Hunting Station",
    inputs: [{ name: "Fine Wolf Carcass" }],
  };

  assert.equal(
    acquisitionRouteLabel(route, { name: "Fine Animal Hair" }),
    "Process Fine Wolf Carcass -> Fine Animal Hair at Fine Hunting Station",
  );
  assert.doesNotMatch(acquisitionRouteLabel(route, { name: "Fine Animal Hair" }), /\{\d+\}/);
  assert.equal(
    acquisitionRouteLabel({ ...route, inputs: [{ name: "Fine Bear Carcass" }] }, { name: "Fine Animal Hair" }),
    "Process Fine Bear Carcass -> Fine Animal Hair at Fine Hunting Station",
  );
});

test("placeholder recipes without inputs use a clean output fallback", () => {
  assert.equal(acquisitionRouteLabel({
    routeType: "craft",
    recipeName: "Harvest {1}",
    buildingName: "Fine Hunting Station",
    inputs: [],
  }, { name: "Fine Animal Hair" }), "Produce Fine Animal Hair at Fine Hunting Station");
});
```

Extend the acquisition-route boundary test in `apps/bitcraft-local/test/craft-planning-boundary.test.mjs` with:

```js
assert.match(chooser, /processing routes available/);
assert.match(chooser, /choose the source material you plan to use/);
```

- [ ] **Step 2: Run the focused tests and confirm the red state**

Run:

```powershell
node --test apps/bitcraft-local/test/craft-planning-route-presentation.test.mjs apps/bitcraft-local/test/craft-planning-boundary.test.mjs
```

Expected: FAIL because `Harvest {0}` is still returned and chooser context copy is absent.

- [ ] **Step 3: Sanitize numeric templates in the presentation helper**

Add to `apps/bitcraft-local/src/pages/craftPlanningRoutePresentation.mjs`:

```js
function hasNumericTemplate(value) {
  return /\{\d+\}/.test(text(value));
}
```

Replace the non-gathering label branch in `acquisitionRouteLabel` with:

```js
  const templatedLabel = hasNumericTemplate(label);
  if (label && !isGenericRecipeName(label) && !templatedLabel) return withStation(label, route);
  const inputs = inputNames(route);
  const outputName = itemName(output);
  if (inputs.length) {
    const processLabel = `${templatedLabel ? "Process " : ""}${inputs.join(" + ")} -> ${outputName}`;
    return withStation(processLabel, route);
  }
  return withStation(templatedLabel ? `Produce ${outputName}` : label || `Produce ${outputName}`, route);
```

This preserves meaningful recipe names and current generic `Recipe ->` behaviour while removing numeric templates everywhere the shared helper is used.

- [ ] **Step 4: Explain why multiple cards exist**

In `apps/bitcraft-local/src/pages/CraftPlanningRouteChooser.tsx`, add directly after the legend:

```tsx
<p className="craft-plan-route-options-help">{formatNumber(routes.length)} processing routes available — choose the source material you plan to use.</p>
```

Add to `apps/bitcraft-local/src/styles/craft-planning.css` beside `.craft-plan-route-options`:

```css
.craft-plan-route-options-help {
  margin: 0 0 8px;
  color: var(--muted);
  font-size: .8rem;
  line-height: 1.35;
  text-wrap: pretty;
}
```

- [ ] **Step 5: Run the focused tests and build**

Run:

```powershell
node --test apps/bitcraft-local/test/craft-planning-route-presentation.test.mjs apps/bitcraft-local/test/craft-planning-boundary.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: both commands exit 0 and all tested route labels contain no numeric brace tokens.

- [ ] **Step 6: Commit Task 2**

```powershell
git add -- apps/bitcraft-local/src/pages/craftPlanningRoutePresentation.mjs apps/bitcraft-local/src/pages/CraftPlanningRouteChooser.tsx apps/bitcraft-local/src/styles/craft-planning.css apps/bitcraft-local/test/craft-planning-route-presentation.test.mjs apps/bitcraft-local/test/craft-planning-boundary.test.mjs
git commit -m "fix: clarify processing route labels"
```

---

### Task 3: Item-Scoped Detail Feedback

**Files:**
- Modify: `apps/bitcraft-local/src/pages/CraftPlanningPage.tsx`
- Modify: `apps/bitcraft-local/test/craft-planning-boundary.test.mjs`

**Interfaces:**
- Introduces local type: `ItemDetailFeedback = { itemKey: string; tone: "success" | "error"; message: string }`.
- Consumes: `selectedNeedKey`, route output keys, and multiplier output keys.
- Produces: feedback visible only when `itemDetailFeedback.itemKey === selectedNeedKey`.

- [ ] **Step 1: Add a failing source-boundary regression test**

Append to `apps/bitcraft-local/test/craft-planning-boundary.test.mjs`:

```js
test("Craft Planning route feedback is scoped to the opened item", () => {
  const page = readFileSync(new URL("../src/pages/CraftPlanningPage.tsx", import.meta.url), "utf8");

  assert.match(page, /type ItemDetailFeedback = \{/);
  assert.match(page, /itemDetailFeedback\?\.itemKey === selectedNeedKey/);
  assert.match(page, /setItemDetailFeedback\(null\)/);
  assert.match(page, /itemKey: outputKey/);
  assert.doesNotMatch(page, /const \[routeStatus, setRouteStatus\]/);
  assert.doesNotMatch(page, /const \[routeError, setRouteError\]/);
});
```

- [ ] **Step 2: Run the regression test and confirm the red state**

Run:

```powershell
node --test apps/bitcraft-local/test/craft-planning-boundary.test.mjs
```

Expected: FAIL because feedback is still stored in global `routeStatus` and `routeError` strings.

- [ ] **Step 3: Replace global route feedback with keyed feedback**

In `apps/bitcraft-local/src/pages/CraftPlanningPage.tsx`, add near the component types:

```ts
type ItemDetailFeedback = {
  itemKey: string;
  tone: "success" | "error";
  message: string;
};
```

Replace the two route feedback states with:

```tsx
const [itemDetailFeedback, setItemDetailFeedback] = React.useState<ItemDetailFeedback | null>(null);
const [rowOverrideError, setRowOverrideError] = React.useState<string | null>(null);
```

Clear item feedback when the detail panel closes and when a different item opens:

```tsx
const nextItemKey = cell.items?.[0]?.key ?? itemKey(cell.item);
setItemDetailFeedback((current) => current?.itemKey === nextItemKey ? current : null);
```

```tsx
setItemDetailFeedback(null);
```

Derive visible feedback after `selectedNeedKey`:

```tsx
const visibleItemFeedback = itemDetailFeedback?.itemKey === selectedNeedKey ? itemDetailFeedback : null;
```

Replace the success/error paragraphs in the detail panel with:

```tsx
{visibleItemFeedback ? <p className={`alert ${visibleItemFeedback.tone}`} role={visibleItemFeedback.tone === "error" ? "alert" : "status"}>{visibleItemFeedback.message}</p> : null}
```

- [ ] **Step 4: Key route and multiplier results to their output item**

At the start of `saveRouteOverride`, call `setItemDetailFeedback(null)`. After refreshing the same open cell, set:

```tsx
setItemDetailFeedback({ itemKey: outputKey, tone: "success", message: "Acquisition route updated." });
```

In its catch block, set:

```tsx
setItemDetailFeedback({ itemKey: outputKey, tone: "error", message: err instanceof Error ? err.message : String(err) });
```

Apply the same pattern in `saveMultiplier`, using `outputKey` and the existing success messages.

For row overrides, use `rowOverrideError`: clear it before saving, set it in the catch block, render it inside the section-override dialog, and close the dialog on success without writing item-detail feedback.

- [ ] **Step 5: Run the focused regression test and build**

Run:

```powershell
node --test apps/bitcraft-local/test/craft-planning-boundary.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: both commands exit 0, and no `routeStatus` or `routeError` state remains in `CraftPlanningPage.tsx`.

- [ ] **Step 6: Commit Task 3**

```powershell
git add -- apps/bitcraft-local/src/pages/CraftPlanningPage.tsx apps/bitcraft-local/test/craft-planning-boundary.test.mjs
git commit -m "fix: scope planner route feedback by item"
```

---

### Task 4: Release Notes and Final Verification

**Files:**
- Modify: `CHANGELOG.md`

**Interfaces:**
- Preserves package version `0.40.1-beta.4` already prepared on the open PR branch.
- Adds player-facing entries to the existing `0.40.1-beta.4` section.

- [ ] **Step 1: Update the existing beta release notes**

Add these entries under `## [0.40.1-beta.4] - 2026-07-21`:

```markdown
- Replaced the generic page-loading panel with a structured destination-aware skeleton.
- Clarified processing route choices with their actual source materials and removed internal recipe placeholders.

### Fixed

- Prevented route-save feedback from appearing when a different item-detail panel is opened.
```

Keep the existing loading-strip and close-control entries. Do not bump the package version again because these changes are part of the same unmerged beta release.

- [ ] **Step 2: Run the full verification suite**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local test
corepack pnpm --filter @workspace/bitcraft-local run build
git diff --check
```

Expected: all tests pass, the build exits 0, and `git diff --check` reports no whitespace errors.

- [ ] **Step 3: Run the frontend quality detector**

Run:

```powershell
node C:\Users\Tom\Documents\Bitcraft_Claim_Monitor_PerformancePass\.agents\skills\impeccable\scripts\detect.mjs --json apps/bitcraft-local/src/components/main/RouteLoadingState.tsx apps/bitcraft-local/src/AppShell.tsx apps/bitcraft-local/src/main.tsx apps/bitcraft-local/src/pages/CraftPlanningRouteChooser.tsx apps/bitcraft-local/src/pages/CraftPlanningPage.tsx apps/bitcraft-local/src/styles.css apps/bitcraft-local/src/styles/craft-planning.css
```

Expected: an empty JSON array or no new actionable findings in the changed UI.

- [ ] **Step 4: Browser-smoke the affected flows**

Build and start the stable smoke server:

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
node scripts/start-bitcraft-local-smoke.mjs --restart
```

At `http://127.0.0.1:18449/`:

1. Navigate between two lazy-loaded pages and confirm the skeleton fills the page content region without a large blank area.
2. Confirm the visual status names the destination page.
3. Open an item with multiple processing routes and confirm each card names a distinct source input and no `{0}` token appears.
4. Change a route, confirm success on that item, then open a different item and confirm the message is absent.
5. Check browser warnings and errors.
6. Repeat at a narrow viewport and with reduced motion emulated.

If the smoke database has no suitable craft plan, verify the built route-loading state and stylesheet rules, then record the fixture limitation rather than mutating production-like data.

- [ ] **Step 5: Commit release notes**

```powershell
git add -- CHANGELOG.md
git commit -m "chore: update 0.40.1-beta.4 notes"
```

- [ ] **Step 6: Review the final branch scope**

Run:

```powershell
git status -sb
git log --oneline origin/main..HEAD
git diff --stat origin/main...HEAD
```

Expected: a clean worktree containing only the approved modal polish, route-loading skeleton, recipe-label clarity, item-scoped feedback, tests, design docs, plan, and `0.40.1-beta.4` release metadata.
