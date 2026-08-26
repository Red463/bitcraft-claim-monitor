# Bot and Admin Visual Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reframe `/bot` around service health and actionable exceptions, harmonise every existing bot/admin section with Obsidian Ledger, and preserve all configuration, moderation, diagnostic, authentication, and delivery behaviour.

**Architecture:** Derive presentation-only health cards and exceptions from status already loaded by `AdminPanel`; add focused Bot health components and keep section routing/state unchanged. Apply contextual Bot/Admin styling through existing `bot-dashboard.css`, `discord-admin.css`, `admin.css`, and `setup-workflow.css` files.

**Tech Stack:** React, TypeScript, Vite, plain CSS, Node test runner, existing admin/bot components, Lucide icons.

**Spec:** `docs/superpowers/specs/2026-08-24-whole-application-visual-system-design.md`

## Global Constraints

- Execute after `2026-08-24-visual-foundations-and-shell.md`.
- Preserve `/bot`, bot sub-section query state, main Admin tabs, permissions, CSRF handling, pending-action guards, and API calls.
- Do not send Discord messages, run command tests, sync live roles/channels, or execute moderation actions during automated/visual tests.
- Do not expose bot tokens, admin secrets, or sensitive configuration.
- Preserve every current Bot section and its stable id.
- Use Discord violet only as contextual service identity; use green/warning/red for semantic state.
- Destructive actions retain explicit confirmation and the shared fixed Dialog foundation.
- Long forms use one column on phones and must not create horizontal overflow.

---

### Task 1: Derive health and exceptions from existing Bot status

**Files:**
- Create: `apps/bitcraft-local/src/components/bot/botHealth.ts`
- Create: `apps/bitcraft-local/src/components/bot/BotHealthSummary.tsx`
- Modify: `apps/bitcraft-local/src/components/admin/AdminPanel.tsx`
- Create: `apps/bitcraft-local/test/bot-health.test.mjs`
- Create: `apps/bitcraft-local/test/bot-health-boundary.test.mjs`
- Modify: `apps/bitcraft-local/test/bot-section-state.test.mjs`

**Interfaces:**
- Produces: `BotHealthTone = "neutral" | "success" | "warning" | "danger"`.
- Produces: `BotHealthInput`, `BotHealthCard`, and `BotException`.
- Produces: `deriveBotHealth(input: BotHealthInput): { cards: BotHealthCard[]; exceptions: BotException[] }`.
- Produces: `BotHealthSummary({ health, onSelectSection })`.
- Preserves: current default/selected `BotSection`; health actions only call `setBotSection`.

- [ ] **Step 1: Write failing pure presentation tests**

Use an explicit input contract:

```ts
export type BotHealthInput = {
  enabled: boolean;
  tokenConfigured: boolean;
  gatewayConnected: boolean;
  gatewayError: string | null;
  rulesEnabled: number;
  lastDeliveryStatus: string | null;
  lastDeliveryLabel: string;
  setupSteps: Array<{ label: string; detail: string; done: boolean; section: BotSection }>;
};
```

Test:

```js
const result = deriveBotHealth({
  enabled: true, tokenConfigured: false, gatewayConnected: false,
  gatewayError: "Invalid token", rulesEnabled: 3,
  lastDeliveryStatus: "failed", lastDeliveryLabel: "Unknown channel",
  setupSteps: [],
});
assert.equal(result.cards.find(({ id }) => id === "gateway").tone, "danger");
assert.deepEqual(result.exceptions.map(({ section }) => section), ["setup", "diagnostics"]);
assert.match(result.exceptions[0].title, /token/i);
```

Also test disabled Bot as neutral rather than failure, healthy Bot with no exceptions, and unfinished setup steps linking to their existing sections.

