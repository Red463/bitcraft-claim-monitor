# BitCraft Claim Monitor Developer Guide

This guide describes the maintained app under `apps/bitcraft-local` and the conventions to follow while preparing it for public release.

## App Structure

- `src/main.tsx` is only the React bootstrap boundary. Keep startup imports and `createRoot` here.
- `src/AppShell.tsx` owns top-level orchestration: route selection, global data refresh, auth state, analytics consent, notification hook orchestration, and app chrome wiring. Admin console rendering lives in `src/components/admin/AdminPanel.tsx`, bot dashboard sections stay under `src/components/bot/`, and browser-local settings UI lives in `src/components/main/UserSettingsDialog.tsx`, so the shell mainly opens and wires these surfaces.
- `src/pages/` contains page components. New page-specific transforms, constants, and hooks should live beside the page in a focused folder when they are not shared.
- `src/pages/DashboardPage.tsx` owns the routed Dashboard page component. Keep Dashboard-only summary calculations and page composition there instead of returning them to the legacy page bundle.
- `src/pages/LeaderboardPage.tsx` owns the routed Leaderboard page component and its tab metadata, sorting state, local leaderboard fetch, and member comparison transforms.
- `src/pages/ActivityPage.tsx` owns the routed Activity page component, including category/member filters, full-history search state, compacting control, and timeline rendering.
- `src/pages/InventoryPage.tsx` owns the routed Inventory page component, including container/item filtering, core material summaries, item detail lookup state, and storage table composition.
- `src/pages/MapPage.tsx` owns the routed Map page component, including player/resource/region map filters, map catalog loading, and embedded BitCraft map URL state.
- `src/pages/PublicCraftFinderPage.tsx` owns the routed Public Craft Finder component, including skill/region filter state, public craft fetch state, sorting, and map-focus handoff.
- `src/pages/ProductionPage.tsx` owns the routed Production page component, including craft sorting, member eligibility checks, toolbelt lookup state, private-craft visibility, and passive-craft history rendering.
- `src/pages/MarketPage.tsx` owns the routed Market page component, including live listings, analytics, market tabs, and market-owned browser state. `src/pages/market/PriceFinder.tsx` owns the price lookup and deal-watch subtool, and `src/pages/market/BuyOrderFinder.tsx` owns the buy-order finder subtool. Market analytics/listing helpers live in `pages/market/marketAnalytics.ts` and `pages/market/listingUtils.ts`; shared browser plumbing such as route query updates and analytics tracking belongs in `src/navigation.ts` and `src/utils/analytics.ts`, and shared active-region fetch/label helpers belong in `src/hooks/useActiveRegions.ts`, not in page bundles. `src/pages/MainPages.tsx` has been removed.
- `src/components/admin/` contains the admin console shell and installation-management UI that is shared by `/?page=admin` and `/bot`. Pure admin labels and formatting live in `src/components/admin/adminDisplay.ts`; keep admin-only route handling and permission enforcement on the server because this folder is UI orchestration only.
- `src/components/main/` contains reusable dashboard UI, app chrome, tables, badges, legal dialogs, browser-local user settings, search, segmentation, stats, and notification rendering.
- `src/components/bot/` contains Discord bot/admin sections. Keep bot dashboard UI in this folder rather than moving it back into `AppShell.tsx`.
- `src/api/` contains frontend fetch hooks and API helpers. Keep network timing, stale-data metadata, and response normalization out of JSX where practical.
- `src/server/httpRoutes.mjs` contains dependency-free HTTP policy helpers: route classification, visitor logging classification, security headers, static cache policy, and frontend MIME type mapping.
- `src/server/httpResponses.mjs` contains dependency-free response writers for JSON, text, and binary payloads.
- `src/server/httpCookies.mjs` contains dependency-free cookie parsing and HttpOnly session cookie serialization helpers.
- `src/server/httpRequests.mjs` contains dependency-free request-origin, same-origin, and safe-return-path helpers used by auth and OAuth flows.
- `src/server/httpCsrf.mjs` contains dependency-free admin CSRF token derivation and constant-time header matching helpers.
- `src/server/httpBodies.mjs` contains dependency-free body-size limits, raw request-body reading, JSON parsing, and 413 body-too-large errors.
- `src/server/httpRateLimit.mjs` contains dependency-free rate-limit policies, request-address extraction, and the app 429 limiter factory.
- `src/server/visitorIp.mjs` contains dependency-free visitor IP normalization, coarse anonymization, and app-salted hash helpers for visitor-security analytics.
- `src/server/notificationActivity.mjs` contains public notification-activity metadata redaction helpers so local notification history does not leak secret-shaped fields.
- `src/server/dealAlerts.mjs` contains public market deal-alert row shaping and Discord DM payload formatting.
- `src/server/marketActivity.mjs` contains dependency-free market listing normalization, BitJita timestamp coercion, trade/listing matching, and market event source-key helpers.
- `src/server/productionActivity.mjs` contains dependency-free production craft identity, output lookup, metrics, and profession-key helpers used by activity history and Discord notifications.
- `src/server/recipeCatalog.mjs` contains dependency-free recipe catalog key, item-kind, and target-normalization helpers used by cached recipe detail storage.
- `src/server/scheduledJobs.mjs` contains dependency-free scheduled-job schedule parsing, serialization, next-run calculation, and admin-facing labels.
- `src/notifications/` contains pure in-app notification generation, dedupe, and routing helpers.
- `src/utils/` contains shared, cross-page helpers. Do not add page-only helpers here.
- `src/styles.css` is the global stylesheet for tokens, layout primitives, shared controls, and page sections that have not yet moved to a focused owner. `src/styles/` is for incremental focused stylesheet modules such as app chrome, notification UI, user settings UI, and page-owned styles with clear boundaries.
- `src/styles/setup-workflow.css` owns setup checklist, admin message state, and bot workflow polish styles. It replaces phase-numbered stylesheet naming.
- `src/styles/dashboard.css` owns the routed Dashboard page shell, KPI metrics, dashboard cards, feed/member/production/alert lists, legacy dashboard top-meta chrome, and Dashboard-specific responsive rules.
- `src/styles/leaderboard.css` owns the routed Leaderboard page cards, tabs, summary, ranking lists, and related responsive rules. Its tab base styles are also reused by the Empires page through the existing `leaderboard-tabs empires-tabs` class combination.
- `src/styles/production.css` owns routed Production page cards, craft grids, crafter pills, member banners, passive-craft table treatment, and Production-specific responsive rules. Shared command-panel and browser theme-propagation selectors remain global because other pages reuse them.
- `src/styles/public-craft.css` owns the routed Public Craft Finder page shell, summary cards, filter hint, table treatment, and page-specific controls.
- `src/styles/inventory.css` owns the routed Inventory page shell, summary cards, material watch/detail panels, filters, toggles, container cards, and page-specific table treatment.
- `src/styles/construction.css` owns the routed Construction page shell, summary cards, warning section, material needs, project cards, progress rows, completion controls, and page-specific responsive rules.
- `src/styles/research.css` owns the routed Research page shell, summary cards, unlock chips, filter panel, research lanes, and technology cards. Shared `research-filter-field` form-control styles stay global because Market and Craft Calculator reuse that class.
- `src/styles/activity.css` owns the routed Activity page shell, summary cards, filter panel, category controls, timeline, event rows, and search-loading state.
- `src/styles/region.css` owns the routed Region page shell, rank and summary cards, regional insights, supply leaders, nearby settlement panel, and regional rankings table treatment.
- `src/styles/sync.css` owns the routed Sync page shell, topbar, and embedded BitCraft Sync iframe treatment.
- `src/styles/market.css` owns the routed Market page shell, live/analytics grids, command/filter panels, best-seller leaderboard, price finder, buy-order finder, pagination, and Market-specific responsive layout rules. Shared `market-command-header` and `suggestion-*` primitives stay global because Region, Craft Calculator, and Market reuse them.
- `src/styles/craftcalc.css` owns the routed Craft Calculator page shell, lookup controls, recipe-route cards, summary cards, material rows, step cards, warning state, and empty state. Shared `market-command-header`, `suggestion-*`, and `research-filter-field` primitives stay global because other routed pages reuse them.
- `src/styles/members.css` owns the routed Members page shell, roster summary, member table treatment, public-profile equipment panels, gear presets, passive-craft list, and Members-specific responsive rules. Shared item thumbnail/label and item-detail primitives stay global because Inventory and shared item display components reuse them.
- `src/styles/skills.css` owns the routed Professions/Skills page shell, focus and coverage panels, adventure skill cards, heatmap table treatment, tier legend, and responsive Skills behavior. Shared summary-grid, mini-stat, tier badge, and base legend primitives stay global because other pages reuse them.
- `src/styles/map.css` owns the routed Map page shell, player/resource selectors, focus banner, map iframe, and Map-specific responsive layout rules. Admin-only map URL diagnostics stay global with the admin styles because they render outside the routed Map page.
- `src/styles/bot-dashboard.css` owns the dedicated `/bot` dashboard shell, overview metrics, section navigation, and related responsive shell rules.
- `src/styles/app-chrome.css` owns floating app tools, shared help/legal dialogs, Discord sign-in dialog, cookie consent, command palette shell, and related mobile overrides.
- `src/styles/user-settings.css` owns the browser settings dialog, account-linking cards, theme editor, and settings-specific responsive rules.
- `src/styles/notifications.css` owns toast, notification drawer, notification badge, and notification sound setting styles.
- `src/styles/empires.css` owns the routed Empires page scouting and watchtower styles. It intentionally remains globally imported because this app does not use CSS modules.

