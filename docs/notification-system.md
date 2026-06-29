# Notification System

This document describes the current in-app notification architecture for `apps/bitcraft-local`.

## Supported In-App Notification Types

The browser UI currently creates these toast/drawer notifications:

- Market listings from `/api/local/notification-activity` events with `event_type = market_new_listing`.
- Market sales from `/api/local/notification-activity` events with `event_type = market_sale` or `market_sale_confirmed`.
- Market deal alerts from `/api/local/market/deal-alerts` for the signed-in user.
- Production started and completed notifications from the global craft queue diff in `src/notifications/useBrowserNotificationSources.ts`.

Discord-only/admin diagnostics, low-supply alerts, app-update messages, supply reports, and character-link requests are server-side delivery paths. They are not currently surfaced as browser toast/drawer notifications unless a dedicated in-app source is added.

## Architecture

Notification behavior is intentionally split into rendering, pure notification logic, and app-level orchestration:

- `src/components/main/Notifications.tsx` renders the toast stack and notification drawer.
- `src/notifications/toastNotices.ts` owns toast notice types, destination mapping, notice creation, and deduplication keys.
- `src/notifications/notificationSources.ts` turns market activity, deal alerts, and production craft events into toast drafts.
- `src/notifications/verificationMatrix.ts` is the tested release-verification checklist for supported browser notification types, every routed main-app page, the intentional `/bot` exception, page-independent sample drafts, page-scoped sample drafts for every page/type combination, and the live-source checklist that separates smoke evidence from source verification requirements with dated `liveEvidence` records for verified live sources.
- `src/notifications/browserSmoke.ts` provides loopback-only browser verification helpers, and `src/notifications/useBrowserNotificationSmoke.ts` wires the smoke event bridge plus `smokeNotification` query trigger into the mounted app so built local smoke checks can prove toast/drawer behavior for every supported type without depending on live BitJita timing or a signed-in account.
- `src/notifications/browserNotificationSourceQueue.ts` owns the pure source-queue adapter for market activity rows, signed-in deal-alert rows, and production queue diffs; `src/notifications/useBrowserNotificationSources.ts` keeps that adapter mounted globally from AppShell.
- `src/notifications/useToastNotifications.ts` owns toast state, notification log state, source-key dedupe, auto-dismiss timers, read-state marking, and browser sound playback; `src/AppShell.tsx` owns route navigation from drawer items and calls notification-owned hooks.
- `src/api/localHistory.ts` keeps market activity and deal-alert polling page-independent.
- `src/notifications/userToastSettings.ts` owns browser toast defaults and persisted settings normalization before notification gating, account save, and account load.
- `src/utils/notificationSounds.ts` owns browser-only generated notification sounds and normalizes sound inputs before preview or playback.

This keeps notification trigger logic central to the mounted app shell rather than tying notifications to whichever page component happens to be visible.

## Replay And Deduplication

On first load, activity and deal-alert sources seed their known source keys and do not replay old rows as fresh toasts. Blank activity `source_key` values fall back to the derived activity key instead of creating empty notification source keys. Production craft rows also use the first non-empty craft identity field before falling back to building/recipe identity, avoiding empty production notification keys. Deal-alert rows without a stable non-empty ID are ignored so malformed live rows cannot create `deal-alert:undefined` notifications. Later refreshes select only unseen rows, cap the batch, and display them in chronological display order.

Toast deduplication prefers `sourceKey` when present. Legacy notices without `sourceKey` dedupe by `kind`, `title`, and `body`.

## Settings

Browser toast settings are controlled by app/admin settings and user settings:

- Market listing toasts require both app-level and user-level listing notifications to be enabled.
- Market sale toasts require both app-level and user-level sale notifications to be enabled.
- Market deal-alert toasts use the broader market toast gate: at least one app-level market category and one user-level market category must be enabled. Disabled deal-alert rows still advance the known-ID baseline so they do not replay later.
- Production toasts require both app-level and user-level production notifications to be enabled.
- Sounds are browser-only and are skipped when disabled or blocked by the browser. Persisted browser toast settings are normalized to boolean notification gates, known tone IDs, and a 0-1 volume range before preview, playback, account save, or account load.

Deal-alert toasts are tied to the signed-in user's deal-alert feed and follow the browser market-toast gate rather than a separate persisted toggle.

## Adding A Browser Notification Type

1. Add a pure draft helper in `src/notifications/notificationSources.ts`.
2. Add tests in `test/notifications.test.mjs` before wiring the UI.
3. Add or reuse a page-independent polling/source hook. Do not mount the source inside a page component unless the notification is intentionally page-specific.
4. Wire the source from `AppShell` or a global notification hook so route changes do not disable notifications; keep shared toast stack/log behavior in `useToastNotifications.ts`.
5. Give every generated notification a stable `sourceKey`.
6. Respect app-level and user-level settings before calling `pushToast`.
7. Verify toast, drawer, sound, dedupe, dismiss, navigation, and history behavior.

## Current Verification Coverage

Automated coverage exists for:

