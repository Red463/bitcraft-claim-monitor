# Obsidian Ledger Visual-System Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the approved Obsidian Ledger redesign by removing redundant route-title heroes and enforcing its neutral palette, sharper geometry, flatter depth, and quiet footer throughout the maintained application and `/bot`.

**Architecture:** Keep the existing React routes and plain-CSS ownership boundaries. Strengthen the semantic token contract in `styles.css`, make `PageHeader` explicitly shell-aware, update legacy headers to the same route-title contract, and replace legacy hard-coded shared presentation in focused page-family styles without changing page behaviour or data flow.

**Tech Stack:** React, TypeScript, Vite, plain CSS, Node test runner, Happy DOM, in-app browser visual inspection.

**Spec:** `docs/superpowers/specs/2026-08-24-whole-application-visual-system-design.md`

## Global Constraints

- Visual redesign only: preserve routes, navigation, permissions, page capabilities, data contracts, authentication, Relay, SQLite, and Discord behaviour.
- Retain one accessible route heading even when the utility strip owns the visible route title.
- Preserve page-level metadata and actions; remove only duplicated title/purpose presentation.
- Use near-square geometry: 2px controls, 4px panels/cards, 6px dialogs; reserve pill geometry for status, tags, counts, and switches.
- Use Obsidian neutral surfaces and warm separators; gold is identity/focus/selection, not a generic status colour.
- Prefer borders and separators over gradients, card shadows, or nested decorative surfaces.
- Keep touch targets, focus visibility, reduced-motion behaviour, responsive containment, and theme compatibility.
- Do not add dependencies or a second styling system.

---

### Task 1: Make Route Titles Shell-Owned

**Files:**
- Modify: `apps/bitcraft-local/src/components/main/PageHeader.tsx`
- Modify: `apps/bitcraft-local/src/pages/MarketPage.tsx`
- Modify: `apps/bitcraft-local/src/pages/SettlementMarketPage.tsx`
- Modify: `apps/bitcraft-local/src/pages/LeaderboardPage.tsx`
- Modify: `apps/bitcraft-local/src/pages/ActivityPage.tsx`
- Modify: `apps/bitcraft-local/src/pages/RegionPage.tsx`
- Modify: `apps/bitcraft-local/src/pages/CraftCalculatorPage.tsx`
- Modify: `apps/bitcraft-local/src/pages/PublicCraftFinderPage.tsx`
- Modify: `apps/bitcraft-local/src/pages/SyncPage.tsx`
- Modify: `apps/bitcraft-local/src/styles.css`
- Modify: `apps/bitcraft-local/test/page-header-spacing-boundary.test.mjs`
- Modify: `apps/bitcraft-local/test/obsidian-ledger-boundary.test.mjs`

**Interfaces:**
- `PageHeader` continues to accept `title`, `description`, `meta`, and `actions`.
- `.route-title-copy` contains the accessible route heading and description but is visually compacted when rendered beneath `.app-utility-bar`.
- `.page-header-aside` and legacy header metadata remain visible and become the compact context row.

- [ ] **Step 1: Write the failing header contract tests**

Require `PageHeader` and each conventional legacy header to emit `.route-title-copy`, and require the shared stylesheet to visually hide only that copy while preserving an accessible heading and a visible metadata row.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/page-header-spacing-boundary.test.mjs test/obsidian-ledger-boundary.test.mjs
```

Expected: FAIL because the common route-title contract is not present.

- [ ] **Step 3: Implement the shared route-title contract**

Use this structure in `PageHeader` and the equivalent wrapper in legacy headers:

```tsx
<div className="page-header-copy route-title-copy">
  <h2>{title}</h2>
  {description ? <p>{description}</p> : null}
