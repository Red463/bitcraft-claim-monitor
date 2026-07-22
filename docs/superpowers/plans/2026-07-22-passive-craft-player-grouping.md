# Passive Craft Player Grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate passive craft coverage into one readable tracked-craft row per player without changing planner material totals.

**Architecture:** Extend `groupNeedCellActiveCrafts` so it first preserves craft-ID deduplication, then groups only passive records by stable player identity. Render the summary fields in the existing item-detail panel and use a scoped responsive grid to keep totals separate from wrapping descriptive text.

**Tech Stack:** React, TypeScript, plain CSS, Node test runner, Vite.

## Global Constraints

- Group passive sources by player ID, falling back to normalized player name.
- Preserve ordinary active crafts as individual rows.
- Sum expected and guaranteed quantities independently; do not change planner calculations.
- Show craft count, ready/processing counts, structure counts, and one location warning per grouped player.
- Keep the modal dense, viewport-bounded, keyboard-accessible, and responsive.
- Add no dependencies and avoid unrelated refactors.

---

### Task 1: Group passive craft presentation records by player

**Files:**
- Modify: `apps/bitcraft-local/src/pages/craftPlanningNeedDetails.ts`
- Test: `apps/bitcraft-local/test/craft-planning-need-details.test.mjs`

**Interfaces:**
- Consumes: `NeedCell.items[].activeCraftSources[]` records.
- Produces: `groupNeedCellActiveCrafts(cell)` rows. Passive rows add `passiveGroup: true`, `craftCount`, `readyCount`, `processingCount`, and `structures: Array<{ name: string; count: number }>`.

- [ ] **Step 1: Write failing helper tests**

Create three passive sources for one player, one passive source for another player, and one ordinary active craft. Assert:

```js
assert.equal(crafts.length, 3);
assert.equal(mosswick.passiveGroup, true);
assert.equal(mosswick.craftCount, 3);
assert.equal(mosswick.expectedQuantity, 3);
assert.equal(mosswick.guaranteedQuantity, 2);
assert.equal(mosswick.readyCount, 2);
assert.equal(mosswick.processingCount, 1);
assert.deepEqual(mosswick.structures, [
  { name: "Large Farming Field", count: 2 },
  { name: "Small Farming Field", count: 1 },
]);
assert.equal(mosswick.locationUnknown, true);
assert.equal(ordinary.passiveGroup, undefined);
```

Also assert two passive records with the same display name and no player ID form one group.

- [ ] **Step 2: Run the focused test and verify RED**

Run `node --test apps/bitcraft-local/test/craft-planning-need-details.test.mjs`.

Expected: FAIL because passive crafts are still returned per craft ID and lack aggregate fields.

- [ ] **Step 3: Implement the smallest grouping helper change**

Keep the craft-ID map. Fold only `passive === true` rows into a player map keyed by `playerId` or normalized `playerName`. Each aggregate has this shape:

```ts
{
  ...firstCraft,
  craftId: `passive-player:${playerIdentity}`,
  passiveGroup: true,
  craftCount,
  readyCount,
  processingCount,
  structures: [...structureCounts.entries()].map(([name, count]) => ({ name, count })),
  expectedQuantity: summedExpected,
  guaranteedQuantity: summedGuaranteed,
  quantity: summedQuantity,
  locationUnknown: anyLocationUnknown,
}
```

Treat `completed === true` or case-insensitive `Ready to collect` as ready; other passive states are processing. Sort structures by descending count then name, then retain ready-first/player-name ordering.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run `node --test apps/bitcraft-local/test/craft-planning-need-details.test.mjs`.

Expected: PASS.

- [ ] **Step 5: Commit the grouping behaviour**

```powershell
git add apps/bitcraft-local/src/pages/craftPlanningNeedDetails.ts apps/bitcraft-local/test/craft-planning-need-details.test.mjs
git commit -m "feat: group passive crafts by player"
```

### Task 2: Render compact player summaries without overlap

**Files:**
- Modify: `apps/bitcraft-local/src/pages/CraftPlanningPage.tsx`
- Modify: `apps/bitcraft-local/src/styles/craft-planning.css`
- Test: `apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs`

**Interfaces:**
- Consumes: passive summary fields from Task 1.
- Produces: `.craft-plan-tracked-craft-row`, `.craft-plan-tracked-craft-copy`, and `.craft-plan-tracked-craft-totals` markup.

- [ ] **Step 1: Write failing boundary assertions**

Assert the page contains all three tracked-craft classes and grouped summary copy fields. Assert the stylesheet defines a two-column grid with `minmax(0, 1fr)` plus a narrow-width single-column rule.

- [ ] **Step 2: Run the boundary test and verify RED**

Run `node --test apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs`.

Expected: FAIL because the scoped markup and grid do not exist.

- [ ] **Step 3: Render grouped passive summary content**

For passive player groups, render:

```tsx
<strong>{craft.playerName ?? "Unknown player"}</strong>
<small>{craft.craftCount} passive crafts · {craft.readyCount} ready · {craft.processingCount} processing</small>
<small>{craft.structures.map(({ name, count }) => `${name} ×${count}`).join(" · ")}</small>
```

Use singular `passive craft` for one craft, omit zero status segments, retain ordinary craft wording, and show the location warning once. Put expected/guaranteed values in a separate totals element.

- [ ] **Step 4: Add scoped responsive CSS**

```css
.craft-plan-tracked-craft-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 12px;
}
.craft-plan-tracked-craft-copy,
.craft-plan-tracked-craft-totals {
  display: grid;
  min-width: 0;
  gap: 2px;
}
.craft-plan-tracked-craft-copy small {
  white-space: normal;
  overflow-wrap: anywhere;
}
.craft-plan-tracked-craft-totals {
  justify-items: end;
  text-align: right;
}
```

At the existing narrow breakpoint, make the row one column and left-align totals. Do not alter generic detail rows used elsewhere.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run `node --test apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs apps/bitcraft-local/test/craft-planning-need-details.test.mjs`.

Expected: PASS.

- [ ] **Step 6: Commit the presentation**

```powershell
git add apps/bitcraft-local/src/pages/CraftPlanningPage.tsx apps/bitcraft-local/src/styles/craft-planning.css apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs
git commit -m "fix: prevent tracked craft detail overlap"
```

### Task 3: Verify the integrated change

**Files:**
- Inspect: all files changed in Tasks 1 and 2.

**Interfaces:**
- Consumes: completed helper, markup, and CSS.
- Produces: a verified review-ready branch.

- [ ] **Step 1: Run the complete app test suite**

Run `corepack pnpm --filter @workspace/bitcraft-local test`.

Expected: all tests PASS.

- [ ] **Step 2: Run the production build**

Run `corepack pnpm --filter @workspace/bitcraft-local run build`.

Expected: Vite build succeeds without TypeScript errors.

- [ ] **Step 3: Browser-smoke desktop and narrow layouts**

Run `node scripts/start-bitcraft-local-smoke.mjs --restart`, open `http://127.0.0.1:18449/?page=craft-planning`, and inspect an item with multiple passive crafts. Confirm one row per player, correct summary copy, wrapping descriptions, aligned totals, and no overlap at desktop and narrow widths.

- [ ] **Step 4: Check the final diff**

```powershell
git diff origin/main...HEAD --check
git status --short
```

Expected: no whitespace errors and only intended tracked files.