- Toast notice creation and destination mapping.
- Deduplication by `sourceKey` and legacy title/body keys, including persisted log duplicate replacement.
- Market activity draft generation and settings gating.
- Market activity queueing by stable notification source keys, deal-alert draft generation, signed-in deal-alert source queue seeding, malformed deal-alert row filtering, and disabled market-toast gating without later replay.
- Production craft draft generation, non-empty production craft identity fallback, and production queue diffing.
- Initial known-source-key seeding, unseen item selection, market claim changes, disabled market settings, signed-in deal-alert batches, production baseline seeding, production claim changes, disabled production settings, started/completed caps, the app-level source-queue adapter that combines live source rows without page-mounted state, visible toast-stack caps, persisted notification-log caps, drawer read-state marking, and browser toast setting normalization.
- The tested release matrix in `src/notifications/verificationMatrix.ts` covers all routed `ActivePanel` pages, the five supported browser notification types, the current `/bot` exception, sample draft-to-toast/log creation for every supported type, unique page-scoped source keys for all 85 routed page/type combinations, one live-source checklist row per supported type, and dated evidence metadata for live-source checks marked verified.
- The loopback-only smoke helpers in `src/notifications/browserSmoke.ts` are covered for host gating, supported-type parsing, unique source keys, and dispatch into normal toast notices; AppShell boundary tests keep smoke wiring delegated through `src/notifications/useBrowserNotificationSmoke.ts`, live source effects delegated through `src/notifications/useBrowserNotificationSources.ts`, and toast stack/log/timer state delegated through `src/notifications/useToastNotifications.ts`.

Required release verification still includes live-source checks for production queue diffs and signed-in deal-alert feeds. `LIVE_SOURCE_NOTIFICATION_CHECKS` records those remaining source requirements beside the already-verified market activity source rows, verified rows carry dated `liveEvidence` references, `liveSourceNotificationChecksForStatus("required")` and `requiredLiveSourceNotificationTypeIds()` are the tested source of truth for the current blocker list, and `liveSourceNotificationVerificationComplete()` is the tested completion gate. Use [`notification-live-source-verification.md`](./notification-live-source-verification.md) for the manual/live verification procedure. The local smoke bridge proves the global toast/drawer UI path for every supported type on every routed main-app page; it does not by itself prove that live BitJita production changes or a real signed-in user deal-alert feed produced the source rows.

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
- Empires
- Map
- Sync
- Activity
- Public Craft Finder
- Craft Calculator
- Admin

The dedicated `/bot` route is intentionally different: `AppShell.tsx` mounts `BotControlApp` directly for `/bot` and bot subdomains so the bot console does not initialise public dashboard data. That route has no floating notification button, toast stack, or notification drawer. Public-release decision `accepted-intentional-exception`: `/bot` browser notifications remain intentionally unsupported unless the bot route is redesigned to share the main app chrome.

A follow-up built-app smoke pass on 2026-06-28 verified the drawer/read-state path with live app controls: a smoke-only market listing inserted into `.dev-data` produced a visible Dashboard toast, unread badge, drawer entry, and drawer-to-Market navigation. The same drawer was opened on Production and contained market plus production started/completed entries. Disabling the user-level `New market listings` preference prevented a later smoke listing from creating a visible toast or unread drawer entry until the setting was restored. Later controlled probes verified refresh-triggered market listing toasts appear, remain visible until their timer expires, can be dismissed manually, and persist in the drawer after dismissal on Dashboard, Market, Activity, Map, Production, and Admin. An Empires smoke pass on 2026-06-28 inserted `codex-empires-smoke-1782672570618`, loaded `/?page=empires`, used the real Refresh button, observed the market-listing toast and unread badge, opened the notification drawer, verified the entry persisted there, clicked it, and confirmed navigation to `/?page=market` with no browser console errors. Those probes also found and fixed a toast clickability issue: the floating Help button was stacked above the toast dismiss button, so `styles.css` now keeps the toast layer above floating tools while overlays still sit above both.

A later built-app smoke pass used the loopback-only `smokeNotification` query trigger on `http://127.0.0.1:18449/` to verify all five supported notification types on every routed main-app page in the matrix: 85 visible toast checks passed, the smoke query parameters were removed after firing, the notification button remained present, and no browser console errors were captured. Additional probes dismissed a production-started toast and a market-deal-alert toast, then opened Recent notifications and verified those dismissed notices still persisted in the drawer alongside production-completed history. A 2026-06-29 built-app smoke repeated the query-trigger path after moving smoke wiring into `src/notifications/useBrowserNotificationSmoke.ts`; a Dashboard market-deal sample produced a visible toast and unread badge, removed the smoke query parameters, and captured no browser console errors. After moving live source baselines into `src/notifications/useBrowserNotificationSources.ts`, a Dashboard production-started smoke confirmed the app mounted, displayed a production toast and unread badge, removed smoke query parameters, and captured no browser console errors. After moving toast stack/log/timer behavior into `src/notifications/useToastNotifications.ts`, a follow-up built-app smoke repeated the Dashboard market-sale query trigger and verified a visible toast, unread badge, query cleanup, and no browser console errors.

Still required before release completion:

- Verify live-source production started/completed notifications from actual production queue diffs, not only sample smoke drafts.
- Verify live-source market deal alert notifications with a signed-in Discord-linked user, not only sample smoke drafts.
- Browser sound Preview has been smoke-verified on representative Dashboard, Production, and Market pages with the real Preferences controls visible and no captured console errors; automated coverage also verifies disabled sound does not create browser audio and enabled sound schedules the selected generated tone at the configured volume.