- [ ] **Step 2: Run tests and verify RED**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/bot-health.test.mjs test/bot-health-boundary.test.mjs test/bot-section-state.test.mjs
```

Expected: FAIL because the helper/component do not exist.

- [ ] **Step 3: Implement presentation-only derivation**

Return exactly four cards:

```text
gateway, rules, token, delivery
```

Rules:

- Disabled Bot: gateway/token/delivery cards are neutral; no failure is implied.
- Enabled + missing token: danger exception targeting `setup`.
- Enabled + gateway error: danger exception targeting `setup`, with the existing error text.
- Last delivery status containing `failed` or `error`: danger exception targeting `diagnostics`.
- Incomplete setup step: warning exception targeting its declared existing section.
- Deduplicate exceptions by id and do not expose secret values.

- [ ] **Step 4: Create the health summary component**

Render semantic status cards and an exception list:

```tsx
<section className="bot-health-summary" aria-label="Bot service health">
  <div className="bot-health-grid">...</div>
  <section className="bot-exceptions" aria-labelledby="bot-exceptions-title">
    <h2 id="bot-exceptions-title">Exceptions requiring action</h2>
    {exceptions.map((exception) => (
      <article data-tone={exception.tone} key={exception.id}>
        <div><strong>{exception.title}</strong><span>{exception.detail}</span></div>
        <button type="button" onClick={() => onSelectSection(exception.section)}>
          {exception.actionLabel}
        </button>
      </article>
    ))}
  </section>
</section>
```

If there are no exceptions, render a compact healthy state rather than removing the section.

- [ ] **Step 5: Integrate above existing Bot section navigation**

In `AdminPanel`, replace the four inline `.bot-overview` cards and setup workflow card with `BotHealthSummary`. Construct `BotHealthInput` from the already available `draft.discord`, `status`, `discordDelivery`, `discordDeliveryLabel`, and `botWorkflowItems`. Do not add fetches or effects.

- [ ] **Step 6: Run focused tests and build**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/bot-health.test.mjs test/bot-health-boundary.test.mjs test/bot-section-state.test.mjs test/admin-status-presentation.test.mjs test/admin-sections-boundary.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: PASS.

- [ ] **Step 7: Commit Bot health hierarchy**

```powershell
git add -- apps/bitcraft-local/src/components/bot/botHealth.ts apps/bitcraft-local/src/components/bot/BotHealthSummary.tsx apps/bitcraft-local/src/components/admin/AdminPanel.tsx apps/bitcraft-local/test/bot-health.test.mjs apps/bitcraft-local/test/bot-health-boundary.test.mjs apps/bitcraft-local/test/bot-section-state.test.mjs
git commit -m "feat: surface bot health and exceptions"
```

### Task 2: Refresh Bot/Admin shell and section navigation

**Files:**
- Modify: `apps/bitcraft-local/src/components/admin/AdminShellHeader.tsx`
- Modify: `apps/bitcraft-local/src/components/admin/AdminPanel.tsx`
- Modify: `apps/bitcraft-local/src/components/bot/BotSectionNav.tsx`
- Modify: `apps/bitcraft-local/src/components/bot/BotMobileSectionNav.tsx`
- Modify: `apps/bitcraft-local/src/styles/admin.css`
- Modify: `apps/bitcraft-local/src/styles/bot-dashboard.css`
- Modify: `apps/bitcraft-local/src/styles/discord-admin.css`
- Modify: `apps/bitcraft-local/test/bot-section-nav-boundary.test.mjs`
- Modify: `apps/bitcraft-local/test/admin-navigation-state.test.mjs`
- Modify: `apps/bitcraft-local/test/appshell-admin-boundary.test.mjs`
- Modify: `apps/bitcraft-local/test/responsive-layout-boundary.test.mjs`

**Interfaces:**
- Consumes: unchanged `BOT_SECTION_DEFINITIONS`, `BOT_SECTION_GROUPS`, `botSection`, and `setBotSection`.
- Produces: `.bot-console-header`, `.bot-console-layout`, `.bot-console-nav`, and `.bot-console-workspace`.
- Preserves: grouped desktop navigation, one labelled grouped mobile picker, `aria-current`, URL persistence, Linked Accounts tab, and return-to-app action.

- [ ] **Step 1: Write failing shell/navigation tests**

Require:

```js
for (const className of ["bot-console-header", "bot-console-layout", "bot-console-nav", "bot-console-workspace"]) {
  assert.match(adminPanel, new RegExp(className));
}
assert.match(mobileNav, /aria-label="Discord tool"/);
assert.match(mobileNav, /<optgroup/);
assert.match(botCss, /--service-accent:\s*var\(--signal-discord\)/);
```

Keep current exact section id/group tests.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/bot-section-nav-boundary.test.mjs test/admin-navigation-state.test.mjs test/appshell-admin-boundary.test.mjs test/responsive-layout-boundary.test.mjs
```

