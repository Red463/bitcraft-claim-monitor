# Obsidian Ledger Foundations and Application Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the shared Obsidian Ledger tokens, contextual surface modes, application shell, navigation, utility actions, and responsive chrome used by every later visual task.

**Architecture:** Extend the existing theme and global CSS contracts rather than adding a styling framework. Add one pure route-to-surface-mode mapping, one focused utility-bar component, and small shell markup changes; preserve navigation, permissions, settings, dialogs, and refresh behaviour.

**Tech Stack:** React, TypeScript, Vite, plain CSS, Node test runner, Lucide icons.

**Spec:** `docs/superpowers/specs/2026-08-24-whole-application-visual-system-design.md`

## Global Constraints

- Preserve all route IDs, navigation groups, access checks, settings, and keyboard behaviour.
- Preserve adaptive-balanced density: compact operational data, comfortable forms/public flows, and unchanged touch targets on mobile.
- Preserve `RefreshStatus`, manual-refresh cooldown, notification drawer, help, command palette, admin link, and user settings capabilities.
- Do not add dependencies or a second theme engine.
- Keep `styles.css` responsible for global tokens and shell ownership.
- Keep all mobile drawers and dialogs viewport-fixed, focus-safe, and internally scrollable.
- Maintain WCAG AA contrast and current theme validation.
- Use CSS custom properties for shared roles; do not scatter new hard-coded colour literals through feature styles.

---

### Task 1: Add contextual surface-mode mapping

**Files:**
- Create: `apps/bitcraft-local/src/ui/surfaceMode.ts`
- Modify: `apps/bitcraft-local/src/AppShell.tsx`
- Create: `apps/bitcraft-local/test/surface-mode.test.mjs`
- Modify: `apps/bitcraft-local/test/appshell-chrome-boundary.test.mjs`

**Interfaces:**
- Consumes: `ActivePanel` from `src/types/app.ts`.
- Produces: `SurfaceMode = "operations" | "market" | "map" | "public" | "admin"`.
- Produces: `surfaceModeForPanel(panel: ActivePanel): SurfaceMode`.
- Produces: one `surface-mode-${mode}` class on `.app-shell` and `surface-mode-bot` on the dedicated `/bot` root.

- [ ] **Step 1: Write the failing mapping test**

Create `surface-mode.test.mjs` with exact route coverage:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { surfaceModeForPanel } from "../src/ui/surfaceMode.ts";

test("every maintained route maps to one contextual surface mode", () => {
  const expected = {
    dashboard: "operations", leaderboard: "operations", members: "operations",
    skills: "operations", "craft-monitor": "operations", planning: "operations",
    inventory: "operations", construction: "operations", research: "operations",
    region: "operations", empires: "operations", activity: "operations",
    market: "market", "settlement-market": "market", map: "map",
    publiccrafts: "public", craftcalc: "public", sync: "public", admin: "admin",
  };
  for (const [panel, mode] of Object.entries(expected)) {
    assert.equal(surfaceModeForPanel(panel), mode, panel);
  }
});
```

Add boundary assertions that `AppShell.tsx` calls `surfaceModeForPanel(active)` and emits `surface-mode-${surfaceMode}`.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/surface-mode.test.mjs test/appshell-chrome-boundary.test.mjs
```

Expected: FAIL because the mapping module and classes do not exist.

- [ ] **Step 3: Implement the exhaustive mapping**

Create the module with an exhaustive switch:

```ts
import type { ActivePanel } from "../types/app";

export type SurfaceMode = "operations" | "market" | "map" | "public" | "admin";

export function surfaceModeForPanel(panel: ActivePanel): SurfaceMode {
  switch (panel) {
    case "market":
    case "settlement-market": return "market";
    case "map": return "map";
    case "publiccrafts":
    case "craftcalc":
    case "sync": return "public";
    case "admin": return "admin";
    default: return "operations";
  }
}
```

In `DashboardApp`, derive `const surfaceMode = surfaceModeForPanel(active);` beside other render-only constants and append `surface-mode-${surfaceMode}` to the existing `.app-shell` class. Add `surface-mode-bot` to `BotControlApp`'s `<main>` without changing its routing branch.

- [ ] **Step 4: Run focused tests and build**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/surface-mode.test.mjs test/appshell-chrome-boundary.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: PASS.

- [ ] **Step 5: Commit the mode boundary**

