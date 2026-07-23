# Automatic Update Confirmation and Refresh Cooldown Design

## Goal

Make background application updates visible after an automatic reload, and make the global data-refresh cooldown unmistakable without adding noise to the operational interface.

## Automatic update confirmation

The existing release check continues to compare the loaded build ID with the server health build ID.

When a newer build is detected while the document is hidden:

1. Store a tab-local automatic-update marker in `sessionStorage`.
2. Reload the page using the existing automatic update path.
3. On startup, consume and remove the marker.
4. Show a compact success notification confirming that the latest app version is active.

The notification:

- Uses the existing release-update popup vocabulary with a success treatment.
- Says **App updated** and **You’re now using the latest version.**
- Includes a **View changelog** link to the repository `CHANGELOG.md`.
- Dismisses automatically after eight seconds.
- Uses `role="status"` and `aria-live="polite"` without moving focus.
- Appears only after an automatic hidden-tab update reload.
- Does not appear after an ordinary reload or after the user selects **Refresh now**.

`sessionStorage` is used because it is temporary and isolated to the tab being reloaded. A startup build comparison would incorrectly notify first-time visitors, while `localStorage` could show the message in a different tab.

If storage is unavailable, the update still reloads normally; only the confirmation message is omitted.

## Global refresh cooldown

The existing 15-second cooldown remains the single source of truth. No second timer or server contract is introduced.

The floating global refresh button has three visible states:

- **Ready:** the normal refresh icon.
- **Refreshing:** the animated refresh icon and existing busy state.
- **Cooldown:** the icon is replaced by the whole seconds remaining, from `15s` through `1s`.

During cooldown:

- The button remains disabled.
- A distinct muted-gold cooldown treatment makes the state visible without suggesting an error.
- The tooltip and accessible label include the result and exact remaining wait, for example: **Data refreshed. Refresh available in 8 seconds.**
- When the timer reaches zero, the normal icon and ready styling return.
- Reduced-motion preferences continue to disable decorative animation without hiding state.

Replacing the icon with the countdown is preferred over a corner badge, which is easier to miss, and over a progress ring, which does not communicate the exact wait.

## State and component boundaries

Release marker helpers belong in the existing release-update utility so storage key handling and marker consumption are independently testable. `AppShell` owns the notification visibility and dismissal timer because it already owns build polling and release banners.

The refresh countdown continues to use `cooldownRemainingMs` and `manualRefreshClock`. `AppShell` changes only the rendered button content and state class.

## Error handling and accessibility

- Storage reads and writes are best-effort and must never interrupt an update reload.
- The automatic dismissal timer is cleared on unmount.
- The changelog opens as an ordinary external link with safe `target` and `rel` attributes.
- The update confirmation does not enter the notification history because it describes the current app shell rather than settlement activity.
- Cooldown state is communicated through visible text and accessible naming, not colour alone.

## Verification

Focused tests will cover:

- Setting an automatic-update marker before a hidden-tab reload.
- Consuming and clearing the marker exactly once after startup.
- Ignoring missing, invalid, and unavailable storage.
- Rendering the updated-app notification with changelog link and polite status semantics.
- Automatic dismissal after eight seconds.
- Rendering exact cooldown seconds in the refresh button.
- Restoring the normal icon when cooldown reaches zero.
- Retaining disabled, tooltip, busy, and accessible-label behavior.

The production build and complete application test suite will run after implementation.