Expected: FAIL for new structural classes and service token.

- [ ] **Step 3: Add shell classes without changing routing**

Apply the new classes to existing header, layout, nav wrapper, mobile picker, and selected section workspace. Keep the current `BotControlApp` route-level branch and `AdminPanel botOnly` contract.

- [ ] **Step 4: Apply desktop console styling**

Use a 250px sticky section nav and flexible workspace:

```css
.surface-mode-bot { --service-accent: var(--signal-discord); }
.bot-console-layout {
  display: grid;
  grid-template-columns: 250px minmax(0, 1fr);
  gap: var(--space-4);
  align-items: start;
}
.bot-console-nav { position: sticky; top: var(--space-4); max-height: calc(100dvh - 24px); overflow: auto; }
```

Use violet for service identity/active Bot navigation only. Use gold for Claim Monitor focus/primary emphasis and semantic state colours for health.

- [ ] **Step 5: Apply mobile section-picker styling**

At `max-width: 720px`, hide desktop nav, show the existing labelled grouped picker, use one column, and keep the current section visible. The picker must not become a clipped tab row.

- [ ] **Step 6: Run focused tests and build**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/bot-section-nav-boundary.test.mjs test/bot-section-state.test.mjs test/admin-navigation-state.test.mjs test/appshell-admin-boundary.test.mjs test/responsive-layout-boundary.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: PASS.

- [ ] **Step 7: Commit Bot/Admin shell styling**

```powershell
git add -- apps/bitcraft-local/src/components/admin/AdminShellHeader.tsx apps/bitcraft-local/src/components/admin/AdminPanel.tsx apps/bitcraft-local/src/components/bot/BotSectionNav.tsx apps/bitcraft-local/src/components/bot/BotMobileSectionNav.tsx apps/bitcraft-local/src/styles/admin.css apps/bitcraft-local/src/styles/bot-dashboard.css apps/bitcraft-local/src/styles/discord-admin.css apps/bitcraft-local/test/bot-section-nav-boundary.test.mjs apps/bitcraft-local/test/admin-navigation-state.test.mjs apps/bitcraft-local/test/appshell-admin-boundary.test.mjs apps/bitcraft-local/test/responsive-layout-boundary.test.mjs
git commit -m "style: refresh bot and admin navigation"
```

### Task 3: Standardise Bot forms, states, and sensitive/destructive controls

**Files:**
- Modify: `apps/bitcraft-local/src/components/bot/DiscordSetupSection.tsx`
- Modify: `apps/bitcraft-local/src/components/bot/DiscordChannelsSection.tsx`
- Modify: `apps/bitcraft-local/src/components/bot/DiscordNotificationsSection.tsx`
- Modify: `apps/bitcraft-local/src/components/bot/DiscordTestsPanel.tsx`
- Modify: `apps/bitcraft-local/src/components/bot/DiscordDiagnosticsPanel.tsx`
- Modify: `apps/bitcraft-local/src/components/bot/DiscordModerationSection.tsx`
- Modify: `apps/bitcraft-local/src/components/bot/DiscordSafetySection.tsx`
- Modify: `apps/bitcraft-local/src/components/bot/DiscordMemberRecordsSection.tsx`
- Modify only when directly needed: other files under `apps/bitcraft-local/src/components/bot/`
- Modify: `apps/bitcraft-local/src/styles/discord-admin.css`
- Modify: `apps/bitcraft-local/src/styles/setup-workflow.css`
- Modify: `apps/bitcraft-local/src/styles/bot-dashboard.css`
- Modify: `apps/bitcraft-local/test/css-ownership.test.mjs`
- Modify: `apps/bitcraft-local/test/admin-action-confirmation.test.mjs`
- Modify: `apps/bitcraft-local/test/state-feedback-boundary.test.mjs`
- Modify: `apps/bitcraft-local/test/bot-discord-test-results-boundary.test.mjs`