```powershell
git add -- apps/bitcraft-local/src/ui/surfaceMode.ts apps/bitcraft-local/src/AppShell.tsx apps/bitcraft-local/test/surface-mode.test.mjs apps/bitcraft-local/test/appshell-chrome-boundary.test.mjs
git commit -m "refactor: add contextual visual modes"
```

### Task 2: Establish shared Obsidian Ledger tokens and primitives

**Files:**
- Modify: `apps/bitcraft-local/src/styles.css`
- Modify: `apps/bitcraft-local/src/theme.ts`
- Modify: `apps/bitcraft-local/src/components/main/AsyncState.tsx`
- Modify: `apps/bitcraft-local/test/theme-contract.test.mjs`
- Create: `apps/bitcraft-local/test/obsidian-ledger-boundary.test.mjs`
- Modify: `apps/bitcraft-local/test/state-feedback-boundary.test.mjs`

**Interfaces:**
- Consumes: existing theme keys such as `bg`, `panel`, `activeColor`, `good`, and `danger`.
- Produces: shared CSS roles `--canvas`, `--surface-1`, `--surface-2`, `--surface-3`, `--line-subtle`, `--line-strong`, `--signal-info`, `--signal-discord`, `--space-*`, `--radius-*`, and `--font-data`.
- Preserves: existing variable aliases used by current styles.

- [ ] **Step 1: Write failing token contract tests**

Add assertions such as:

```js
for (const token of [
  "--canvas", "--surface-1", "--surface-2", "--surface-3",
  "--line-subtle", "--line-strong", "--signal-info", "--signal-discord",
  "--space-1", "--space-2", "--space-3", "--space-4", "--space-5", "--space-6",
  "--radius-control", "--radius-panel", "--radius-dialog", "--font-data",
]) assert.match(styles, new RegExp(`${token}:`), token);

assert.match(styles, /\.surface-mode-market\s*\{/);
assert.match(styles, /\.surface-mode-public\s*\{/);
assert.match(styles, /\.surface-mode-bot\s*\{/);
assert.doesNotMatch(styles, /--signal-good:\s*var\(--gold\)/);
```

Extend contrast coverage so the default theme validates gold, green, red, information blue, and focus against the relevant panel surfaces.