## Data Flow

1. Browser pages refresh live public game data through same-origin `/api/bitjita/*` routes.
2. The Vite dev server proxies those routes to BitJita and proxies `/api/local/*` to the local Node server.
3. In production, `server.mjs` serves the built frontend, the restricted BitJita proxy, local/admin APIs, SQLite persistence, background collectors, and Discord delivery.
4. `src/api/bitjita.ts` and `src/api/localHistory.ts` expose browser hooks that handle aborts, loading state, cached helper data, and stale-data metadata.
5. `src/utils/normalize.ts` turns raw BitJita/local payloads into page-facing structures.
6. SQLite is retained for history, notifications, analytics, cached tools, diagnostics, admin state, and Discord state. Normal page rendering should continue to prefer live BitJita data unless a helper endpoint intentionally returns cached last-known-good data with freshness metadata.

## Server Boundaries

`apps/bitcraft-local/server.mjs` is still a large single service file. Keep changes scoped and additive until it is split deliberately. The practical boundaries to preserve are:

- Schema bootstrapping and migrations near SQLite setup.
- Prepared statements grouped by data domain.
- Public local APIs, admin APIs, Discord interaction endpoints, BitJita proxy routes, and static serving as separate conceptual route groups.
- Admin mutations protected by an authenticated session and CSRF token.
- Secrets stored in environment variables or the protected `app_secrets` table, never returned to public settings APIs.
- Background collectors and Discord jobs isolated from request lifetimes so upstream failures do not terminate the process.

