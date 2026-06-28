# Release Readiness Audit

Status date: 2026-06-28

This audit tracks public-release readiness for the maintained app at `apps/bitcraft-local`. It records evidence from the current codebase and the remaining work that must be verified before the release-readiness goal can be marked complete.

## Current Structure Findings

| Area | Current state | Release decision |
| --- | --- | --- |
| `src/main.tsx` | Small bootstrap file that imports styles and renders `AppShell`. | Keep as-is. It is already the right boundary. |
| `src/AppShell.tsx` | About 3,057 lines. Owns app chrome, global refresh, admin shell, auth, settings, analytics, and notifications. | Still large, but acceptable as top-level orchestration while page/admin internals are gradually extracted. Avoid adding page-specific logic here. |
| `src/pages/MainPages.tsx` | About 2,661 lines after extracting activity, map, member identity, market analytics, best-seller sorting, market listing, and production craft helpers. Still contains Dashboard, Inventory, Market, Production, Public Craft Finder, Leaderboard, Map, and Activity components. | Continue shrinking it. Keep it temporarily as shared legacy page glue until individual pages can be extracted safely. |
| `server.mjs` | Single large Node service, about 504 KB / 9,390 lines after extracting route classification. Owns static serving, BitJita proxy/cache, SQLite schema/migrations, prepared statements, local/admin APIs, app/admin auth, Discord, analytics, collectors, backups, and scheduled jobs. | Needs further deliberate server-module splits. The first safe extraction is `src/server/httpRoutes.mjs`; route/auth/persistence boundaries must remain under test before moving larger code. |
| `src/styles.css` | Large global stylesheet, now 6,741 lines, containing tokens, layout, navigation, tables, page-specific sections, responsive rules, and admin/bot styles. Notification, app-chrome, and user-settings UI styles have been extracted. | Needs continued CSS audit and incremental extraction. Avoid broad formatting churn; split only stable sections with clear ownership. |
| `src/styles/phase6.css` | Small focused module for setup/workflow polish. | Keep as an existing focused module, but the name is not descriptive enough for future modules. |
| `src/styles/app-chrome.css` | Focused module for floating app tools, shared help/legal dialogs, Discord sign-in dialog, cookie consent, command palette shell, and their mobile overrides. | Keep shared app-chrome overlays out of the global stylesheet; preserve the import order after global tokens and before notification overlays. |
| `src/styles/user-settings.css` | Focused module for the browser settings dialog, account-linking cards, theme editor, and settings-specific responsive rules. | Keep feature-owned settings styles out of the global stylesheet. |
| `src/styles/notifications.css` | Focused module for toast stack, notification drawer, notification badge, notification sound settings, and responsive notification overrides. | Keep as the pattern for feature-owned stylesheet modules with clear ownership. |
| Notifications | Rendering and generation have been split into `src/components/main/Notifications.tsx` and `src/notifications/`. | Architecture is improved, but full browser/page matrix verification is still required. |

## Completed Release-Readiness Improvements

- Extracted pure notification creation, dedupe, source drafting, unseen selection, market activity source, signed-in deal-alert source, production queue diff, toast-stack, persisted-log, and drawer read-state helpers.
- Extracted activity summary, diff, toast, and activity-log cleanup helpers into `src/pages/activity/activityUtils.ts`.
- Extracted production craft activity-window, progress-key, and metrics helpers into `src/pages/production/productionUtils.ts`.
- Extracted map URL and resource-token helpers into `src/pages/map/mapUtils.ts`.
- Extracted market analytics transforms and best-seller sort helpers into `src/pages/market/marketAnalytics.ts`, plus market listing display, age, and tracking helpers into `src/pages/market/listingUtils.ts`.
- Extracted member identity helpers into `src/utils/memberIdentity.ts`.
- Added focused tests for notification, activity, map, member identity, market analytics, and market listing helper behavior.
- Added notification architecture documentation in `docs/notification-system.md`.
- Added this audit and the developer guide to make the current architecture and remaining release blockers explicit.
- Replaced the generic `.env.example` with app-specific environment variables and secret placeholders.
- Fixed the `admin` role permission set so non-owner administrators can access admin-user management routes that require `users.manage`, while viewer-level users remain denied.
- Extracted notification UI styles into `src/styles/notifications.css` so toast, drawer, badge, sound-setting, and responsive notification rules have clear ownership.
- Extracted user settings and theme-editor UI styles into `src/styles/user-settings.css` so settings-specific selectors are no longer mixed into the global stylesheet.
- Extracted shared app-chrome styles into `src/styles/app-chrome.css` so floating tools, shared dialogs, cookie consent, and command palette shell styles have a named owner outside the global stylesheet.
- Added `src/notifications/userToastSettings.ts` for pure browser toast defaults and normalization so corrupted persisted notification booleans, tone IDs, or volume values fall back to safe browser settings before UI use, account save/load, and playback.
- Extracted server route classification into `src/server/httpRoutes.mjs` with focused tests, giving the first small dependency-free server helper module before larger route/auth/database splits.

