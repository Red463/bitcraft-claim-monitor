# Notification System

This document describes the current in-app notification architecture for `apps/bitcraft-local`.

## Supported In-App Notification Types

The browser UI currently creates these toast/drawer notifications:

- Market listings from `/api/local/notification-activity` events with `event_type = market_new_listing`.
- Market sales from `/api/local/notification-activity` events with `event_type = market_sale` or `market_sale_confirmed`.
- Market deal alerts from `/api/local/market/deal-alerts` for the signed-in user.
- Production started and completed notifications from the global craft queue diff in `AppShell`.

Discord-only/admin diagnostics, low-supply alerts, app-update messages, supply reports, and character-link requests are server-side delivery paths. They are not currently surfaced as browser toast/drawer notifications unless a dedicated in-app source is added.

## Architecture

Notification behavior is intentionally split into rendering, pure notification logic, and app-level orchestration:

- `src/components/main/Notifications.tsx` renders the toast stack and notification drawer.
- `src/notifications/toastNotices.ts` owns toast notice types, destination mapping, notice creation, and deduplication keys.
- `src/notifications/notificationSources.ts` turns market activity, deal alerts, and production craft events into toast drafts.
- `src/AppShell.tsx` owns global polling hooks, known-ID refs, toast state, notification log state, browser sound playback, and route navigation from drawer items.
- `src/api/localHistory.ts` keeps market activity and deal-alert polling page-independent.
- `src/notifications/userToastSettings.ts` owns browser toast defaults and persisted settings normalization before notification gating, account save, and account load.
- `src/utils/notificationSounds.ts` owns browser-only generated notification sounds and normalizes sound inputs before preview or playback.

This keeps notification trigger logic central to the mounted app shell rather than tying notifications to whichever page component happens to be visible.

## Replay And Deduplication

On first load, activity and deal-alert sources seed their known IDs and do not replay old rows as fresh toasts. Later refreshes select only unseen rows, cap the batch, and display them in chronological display order.

Toast deduplication prefers `sourceKey` when present. Legacy notices without `sourceKey` dedupe by `kind`, `title`, and `body`.

## Settings

Browser toast settings are controlled by app/admin settings and user settings:

- Market listing toasts require both app-level and user-level listing notifications to be enabled.
- Market sale toasts require both app-level and user-level sale notifications to be enabled.
- Production toasts require both app-level and user-level production notifications to be enabled.
- Sounds are browser-only and are skipped when disabled or blocked by the browser. Persisted browser toast settings are normalized to boolean notification gates, known tone IDs, and a 0-1 volume range before preview, playback, account save, or account load.

Deal-alert toasts are tied to the signed-in user's deal-alert feed.

## Adding A Browser Notification Type

1. Add a pure draft helper in `src/notifications/notificationSources.ts`.
2. Add tests in `test/notifications.test.mjs` before wiring the UI.
3. Add or reuse a page-independent polling/source hook. Do not mount the source inside a page component unless the notification is intentionally page-specific.
4. Wire the source from `AppShell` or a global notification hook so route changes do not disable notifications.
5. Give every generated notification a stable `sourceKey`.
6. Respect app-level and user-level settings before calling `pushToast`.
7. Verify toast, drawer, sound, dedupe, dismiss, navigation, and history behavior.

## Current Verification Coverage

Automated coverage exists for:

- Toast notice creation and destination mapping.
- Deduplication by `sourceKey` and legacy title/body keys, including persisted log duplicate replacement.
- Market activity draft generation and settings gating.
- Deal-alert draft generation and signed-in deal-alert source queue seeding.
- Production craft draft generation and production queue diffing.
- Initial known-ID seeding, unseen item selection, market claim changes, disabled market settings, signed-in deal-alert batches, production baseline seeding, production claim changes, disabled production settings, started/completed caps, visible toast-stack caps, persisted notification-log caps, drawer read-state marking, and browser toast setting normalization.

Required release verification still includes a manual or browser-driven matrix proving that every supported in-app notification type can appear while each app page is active, unless a page restriction is intentional and documented.

## Browser Verification Matrix Progress

Browser smoke verification on the built local app at `http://127.0.0.1:18449/` inserted smoke-only `activity_events` rows into the local `.dev-data` SQLite database, then used the real Refresh button, toast stack, notification button, and drawer. This verified that market listing and market sale browser notifications can appear while these pages are active, and that the same entries persist in the notification drawer:

- Dashboard
- Leaderboard
- Members
- Professions
- Production
- Inventory
- Construction
- Research
- Market
- Region
- Map
- Sync
- Activity
- Public Craft Finder
- Craft Calculator
- Admin

The dedicated `/bot` route is intentionally different: `AppShell.tsx` mounts `BotControlApp` directly for `/bot` and bot subdomains so the bot console does not initialise public dashboard data. That route currently has no floating notification button, toast stack, or notification drawer. Treat `/bot` browser notifications as intentionally not supported unless the bot route is redesigned to share the main app chrome.

A follow-up built-app smoke pass on 2026-06-28 verified the drawer/read-state path with live app controls: a smoke-only market listing inserted into `.dev-data` produced a visible Dashboard toast, unread badge, drawer entry, and drawer-to-Market navigation. The same drawer was opened on Production and contained market plus production started/completed entries. Disabling the user-level `New market listings` preference prevented a later smoke listing from creating a visible toast or unread drawer entry until the setting was restored. A separate Production-page dismissal attempt remains inconclusive: two later smoke listings entered the unread drawer log, but no visible `.toast-stack` item was observed before dismissal could be tested.

Still required before release completion:

- Verify production started and production completed browser notifications across the same page matrix.
- Verify market deal alert notifications with a signed-in Discord-linked user.
- Verify visible toast dismissal and sound enabled/disabled behavior across representative pages.
- Re-check the Production-page toast visibility path for refresh-triggered market notifications, because the drawer/log updated during the 2026-06-28 follow-up while the visible toast stack was not observed.