</div>
```

Style `.route-title-copy` as visually hidden on conventional shell pages while keeping it in the accessibility tree. Hide an otherwise-empty header; retain a compact, separator-led row whenever metadata or actions exist. Do not apply this rule to dedicated map, authentication, legal, or standalone Bot sign-in compositions.

- [ ] **Step 4: Run the focused tests and build**

Run the focused command above, then:

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: PASS.

### Task 2: Enforce the Obsidian Palette and Sharp Geometry

**Files:**
- Modify: `apps/bitcraft-local/src/styles.css`
- Modify: `apps/bitcraft-local/src/theme.ts`
- Modify: `apps/bitcraft-local/src/styles/app-chrome.css`
- Modify: focused CSS under `apps/bitcraft-local/src/styles/` where literal legacy backgrounds or radii override semantic roles
- Modify: `apps/bitcraft-local/test/theme-contract.test.mjs`
- Modify: `apps/bitcraft-local/test/obsidian-ledger-boundary.test.mjs`

**Interfaces:**
- Shared geometry tokens become `--radius-control: 2px`, `--radius-panel: 4px`, `--radius-card: 4px`, and `--radius-dialog: 6px`.
- Default theme roles remain user-configurable through existing theme keys and aliases.
- Status pills, badges, avatars, dots, switches, and circular iconography retain intentional rounded geometry.

- [ ] **Step 1: Write failing semantic visual-contract tests**

Add literal expectations for the four geometry tokens and default Obsidian roles. Add a guard that rejects legacy blue-slate defaults such as `#111923`, `#080d14`, and `#353b46` from the root theme contract.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/theme-contract.test.mjs test/obsidian-ledger-boundary.test.mjs
```

Expected: FAIL on the current 7–12px geometry and blue-slate aliases.

- [ ] **Step 3: Apply neutral semantic defaults**

Use an Obsidian-neutral hierarchy equivalent to:

```css
--canvas: #030403;
--surface-1: #070907;
--surface-2: #0b0e0b;
--surface-3: #111510;
--line-subtle: rgba(184, 161, 91, .14);
--line-strong: rgba(184, 161, 91, .28);
--text: #f0ede4;
--muted: #9ca197;
--active-color: #d9af3d;
--radius-control: 2px;
--radius-panel: 4px;
--radius-dialog: 6px;
```

Update `theme.ts` defaults to match without weakening existing contrast validation.

- [ ] **Step 4: Replace shared legacy presentation**

Convert recurring card, panel, toolbar, field, tab, table, notice, and modal backgrounds to semantic surfaces. Replace resting gradients and wide shadows with flat fills, hairline borders, and restrained inset separators. Replace literal 7–14px radii with geometry tokens, excluding semantic pills, switches, avatars, dots, and circular controls.

- [ ] **Step 5: Run focused tests and build**

Run the Task 2 focused tests, theme validation coverage, and the production build. Expected: PASS.

### Task 3: Flatten Each Contextual Page Family

**Files:**
- Modify: `apps/bitcraft-local/src/styles/dashboard.css`
- Modify: `apps/bitcraft-local/src/styles/market.css`
- Modify: operational page CSS under `apps/bitcraft-local/src/styles/`
- Modify: `apps/bitcraft-local/src/styles/map.css`
- Modify: `apps/bitcraft-local/src/styles/admin.css`
- Modify: `apps/bitcraft-local/src/styles/bot-dashboard.css`
- Modify: `apps/bitcraft-local/src/styles/discord-admin.css`
- Modify: relevant focused CSS boundary tests

**Interfaces:**
- Operations pages use flat compact metric strips and separators.
- Market pages use the darkest/densest surface hierarchy and monospaced price alignment.
- Map docks retain translucency but use the same sharp edge and border language.
- Public/guided pages keep extra spacing without reintroducing promotional cards.
- Bot/Admin uses semantic health colours and Discord violet only for Discord context.

- [ ] **Step 1: Add failing page-family guardrails**

Extend existing focused CSS tests so primary page containers consume semantic surface/radius variables and do not restore known legacy page gradients or resting card shadows.

- [ ] **Step 2: Run the focused page tests and verify RED**

Run the affected CSS boundary tests directly. Expected: FAIL on current literal gradients, 7–14px panels, or resting shadows.

- [ ] **Step 3: Apply focused page-family overrides**

Change only visual presentation. Preserve grids, table semantics, drill-in behaviour, filters, forms, responsive ordering, and all data/state branches.

- [ ] **Step 4: Run the focused tests and build**

Expected: PASS with no TypeScript or Vite errors.

### Task 4: Rebuild the Footer and Remove Obsolete Chrome

**Files:**
- Modify: `apps/bitcraft-local/src/AppShell.tsx`
- Modify: `apps/bitcraft-local/src/styles.css`
- Modify: `apps/bitcraft-local/src/styles/app-chrome.css`
- Modify: `apps/bitcraft-local/src/components/main/SupportLinks.tsx`
- Modify: `apps/bitcraft-local/test/appshell-chrome-boundary.test.mjs`
- Modify: `apps/bitcraft-local/test/manual-refresh-css-boundary.test.mjs`

**Interfaces:**
- Footer retains copyright, build, Relay attribution, repository, feature requests, support, privacy, and terms.
- Footer uses a single quiet utility row with a hairline top separator.
- Build text is plain monospaced text rather than a capsule.
- Obsolete `.floating-actions` styling is removed because `AppUtilityBar` owns those actions.

- [ ] **Step 1: Write failing footer/chrome tests**

Require a compact `.footer-primary`/`.footer-secondary` structure, plain `.footer-build`, and absence of obsolete floating-action markup/styles while preserving accessible action labels.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/appshell-chrome-boundary.test.mjs test/manual-refresh-css-boundary.test.mjs
```

