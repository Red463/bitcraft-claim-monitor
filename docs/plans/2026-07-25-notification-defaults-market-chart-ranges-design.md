# Notification Defaults and Market Income Chart Design

Date: 2026-07-25

## Goal

Make browser notifications privacy-first for new users and make the dashboard's cumulative market income chart understandable across useful time ranges without requiring hover.

## Scope

This change covers:

- New-user defaults for in-app market and production notifications.
- New-user defaults for notification sounds.
- Dashboard market-income range selection for 7 days, 30 days, and 1 year.
- Visible Y-axis values and a clear metric label.
- Honest handling of partial stored history.

Discord direct-message preferences remain independent and are not changed.

## Notification Defaults

The shared user-toast defaults will set these values to `false`:

- New market listings.
- Confirmed market sales.
- Production starts and completions.
- Notification sounds.

Saved choices are authoritative. Existing browser-local or signed-in account settings are preserved and are not migrated or overwritten. The new defaults apply only when a preference is absent.

Sound selection and volume values may retain their existing defaults because they have no effect while sounds are disabled. If a user enables sounds, the existing default sound and volume provide a usable starting point.

## Market History Data

The server already retains confirmed market trades in SQLite. The market-history response currently groups only the newest 30 sale days. It will instead return up to 365 calendar-day aggregates for the dashboard.

The response will continue returning lifetime confirmed-sale totals. The frontend can use the lifetime total and the daily rows to calculate the cumulative opening value for each selected range:

1. Start with the lifetime confirmed income.
2. Subtract daily income after the range's opening boundary to derive the opening cumulative value.
3. Fill calendar days with no confirmed sales using the previous cumulative value.
4. End the chart at the current lifetime confirmed income.

This keeps all ranges consistent with the headline total and avoids resetting cumulative income to zero at the start of each selected range.

## Chart Interaction

The card will expose a compact segmented control:

- `7D` — default.
- `30D`.
- `1Y`.

The app will load at most 365 small daily aggregate rows once and switch ranges locally, so selection is immediate and does not trigger another request.

All range controls remain visible. If the database contains less history than the requested period, the chart shows the stored portion and includes explicit coverage text such as `Stored sales begin 19 Jul`. It must not imply that an unobserved period had zero sales.

The chart will:

- Plot all available daily cumulative points in the selected range.
- Keep X-axis labels sparse and readable for longer ranges.
- Add a left Y-axis labelled `Cumulative gold`.
- Show compact gold values on several horizontal ticks.
- Retain pointer hover details for exact date and value.
- Preserve the accessible text summary for screen readers.

The Y domain will use readable rounded bounds around the displayed cumulative values. A flat series receives a small safe range so labels and the line remain legible.

## Empty and Partial States

- Fewer than two usable points: retain the existing instructional empty state.
- No confirmed sales: show `0g` and the existing no-sales message.
- Partial requested range: show the available chart plus the stored-history coverage note.
- Missing or malformed daily rows: ignore invalid rows without breaking the dashboard.

## Files Expected to Change

- `apps/bitcraft-local/src/notifications/userToastSettings.ts`
- `apps/bitcraft-local/src/pages/DashboardPage.tsx`
- `apps/bitcraft-local/src/components/main/DashboardWidgets.tsx`
- `apps/bitcraft-local/src/pages/market/marketAnalytics.ts`
- `apps/bitcraft-local/src/styles/dashboard.css`
- `apps/bitcraft-local/server.mjs`
- Focused tests under `apps/bitcraft-local/test/`

## Verification

Focused tests will cover:

- Missing notification preferences normalize to off.
- Explicit existing preferences remain unchanged.
- Seven-day, 30-day, and one-year cumulative range calculations.
- Partial stored-history messaging/data.
- Market history returns up to 365 daily aggregates.
- Dashboard range controls and Y-axis accessibility.

Because the change touches frontend logic and the backend market-history response, final verification will run:

```sh
corepack pnpm --filter @workspace/bitcraft-local run build
corepack pnpm --filter @workspace/bitcraft-local test
```
