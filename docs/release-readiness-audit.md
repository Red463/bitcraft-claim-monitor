# Release Readiness Audit

Status date: 2026-06-28

This audit tracks public-release readiness for the maintained app at `apps/bitcraft-local`. It records evidence from the current codebase and the remaining work that must be verified before the release-readiness goal can be marked complete.

## Current Structure Findings

| Area | Current state | Release decision |
| --- | --- | --- |
| `src/main.tsx` | Small bootstrap file that imports styles and renders `AppShell`. | Keep as-is. It is already the right boundary. |
| `src/AppShell.tsx` | About 3,057 lines. Owns app chrome, global refresh, admin shell, auth, settings, analytics, and notifications. | Still large, but acceptable as top-level orchestration while page/admin internals are gradually extracted. Avoid adding page-specific logic here. |
| `src/pages/MainPages.tsx` | About 2,697 lines after extracting activity, map, member identity, and market analytics helpers. Still contains Dashboard, Inventory, Market, Production, Public Craft Finder, Leaderboard, Map, and Activity components. | Continue shrinking it. Keep it temporarily as shared legacy page glue until individual pages can be extracted safely. |
| `server.mjs` | Single large Node service, about 504 KB. Owns static serving, BitJita proxy, SQLite schema, prepared statements, local/admin APIs, auth, Discord, analytics, collectors, backups, and scheduled jobs. | Needs a deliberate server-module split, but risky to split casually. Prioritize tests around route/auth/persistence boundaries before moving code. |
| `src/styles.css` | Large global stylesheet, now about 6,920 lines, containing tokens, layout, navigation, tables, page-specific sections, responsive rules, and admin/bot styles. Notification and user-settings UI styles have been extracted. | Needs continued CSS audit and incremental extraction. Avoid broad formatting churn; split only stable sections with clear ownership. |
| `src/styles/phase6.css` | Small focused module for setup/workflow polish. | Keep as an existing focused module, but the name is not descriptive enough for future modules. |
| `src/styles/user-settings.css` | Focused module for the browser settings dialog, account-linking cards, theme editor, and settings-specific responsive rules. | Keep feature-owned settings styles out of the global stylesheet. |
| `src/styles/notifications.css` | Focused module for toast stack, notification drawer, notification badge, notification sound settings, and responsive notification overrides. | Keep as the pattern for feature-owned stylesheet modules with clear ownership. |
| Notifications | Rendering and generation have been split into `src/components/main/Notifications.tsx` and `src/notifications/`. | Architecture is improved, but full browser/page matrix verification is still required. |

## Completed Release-Readiness Improvements

- Extracted pure notification creation, dedupe, source drafting, unseen selection, market activity source, signed-in deal-alert source, production queue diff, toast-stack, persisted-log, and drawer read-state helpers.
- Extracted activity summary/diff/toast helpers into `src/pages/activity/activityUtils.ts`.
- Extracted map URL and resource-token helpers into `src/pages/map/mapUtils.ts`.
- Extracted market analytics transforms into `src/pages/market/marketAnalytics.ts`.
- Extracted member identity helpers into `src/utils/memberIdentity.ts`.
- Added focused tests for notification, activity, map, member identity, and market analytics behavior.
- Added notification architecture documentation in `docs/notification-system.md`.
- Added this audit and the developer guide to make the current architecture and remaining release blockers explicit.
- Replaced the generic `.env.example` with app-specific environment variables and secret placeholders.
- Fixed the `admin` role permission set so non-owner administrators can access admin-user management routes that require `users.manage`, while viewer-level users remain denied.
- Extracted notification UI styles into `src/styles/notifications.css` so toast, drawer, badge, sound-setting, and responsive notification rules have clear ownership.
- Extracted user settings and theme-editor UI styles into `src/styles/user-settings.css` so settings-specific selectors are no longer mixed into the global stylesheet.
- Added `src/notifications/userToastSettings.ts` for pure browser toast defaults and normalization so corrupted persisted notification booleans, tone IDs, or volume values fall back to safe browser settings before UI use, account save/load, and playback.

## Architecture Decisions

- Keep `main.tsx` as the startup boundary only.
- Keep notification sources mounted at `AppShell` level so in-app toasts are not tied to visible page components.
- Keep page-owned pure helpers beside page folders before extracting full components.
- Keep `server.mjs` monolithic until a server split can be backed by route and persistence tests.
- Keep normal page rendering on live BitJita data through the local proxy; SQLite remains the source for history, notifications, analytics, diagnostics, cached tools, and admin/server state.
- Prefer last-known-good or cached helper data only when the UI clearly shows freshness or stale state.

## CSS And UX Audit Notes

Evidence from the current stylesheet shows reusable tokens and focus rules already exist, including CSS variables for colors, radii, control heights, focus rings, and z-indexes. Sidebar, tables, market, broad responsive rules, and admin/bot styles are still bundled in `styles.css`; notification toast/drawer/sound styles now live in `src/styles/notifications.css`, and browser settings/theme-editor styles now live in `src/styles/user-settings.css`.

Remaining CSS work:

- Identify unused or duplicate selectors before deletion.
- Split stable page-specific sections only after the related page/component boundary is clear.
- Review responsive behavior for the main dashboard pages and bot/admin pages in browser screenshots.
- Check contrast, focus states, disabled/loading states, stale-data states, and table overflow on desktop and mobile.
- Rename future stylesheet modules by feature or component rather than phase number.

