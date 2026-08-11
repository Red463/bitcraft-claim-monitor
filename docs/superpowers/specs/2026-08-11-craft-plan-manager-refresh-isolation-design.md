# Craft Plan Manager Refresh Isolation

## Problem

The Craft Plan manager subscribes its configuration loader to the shared page-refresh cycle. Every regular refresh recreates that loader, causing the open dialog to reload saved configuration and discard the administrator's unsaved draft, bank discovery state, filters, and accordion state.

## Design

- Treat each open manager window as an isolated editing session.
- Load saved manager state only when the dialog opens, after a successful save, or when the administrator explicitly chooses Refresh.
- Keep the public Craft Planning page subscribed to regular refreshes behind the dialog.
- Keep manager requests independent from the shared page-refresh task coordinator so a cycle change cannot recreate the manager loader.
- Track whether the current configuration differs from the last loaded or saved configuration.
- If Refresh would discard a dirty draft, require an in-app confirmation before reloading. A clean draft refreshes immediately.
- Saving updates the clean baseline and triggers the existing public-plan refresh callback.
- Closing retains the existing discard-on-close behavior; reopening starts a fresh editing session.

## Verification

- Add a focused regression test proving a shared refresh-cycle change cannot reload or replace the manager draft.
- Test clean explicit refresh, dirty explicit refresh confirmation, and cancellation.
- Run the focused Craft Planning tests and production build.
