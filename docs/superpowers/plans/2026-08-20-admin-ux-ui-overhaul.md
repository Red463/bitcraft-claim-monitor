# Admin UX/UI Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the complete approved admin UX/UI overhaul for the main Admin Console and Discord Bot Control console.

**Architecture:** Keep `AdminPanel` as the authenticated orchestration boundary while moving navigation, configuration presentation, status classification, destructive confirmation, and Discord mobile navigation into focused modules. Preserve existing API payloads and mutations; add pure helpers for URL and state normalization so the behavior is testable without a browser.

**Tech Stack:** React, TypeScript, Vite, plain CSS, Node HTTP, Node test runner, Playwright browser verification.

**Spec:** `docs/superpowers/specs/2026-08-20-admin-ux-ui-overhaul-design.md`

## Global Constraints

- Preserve every working administrative capability and existing permission check.
- Do not add a router, component framework, styling system, state library, or database migration.
- Keep Discord moderation actions and delivery behavior unchanged.
- Use existing `Info`, `toolbar-button`, `field`, `toggle-line`, `form-card`, modal, and Lucide patterns.
- Render dialogs as viewport-fixed overlays with bounded internal scrolling.
- Keep the temporary smoke-review server loopback-only, isolated, and read-only.
- Run focused tests at each red-green cycle, the build regularly, and the complete test suite once at the end.

---

### Task 1: Navigation State and Semantic Foundations

**Files:**
- Create: `apps/bitcraft-local/src/components/admin/adminNavigationState.ts`
- Modify: `apps/bitcraft-local/src/components/admin/AdminPanel.tsx`
- Modify: `apps/bitcraft-local/src/components/bot/BotSectionNav.tsx`
- Test: `apps/bitcraft-local/test/admin-navigation-state.test.mjs`

**Interfaces:**
- Produces `parseAdminLocation(search)`, `adminSearchWithTab(search, tab, configSection?)`, `parseBotSectionLocation(search)`, and `botSearchWithSection(search, section)`.
- Consumers receive validated `AdminTab`, `ConfigurationSection`, and `BotSection` values; invalid values fall back to `status`, `general`, and `setup`.

- [ ] **Step 1: Write failing URL-state tests**

```js
test("admin navigation preserves unrelated query values and validates sections", () => {
  assert.deepEqual(parseAdminLocation("?page=admin&admin=configuration&config=privacy"), {
    tab: "configuration",
    configurationSection: "privacy",
  });
  assert.equal(adminSearchWithTab("?page=admin&foo=1", "analytics"), "?page=admin&foo=1&admin=analytics");
  assert.deepEqual(parseAdminLocation("?page=admin&admin=unknown&config=wrong"), {
    tab: "status",
    configurationSection: "general",
  });
});

test("bot navigation validates and serializes the selected section", () => {
  assert.equal(parseBotSectionLocation("?section=community"), "community");
  assert.equal(parseBotSectionLocation("?section=unknown"), "setup");
  assert.equal(botSearchWithSection("?foo=1", "diagnostics"), "?foo=1&section=diagnostics");
});
```

- [ ] **Step 2: Run the focused test and verify missing-module failure**

Run: `node --experimental-strip-types --test apps/bitcraft-local/test/admin-navigation-state.test.mjs`

- [ ] **Step 3: Implement literal allowlist parsing and URLSearchParams serialization**

```ts
export type ConfigurationSection = "general" | "privacy" | "notifications" | "integrations" | "branding";
export function parseAdminLocation(search: string): { tab: AdminTab; configurationSection: ConfigurationSection };
export function adminSearchWithTab(search: string, tab: AdminTab, configurationSection?: ConfigurationSection): string;
export function parseBotSectionLocation(search: string): BotSection;
export function botSearchWithSection(search: string, section: BotSection): string;
```

- [ ] **Step 4: Initialize AdminPanel from the URL, synchronize selection with replaceState, and apply `aria-current="page"` to active navigation buttons**

- [ ] **Step 5: Run the focused test and build**

Run: `node --experimental-strip-types --test apps/bitcraft-local/test/admin-navigation-state.test.mjs`

Run: `corepack pnpm --filter @workspace/bitcraft-local run build`