When adding an endpoint, prefer a thin route handler that delegates parsing, data shaping, and database work to focused helpers. Add a focused Node test when the endpoint changes auth, persistence, polling, notification, Discord, or cache behavior.

Future server extraction should be incremental and dependency-injected. Continue with helpers that do not need the request dispatcher, then move schema/statements into a database module, then auth/session/permission helpers, BitJita proxy/cache, scheduled jobs/collectors, Discord services, and finally route groups. Keep the route order explicit: public health/proxy/config first, authenticated admin routes after session/CSRF/permission checks, user-private endpoints after app-user auth, and static frontend fallback last.

## Notifications

Browser notification architecture is documented in [`notification-system.md`](./notification-system.md). In short:

- `src/components/main/Notifications.tsx` renders toasts and the drawer.
- `src/notifications/toastNotices.ts` owns notice shape, destination mapping, and dedupe keys.
- `src/notifications/notificationSources.ts` turns data events into toast drafts.
- `src/notifications/verificationMatrix.ts` defines the release notification page/type matrix and the intentional `/bot` exception; update it whenever a page or browser notification type changes.
- `src/notifications/browserSmoke.ts` provides loopback-only browser verification helpers; `src/notifications/useBrowserNotificationSmoke.ts` wires the smoke event bridge and `smokeNotification` query trigger into the mounted app for built-app smoke checks.
- `src/notifications/useBrowserNotificationSources.ts` keeps market activity, signed-in deal-alert, and production queue toast sources mounted globally so route changes do not disable toasts.
- `src/notifications/useToastNotifications.ts` owns the browser toast stack, persisted notification log, source-key dedupe, auto-dismiss timers, read-state marking, and optional sound playback.
- `src/notifications/userToastSettings.ts` owns browser toast defaults and persisted settings normalization; `src/utils/notificationSounds.ts` handles optional generated browser sounds and silently tolerates browser audio blocking.