**Interfaces:**
- Consumes: shared `BotStatusInfo`, `ActionButton`, `ConfirmAdminActionDialog`, `Dialog`, `.field`, `.toggle-line`, `.form-card`, and pending-action state.
- Produces: consistent `.bot-form-section`, `.bot-form-grid`, `.bot-sensitive-field`, `.bot-danger-zone`, `.bot-section-status`, and `.bot-sticky-actions`.
- Preserves: current APIs, form drafts, validation, saved/error feedback, and confirmation behaviour.

- [ ] **Step 1: Write failing shared-form tests**

Require the high-risk sections to use shared visual roles:

```js
for (const file of [
  "DiscordSetupSection.tsx", "DiscordNotificationsSection.tsx",
  "DiscordModerationSection.tsx", "DiscordSafetySection.tsx",
  "DiscordDiagnosticsPanel.tsx",
]) {
  const source = readFileSync(new URL(`../src/components/bot/${file}`, import.meta.url), "utf8");
  assert.match(source, /bot-form-section|bot-section-status/, file);
}
assert.match(moderation, /bot-danger-zone/);
assert.match(setup, /bot-sensitive-field/);
```

Keep current confirmation and pending-action assertions.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/css-ownership.test.mjs test/admin-action-confirmation.test.mjs test/state-feedback-boundary.test.mjs test/bot-discord-test-results-boundary.test.mjs
```

Expected: FAIL for missing shared form roles.

- [ ] **Step 3: Add visual roles to existing sections**

Add class names around existing headings, field groups, status summaries, action rows, sensitive inputs, and dangerous actions. Do not change input names, values, handlers, pending keys, or API methods.

- [ ] **Step 4: Standardise form layout**

Use two/three-column grids only when fields are short and related. Long text, IDs, diagnostics, and explanations span the available width. On phone every form is one column. Use `min-width: 0` and `overflow-wrap` for IDs/logs, not `word-break: break-all` on ordinary text.

- [ ] **Step 5: Make state feedback explicit**

Keep `BotStatusInfo` as the status vocabulary. Show pending, saved, warning, failed, and partially configured states using text/icon plus tone. Do not add a new `info` tone to `BotStatusInfo` unless its type/test contract is deliberately extended everywhere.

- [ ] **Step 6: Preserve sensitive/destructive safeguards**

Token/secret fields stay masked and are marked `.bot-sensitive-field`. Moderation kick/ban/purge and destructive admin actions remain in `.bot-danger-zone` and continue through `ConfirmAdminActionDialog` or their existing explicit confirmation path.

- [ ] **Step 7: Run focused tests and build**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/css-ownership.test.mjs test/admin-action-confirmation.test.mjs test/state-feedback-boundary.test.mjs test/bot-discord-test-results-boundary.test.mjs test/bot-craft-plan-reports-boundary.test.mjs test/bot-youtube-monitor-boundary.test.mjs test/modal-foundation-boundary.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: PASS.

- [ ] **Step 8: Commit Bot form/state styling**

```powershell
git add -- apps/bitcraft-local/src/components/bot apps/bitcraft-local/src/styles/discord-admin.css apps/bitcraft-local/src/styles/setup-workflow.css apps/bitcraft-local/src/styles/bot-dashboard.css apps/bitcraft-local/test/css-ownership.test.mjs apps/bitcraft-local/test/admin-action-confirmation.test.mjs apps/bitcraft-local/test/state-feedback-boundary.test.mjs apps/bitcraft-local/test/bot-discord-test-results-boundary.test.mjs
git commit -m "style: standardize bot control workflows"
```

### Task 4: Apply the visual system to main Admin and complete Bot/Admin verification

**Files:**
- Modify: `apps/bitcraft-local/src/components/admin/AdminPanel.tsx`
- Modify: `apps/bitcraft-local/src/components/admin/AdminStatusOverview.tsx`
- Modify: `apps/bitcraft-local/src/components/admin/AdminConfigurationNav.tsx`
- Modify: `apps/bitcraft-local/src/components/admin/AdminSectionNavigation.tsx`
- Modify: `apps/bitcraft-local/src/components/admin/AdminShellHeader.tsx`
- Modify: `apps/bitcraft-local/src/styles/admin.css`
- Modify: `apps/bitcraft-local/src/styles/server-health.css`
- Modify: `apps/bitcraft-local/src/styles/setup-workflow.css`
- Modify: `apps/bitcraft-local/test/admin-sections-boundary.test.mjs`
- Modify: `apps/bitcraft-local/test/admin-status-presentation.test.mjs`
- Modify: `apps/bitcraft-local/test/admin-loading-state.test.mjs`
- Modify: `apps/bitcraft-local/test/responsive-layout-boundary.test.mjs`

**Interfaces:**
- Preserves: main Admin tabs, permissions, status data, configuration sections, server health, loading/login states, Linked Accounts, and all mutations.
- Produces: consistent Admin header, status, navigation, workspace, loading, and mobile layouts using admin contextual mode.

- [ ] **Step 1: Add failing Admin visual-boundary tests**

Require Admin roots to use `.admin-workspace`, `.admin-status-grid`, `.admin-section-nav`, and `.admin-action-bar`; keep all current section and permission assertions.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/admin-sections-boundary.test.mjs test/admin-status-presentation.test.mjs test/admin-loading-state.test.mjs test/responsive-layout-boundary.test.mjs
```