### Task 2: Startup, Discord Availability, and Emoji Defects

**Files:**
- Create: `apps/bitcraft-local/src/server/discordDiscoveryAvailability.mjs`
- Modify: `apps/bitcraft-local/server.mjs`
- Modify: `apps/bitcraft-local/src/components/admin/AdminPanel.tsx`
- Modify: `apps/bitcraft-local/src/server/discordSettings.mjs`
- Modify: `apps/bitcraft-local/src/settingsDefaults.ts`
- Test: `apps/bitcraft-local/test/discord-discovery-availability.test.mjs`
- Test: `apps/bitcraft-local/test/discord-role-panel-defaults.test.mjs`

**Interfaces:**
- Produces `unavailableDiscordDiscovery(reason, message)` with `available: false`, stable reason, message, and complete empty discovery collections.
- AdminPanel consumes `available`, `reason`, and `message` without emitting a global error for expected disabled states.

- [ ] **Step 1: Write failing tests for unavailable discovery and clean emoji defaults**

```js
test("disabled Discord discovery is a complete non-error envelope", () => {
  assert.deepEqual(unavailableDiscordDiscovery("token_missing", "Add a bot token in Setup."), {
    available: false,
    reason: "token_missing",
    message: "Add a bot token in Setup.",
    guild: null,
    bot: null,
    channels: [], roles: [], emojis: [], members: [],
    memberCount: 0,
    memberCountAvailable: false,
    memberCountError: "Add a bot token in Setup.",
  });
});

test("default role-panel emoji values contain no mojibake", () => {
  for (const panel of DEFAULT_ROLE_PANELS) {
    for (const option of panel.options) assert.doesNotMatch(option.emoji, /Ã|Â|Æ/);
  }
});
```

- [ ] **Step 2: Run both tests and verify the expected failures**

- [ ] **Step 3: Return the unavailable envelope with HTTP 200 when the token is absent or Discord startup is disabled**

- [ ] **Step 4: Replace the corrupted defaults with `1️⃣` and `2️⃣` in both server and browser defaults**

- [ ] **Step 5: Remove the fixed three-second loader and show it only after a 250ms delay while authentication remains pending**

```ts
const [showAuthLoader, setShowAuthLoader] = React.useState(false);
React.useEffect(() => {
  if (!authLoading) { setShowAuthLoader(false); return; }
  const timer = window.setTimeout(() => setShowAuthLoader(true), 250);
  return () => window.clearTimeout(timer);
}, [authLoading]);
```

- [ ] **Step 6: Run focused tests, build, and full server tests affected by the route change**

### Task 3: Discord Mobile Navigation and Summary Layout

**Files:**
- Create: `apps/bitcraft-local/src/components/bot/BotMobileSectionNav.tsx`
- Modify: `apps/bitcraft-local/src/components/bot/BotSectionNav.tsx`
- Modify: `apps/bitcraft-local/src/components/admin/AdminPanel.tsx`
- Modify: `apps/bitcraft-local/src/styles/bot-dashboard.css`
- Modify: `apps/bitcraft-local/src/styles/discord-admin.css`
- Test: `apps/bitcraft-local/test/bot-section-nav-boundary.test.mjs`
- Test: `apps/bitcraft-local/test/responsive-layout-boundary.test.mjs`

**Interfaces:**
- `BotMobileSectionNav({ active, onSelect })` renders a labelled optgroup select and a description drawer.
- Desktop and mobile navigation share `BOT_SECTION_DEFINITIONS`; only their presentation differs.

- [ ] **Step 1: Add failing boundary tests for a labelled mobile selector, grouped options, `aria-current`, and mobile summary scrollers**

- [ ] **Step 2: Verify the focused tests fail because the mobile component and CSS do not exist**

- [ ] **Step 3: Implement BotMobileSectionNav with a visible `Discord tool` label and optgroups derived from existing metadata**

- [ ] **Step 4: Render desktop navigation above 720px and mobile navigation at or below 720px without duplicating section content**

- [ ] **Step 5: Make mobile summary and workflow cards horizontal snap scrollers; make the desktop side rail sticky and internally bounded**

- [ ] **Step 6: Run focused tests and build**

### Task 4: Configuration Categories and Dirty-State Protection

