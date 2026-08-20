# Admin UX/UI Overhaul Design

Date: 2026-08-20

## Goal

Make the complete administration experience faster to enter, easier to navigate, safer to operate, and usable on narrow screens while preserving every current administrative capability.

The work covers both the main Admin Console at `/?page=admin` and the dedicated Discord Bot Control console at `/bot`.

## Context

A visual inspection covered all 13 main-admin views and all 16 Discord-admin sections at 1440px and 390px. The existing interface has a coherent dark visual system, logical primary grouping, labelled form controls, useful empty states, and strong operational density. The remaining problems are concentrated in startup latency, information architecture, configuration scale, expected integration failures, action safety, navigation semantics, and the Discord mobile layout.

This design extends the earlier `2026-06-30-admin-ux-cleanup-design.md`. Its grouped navigation remains the foundation; this work completes the deeper restructuring that the earlier in-place cleanup deliberately left out.

## Approved Product Direction

Use an in-place overhaul built from focused React components and existing CSS patterns. Keep the current React, TypeScript, plain-CSS, Node HTTP, and SQLite stack. Keep all current admin routes and permissions unless this design explicitly changes the presentation of an expected Discord-unavailable state.

Do not introduce a router, component framework, styling system, or state library. Do not remove working controls. Do not change production data, authentication rules, Discord moderation permissions, or background jobs.

## Success Criteria

- Authenticated admin content appears as soon as the session request completes; there is no fixed minimum delay.
- A missing Discord token produces an actionable unavailable state, not an HTTP 500 or duplicate generic error banner.
- The selected Discord section is reachable within one interaction on a 390px viewport and does not sit below the full section list.
- No corrupted emoji or mojibake appears in Role Panels or their Discord previews.
- Main and Discord admin navigation expose the current page semantically and support keyboard operation.
- Every primary and secondary admin view has a stable query-string deep link.
- Configuration is divided into focused categories with no more than roughly 15 primary controls visible at once, excluding repeated access-rule rows.
- Dirty configuration state and save scope are explicit. Navigation warns before discarding unsaved changes.
- Expected empty, disabled, stale, degraded, and failed states are visually distinct.
- Destructive actions require an impact summary and explicit confirmation before the mutation is submitted.
- No administration view creates horizontal document overflow at 390px.

## Information Architecture

### Main Admin Console

Retain the four approved work areas:

- Operations: Status, Server Health, Configuration, Diagnostics
- Insights: Analytics, Empire Membership, Database
- Access: Administrators, Linked Accounts, Audit
- Maintenance: Backups

Render them inside a focused admin shell. On the admin route, collapse the public application sidebar by default and omit the public footer and optional analytics-consent interruption. Keep a clear `Return to app` action and allow the public sidebar to be reopened when needed.

The current work area and page remain visible in the header. Buttons that behave as pages expose `aria-current="page"`; they are not presented as ARIA tabs unless the implementation also supplies complete tab keyboard behavior.

Use stable query parameters:

- `?page=admin&admin=status`
- `?page=admin&admin=configuration&config=general`
- `?page=admin&admin=analytics`

Invalid or unauthorized values fall back to the first permitted view and replace the URL without adding a history entry.

### Configuration

Split Configuration into five categories:

1. General: settlement identifiers, BitCraft Sync URL, opening page, active regions, browser refresh, and reconciliation cadence.
2. Access & Privacy: page access rules, IP retention, analytics retention, and GeoIP configuration.
3. Notifications: browser toast defaults, market deal-watch defaults, and app popups.
4. Integrations: craft-planning administration and member tracking.
5. Branding: app logo and favicon.

Use a compact secondary navigation row on desktop and a labelled select control on narrow screens. Preserve the existing server payload and existing specialized save endpoints. Each category displays its own save action when it owns a distinct endpoint. The shared application-settings draft uses one sticky save bar that states which category contains unsaved changes.

Before changing category, main admin page, or leaving the browser with unsaved shared settings, present a confirmation to discard changes or remain on the page. Successful saves clear the dirty state and announce the result through the existing live status messaging.

### Discord Bot Control

Keep the existing six groups and sixteen tools. Desktop retains the grouped side rail, made sticky within the console viewport. Mobile replaces the entire side rail with:

- a sticky section header,
- a labelled `Discord tool` select containing optgroups for the six groups,
- an optional `Browse tools` drawer for descriptions.

The selected tool renders immediately below this compact navigator. Summary metrics and setup workflow become horizontally scrollable compact cards on narrow screens rather than a tall stack. The console stores the selection as it does today and additionally deep-links it as `/bot?section=community`.

The outer `Bot Console`, `Discord Bot Control`, and `Linked Accounts` navigation is restyled as one clear primary navigation level. Only the selected destination receives the highlighted state.

## Startup and Integration States

Remove the three-second `authLoaderMinimumActive` timer. Render no loader for a session response that completes within 250ms. After 250ms, show the existing accessible session loader until the request settles.

Discord discovery must distinguish these outcomes:

- configured and available: return discovery data;
- token not configured or Discord startup disabled: return HTTP 200 with `available: false`, a stable reason code, empty collections, and a setup message;
- configured but Discord request failed: retain an error response and show a retryable degraded-state message.

The disabled state must not create a console error. It displays one inline setup notice near the Discord summary, and section controls that require discovery explain their prerequisite. Existing settings that contain unknown IDs remain visible as unknown configured values.

## Authentication Clarity

The public application session and administrator session are separate. The admin shell labels them separately:

- `Admin session: <administrator>`
- `Public account: Not connected` or the connected Discord/character identity

