# Reliable App Update Notifications Design

## Goal

Notify users reliably whenever the app changes to a newer deployed build, regardless of whether the tab was visible, backgrounded, manually refreshed, automatically reloaded, closed, or reopened.

## Current Problem

The client keeps the loaded build ID only in React memory and records an update marker only before an automatic hidden-tab reload.

This leaves two gaps:

- browsers may suspend the 60-second polling timer while a tab is in the background, and the app does not immediately check again when the tab becomes visible;
- manual refreshes and the visible **Refresh now** action do not carry the automatic-reload marker, so the new app cannot confirm that an update occurred.

The production health endpoint already returns the correct deployed version and build ID, so this change is limited to the browser lifecycle.

## Behaviour

The browser stores the last successfully loaded build ID locally.

On app startup and whenever the tab becomes visible, the app immediately requests `/api/local/health` with caching disabled.

The result is handled as follows:

- If no valid build ID is returned, the app keeps its current state and retries normally later.
- If there is no stored build ID, the app records the current build without notifying. This avoids an update message for first-time visitors.
- If the returned build matches the stored build, no notification is shown.
- If the returned build differs from the stored build and the running page is still the old build:
  - a visible tab shows **Update available**;
  - a hidden tab records the pending update and reloads automatically.
- After any reload that starts the new build, the app compares the stored build with the health response, records the new build, and shows **App updated** exactly once.

The post-update confirmation applies to:

- automatic background reloads;
- the **Refresh now** action;
- a normal browser refresh;
- closing and reopening the app after deployment.

The confirmation retains the existing changelog link and eight-second dismissal.

## Storage and Failure Handling

The stored value contains only the public build ID and uses the existing browser settings storage pattern.

Storage access is best-effort:

- storage failures must not interrupt rendering, update polling, or reloads;
- when storage is unavailable, the existing in-memory build comparison remains as a fallback;
- malformed or empty stored values are ignored.

A newly detected build is not recorded as successfully loaded until the new app instance receives that same build from the health endpoint. This preserves the old build ID across the reload boundary and allows the new instance to show the confirmation.

## UI

No new visual component is required.

The existing bottom-centre banners remain:

- **Update available** with **Refresh now** while an old visible page is running;
- **App updated** with **View changelog** after the new build loads.

The updated confirmation remains polite live-region content and dismisses automatically after 8,000 milliseconds.

## Testing

Add behavioural tests around the release-update state transitions:

- first visit remembers a build without notifying;
- the same build produces no notification;
- a changed visible build prompts for refresh;
- a changed hidden build requests automatic reload;
- a new app instance consuming a different persisted build shows **App updated** once and records the new build;
- manual and automatic reloads share the same post-load result;
- storage failures preserve the in-memory fallback;
- visibility changes trigger an immediate health check.

Retain a focused AppShell boundary test for the polling interval, visibility listener, banner copy, changelog link, and dismissal timer. Run the focused release-update tests, production build, and full app test suite.

## Scope

This change does not alter deployment scripts, server build-ID generation, service workers, application data refreshes, or the notification-history system.