**Files:**
- Create: `apps/bitcraft-local/src/components/admin/adminConfigurationState.ts`
- Create: `apps/bitcraft-local/src/components/admin/AdminConfigurationNav.tsx`
- Modify: `apps/bitcraft-local/src/components/admin/AdminPanel.tsx`
- Modify: `apps/bitcraft-local/src/styles/admin.css`
- Test: `apps/bitcraft-local/test/admin-configuration-state.test.mjs`
- Test: `apps/bitcraft-local/test/admin-sections-boundary.test.mjs`

**Interfaces:**
- Produces `CONFIGURATION_SECTIONS`, `configurationSectionForSetting(key)`, and `shouldConfirmConfigurationNavigation({ dirty, current, next })`.
- AdminPanel owns the existing draft and save functions; category components only choose which existing cards are visible.

- [ ] **Step 1: Write failing tests for five categories, setting ownership, and dirty-navigation decisions**

```js
assert.deepEqual(CONFIGURATION_SECTIONS.map(({ id }) => id), ["general", "privacy", "notifications", "integrations", "branding"]);
assert.equal(configurationSectionForSetting("refreshSeconds"), "general");
assert.equal(configurationSectionForSetting("visitorSecurity"), "privacy");
assert.equal(shouldConfirmConfigurationNavigation({ dirty: true, current: "general", next: "privacy" }), true);
```

- [ ] **Step 2: Verify focused RED**

- [ ] **Step 3: Implement category metadata and the responsive secondary navigation**

- [ ] **Step 4: Gate existing configuration cards by category without changing their API methods or field bindings**

- [ ] **Step 5: Add a sticky shared-settings save bar, `beforeunload` protection, and an in-app discard confirmation before category or admin-page changes**

- [ ] **Step 6: Run focused tests and build**

### Task 5: Focused Admin Shell and Identity Clarity

**Files:**
- Create: `apps/bitcraft-local/src/components/admin/AdminShellHeader.tsx`
- Create: `apps/bitcraft-local/src/components/admin/AdminSectionNavigation.tsx`
- Modify: `apps/bitcraft-local/src/components/admin/AdminPanel.tsx`
- Modify: `apps/bitcraft-local/src/components/AppShell.tsx`
- Modify: `apps/bitcraft-local/src/styles/admin.css`
- Modify: `apps/bitcraft-local/src/styles/app-chrome.css`
- Test: `apps/bitcraft-local/test/appshell-admin-boundary.test.mjs`

**Interfaces:**
- `AdminShellHeader` receives the authenticated admin, public account summary, environment, reconciliation state, and existing actions.
- AppShell applies an admin-route chrome modifier that collapses public navigation and suppresses public-only footer/analytics interruption.

- [ ] **Step 1: Add failing boundary assertions for separate admin/public identity labels, `Return to app`, and admin-focused chrome**

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Extract the admin header and grouped navigation while retaining current permissions and active metadata**

- [ ] **Step 4: Add the admin-route shell modifier, default-collapsed public sidebar, and public analytics-consent suppression on authenticated admin routes**

- [ ] **Step 5: Restyle the outer bot-console navigation as one primary level with exactly one highlighted destination**

- [ ] **Step 6: Run focused tests and build**

### Task 6: Severity-Led Status and Server Health

**Files:**
- Create: `apps/bitcraft-local/src/components/admin/adminStatusPresentation.ts`
- Create: `apps/bitcraft-local/src/components/admin/AdminStatusOverview.tsx`
- Modify: `apps/bitcraft-local/src/components/admin/AdminPanel.tsx`
- Modify: `apps/bitcraft-local/src/components/admin/ServerHealthSection.tsx`
- Modify: `apps/bitcraft-local/src/styles/admin.css`
- Modify: `apps/bitcraft-local/src/styles/server-health.css`
- Test: `apps/bitcraft-local/test/admin-status-presentation.test.mjs`

**Interfaces:**
- Produces `classifyAdminCondition(condition)` and `scheduledJobTimingLabel(job, schedulerEnabled)`.
- `AdminStatusOverview` receives current status data and existing refresh/reconciliation actions.

- [ ] **Step 1: Write failing literal tests for needs-action, degraded, healthy, local-development, and disabled-scheduler cases**