Adding a notification type requires a test-first pure draft helper, a stable `sourceKey`, settings checks, global wiring, and browser verification across pages before claiming release readiness.

## Adding A Page

1. Add a page component under `src/pages/` or a focused `src/pages/<page>/` folder.
2. Keep page-only transforms and constants beside the page.
3. Add shared reusable UI to `src/components/main/` only when at least two pages need it or the abstraction is already established.
4. Add the page to `src/navigation.ts` and wire it from `AppShell.tsx`.
5. Persist page filters with `usePersistedState` only when restoring them is useful to operators.
6. Add tests for extracted pure transforms before wiring them into JSX.
7. Run `corepack pnpm --filter @workspace/bitcraft-local run build` for frontend logic changes.

## Adding An API Endpoint

1. Decide whether the endpoint is public local data, admin-only data, Discord interaction handling, or BitJita proxy behavior.
2. Keep admin-only routes behind session and permission checks, and include CSRF on non-GET mutations.
3. Return freshness metadata when serving cached or last-known-good data.
4. Avoid exposing tokens, setup keys, admin secrets, bot tokens, or raw secret-backed settings.
5. Add or update a focused test under `apps/bitcraft-local/test/`.
6. Run both build and tests for backend/API changes.

## Styling Conventions

- This is an operational dashboard. Prefer dense, readable, scan-friendly UI over marketing-style composition.
- Reuse established classes such as `Info`, `toolbar-button`, `field`, `toggle-line`, `form-card`, `DataTable`, `MiniStat`, and bot dashboard classes before adding new patterns.
- Keep cards to individual repeated items, modals, or framed tools. Avoid nested cards.
- Use existing CSS variables for color, borders, radius, focus, and z-index.
- Keep button text compact and use lucide icons where an icon exists.
- Do not hide layout issues with high-specificity CSS hacks. Fix the component structure first when possible.
- Add page-specific CSS near related existing sections in `styles.css` until a focused stylesheet module is justified. Setup/workflow styles belong in `setup-workflow.css`; bot dashboard shell/navigation styles belong in `bot-dashboard.css`; shared app-chrome overlays belong in `app-chrome.css`; notification UI belongs in `notifications.css`; user settings UI belongs in `user-settings.css`; stable routed page styles can move to a page-named stylesheet such as `dashboard.css`, `leaderboard.css`, `production.css`, `public-craft.css`, `market.css`, `craftcalc.css`, `members.css`, `skills.css`, `inventory.css`, `construction.css`, `research.css`, `activity.css`, `region.css`, `sync.css`, `map.css`, or `empires.css`.
- Any new stylesheet module under `src/styles/` must be imported by `src/main.tsx` and documented here if it establishes a reusable convention. Keep feature-owned modules narrow; shared layout primitives stay in `styles.css`.

## Commands

From the repository root:

```sh
corepack pnpm install
corepack pnpm --filter @workspace/bitcraft-local run dev
corepack pnpm --filter @workspace/bitcraft-local run build
corepack pnpm --filter @workspace/bitcraft-local test
```

Default local URLs:

- Frontend: `http://localhost:18428`
- Local API: `http://127.0.0.1:18430`

For built-app browser smoke checks:

```sh
corepack pnpm --filter @workspace/bitcraft-local run build
node scripts/start-bitcraft-local-smoke.mjs --restart
```

The smoke server serves `http://127.0.0.1:18449/`. Notification matrix probes can use `?page=<panel>&smokeNotification=<type>&smokeRun=<id>` on loopback only; this verifies the normal toast/drawer UI path with sample notices, not live BitJita production queue diffs or signed-in deal-alert source rows.

For VPS deployment and updates, use [`DEPLOYMENT.md`](../DEPLOYMENT.md).