## Architecture Decisions

- Keep `main.tsx` as the startup boundary only.
- Keep notification sources mounted at `AppShell` level so in-app toasts are not tied to visible page components.
- Keep page-owned pure helpers beside page folders before extracting full components.
- Keep `server.mjs` monolithic until each moved route group has injection-friendly helpers and route/persistence tests that preserve auth, CSRF, cache, and background-job behavior.
- Keep normal page rendering on live BitJita data through the local proxy; SQLite remains the source for history, notifications, analytics, diagnostics, cached tools, and admin/server state.
- Prefer last-known-good or cached helper data only when the UI clearly shows freshness or stale state.

## Server Architecture Audit Notes

`server.mjs` is still the largest release-readiness risk. The current file has several stable conceptual regions that can become modules, but most of them share the same SQLite handle, prepared statements object, settings helpers, rate-limit maps, cache maps, and request helpers. Splitting by copying chunks would be risky; the safer path is dependency-injected modules that receive a small server context instead of importing global state directly. The first extracted helper, `src/server/httpRoutes.mjs`, is intentionally dependency-free and owns route classification plus static-asset visitor logging decisions.

Current evidence:

- Environment, data-directory setup, SQLite schema creation, migrations, seeded defaults, and prepared statements live near the top of `server.mjs`. The prepared statement block mixes settings, admin sessions, app user sessions, analytics, production, market, Discord delivery, moderation, scheduled jobs, and cached payloads.
- Route classification and static-asset visitor logging now live in `src/server/httpRoutes.mjs`; focused tests cover admin, auth, Discord, BitJita proxy, local API, static asset, and app-route classifications.
- Authentication and security helpers are already clustered enough to extract later: admin session lookup, app user sessions, Discord OAuth, role permissions, same-origin checks, and CSRF checks are near each other.
- Discord behavior is large and mixed: message delivery, role panels, moderation, custom commands, component handling, OAuth-backed admin/user state, and interaction handling are in one file but mostly grouped by function families.
- Collector and scheduled-job behavior is also grouped enough to split later: recipe catalog refresh, GeoIP refresh, market deal watch jobs, regional buy-order baselines, production contribution collection, storage activity, current-claim refresh, and server snapshot polling are identifiable domains.
- The main `createServer` dispatcher is an ordered route chain. Public health/proxy/config endpoints must remain before admin routes; static frontend fallback must remain after API handling so API typos do not return `index.html`.

Current automated coverage that protects a future split:

- `test/server-route-groups.test.mjs` covers the extracted route classification helper directly.
- `test/server.test.mjs` starts the real server in a child process with an isolated data directory and mocked upstream BitJita service.
- The integration test covers security headers, BitJita proxy cache/dedupe/stale-if-error behavior, cached local helper endpoints with freshness metadata, admin setup/login/roles/CSRF, scheduled jobs, GeoIP, analytics, market deal watches and alerts, polling, activity/history, production data protection, and notification-activity filtering.
- A separate background-polling test verifies upstream failures do not terminate the server process.

Recommended split order:

1. Continue extracting dependency-free HTTP helpers after `httpRoutes.mjs`: security headers, request parsing, response helpers, cookies, CSRF, and rate-limit helpers without changing behavior.
2. Move SQLite schema/migrations and prepared statements into a database module that returns `{ db, statements }`; do not let route modules open their own database handles.
3. Extract auth/session/permission helpers with tests for owner/admin/viewer behavior and same-origin/CSRF rejection.
4. Extract the BitJita proxy/cache module with the existing cache, dedupe, stale-if-error, timeout, and response-header tests preserved.
5. Extract scheduled jobs and collectors behind a small service API so long-running work remains outside request lifetimes.
6. Extract Discord service functions separately from admin route handlers; keep real Discord delivery mocked or disabled in tests.
7. Split the route dispatcher last into small route modules registered in the same order as today.