```js
assert.equal(classifyAdminCondition({ configured: true, ok: false, critical: true }), "action");
assert.equal(classifyAdminCondition({ configured: false, optional: true }), "degraded");
assert.equal(classifyAdminCondition({ ok: true }), "healthy");
assert.equal(scheduledJobTimingLabel({ nextRunAt: "2026-01-01T00:00:00Z" }, false), "Not scheduled while disabled");
```

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Implement pure presentation rules**

- [ ] **Step 4: Render ordered condition groups and move detailed provider, scheduler, timing, process, and log content into accessible expandable sections**

- [ ] **Step 5: Run focused tests and build**

### Task 7: Shared Destructive Confirmation, Tables, and Accessibility

**Files:**
- Create: `apps/bitcraft-local/src/components/admin/ConfirmAdminActionDialog.tsx`
- Create: `apps/bitcraft-local/src/components/admin/adminActionConfirmation.ts`
- Modify: `apps/bitcraft-local/src/components/admin/AdminPanel.tsx`
- Modify: relevant extracted admin and bot sections containing destructive actions
- Modify: `apps/bitcraft-local/src/styles/admin.css`
- Modify: `apps/bitcraft-local/src/styles/discord-admin.css`
- Test: `apps/bitcraft-local/test/admin-action-confirmation.test.mjs`
- Test: `apps/bitcraft-local/test/modal-foundation-boundary.test.mjs`
- Test: `apps/bitcraft-local/test/responsive-layout-boundary.test.mjs`

**Interfaces:**
- `AdminActionConfirmation` contains `title`, `target`, `impact`, `reversible`, `confirmLabel`, `tone`, and `onConfirm`.
- `ConfirmAdminActionDialog` is the only presentation path for destructive admin confirmation.

- [ ] **Step 1: Write failing tests for confirmation metadata validation and fixed modal/table responsive boundaries**

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Implement the confirmation metadata guard and focus-managed viewport-fixed dialog**

- [ ] **Step 4: Route analytics clearing, session clearing, administrator disabling, diagnostic clearing, warning clearing, purge, kick, ban, unban, and role deletion through the dialog**

- [ ] **Step 5: Separate destructive controls from filter toolbars, wrap every admin table in a bounded mobile scroller, and make the first identifying column sticky in analytics, database, empire-membership, and server-health tables**

- [ ] **Step 6: Audit navigation regions, expanders, icon buttons, live messages, and focus indicators against the spec**

- [ ] **Step 7: Run focused tests and build**

### Task 8: End-to-End Verification and Review

**Files:**
- Modify only files required by defects discovered during verification.

- [ ] **Step 1: Run every new focused test together**

Run: `node --experimental-strip-types --test apps/bitcraft-local/test/admin-navigation-state.test.mjs apps/bitcraft-local/test/discord-discovery-availability.test.mjs apps/bitcraft-local/test/discord-role-panel-defaults.test.mjs apps/bitcraft-local/test/admin-configuration-state.test.mjs apps/bitcraft-local/test/admin-status-presentation.test.mjs apps/bitcraft-local/test/admin-action-confirmation.test.mjs`

- [ ] **Step 2: Run the production build**

Run: `corepack pnpm --filter @workspace/bitcraft-local run build`

- [ ] **Step 3: Run the complete test suite**

Run: `corepack pnpm --filter @workspace/bitcraft-local test`

- [ ] **Step 4: Start the isolated read-only review server and verify mutation rejection**

Run: `node scripts/start-bitcraft-local-smoke.mjs --admin-review`

Verify GET `/api/local/admin/me` succeeds and unsafe admin methods plus `/api/local/market/event/resolve` return 403.

- [ ] **Step 5: Browser-check all 13 main-admin pages and 16 Discord tools at 1440x1000 and 390x844**

Confirm deep links, current-page semantics, mobile content position, disabled Discord state, dirty-navigation dialog, destructive confirmation rendering, no mojibake, no console errors for disabled Discord, and no horizontal overflow.

- [ ] **Step 6: Run code review against the approved spec and repository standards; fix every high- or medium-confidence regression**

- [ ] **Step 7: Re-run build and full tests after review fixes, then stop the temporary review server**
