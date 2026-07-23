# Global Manual Refresh Design

## Goal

Make the floating refresh control reliably refresh all live data owned by the active page while preventing repeated clicks or scripted requests from flooding the application or BitJita.

## Approved Interaction

- Automatic polling continues at the configured display interval and uses all normal browser and server caches.
- A manual click starts one forced refresh for the active page.
- The button is disabled while that refresh is running and for a 15-second cooldown measured from the accepted click.
- While requests are active, the icon spins and the accessible label reads `Refreshing data…`.
- During the remaining cooldown, the tooltip and accessible label state when refresh is available again.
- A successful refresh provides a short `Data refreshed` completion message through the existing status/toast patterns.
- A failed refresh leaves current data visible and reports the failure without shortening the cooldown.
- Reduced-motion users receive the same state changes without rotational animation.

## Architecture

### Separate automatic and manual signals

`AppShell` will retain the existing automatic refresh counter and add a manual refresh request with its own sequence number and timestamp. Consumers can therefore distinguish inexpensive scheduled polling from a deliberate cache-bypassing request.

The manual signal is passed only to the currently mounted page. Page filters, selected tabs, scroll position, and open dialogs remain mounted and are not reset.

### Refresh coordinator

A focused client helper will own the 15-second cooldown and the lifecycle of the active manual refresh. It will:

1. reject clicks while a refresh or cooldown is active;
2. issue a new manual sequence number;
3. track the active page's main and page-specific requests;
4. expose `idle`, `refreshing`, and `cooldown` presentation states; and
5. release the button after both request completion and the cooldown boundary.

Pages with independent live requests—including Craft Planning, Production, Leaderboard, Public Craft Finder, Empires, Dashboard planner preview, Market member history, and open member/item details—will subscribe to the manual sequence. Static catalog-only data does not need to refetch unless its page currently presents it as live data.

### Cache bypass

The main BitJita loader will ignore its 20-second page-navigation cache when the manual sequence changes. Manual proxy requests will include an internal force-refresh marker that the local server removes before constructing the upstream BitJita URL.

Eligible local aggregate endpoints will accept the same manual marker and bypass their own response cache for that request. Automatic polling and ordinary navigation never set the marker.

The planner, dashboard aggregate, production summary, passive craft summary, player detail summary, and relevant active-page aggregates will support request-scoped bypasses. A manual refresh does not clear shared caches globally; the newly fetched successful result replaces the appropriate cache entry normally.

### Server-side abuse protection

Forced refresh is protected independently of the browser UI:

- one accepted forced-refresh window per client address every 15 seconds;
- requests sharing the same manual refresh identifier are treated as one refresh fan-out rather than separate user actions;
- each accepted identifier is capped at 40 requests during its 15-second lifetime, in addition to existing endpoint rate limits;
- duplicate in-flight requests for the same upstream resource continue to coalesce;
- rejected force attempts return HTTP `429` with a `Retry-After` header;
- ordinary cached requests retain their existing rate limits.

The force marker is never forwarded to BitJita and cannot be used to alter an upstream query.

## Error and Feedback Behaviour

- Existing data remains visible while refreshing.
- The floating button reflects the combined active-page refresh rather than only the base claim-data request.
- Page-specific failures are included in the completion result; one failed source does not erase successful data from other sources.
- The button remains protected by the cooldown after failure, preventing rapid retry storms during an upstream outage.
- Hidden tabs do not start automatic refreshes; a manual refresh only occurs from a direct user action in a visible page.

## Test Strategy

- Unit-test the refresh coordinator's accepted click, in-flight lock, 15-second cooldown, completion, and failure behavior using a controllable clock.
- Add a boundary test proving manual refresh bypasses the browser page cache while automatic refresh still uses it.
- Add page boundary tests proving each independent active-page request consumes the manual sequence and preserves current content while loading.
- Add server tests proving the force marker is stripped, eligible caches are bypassed, duplicate fan-out requests are allowed within one refresh identifier, separate refresh bursts receive `429`, and `Retry-After` is returned.
- Run the full app build and test suite, followed by a browser smoke check of at least Dashboard, Craft Planning, Production, Empires, and an open detail view.

## Non-goals

- Changing the configured automatic refresh interval.
- Refreshing pages that are not currently mounted.
- Globally deleting caches for other users.
- Refreshing the weekly probability catalogue from the public floating button.
- Resetting filters, selections, dialogs, or page scroll position.