Do not split `server.mjs` further until a fresh server test run passes after each step. Any route extraction should keep admin mutations behind `requireAdmin`, `requireAdminMutation`, and `requireAdminPermission`; preserve the public/private distinction for app user endpoints; keep bot tokens and OAuth secrets out of public settings responses; and keep expensive API-heavy work behind cache/rate-limit/background-job boundaries.

## CSS And UX Audit Notes

Evidence from the current stylesheet shows reusable tokens and focus rules already exist, including CSS variables for colors, radii, control heights, focus rings, and z-indexes. The active CSS entrypoints are imported from `src/main.tsx` in this order: `src/styles/phase6.css`, `src/styles.css`, `src/styles/app-chrome.css`, `src/styles/user-settings.css`, and `src/styles/notifications.css`. Current module sizes are `styles.css` at 6,741 lines, `phase6.css` at 162 lines, `app-chrome.css` at 102 lines, `user-settings.css` at 97 lines, and `notifications.css` at 75 lines.

Sidebar, tables, market, broad responsive rules, and admin/bot styles are still bundled in `styles.css`; floating tools, shared help/legal dialogs, Discord sign-in dialog, cookie consent, and command palette shell styles now live in `src/styles/app-chrome.css`; notification toast/drawer/sound styles live in `src/styles/notifications.css`; and browser settings/theme-editor styles live in `src/styles/user-settings.css`. The app-chrome module preserves the z-index relationship fixed during notification smoke testing: `--z-toast` sits above `--z-help`, while modal overlays still sit above both.

Remaining CSS work:

- Identify unused or duplicate selectors before deletion.
- Split stable page-specific sections only after the related page/component boundary is clear.
- Keep future extractions feature-owned and descriptively named; use `notifications.css` and `user-settings.css` as the current pattern, and do not create more phase-numbered modules.
- Review responsive behavior for the main dashboard pages and bot/admin pages in browser screenshots. App-chrome desktop and 390px mobile smoke checks now have representative evidence, but page/table/admin/bot screenshots still need broader coverage.
- Check contrast, focus states, disabled/loading states, stale-data states, and table overflow on desktop and mobile.

## Notification Audit Notes

Supported browser in-app notification types are documented in `docs/notification-system.md`:

- Market listing toasts.
- Market sale toasts.
- Market deal alert toasts.
- Production started and completed toasts.

Current automated coverage verifies pure generation, settings gating, source-key dedupe, unseen selection, market activity source queueing, signed-in deal-alert source queueing, production queue diffing, visible toast-stack caps, persisted notification-log caps, duplicate replacement, drawer read-state marking, and browser toast setting normalization. Browser smoke verification proves market listing and market sale notifications plus drawer persistence on Dashboard, Leaderboard, Members, Professions, Production, Inventory, Construction, Research, Market, Region, Map, Sync, Activity, Public Craft Finder, Craft Calculator, and Admin. A 2026-06-28 follow-up also verified Dashboard toast creation from a smoke-only market listing, unread badge clearing when the drawer opens, drawer close behavior, drawer notice navigation to Market, drawer availability on Production with market and production entries, and the user-level market-listing setting blocking a later smoke listing while disabled. Later controlled probes verified refresh-triggered market listing toasts appear, stay visible until the timer expires, can be dismissed manually, and remain in the drawer log after dismissal on Dashboard, Market, Activity, Map, Production, and Admin. Those probes found the floating Help button was stacked above the toast dismiss button; `styles.css` now keeps `--z-toast` above `--z-help` while leaving overlays above both. The dedicated `/bot` route intentionally mounts `BotControlApp` without the main app notification chrome, so bot-route browser notifications are not currently supported. Remaining notification blockers are production started/completed generation across the full matrix, market deal alerts with a signed-in Discord-linked user, browser/manual sound checks across representative pages, and visible-dismissal coverage for non-market-listing notification types.

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

