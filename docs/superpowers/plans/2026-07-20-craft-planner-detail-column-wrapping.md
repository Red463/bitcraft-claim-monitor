# Craft Planner Detail Column Wrapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove inner horizontal scrolling from every craft-planner item-detail card while wrapping long descriptions and keeping quantities aligned at the top-right.

**Architecture:** Keep the existing React markup and modal layout. Broaden the established stock-location presentation at the `.craft-plan-need-detail-grid` boundary so every nested card and detail row receives the same overflow, wrapping, and value-alignment behavior.

**Tech Stack:** React, TypeScript, plain CSS, Node test runner, pnpm.

## Global Constraints

- Preserve the existing desktop two-column and mobile single-column modal layouts.
- Preserve vertical scrolling inside viewport-bounded modal cards.
- Do not change unrelated detail rows elsewhere in the application.
- Add no dependencies and perform no unrelated refactoring.

---

### Task 1: Share the detail-card wrapping behavior

**Files:**
- Modify: `apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs`
- Modify: `apps/bitcraft-local/src/styles/craft-planning.css`

**Interfaces:**
- Consumes: Existing `.craft-plan-need-detail-grid`, `.nested-card`, and `.craft-plan-detail-row` markup from `CraftPlanningPage.tsx`.
- Produces: Modal-scoped CSS that hides horizontal overflow, wraps descriptive row text, and keeps quantities top-right.

- [ ] **Step 1: Write the failing CSS boundary test**

Add this test after the existing grouped stock and usage drilldown test:

```js
test("Craft planning detail cards wrap rows without horizontal scrolling", () => {
  const css = readFileSync(new URL("../src/styles/craft-planning.css", import.meta.url), "utf8");
  const card = css.match(/\.craft-plan-need-detail-grid \.nested-card\s*\{([^}]+)\}/)?.[1] ?? "";
  const row = css.match(/\.craft-plan-need-detail-grid \.craft-plan-detail-row\s*\{([^}]+)\}/)?.[1] ?? "";
  const label = css.match(/\.craft-plan-need-detail-grid \.craft-plan-detail-row > span\s*\{([^}]+)\}/)?.[1] ?? "";
  const value = css.match(/\.craft-plan-need-detail-grid \.craft-plan-detail-row > strong\s*\{([^}]+)\}/)?.[1] ?? "";

  assert.match(card, /overflow-x:\s*hidden/);
  assert.match(card, /overflow-y:\s*auto/);
  assert.match(row, /min-width:\s*0/);
  assert.match(row, /align-items:\s*flex-start/);
  assert.match(label, /flex:\s*1 1 auto/);
  assert.match(label, /overflow:\s*visible/);
  assert.match(label, /text-overflow:\s*clip/);
  assert.match(label, /white-space:\s*normal/);
  assert.match(label, /overflow-wrap:\s*anywhere/);
  assert.match(value, /flex:\s*0 0 auto/);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```sh
node --test apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs
```

Expected: FAIL in `Craft planning detail cards wrap rows without horizontal scrolling` because the shared modal selectors do not yet define `overflow-x: hidden` and the wrapping rules.

- [ ] **Step 3: Implement the shared modal CSS**

Change the existing nested-card overflow declaration and add these scoped selectors after the base `.craft-plan-detail-row strong` rule:

```css
.craft-plan-need-detail-grid .nested-card {
  margin: 0;
  min-width: 0;
  max-height: calc(100vh - 180px);
  overflow-x: hidden;
  overflow-y: auto;
}
.craft-plan-need-detail-grid .craft-plan-detail-row {
  min-width: 0;
  align-items: flex-start;
}
.craft-plan-need-detail-grid .craft-plan-detail-row > span {
  flex: 1 1 auto;
  min-width: 0;
  overflow: visible;
  text-overflow: clip;
  white-space: normal;
  overflow-wrap: anywhere;
}
.craft-plan-need-detail-grid .craft-plan-detail-row > strong {
  flex: 0 0 auto;
}
```

- [ ] **Step 4: Run focused and production verification**

Run:

```sh
node --test apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: the focused test passes and the Vite production build exits successfully.

- [ ] **Step 5: Browser-check the modal**

Run:

```powershell
node scripts/start-bitcraft-local-smoke.mjs --restart
curl.exe -s http://127.0.0.1:18449/api/local/health
```

Open `http://127.0.0.1:18449/?page=craft-planning`, inspect an item-detail modal at the supplied narrow desktop width, and confirm:

- No nested card has a horizontal scrollbar.
- Long recipe-demand descriptions wrap.
- Quantities remain aligned at the top-right.
- The modal still switches to one column at the existing 760px breakpoint.

- [ ] **Step 6: Commit the focused implementation**

```sh
git add apps/bitcraft-local/src/styles/craft-planning.css apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs docs/superpowers/plans/2026-07-20-craft-planner-detail-column-wrapping.md
git commit -m "fix: wrap craft planner detail columns"
```
