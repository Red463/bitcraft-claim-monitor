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
- `src/utils/notificationSounds.ts` owns browser-only generated notification sounds.

This keeps notification trigger logic central to the mounted app shell rather than tying notifications to whichever page component happens to be visible.

## Replay And Deduplication

On first load, activity and deal-alert sources seed their known IDs and do not replay old rows as fresh toasts. Later refreshes select only unseen rows, cap the batch, and display them in chronological display order.

Toast deduplication prefers `sourceKey` when present. Legacy notices without `sourceKey` dedupe by `kind`, `title`, and `body`.

## Settings

Browser toast settings are controlled by app/admin settings and user settings:

- Market listing toasts require both app-level and user-level listing notifications to be enabled.
- Market sale toasts require both app-level and user-level sale notifications to be enabled.
- Production toasts require both app-level and user-level production notifications to be enabled.
- Sounds are browser-only and are skipped when disabled or blocked by the browser.

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
- Deduplication by `sourceKey` and legacy title/body keys.
- Market activity draft generation and settings gating.
- Deal-alert draft generation.
- Production craft draft generation.
- Initial known-ID seeding and unseen item selection.

Required release verification still includes a manual or browser-driven matrix proving that every supported in-app notification type can appear while each app page is active, unless a page restriction is intentional and documented.