- [ ] **Step 2: Run tests and verify RED**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/theme-contract.test.mjs test/obsidian-ledger-boundary.test.mjs
```

Expected: FAIL because the semantic token layer is absent.

- [ ] **Step 3: Add tokens while retaining old aliases**

Add the semantic roles at `:root` and point current aliases at them:

```css
:root {
  --canvas: #030506;
  --surface-1: #080d10;
  --surface-2: #0c1216;
  --surface-3: #11191e;
  --line-subtle: rgba(126, 145, 155, .20);
  --line-strong: rgba(139, 159, 169, .38);
  --signal-info: #6aafff;
  --signal-discord: #8793ff;
  --font-data: "JetBrains Mono", "Cascadia Mono", Consolas, monospace;
  --space-1: 4px;
  --space-2: 6px;
  --space-3: 8px;
  --space-4: 12px;
  --space-5: 16px;
  --space-6: 20px;
  --space-7: 24px;
  --radius-control: 6px;
  --radius-panel: 8px;
  --radius-dialog: 12px;
  --bg: var(--canvas);
  --panel: var(--surface-2);
  --panel-2: var(--surface-1);
}
```

Use accessible values confirmed by `validateThemeContrast`; if the literal examples fail, adjust luminance rather than weakening validation.

- [ ] **Step 4: Add contextual variable overrides**

Keep overrides limited to semantic emphasis:

```css
.surface-mode-operations { --workspace-density: 1; }
.surface-mode-market { --workspace-density: .92; --workspace-accent: var(--active-color); }
.surface-mode-public { --workspace-density: 1.08; }
.surface-mode-admin { --workspace-density: 1; }
.surface-mode-bot { --workspace-density: .98; --service-accent: var(--signal-discord); }
```

Do not make route modes separate themes. User theme variables remain authoritative.

- [ ] **Step 5: Update shared primitives**

Use the new tokens for `.panel`, `.form-card`, `.toolbar-button`, `.field`, `.search`, `.tabs`, `.metric-grid`, `.empty-state`, `.error`, `.info`, `.table-wrap`, and focus rules. Keep `AsyncState` as the shared loading/empty/error/status vocabulary and add only semantic class/data attributes needed for tokenised presentation. Prefer separators and inset borders over new wide resting shadows. Keep coarse-pointer targets at least 44px where already required.

- [ ] **Step 6: Run focused tests and build**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/theme-contract.test.mjs test/obsidian-ledger-boundary.test.mjs test/shared-controls-boundary.test.mjs test/ui-audit-guardrails.test.mjs test/state-feedback-boundary.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: PASS.

- [ ] **Step 7: Commit foundations**

```powershell
git add -- apps/bitcraft-local/src/styles.css apps/bitcraft-local/src/theme.ts apps/bitcraft-local/src/components/main/AsyncState.tsx apps/bitcraft-local/test/theme-contract.test.mjs apps/bitcraft-local/test/obsidian-ledger-boundary.test.mjs apps/bitcraft-local/test/state-feedback-boundary.test.mjs
git commit -m "style: establish Obsidian Ledger foundations"
```

### Task 3: Replace floating tools with an anchored application utility bar

**Files:**
- Create: `apps/bitcraft-local/src/components/main/AppUtilityBar.tsx`
- Modify: `apps/bitcraft-local/src/AppShell.tsx`
- Modify: `apps/bitcraft-local/src/styles/app-chrome.css`
- Modify: `apps/bitcraft-local/test/appshell-chrome-boundary.test.mjs`
- Modify: `apps/bitcraft-local/test/manual-refresh-css-boundary.test.mjs`
- Modify: `apps/bitcraft-local/test/manual-refresh-pages-boundary.test.mjs`

**Interfaces:**
- Produces: `AppUtilityBarProps` containing route label, command/admin/settings/notifications/help actions, unread count, and manual-refresh state.
- Preserves: all existing callbacks and refresh aria labels.
- Preserves: modified-click behaviour on the Admin link.

- [ ] **Step 1: Write failing utility-bar boundary tests**

Require a focused component and preserved actions:

```js
const utility = readFileSync(new URL("../src/components/main/AppUtilityBar.tsx", import.meta.url), "utf8");
assert.match(utility, /aria-label="Application tools"/);
for (const label of ["Search commands", "Admin console", "Updates", "Browser settings", "Help and application information"]) {
  assert.match(utility, new RegExp(label));
}
assert.match(utility, /aria-busy=\{refreshing\}/);
assert.match(utility, /disabled=\{refreshDisabled\}/);
assert.doesNotMatch(appShell, /className=\{`floating-actions/);
```

Update refresh CSS expectations from `.floating-action-item` to `.app-utility-refresh` while preserving cooldown and spinner rules.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/appshell-chrome-boundary.test.mjs test/manual-refresh-css-boundary.test.mjs test/manual-refresh-pages-boundary.test.mjs
```

Expected: FAIL because tools are still floating.

- [ ] **Step 3: Create the focused utility component**

Use an explicit prop contract:

```ts
export type AppUtilityBarProps = {
  pageLabel: string;
  adminHref: string;
  adminActive: boolean;
  adminVisible: boolean;
  unreadCount: number;
  refreshing: boolean;
  coolingDownSeconds: number;
  refreshDisabled: boolean;
  refreshLabel: string;
  onAdminNavigate: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  onOpenCommand: () => void;
  onRefresh: () => void;
  onOpenSettings: () => void;
  onOpenNotifications: () => void;
  onOpenHelp: () => void;
};
```

Render route context first, then command search and existing tools. Keep icon-only compact controls accessible by label/title. Show refresh countdown text when cooling down.

- [ ] **Step 4: Replace the floating-action markup**

In `AppShell.tsx`, pass the existing callbacks and state into `AppUtilityBar`. Remove only the obsolete floating presentation state and toggle after tests prove no other consumer uses it. Do not alter command palette, drawer, settings, notification, help, admin, or refresh logic.

- [ ] **Step 5: Style desktop and mobile utility layouts**

Use a shell-contained sticky row on desktop and a compact icon row below/within the mobile route bar:

```css
.app-utility-bar {
  position: sticky;
  top: 0;
  z-index: var(--z-sticky);
  min-height: 42px;
  border-bottom: 1px solid var(--line-subtle);
  background: color-mix(in srgb, var(--canvas) 92%, transparent);
  backdrop-filter: blur(12px);
}
```

Do not allow the utility row to cover page content or the dedicated map.

- [ ] **Step 6: Run focused tests and build**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/appshell-chrome-boundary.test.mjs test/manual-refresh-css-boundary.test.mjs test/manual-refresh-pages-boundary.test.mjs test/appshell-navigation-boundary.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: PASS.

- [ ] **Step 7: Commit the utility bar**

```powershell
git add -- apps/bitcraft-local/src/components/main/AppUtilityBar.tsx apps/bitcraft-local/src/AppShell.tsx apps/bitcraft-local/src/styles/app-chrome.css apps/bitcraft-local/test/appshell-chrome-boundary.test.mjs apps/bitcraft-local/test/manual-refresh-css-boundary.test.mjs apps/bitcraft-local/test/manual-refresh-pages-boundary.test.mjs
git commit -m "style: anchor global application tools"
```

### Task 4: Refresh expanded, collapsed, and mobile navigation

**Files:**
- Modify: `apps/bitcraft-local/src/AppShell.tsx`
- Modify: `apps/bitcraft-local/src/styles.css`
- Modify: `apps/bitcraft-local/test/appshell-navigation-boundary.test.mjs`
- Modify: `apps/bitcraft-local/test/responsive-layout-boundary.test.mjs`
- Modify: `apps/bitcraft-local/test/css-ownership.test.mjs`

**Interfaces:**
- Consumes: unchanged `NAV_GROUPS`, `RefreshStatus`, access decisions, and account state.
- Produces: refreshed expanded sidebar, 72px collapsed rail, and narrow viewport drawer.
- Preserves: drawer inert/aria-hidden behaviour, Escape close, focus restoration, body scroll lock, modified-click links, and restricted lock icon.

- [ ] **Step 1: Add failing visual-boundary assertions**

Require:

```js
assert.match(shellCss, /\.app-shell\s*\{[^}]*grid-template-columns:\s*238px/s);
assert.match(shellCss, /\.app-shell\.sidebar-collapsed\s*\{[^}]*grid-template-columns:\s*72px/s);
assert.match(shellCss, /\.nav-destination\.active\s*\{[^}]*box-shadow:\s*inset\s+2px\s+0/s);
assert.match(shellCss, /\.refresh-status\s*\{[^}]*margin-top:\s*auto/s);
```

Keep existing assertions for grouped mobile navigation, `inert`, Escape, focus restoration, 44px mobile controls, and restricted state.

- [ ] **Step 2: Run tests and verify RED where the new visual contract differs**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/appshell-navigation-boundary.test.mjs test/responsive-layout-boundary.test.mjs test/css-ownership.test.mjs
```

Expected: at least the active-rail/freshness visual assertions fail before styling.

- [ ] **Step 3: Apply the desktop shell hierarchy**

Restyle brand, account, groups, active destination, restricted state, freshness, collapsed tooltips, and footer with shared tokens. Keep label copy and route ordering unchanged. Ensure the selected route uses shape plus colour, not colour alone.

- [ ] **Step 4: Apply the narrow drawer hierarchy**

At the existing `max-width: 920px` boundary, retain the fixed 52px mobile route bar and full-height drawer. Use one scrolling navigation region; keep account and settlement identity visible; ensure close and destination targets are at least 44px.

- [ ] **Step 5: Respect density and reduced motion**

Compact density may reduce row padding, but mobile touch sizes remain unchanged. Navigation transitions may animate only transform/opacity and must be disabled under reduced motion.

- [ ] **Step 6: Run focused tests and build**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/appshell-navigation-boundary.test.mjs test/responsive-layout-boundary.test.mjs test/css-ownership.test.mjs test/theme-contract.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: PASS.

- [ ] **Step 7: Browser-check shell states**

On the smoke server inspect Dashboard at 1440×900, 1024×768, 768×1024, and 390×844. Verify expanded/collapsed navigation, signed-in/signed-out account cards, restricted lock treatment, mobile drawer focus/scroll, utility bar, refresh cooldown, notification drawer, help, settings, command palette, and footer.

- [ ] **Step 8: Commit shell styling**

```powershell
git add -- apps/bitcraft-local/src/AppShell.tsx apps/bitcraft-local/src/styles.css apps/bitcraft-local/test/appshell-navigation-boundary.test.mjs apps/bitcraft-local/test/responsive-layout-boundary.test.mjs apps/bitcraft-local/test/css-ownership.test.mjs
git commit -m "style: refresh application shell navigation"
```