Expected: FAIL on the current wrapped promotional footer and retained floating-action CSS.

- [ ] **Step 3: Implement the quiet footer and delete dead styling**

Use two logical groups inside one flat strip. Keep support visually findable but compact; remove the version pill, decorative footer gradient/shadow, hover lift, and all unused floating-action rules.

- [ ] **Step 4: Run focused tests and build**

Expected: PASS.

### Task 5: Release Verification, Production Inspection, and Deployment

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `apps/bitcraft-local/package.json`

**Interfaces:**
- Release follows the existing `0.62.0-beta.N` line unless scope requires the next minor under `VERSIONING.md`.
- Production inspection uses real live data and makes no Bot/Admin mutations.

- [ ] **Step 1: Run the complete automated gate**

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
corepack pnpm --filter @workspace/bitcraft-local test
git diff --check
```

Expected: build and all non-environment-skipped tests pass; diff check is clean apart from platform line-ending notices.

- [ ] **Step 2: Build and inspect the stable local smoke site**

```powershell
node scripts/start-bitcraft-local-smoke.mjs --restart
curl.exe -s http://127.0.0.1:18449/api/local/health
```

Inspect representative operations, Global Market, Local Market, map, public/guided, and Bot/Admin surfaces at 1440×900, 1024×768, 768×1024, and 390×844. Verify title deduplication, palette, geometry, footer, focus, no root overflow, and no console errors.

- [ ] **Step 3: Update release metadata**

Add a dated changelog entry describing the completed Obsidian enforcement, update the package version, and rebuild.

- [ ] **Step 4: Commit and push the verified release**

Commit only task files and push `HEAD:main` after checks pass.

- [ ] **Step 5: Deploy and monitor GitHub Actions**

Trigger `deploy-relay-preview.yml` on `main`, monitor it to a successful verify and deploy conclusion, and retain the workflow URL.

- [ ] **Step 6: Inspect production with live data**

Recheck Dashboard, Global Market, Local Market, Map, public/guided, and the available Bot/Admin auth state on the live site at desktop and phone width. Confirm the deployed version, no root overflow, no console errors, and visual agreement with the approved corrective design.