- Focused activity helper test: `node --experimental-strip-types --test test/activity-utils.test.mjs` passed after extracting activity-log cleanup into the activity utility module.
- Focused production helper test: `node --experimental-strip-types --test test/production-utils.test.mjs` passed after extracting production craft activity-window, progress-key, and metrics helpers.
- Focused notification source tests: `node --experimental-strip-types --test test/notifications.test.mjs` passed with 14 tests after extracting market activity, deal-alert, production source queue, toast-stack, persisted-log, and drawer read-state helpers.
- Focused notification sound/settings tests: `node --experimental-strip-types --test test/notification-sounds.test.mjs` passed with 5 tests after adding persisted setting normalization plus generated-audio coverage for disabled sound and selected enabled tones.
- Focused market analytics test: `node --experimental-strip-types --test test/market-analytics.test.mjs` passed after extracting best-seller sort helpers into the market analytics module.
- Focused market listing helper test: `node --experimental-strip-types --test test/market-listing-utils.test.mjs` passed after extracting market listing display, date, age, JSON, and tracking-key helpers.
- Focused server route helper test: `node --experimental-strip-types --test test/server-route-groups.test.mjs` passed after the route classification extraction.
- Focused server integration test: `node --experimental-strip-types --test test/server.test.mjs` passed after the admin-role permission fix and route-helper import wiring.
- Full production build: `corepack pnpm --filter @workspace/bitcraft-local run build` passed.
- Full app test suite: `corepack pnpm --filter @workspace/bitcraft-local test` passed with 53 tests.
- `git diff --check` passed for this slice, with only Windows CRLF warnings from Git.
- Targeted secret/config checks covered tracked runtime data, ignored local data/env files, documented secret placeholders, and private-key/token-shaped literals.
- Browser smoke notification probe verified market listing and market sale toasts plus drawer persistence across 16 main app pages and Admin; `/bot` was verified as a documented exception because it does not mount `DashboardApp`. Later built-app smoke checks loaded Dashboard, Activity, Market, and Production with notification chrome present and no browser console errors after the AppShell notification-source extraction, verified the split notification stylesheet still applies drawer overlay, drawer panel, notification button, and toast-stack styles, verified the extracted user-settings stylesheet still applies the settings dialog, preferences sound controls, and expanded theme editor styles, and verified the AppShell toast-setting normalization wiring renders Preferences with sane default sound controls and no console errors. A 2026-06-28 follow-up inserted smoke-only market listing rows, verified Dashboard toast creation, unread badge clearing, drawer close, drawer-to-Market navigation, drawer persistence on Production with market and production entries, and user-level listing settings blocking a smoke listing while disabled. Controlled dismissal probes then verified refresh-triggered market listing toast timing, confirmed `elementFromPoint` over the dismiss button targets the toast after the z-index fix, confirmed manual dismissal removes visible toasts, confirmed the drawer still retains dismissed notices, and reported no browser console errors on Dashboard, Market, Activity, Map, Production, and Admin. A built-app app-chrome smoke check after extracting `src/styles/app-chrome.css` verified the Dashboard floating action rail and Help dialog at desktop size, the keyboard command palette shell, the dedicated Terms page legal document styles, and the mobile floating-action offset at 390px width; browser console errors were empty. The cookie banner was not visible in that browser session because analytics consent had already been stored, so cookie-banner visual verification remains a separate manual/browser check if consent state can be reset safely.

Run the full app build and full test suite again before the next push or final release claim if additional code changes are made.

## Remaining Release Blockers

The release-readiness goal is not complete until all of these are done with current evidence:

- Browser smoke verification is complete for market listing and market sale notifications on Dashboard, Leaderboard, Members, Professions/Skills, Production, Inventory/Storage, Construction, Research, Market, Region, Map, Sync, Activity, Admin, Public Craft Finder, and Craft Calculator.
- Full notification matrix verification is still required for production started/completed notification generation and market deal alerts, including dedupe, refresh behavior, visible dismissal for those non-market-listing notification types, and browser/manual sound checks. Drawer open/closed, read-state, drawer navigation, user-level listing settings, market-listing toast visibility, market-listing toast dismissal, and generated-audio helper behavior now have representative evidence.
- The dedicated Discord/bot route is verified to lack main app notification chrome by design; redesign it or keep the documented exception before final release.
- CSS audit with concrete fixes or documented decisions for unused, duplicate, fragile, or page-owned styles.
- Server architecture audit now documents concrete split boundaries and existing test coverage; meaningful `server.mjs` extraction still requires fresh focused route/auth/cache/persistence tests after each move.
- Public-release security/config scan should be repeated before final release.
- Fresh build and full test run after the remaining code changes.
