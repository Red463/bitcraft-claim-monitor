# Linked Accounts Overflow Trigger Centering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reliably center the vertical-ellipsis icon in every Linked Accounts “More actions” trigger across supported browsers and responsive sizes.

**Architecture:** Keep the existing React markup and menu behavior unchanged. Strengthen the focused `admin.css` trigger rules by neutralizing native summary-marker layout and explicitly centering the Lucide SVG, with boundary assertions guarding the CSS contract.

**Tech Stack:** React, TypeScript, plain CSS, Node test runner, Vite

## Global Constraints

- Keep the existing 36px desktop trigger and 44px narrow-screen trigger.
- Preserve hover, open, focus-visible, keyboard, and dropdown behavior.
- Do not change React markup, APIs, row grids, or ordinary user Settings.
- Do not add dependencies or a new testing framework.

---

### Task 1: Center the More Actions Trigger

**Files:**
- Modify: `apps/bitcraft-local/test/admin-character-assignment-boundary.test.mjs:96-106`
- Modify: `apps/bitcraft-local/src/styles/admin.css:883-896`

**Interfaces:**
- Consumes: Existing `.linked-account-more-actions > summary` markup containing one Lucide SVG.
- Produces: A browser-neutral centered icon trigger while retaining the existing menu and responsive dimensions.

- [ ] **Step 1: Add failing boundary assertions**

Extend the existing narrow-screen/layout test with exact contracts for marker suppression, trigger centering, and SVG baseline removal:

```js
assert.match(css, /\.linked-account-more-actions\s*>\s*summary\s*\{[^}]*padding:\s*0[^}]*display:\s*flex[^}]*align-items:\s*center[^}]*justify-content:\s*center[^}]*line-height:\s*0/);
assert.match(css, /\.linked-account-more-actions\s*>\s*summary::marker,[\s\S]*\.linked-account-more-actions\s*>\s*summary::-webkit-details-marker\s*\{[^}]*content:\s*["']{2}[^}]*display:\s*none/);
assert.match(css, /\.linked-account-more-actions\s*>\s*summary\s*>\s*svg\s*\{[^}]*display:\s*block[^}]*margin:\s*0/);
```

- [ ] **Step 2: Run the focused test and verify the new assertions fail**

Run:

```sh
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/admin-character-assignment-boundary.test.mjs
```

Expected: the existing test named `Linked account assignment remains dense, layered, and touch-friendly on narrow screens` fails because the robust centering declarations are absent.

- [ ] **Step 3: Implement the minimal CSS correction**

Update the summary rule and marker rules:

```css
.linked-account-more-actions > summary {
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid rgba(108,123,145,.28);
  border-radius: 7px;
  color: #aeb9c9;
  background: rgba(4,7,11,.5);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 0;
  list-style: none;
}
.linked-account-more-actions > summary::marker,
.linked-account-more-actions > summary::-webkit-details-marker {
  content: "";
  display: none;
}
.linked-account-more-actions > summary > svg {
  display: block;
  margin: 0;
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```sh
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/admin-character-assignment-boundary.test.mjs
```

Expected: all assertions pass.

- [ ] **Step 5: Build the application**

Run:

```sh
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: TypeScript checking and Vite production build complete successfully.

- [ ] **Step 6: Browser-check desktop and narrow widths**

Build and serve the smoke app if needed:

```powershell
node scripts/start-bitcraft-local-smoke.mjs --restart
```

Open the Linked Accounts admin tab at desktop width and below 860px. Confirm the ellipsis is centered horizontally and vertically, focus remains visible, the menu opens in the same position, and the narrow trigger remains 44px.

- [ ] **Step 7: Commit the verified fix**

```sh
git add apps/bitcraft-local/test/admin-character-assignment-boundary.test.mjs apps/bitcraft-local/src/styles/admin.css
git commit -m "Center Linked Accounts overflow icons"
```
