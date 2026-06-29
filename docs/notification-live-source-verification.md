# Live-Source Notification Verification

This runbook covers the release checks that cannot be proven by the loopback smoke notification bridge alone. Smoke samples verify the global toast/drawer UI path. These checks verify that real source data can enter that path.

Use this only against a safe local, staging, or intentionally prepared production-like environment. Do not send real Discord notifications or mutate real settlement production unless the operator has approved that environment for testing.

## Current Required Checks

The current required browser live-source checks are defined in `src/notifications/verificationMatrix.ts` by `liveSourceNotificationChecksForStatus("required")`:

- `market-deal-alert`
- `production-started`
- `production-completed`

Market listing and market sale browser notification sources already have source-row evidence through `/api/local/notification-activity` rows and real refresh controls.

## Common Evidence To Capture

For each check, record:

- Date, environment, app version or commit, and signed-in user when relevant.
- Active page where the notice appeared.
- Source action that created the row or queue diff.
- Visible toast title/body.
- Unread notification badge state.
- Drawer entry after opening Recent notifications.
- Drawer entry after dismissing a visible toast.
- Destination navigation after clicking the drawer entry.
- Browser console status.
- Any intentionally unsupported route, such as `/bot`, with the documented reason.

## Production Started And Completed

Purpose: prove production queue diffs from live source data create browser toasts through the globally mounted notification source hook.

1. Open a main app page that is not Production, such as Dashboard or Market.
2. Confirm production browser notifications are enabled in both app/admin settings and local user settings.
3. Capture the current production queue baseline for the configured claim.
4. Start a safe test craft in the configured claim, or use a staging fixture that causes the live production queue to gain one craft.
5. Refresh data through the normal app refresh control or wait for the configured background refresh.
6. Verify a `Craft started` toast appears while still on the original page.
7. Open Recent notifications and verify the started entry persists there.
8. Navigate to another main app page and confirm the drawer still contains the entry.
9. Complete or remove the same test craft, or use a staging fixture that causes the live production queue to lose that craft.
10. Refresh data through the normal app refresh control or wait for background refresh.
11. Verify a `Craft completed` toast appears while still on the current page.
12. Dismiss the visible completed toast, open Recent notifications, and verify the dismissed entry persists in the drawer.
13. Click each production drawer entry and verify it navigates to Production.

Expected result:

- Started and completed toasts are emitted from real queue diffs, not sample smoke drafts.
- Both entries persist in the drawer and use Production as their destination.
- Route changes do not disable notification delivery.

## Signed-In Market Deal Alert

Purpose: prove the signed-in user's deal-alert feed creates browser toasts through the globally mounted notification source hook.

1. Sign in with a Discord-linked user that has access to deal alerts.
2. Configure or identify a safe deal-watch rule that will produce one new alert in the test environment.
3. Open a main app page that is not Market, such as Dashboard or Production.
4. Confirm market browser notifications are enabled where relevant.
5. Capture the current `/api/local/market/deal-alerts` baseline for the signed-in user.
6. Create or wait for a real deal-alert source row for that user.
7. Refresh deal-alert data through the normal app refresh path or wait for background refresh.
8. Verify a `Market deal found` toast appears while still on the original page.
9. Open Recent notifications and verify the deal-alert entry persists there.
10. Dismiss the visible toast if it is still present, reopen Recent notifications, and verify the drawer entry remains.
11. Click the drawer entry and verify it navigates to Market.
12. Sign out or switch to a user without that alert and confirm the same private deal-alert row is not exposed as a browser notification to the wrong user.

Expected result:

- Deal-alert toasts are emitted from the signed-in user's real feed, not sample smoke drafts.
- Private user-specific alert data does not leak across users.
- Drawer, badge, dismissal, and navigation behavior match the rest of the notification system.

## Completion Rule

Do not mark release notification verification complete until:

- `liveSourceNotificationVerificationComplete()` returns `true`, or every required item has dated evidence recorded in `docs/release-readiness-audit.md` and its status has been updated to `verified` with matching tests.
- The full app build and test suite pass after any status update.