Expected: FAIL for missing visual roles.

- [ ] **Step 3: Apply shared Admin hierarchy**

Use status/health first, then section navigation and selected workspace. Restyle login/loading with the same token system and reduced motion; remove promotional-scale effects that compete with operational state.

- [ ] **Step 4: Run complete focused Bot/Admin tests and build**

```powershell
corepack pnpm --filter @workspace/bitcraft-local exec node --experimental-strip-types --test test/bot-health.test.mjs test/bot-health-boundary.test.mjs test/bot-section-nav-boundary.test.mjs test/bot-section-state.test.mjs test/admin-sections-boundary.test.mjs test/admin-status-presentation.test.mjs test/admin-loading-state.test.mjs test/admin-action-confirmation.test.mjs test/state-feedback-boundary.test.mjs test/modal-foundation-boundary.test.mjs test/responsive-layout-boundary.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: PASS.

- [ ] **Step 5: Browser-check main Admin and every Bot section**

Use authenticated local/safe data without executing external actions. Inspect main Admin and `/bot` at 1440×900, 1024×768, 768×1024, and 390×844. Cover every Bot section id, healthy and exception states, missing token/gateway error, signed-out/login/loading, long diagnostics, long channel/role names, pending buttons, validation error, sensitive fields, confirmation dialogs, and mobile section picker.

- [ ] **Step 6: Confirm no external side effects occurred**

Do not click send/test/sync/moderation actions against production Discord. Use read-only inspection or existing mocked/dry-run test paths. Record this explicitly in verification notes.

- [ ] **Step 7: Commit Admin completion**

```powershell
git add -- apps/bitcraft-local/src/components/admin apps/bitcraft-local/src/styles/admin.css apps/bitcraft-local/src/styles/server-health.css apps/bitcraft-local/src/styles/setup-workflow.css apps/bitcraft-local/test/admin-sections-boundary.test.mjs apps/bitcraft-local/test/admin-status-presentation.test.mjs apps/bitcraft-local/test/admin-loading-state.test.mjs apps/bitcraft-local/test/responsive-layout-boundary.test.mjs
git commit -m "style: complete admin visual refresh"
```