## Notification Audit Notes

Supported browser in-app notification types are documented in `docs/notification-system.md`:

- Market listing toasts.
- Market sale toasts.
- Market deal alert toasts.
- Production started and completed toasts.

Current automated coverage verifies pure generation, settings gating, source-key dedupe, unseen selection, market activity source queueing, signed-in deal-alert source queueing, production queue diffing, visible toast-stack caps, persisted notification-log caps, duplicate replacement, drawer read-state marking, and browser toast setting normalization. Browser smoke verification now also proves market listing and market sale toasts plus drawer persistence on Dashboard, Leaderboard, Members, Professions, Production, Inventory, Construction, Research, Market, Region, Map, Sync, Activity, Public Craft Finder, Craft Calculator, and Admin. The dedicated `/bot` route intentionally mounts `BotControlApp` without the main app notification chrome, so bot-route browser notifications are not currently supported. Remaining notification blockers are production started/completed notifications, market deal alerts with a signed-in Discord-linked user, settings/sound/dismissed-state verification, and drawer open/closed verification across representative pages.

## Security And Config Notes

Current documented safeguards and verified findings:

- Admin pages use server-side sessions and CSRF tokens for mutations.
- Admin routes have role permissions; the `admin` role now includes `users.manage`, and server tests verify an `admin` user can list admin users while a `viewer` user receives `403`.
- Discord admin login is the normal production path; legacy password setup is compatibility-only.
- Discord bot tokens should come from environment variables or protected `app_secrets`, not public settings responses.
- GeoIP license keys are returned to the frontend as configured/not-configured state unless the server explicitly requests secrets internally.
- The admin table browser excludes `app_secrets`.
- Production data lives outside the Git checkout at `/var/lib/bitcraft-claim-monitor`.
- Node should remain bound to localhost behind Caddy in production.
- `git check-ignore` covers local SQLite files, local env files, `.codex-dev/`, and `outputs/`.
- Tracked-file scan found no SQLite databases or log files committed; only `.env.example` matched the environment/data filename pattern.
- Token/private-key pattern scan found no committed Discord-token or private-key shaped literals in tracked source/docs outside documented placeholders and server secret plumbing.

Remaining security/config work:

- Repeat the targeted secret scan before final release, especially after any deployment or Discord changes.
- Re-check deployment docs, `.gitignore`, and admin settings responses before final release.
- Verify notification payloads do not expose admin secrets, Discord bot tokens, setup keys, or private admin diagnostics to unauthenticated users.

## Verification Status

Most recent verified checks in this release-readiness pass:

- Focused notification source tests: `node --experimental-strip-types --test test/notifications.test.mjs` passed with 14 tests after extracting market activity, deal-alert, production source queue, toast-stack, persisted-log, and drawer read-state helpers.
- Focused notification sound/settings tests: `node --experimental-strip-types --test test/notification-sounds.test.mjs` passed with 3 tests after adding persisted setting normalization for notification gates, unknown tones, and out-of-range volumes.
- Focused server integration test: `node --experimental-strip-types --test test/server.test.mjs` passed after the admin-role permission fix.
- Full production build: `corepack pnpm --filter @workspace/bitcraft-local run build` passed.
- Full app test suite: `corepack pnpm --filter @workspace/bitcraft-local test` passed with 49 tests.
- `git diff --check` passed for this slice, with only Windows CRLF warnings from Git.
- Targeted secret/config checks covered tracked runtime data, ignored local data/env files, documented secret placeholders, and private-key/token-shaped literals.
- Browser smoke notification probe verified market listing and market sale toasts plus drawer persistence across 16 main app pages and Admin; `/bot` was verified as a documented exception because it does not mount `DashboardApp`. Later built-app smoke checks loaded Dashboard, Activity, Market, and Production with notification chrome present and no browser console errors after the AppShell notification-source extraction, verified the split notification stylesheet still applies drawer overlay, drawer panel, notification button, and toast-stack styles, verified the extracted user-settings stylesheet still applies the settings dialog, preferences sound controls, and expanded theme editor styles, and verified the AppShell toast-setting normalization wiring renders Preferences with sane default sound controls and no console errors.

Run the full app build and full test suite again before the next push or final release claim if additional code changes are made.

## Remaining Release Blockers

The release-readiness goal is not complete until all of these are done with current evidence:

- Browser smoke verification is complete for market listing and market sale notifications on Dashboard, Leaderboard, Members, Professions/Skills, Production, Inventory/Storage, Construction, Research, Market, Region, Map, Sync, Activity, Admin, Public Craft Finder, and Craft Calculator.
- Full notification matrix verification is still required for production started/completed notifications and market deal alerts, including drawer open/closed, settings, sound behavior, dedupe, dismissed state, navigation, and refresh behavior.
- The dedicated Discord/bot route is verified to lack main app notification chrome by design; redesign it or keep the documented exception before final release.
- CSS audit with concrete fixes or documented decisions for unused, duplicate, fragile, or page-owned styles.
- Server architecture audit backed by tests before any meaningful `server.mjs` split.
- Public-release security/config scan should be repeated before final release.
- Fresh build and full test run after the remaining code changes.