Do not use the generic `Not signed in` card as the dominant identity message while an administrator is authenticated. The optional analytics-consent dialog does not block an authenticated admin route; it remains available from Privacy & Analytics and continues to appear on public routes according to the current policy.

## Status and Health Hierarchy

Status and Server Health use three ordered groups:

1. Needs action: failed checks, configured services that are down, stale critical data, and blocked jobs.
2. Degraded or unavailable: optional integrations not configured, collectors unavailable in local development, and stale non-critical telemetry.
3. Healthy: current Relay generation, successful services, database availability, and normal jobs.

The first viewport shows the setup checklist, actionable conditions, and four primary health metrics. Detailed provider fields, scheduler metadata, endpoint timings, processes, and logs remain available in collapsible sections. Local-development-only unavailability is labelled as such instead of reading like a production incident.

Impossible or stale combinations such as `scheduler disabled` with an old `next run` date display `Not scheduled while disabled`; raw timestamps may remain in expanded detail.

## Actions, Forms, and Feedback

Adopt these shared rules across main and Discord administration:

- Primary actions appear once per section and use consistent placement.
- Controls remain disabled until their prerequisites are satisfied, with a nearby reason.
- Long forms group related controls under descriptive headings and keep labels above fields.
- Save operations expose pending, success, and error states through the existing pending-action and live-message infrastructure.
- The sticky save bar never covers form controls or the floating support control.
- Empty states include the safest relevant next action when one exists.

Destructive actions—including analytics clearing, session clearing, administrator disabling, warning clearing, purge, kick, ban, role deletion, backup deletion if added later, and diagnostics clearing—open a shared viewport-fixed confirmation dialog. The dialog names the target, describes the effect, identifies reversibility, and requires a specific confirmation button. High-impact Discord actions retain audit reasons and existing permission checks.

## Tables and Dense Data

Retain the current desktop data-table density. On narrow screens, tables use a bounded horizontal scroller with the first identifying column sticky where practical. Search, row count, and filters stay above the table. Empty tables render one row-spanning empty state instead of an otherwise blank header grid.

Database and analytics views keep exports and filters. Destructive `Clear Data` is separated from period/filter controls and placed in an overflow or danger area.

## Accessibility

- Every navigation region has a unique accessible label.
- Page-like navigation buttons use `aria-current="page"`.
- Mobile selects have visible labels.
- Expanders expose `aria-expanded` and `aria-controls`.
- Dialogs use the existing fixed modal foundation, move focus inside, restore focus on close, close on Escape when safe, and prevent background interaction.
- Pending and completion messages use appropriate polite live regions; destructive failures use alerts.
- Icon-only controls have accessible names and tooltips.
- Focus indicators remain visible against the dark theme.
- Status never relies on colour alone; each state includes text and an icon.

## Component Boundaries

Create focused modules rather than adding more unrelated rendering to `AdminPanel.tsx`:

- `AdminShellHeader`: admin/public identity, environment, return-to-app, and sign-out actions.
- `AdminSectionNavigation`: work-area and page navigation with URL synchronization.
- `AdminConfigurationSection`: category navigation, shared dirty-state guard, and composition of current configuration cards.
- `AdminStatusOverview`: severity grouping and collapsible operational detail.
- `ConfirmAdminActionDialog`: shared destructive-action confirmation.
- `BotMobileSectionNav`: mobile Discord section picker and browse drawer.
- Small pure helpers for URL state, severity classification, and Discord availability normalization.

Existing specialized components such as `AdminAccessSection`, `AdminAnalyticsSection`, `AdminDataSection`, `ServerHealthSection`, and the Discord section components remain authoritative for their domain content.

## Error Handling

- Invalid URL state falls back safely and updates the URL.
- A failed background refresh preserves the last rendered data and displays a retry action.
- Expected disabled integrations do not emit global error banners.
- Mutations preserve the draft and dirty state after failure.
- Navigation away from a dirty draft requires confirmation; failed saves never silently discard changes.
- Read-only smoke review mode displays a visible `Read-only review` badge and disables mutation controls when the server exposes that state, while the server guard remains authoritative.

## Testing Strategy

Use test-driven development at pure and component-boundary seams:

- URL parsing and serialization for admin and Discord sections.
- Discord availability normalization and disabled response behavior.
- Status severity classification and stale scheduler presentation.
- Configuration category metadata and dirty-navigation guard.
- Bot mobile navigation structure and accessible current-state semantics.
- Shared destructive-confirmation boundary and modal CSS.
- Mojibake regression for default Role Panel emoji values.
- Smoke-review read-only state presentation when applicable.

Run the focused tests during each task, the app build regularly, and the complete test suite once at the end. Browser verification must cover every main-admin page and Discord tool at 1440px and 390px, keyboard navigation of both navigation systems, loading and disabled Discord states, dirty configuration navigation, and at least one non-mutating confirmation-dialog rendering path.

## Non-Goals

- No change to production authentication or permission policy.
- No redesign of public settlement pages.
- No new Discord moderation capability.
- No new server framework, router, state library, CSS framework, or component library.
- No database schema changes for the UX overhaul.
- No production deployment, changelog, or version bump unless separately requested.

## Delivery Order

1. Fix emoji encoding, startup delay, and Discord-disabled response semantics.
2. Add URL state and semantic navigation foundations.
3. Implement the compact mobile Discord navigator and summary layout.
4. Split Configuration and add dirty-state/save behavior.
5. Introduce the focused admin shell and identity clarification.
6. Add status severity hierarchy and collapsible detail.
7. Standardize destructive confirmations, table responsiveness, and accessibility details.
8. Run complete automated and visual verification, then perform code review.
