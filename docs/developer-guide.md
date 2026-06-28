# BitCraft Claim Monitor Developer Guide

This guide describes the maintained app under `apps/bitcraft-local` and the conventions to follow while preparing it for public release.

## App Structure

- `src/main.tsx` is only the React bootstrap boundary. Keep startup imports and `createRoot` here.
- `src/AppShell.tsx` owns top-level orchestration: route selection, global data refresh, admin shell, browser/user settings, auth state, analytics consent, notification state, and app chrome wiring.
- `src/pages/` contains page components. New page-specific transforms, constants, and hooks should live beside the page in a focused folder when they are not shared.
- `src/pages/MainPages.tsx` still contains several legacy page components that share normalized dashboard data. Continue shrinking it by moving obvious page-owned helpers or components into folders such as `pages/activity/`, `pages/map/`, and `pages/market/`.
- `src/components/main/` contains reusable dashboard UI, app chrome, tables, badges, legal dialogs, search, segmentation, stats, and notification rendering.
- `src/components/bot/` contains Discord bot/admin sections. Keep bot dashboard UI in this folder rather than moving it back into `AppShell.tsx`.
- `src/api/` contains frontend fetch hooks and API helpers. Keep network timing, stale-data metadata, and response normalization out of JSX where practical.
- `src/notifications/` contains pure in-app notification generation, dedupe, and routing helpers.
- `src/utils/` contains shared, cross-page helpers. Do not add page-only helpers here.
- `src/styles.css` is the global stylesheet for tokens, layout primitives, shared controls, and page sections. `src/styles/` is for incremental focused stylesheet modules such as notification UI.
- `src/styles/notifications.css` owns toast, notification drawer, notification badge, and notification sound setting styles.

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

## Notifications

Browser notification architecture is documented in [`notification-system.md`](./notification-system.md). In short:

- `src/components/main/Notifications.tsx` renders toasts and the drawer.
- `src/notifications/toastNotices.ts` owns notice shape, destination mapping, and dedupe keys.
- `src/notifications/notificationSources.ts` turns data events into toast drafts.
- `AppShell.tsx` keeps notification sources mounted globally so route changes do not disable toasts.
- `src/utils/notificationSounds.ts` handles optional generated browser sounds and silently tolerates browser audio blocking.

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
- Add page-specific CSS near related existing sections in `styles.css` until a focused stylesheet module is justified.
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

For VPS deployment and updates, use [`DEPLOYMENT.md`](../DEPLOYMENT.md).
